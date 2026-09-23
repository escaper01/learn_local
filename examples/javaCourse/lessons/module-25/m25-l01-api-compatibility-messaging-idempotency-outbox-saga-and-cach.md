# API compatibility, messaging, idempotency, outbox, saga, and caching

Up to now most of your programs lived inside a single JVM with a single memory. If a method returned, its effect happened; if it threw, it did not. The moment your service talks to a database, a message broker, another team's API, or a mobile app that was installed eight months ago, that comfortable certainty disappears. Networks drop responses, processes are killed between two lines of code, clients keep running old versions, and caches keep serving yesterday's answer. Senior engineers are not people who avoid these failures; they are people who design so that each failure has a known, boring outcome.

This lesson gives you the core toolkit for that: evolving an API without breaking existing clients, reasoning about message delivery, making operations safe to repeat, publishing events reliably with an outbox, coordinating multi-step work with a saga, and caching without leaking or serving dangerous stale data.

What you will learn:

- How to change a public API or event format without breaking clients that you do not control.
- What at-most-once, at-least-once, and "exactly-once" delivery really mean, and why duplicates are normal.
- How to make a handler idempotent with idempotency keys and a processed-message store.
- Why writing to a database and a broker in two separate steps loses events, and how the transactional outbox fixes it.
- Why an outbox relay can still publish the same event twice, and why that is acceptable.
- How a saga coordinates several local transactions with explicit compensation.
- How to design a bounded, correctly keyed cache with expiry and invalidation.

## Compatibility: your API is a promise to strangers

When you publish an HTTP endpoint or an event type, other code starts depending on its exact shape. You usually cannot upgrade all those clients at the same moment you deploy. During a rolling deployment, even your own service runs old and new versions side by side. So every change must be judged by one question: can an old reader still understand new data, and can a new reader still understand old data?

Think of an API like a power socket in a building. You can add a USB port next to the socket, and old plugs still work. If you change the socket shape, every appliance in the building breaks at once.

| Change | Usually safe? | Why |
|---|---|---|
| Add an optional response field | Yes | Tolerant readers ignore unknown fields |
| Add an optional request field with a default | Yes | Old clients omit it and get old behavior |
| Add a new endpoint or event type | Yes | Nobody depended on it yet |
| Add a new enum value in a response | Risky | Old clients with exhaustive switches may fail |
| Rename or remove a field | No | Old clients read null or fail to parse |
| Change a field type (number to string) | No | Parsers reject or misinterpret it |
| Make an optional request field required | No | Old clients are suddenly rejected |
| Change the meaning of an existing field | No, and it is invisible | Parsing succeeds while behavior is wrong |

The last row is the most dangerous because no test that only checks the shape will catch it. If `durationMinutes` becomes `durationSeconds` without a rename, every client silently computes wrong answers.

### Additive change and the expand/contract pattern

To rename `title` to `name`, you do not rename in one step. You expand first, then contract later:

1. Expand: add `name`, keep writing `title` with the same value, accept both on input.
2. Migrate: move clients (and your own readers) to `name`, and measure who still sends `title`.
3. Contract: once usage is zero, or after an announced deprecation window, remove `title` in a new major version.

```json
{
  "id": 42,
  "title": "Write report",
  "name": "Write report",
  "status": "OPEN"
}
```

For breaking changes that cannot be avoided, version explicitly, for example `/v2/tasks` or a media type version, and run both versions until the old one is retired. Keep recorded request and response fixtures from each released version in your test suite; a test that parses the old fixture with new code is the cheapest compatibility guarantee you will ever buy.

### Tolerant readers in Java

A tolerant reader takes what it needs and ignores what it does not understand. With Jackson, this is a configuration choice, shown here as a fragment (Jackson is an external library, not part of the JDK):

```java
// Fragment: requires the Jackson databind library on the classpath.
@JsonIgnoreProperties(ignoreUnknown = true)
public record TaskDto(long id, String title, String status) {}

// When reading enums sent by a newer producer, map unknown values safely.
static TaskStatus parseStatus(String raw) {
    return switch (raw) {
        case "OPEN" -> TaskStatus.OPEN;
        case "DONE" -> TaskStatus.DONE;
        default -> TaskStatus.UNKNOWN;   // do not crash on a value added later
    };
}
```

The same thinking applies to database schemas: a new version of the code must work against the old schema during a rollout, and the old code must survive the new schema. Lesson 3 returns to this under deployment strategies.

## Messaging and delivery guarantees

A message broker (Kafka, RabbitMQ, Amazon SQS, and many others) decouples a producer from consumers. The producer hands off an event, and consumers process it later, at their own pace, even if they were down when it was sent. The price is that you must now reason about delivery across process boundaries.

A consumer typically does three things: receive a message, perform an effect (update a database, send an email), and acknowledge the message so the broker stops redelivering it. The order of the last two steps decides your guarantee.

| Guarantee | Consumer order | Failure outcome | Typical use |
|---|---|---|---|
| At-most-once | Acknowledge, then process | Crash after ack loses the work | Metrics samples, non-critical telemetry |
| At-least-once | Process, then acknowledge | Crash before ack causes redelivery, so duplicates | Almost all business events |
| Effectively-once | At-least-once plus idempotent effect | Duplicates arrive but change nothing twice | Payments, state transitions, notifications |

"Exactly-once delivery" across a network is not something you get for free. What you can build is *effectively-once processing*: messages may arrive more than once, but the durable effect happens once. Some platforms advertise exactly-once semantics inside their own boundaries (for example, transactional reads and writes within Kafka), but the moment your consumer touches an external database or sends an email, you are back to designing idempotency yourself.

> **Note:** Duplicates are not a bug in the broker. A lost acknowledgment is indistinguishable from a lost message, so a correct broker must resend. Your consumer must be the one that tolerates it.

### Retries, backoff, and poison messages

When processing fails, consumers retry. Retrying immediately in a tight loop hammers a dependency that is already struggling. Use exponential backoff with jitter (random spread), cap the number of attempts, and move a message that keeps failing to a dead-letter queue where a human or tool can inspect it. A malformed "poison" message that can never succeed must not block every message behind it forever.

```java
// Fragment: exponential backoff with full jitter.
long baseMillis = 100;
long capMillis = 10_000;
for (int attempt = 1; attempt <= 5; attempt++) {
    try {
        handler.handle(message);
        return;
    } catch (TransientException e) {
        long ceiling = Math.min(capMillis, baseMillis * (1L << (attempt - 1)));
        Thread.sleep(ThreadLocalRandom.current().nextLong(ceiling + 1));
    }
}
deadLetterQueue.send(message);
```

Only retry errors that might succeed later (timeouts, 503 responses, lock conflicts). Retrying a validation error five times just wastes five attempts.

## Idempotency: making "do it again" safe

An operation is idempotent if doing it twice has the same durable effect as doing it once. `status = DONE` is naturally idempotent. `balance = balance + 50` is not. Your job is to make non-idempotent operations safe to repeat, because retries will happen in both directions: clients retry HTTP calls whose responses were lost, and brokers redeliver messages whose acknowledgments were lost.

### Idempotency keys for API calls

For HTTP, the client generates a unique key (usually a UUID) per logical operation and sends it with every retry of that operation, commonly in an `Idempotency-Key` header. The server stores the key with the result. A repeated key replays the stored result instead of repeating the effect. The server should also remember a fingerprint of the request, so the same key reused for a *different* request is rejected rather than silently replayed.

```java
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

public class IdempotencyKeyDemo {
    public static void main(String[] args) {
        var api = new TaskApi();
        System.out.println(api.createTask("key-A", "Write report"));    // first attempt
        System.out.println(api.createTask("key-A", "Write report"));    // retry after a lost response
        System.out.println(api.createTask("key-B", "Write report"));    // a genuinely new request
        System.out.println(api.createTask("key-A", "Other title"));     // key reused for a different request
        System.out.println("Tasks stored: " + api.taskCount());
    }
}

record Response(int status, String body) {
    @Override
    public String toString() {
        return status + " " + body;
    }
}

final class TaskApi {
    private record Stored(String fingerprint, Response response) {}

    private final Map<String, Stored> idempotencyStore = new HashMap<>();
    private final Map<Integer, String> tasks = new LinkedHashMap<>();
    private int nextId = 100;

    synchronized Response createTask(String idempotencyKey, String title) {
        String fingerprint = "POST /tasks title=" + title;
        Stored previous = idempotencyStore.get(idempotencyKey);
        if (previous != null) {
            if (!previous.fingerprint().equals(fingerprint)) {
                return new Response(422, "{\"error\":\"idempotency key reused for a different request\"}");
            }
            return previous.response(); // replay the stored result, no second effect
        }
        int id = nextId++;
        tasks.put(id, title);
        Response created = new Response(201, "{\"id\":" + id + ",\"title\":\"" + title + "\"}");
        idempotencyStore.put(idempotencyKey, new Stored(fingerprint, created));
        return created;
    }

    synchronized int taskCount() {
        return tasks.size();
    }
}
```

```text
201 {"id":100,"title":"Write report"}
201 {"id":100,"title":"Write report"}
201 {"id":101,"title":"Write report"}
422 {"error":"idempotency key reused for a different request"}
Tasks stored: 2
```

Notice that the retry returned the *same* id 100. The client cannot tell that its first response was lost, which is exactly the point. In a real service the idempotency store lives in the database, the key row and the task row are written in the same transaction, and old keys expire after a documented window (for example 24 hours).

### Processed-message store for consumers

For message consumers, the event carries a producer-assigned unique ID. The consumer records that ID in the same database transaction as its effect. A unique constraint turns "have I seen this?" into something the database enforces even under concurrency.

```sql
-- PostgreSQL syntax. Both statements run in ONE transaction.
BEGIN;
INSERT INTO processed_message(event_id, processed_at)
VALUES ('evt-001', now())
ON CONFLICT (event_id) DO NOTHING;
-- If the insert affected 0 rows, the event was already handled: ROLLBACK and acknowledge.
UPDATE account SET balance_cents = balance_cents + 5000 WHERE id = 7;
COMMIT;
-- Acknowledge the message only after COMMIT succeeds.
```

If the process dies after `COMMIT` but before the acknowledgment, the broker redelivers, the insert hits the conflict, and nothing is applied twice. If it dies before `COMMIT`, both the marker and the effect roll back, and the redelivery does the work properly.

## The dual-write problem and the transactional outbox

A very common bug looks innocent:

```java
// WRONG: two independent systems, no shared transaction.
taskRepository.markDone(42);           // commits to the database
broker.publish(new TaskCompleted(42)); // separate network call
```

If the process crashes between the two lines, the database says the task is done but no event ever exists. Swap the order and the opposite happens: consumers hear about a completion the database never committed. You cannot fix this by wrapping both in a local `try` block, because a database transaction does not cover a broker.

The transactional outbox solves it by writing the event into a table in the *same* database, in the *same* transaction, as the state change:

```sql
BEGIN;
UPDATE task SET status = 'DONE' WHERE id = 42;
INSERT INTO outbox(event_id, aggregate_id, event_type, payload, created_at)
VALUES ('evt-001', 42, 'TASK_COMPLETED', '{"taskId":42}', now());
COMMIT;
```

Now the state change and the intent to publish are atomic. A separate relay process polls committed outbox rows (or reads the database change log, a technique called change data capture), publishes each one, and then marks it as published.

### What happens under the hood: tracing the relay

The relay does two things per row, in order: publish to the broker, then record completion in the database. Walk through every place a crash can land:

1. Crash before publishing: the row is still unpublished, the next relay run sends it. No loss.
2. Crash after publishing but before marking the row: the broker already has the event, yet the database still says "unpublished". The next run sends it *again*.
3. Crash after marking: nothing to redo. Clean.

Case 2 is unavoidable. The broker and the database are separate systems, so there is always a window between "the broker has it" and "the database knows the broker has it". Reversing the order (mark first, then publish) would instead risk losing events forever, which is worse. The outbox therefore gives you *at-least-once* publication, and it moves the duplicate problem to the consumer, where the processed-message store from the previous section handles it.

The following program simulates exactly that crash window and a deduplicating consumer:

```java
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

public class OutboxDemo {
    public static void main(String[] args) {
        var db = new Database();
        var broker = new Broker();

        db.completeTask(42, "evt-001");
        db.completeTask(43, "evt-002");
        System.out.println("Committed tasks: " + db.tasks());
        System.out.println("Pending outbox rows: " + db.pendingEventIds());

        var relay = new OutboxRelay(db, broker, "evt-001");
        try {
            relay.runOnce();
        } catch (IllegalStateException crash) {
            System.out.println("Relay crashed: " + crash.getMessage());
        }
        System.out.println("Pending after crash: " + db.pendingEventIds());

        var restarted = new OutboxRelay(db, broker, null);
        restarted.runOnce();
        System.out.println("Pending after restart: " + db.pendingEventIds());
        System.out.println("Broker log: " + broker.log());

        var consumer = new NotificationConsumer();
        for (String message : broker.log()) {
            consumer.handle(message);
        }
        System.out.println("Notifications sent: " + consumer.sent());
    }
}

record OutboxRow(String eventId, int taskId, String type) {}

final class Database {
    private final Map<Integer, String> tasks = new TreeMap<>(Map.of(42, "OPEN", 43, "OPEN"));
    private final Map<String, OutboxRow> outbox = new LinkedHashMap<>();
    private final Set<String> published = new HashSet<>();

    // One local transaction: the state change and the outbox row commit together or not at all.
    synchronized void completeTask(int taskId, String eventId) {
        tasks.put(taskId, "DONE");
        outbox.put(eventId, new OutboxRow(eventId, taskId, "TASK_COMPLETED"));
    }

    synchronized List<OutboxRow> unpublished() {
        return outbox.values().stream().filter(r -> !published.contains(r.eventId())).toList();
    }

    synchronized void markPublished(String eventId) {
        published.add(eventId);
    }

    synchronized List<String> pendingEventIds() {
        return unpublished().stream().map(OutboxRow::eventId).toList();
    }

    synchronized Map<Integer, String> tasks() {
        return new TreeMap<>(tasks);
    }
}

final class Broker {
    private final List<String> log = new ArrayList<>();

    void publish(OutboxRow row) {
        log.add(row.eventId() + ":" + row.type() + ":" + row.taskId());
    }

    List<String> log() {
        return List.copyOf(log);
    }
}

final class OutboxRelay {
    private final Database db;
    private final Broker broker;
    private final String crashAfterPublishing;

    OutboxRelay(Database db, Broker broker, String crashAfterPublishing) {
        this.db = db;
        this.broker = broker;
        this.crashAfterPublishing = crashAfterPublishing;
    }

    void runOnce() {
        for (OutboxRow row : db.unpublished()) {
            broker.publish(row);                                   // step 1: the broker has it
            if (row.eventId().equals(crashAfterPublishing)) {
                throw new IllegalStateException("process killed after publishing " + row.eventId());
            }
            db.markPublished(row.eventId());                       // step 2: remember we sent it
        }
    }
}

final class NotificationConsumer {
    private final Set<String> processedEventIds = new HashSet<>();
    private final List<String> sent = new ArrayList<>();

    void handle(String message) {
        String eventId = message.substring(0, message.indexOf(':'));
        if (!processedEventIds.add(eventId)) {
            System.out.println("Duplicate ignored: " + eventId);
            return;
        }
        sent.add("task " + message.substring(message.lastIndexOf(':') + 1) + " completed");
    }

    List<String> sent() {
        return sent;
    }
}
```

```text
Committed tasks: {42=DONE, 43=DONE}
Pending outbox rows: [evt-001, evt-002]
Relay crashed: process killed after publishing evt-001
Pending after crash: [evt-001, evt-002]
Pending after restart: []
Broker log: [evt-001:TASK_COMPLETED:42, evt-001:TASK_COMPLETED:42, evt-002:TASK_COMPLETED:43]
Duplicate ignored: evt-001
Notifications sent: [task 42 completed, task 43 completed]
```

Read the broker log carefully: `evt-001` appears twice, yet only one notification was sent. The outbox guaranteed that no committed change was lost; the consumer's idempotency guaranteed that no duplicate had a second effect. You need both halves. In production, also delete or archive published outbox rows on a schedule so the table does not grow forever, and preserve ordering per aggregate if consumers depend on it.

## Sagas: coordinating several local transactions

Sometimes one business action spans several services or databases: reserve a seat, charge a card, confirm the enrollment. There is no single transaction that covers all of them, and distributed two-phase commit is rarely available or desirable across independent services. A saga breaks the action into local transactions, each paired with a *compensating* action that semantically undoes it if a later step fails.

Compensation is not a rollback. A refund is a new, visible event on the customer's statement; the original charge still happened. An email that was sent cannot be unsent; at best you send a correction. So design steps in a careful order: do reversible, cheap steps first, and put irreversible steps (sending email, shipping goods) last.

There are two styles. In orchestration, one coordinator tells each participant what to do and tracks progress, which is easy to follow and test. In choreography, each service reacts to the previous service's events, which avoids a central coordinator but makes the overall flow harder to see. For most teams starting out, orchestration is easier to reason about.

```java
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

public class SagaDemo {
    public static void main(String[] args) {
        System.out.println("--- enrollment for alice ---");
        new EnrollmentSaga(false).run("alice");
        System.out.println("--- enrollment for bob (card declined) ---");
        new EnrollmentSaga(true).run("bob");
    }
}

record SagaStep(String name, Runnable action, Runnable compensation) {}

final class EnrollmentSaga {
    private final boolean declineCard;

    EnrollmentSaga(boolean declineCard) {
        this.declineCard = declineCard;
    }

    void run(String student) {
        List<SagaStep> steps = List.of(
            new SagaStep("reserve seat",
                () -> System.out.println("  seat reserved for " + student),
                () -> System.out.println("  COMPENSATE: seat released for " + student)),
            new SagaStep("charge card",
                () -> {
                    if (declineCard) {
                        throw new IllegalStateException("card declined");
                    }
                    System.out.println("  card charged for " + student);
                },
                () -> System.out.println("  COMPENSATE: refund issued to " + student)),
            new SagaStep("confirm enrollment",
                () -> System.out.println("  enrollment confirmed for " + student),
                () -> System.out.println("  COMPENSATE: enrollment revoked for " + student)));

        Deque<SagaStep> completed = new ArrayDeque<>();
        for (SagaStep step : steps) {
            try {
                step.action().run();
                completed.push(step);
            } catch (RuntimeException failure) {
                System.out.println("  step '" + step.name() + "' failed: " + failure.getMessage());
                while (!completed.isEmpty()) {
                    completed.pop().compensation().run();   // newest first
                }
                System.out.println("  saga result: CANCELLED");
                return;
            }
        }
        System.out.println("  saga result: ENROLLED");
    }
}
```

```text
--- enrollment for alice ---
  seat reserved for alice
  card charged for alice
  enrollment confirmed for alice
  saga result: ENROLLED
--- enrollment for bob (card declined) ---
  seat reserved for bob
  step 'charge card' failed: card declined
  COMPENSATE: seat released for bob
  saga result: CANCELLED
```

This in-memory version hides the hard parts on purpose. A real saga must persist its progress (which step completed) so that a crashed coordinator can resume; every step and every compensation must be idempotent because they will be retried; and a compensation can itself fail, which needs retries and, eventually, a human alert. The honest question before building one is: do I really need separate services here? Inside a modular monolith with one database, a single local transaction is simpler and stronger.

## Caching without regret

A cache trades freshness and memory for speed. Every cache you add is a second copy of the truth that can disagree with the first. Before adding one, measure that the uncached path is actually too slow, then answer five design questions explicitly:

- Key: does the key include *every* input that changes the result, such as tenant, user, locale, permissions, and API version?
- Size: what is the maximum number of entries or bytes, and what gets evicted first?
- Expiry: how old may a value be before it must be reloaded (time to live)?
- Invalidation: which writes remove or update the entry, and how do other instances find out?
- Stampede: when a hot entry expires, do a thousand requests all hit the database at once?

| Strategy | How it works | Strength | Risk |
|---|---|---|---|
| Cache-aside | Read cache, on miss load from database and store | Simple, most common | Stale data between write and invalidation |
| Read-through | Cache library loads on miss for you | Centralized loading logic | Hides slow loads behind the cache |
| Write-through | Writes go to cache and database together | Cache stays warm and fresh | Slower writes, two systems to keep consistent |
| Write-behind | Write to cache, flush to database later | Very fast writes | Data loss if the cache node dies |

The program below implements a small cache-aside cache with a maximum size (LRU eviction via `LinkedHashMap` access order), a time to live, explicit invalidation, and a composite key that includes the tenant. A fake clock makes expiry deterministic.

```java
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;

public class CacheDemo {
    public static void main(String[] args) {
        var clock = new FakeClock();
        var cache = new BoundedTtlCache<TaskKey, String>(2, 30_000, clock);
        Function<TaskKey, String> loadFromDatabase = key -> {
            System.out.println("  (database read for " + key + ")");
            return "title-" + key.taskId() + "@" + key.tenantId();
        };

        System.out.println(cache.get(new TaskKey("acme", 1), loadFromDatabase));
        System.out.println(cache.get(new TaskKey("acme", 1), loadFromDatabase));   // hit
        System.out.println(cache.get(new TaskKey("globex", 1), loadFromDatabase)); // same id, other tenant
        System.out.println(cache.get(new TaskKey("acme", 2), loadFromDatabase));   // evicts the LRU entry
        clock.advance(31_000);
        System.out.println(cache.get(new TaskKey("acme", 2), loadFromDatabase));   // expired, reload
        cache.invalidate(new TaskKey("acme", 2));                                  // after a write
        System.out.println(cache.get(new TaskKey("acme", 2), loadFromDatabase));
        System.out.println(cache.stats());
    }
}

record TaskKey(String tenantId, int taskId) {}

final class FakeClock {
    private long millis;

    long now() {
        return millis;
    }

    void advance(long delta) {
        millis += delta;
    }
}

final class BoundedTtlCache<K, V> {
    private record Entry<V>(V value, long expiresAt) {}

    private final Map<K, Entry<V>> map;
    private final long ttlMillis;
    private final FakeClock clock;
    private int hits;
    private int misses;
    private int evictions;

    BoundedTtlCache(int maxEntries, long ttlMillis, FakeClock clock) {
        this.ttlMillis = ttlMillis;
        this.clock = clock;
        this.map = new LinkedHashMap<>(16, 0.75f, true) {   // access order gives LRU
            @Override
            protected boolean removeEldestEntry(Map.Entry<K, Entry<V>> eldest) {
                boolean evict = size() > maxEntries;
                if (evict) {
                    evictions++;
                }
                return evict;
            }
        };
    }

    synchronized V get(K key, Function<K, V> loader) {
        Entry<V> entry = map.get(key);
        if (entry != null && entry.expiresAt() > clock.now()) {
            hits++;
            return entry.value();
        }
        misses++;
        V value = loader.apply(key);
        map.put(key, new Entry<>(value, clock.now() + ttlMillis));
        return value;
    }

    synchronized void invalidate(K key) {
        map.remove(key);
    }

    synchronized String stats() {
        return "hits=" + hits + " misses=" + misses + " evictions=" + evictions + " size=" + map.size();
    }
}
```

```text
  (database read for TaskKey[tenantId=acme, taskId=1])
title-1@acme
title-1@acme
  (database read for TaskKey[tenantId=globex, taskId=1])
title-1@globex
  (database read for TaskKey[tenantId=acme, taskId=2])
title-2@acme
  (database read for TaskKey[tenantId=acme, taskId=2])
title-2@acme
  (database read for TaskKey[tenantId=acme, taskId=2])
title-2@acme
hits=1 misses=5 evictions=1 size=2
```

Task 1 exists in both tenants and the two values never mix, because the tenant is part of the key. This demo holds a lock while loading, which is fine for learning but serializes all loads; production caches such as Caffeine load per key and let only one caller load a missing key while others wait, which also prevents stampedes. Expose hit, miss, and eviction counts as metrics so you can prove the cache is earning its memory.

> **Warning:** Never cache authorization decisions or permission-filtered results under a key that omits the user or role. When a permission is revoked, a long-lived cached "allowed" answer keeps granting access until it expires.

## Common mistakes

**Acknowledging before the effect commits.** Wrong: `message.ack(); repository.save(effect);`. A crash between the lines loses the work permanently, because the broker believes it was handled. Fix: commit the effect (with its processed-message marker) first, then acknowledge, and accept duplicates.

**Deduplicating in memory only.** Wrong: a `HashSet<String>` of processed IDs in the consumer object. It empties on every restart and is not shared between instances, which is exactly when redeliveries arrive. Fix: store processed IDs durably, in the same transaction as the effect, with a unique constraint.

**Believing the outbox removes duplicates.** Wrong: "we have an outbox, so consumers can just count events". The relay's publish-then-mark sequence can repeat a publish after a crash. Fix: give every event a stable unique ID assigned when the outbox row is written, and make every consumer idempotent.

**Generating the event ID in the relay.** Wrong: `UUID.randomUUID()` at publish time. The retried publish gets a new ID and deduplication cannot recognize it. Fix: assign the ID once, when the outbox row is inserted.

**Treating compensation as undo.** Wrong: assuming a failed saga leaves no trace. Fix: design compensations as real business actions with their own idempotency, logging, and failure handling.

**Caching with an incomplete key.** Wrong: `cache.get(taskId)` in a multi-tenant service. Tenant B receives tenant A's data. Fix: a key record containing every result-affecting dimension.

**Unbounded caches.** Wrong: `static final Map<Long, Task> CACHE = new HashMap<>();` that only grows. It becomes a memory leak and eventually an `OutOfMemoryError`. Fix: a maximum size and a time to live, always.

## Best practices

- Write down the failure model first: which component can crash, when, and what the user sees in each case.
- Prefer additive API changes, keep old-version fixtures in tests, and document deprecation windows.
- Assign unique IDs at the source of every command and event; propagate them end to end.
- Make handlers idempotent by construction (set state, not increment) where the domain allows it; otherwise use a durable processed-message store.
- Put the outbox insert in the same transaction as the state change; keep the relay simple and observable (lag and pending count are excellent metrics).
- Use sagas only when separate transactional boundaries truly exist; order steps so irreversible ones come last.
- Start without a cache. Add one only with a measured need, a bounded size, a TTL, a complete key, and metrics.
- Do not add a broker, a saga, or microservices merely because they sound professional. A justified "we did not need this" is a senior answer.

## Summary

- Compatibility means old readers survive new data and new readers survive old data; expand first, contract later.
- Networks make duplicates normal. At-least-once delivery plus an idempotent effect gives effectively-once processing.
- Idempotency keys protect client retries; a processed-message table, written in the same transaction as the effect, protects consumers.
- The dual-write problem loses events; the transactional outbox makes the state change and the intent to publish atomic.
- The outbox relay publishes and then records completion in separate systems, so a crash between them causes a republish. Consumers must tolerate it.
- A saga chains local transactions with compensations, which are new business actions, not rollbacks.
- A cache needs a complete key, a bound, expiry, invalidation, and stampede control.

## Practice

**Warm-up:** Classify ten API changes of your own invention (renames, new fields, type changes, new enum values) using the compatibility table, and justify each classification in one sentence.

**Warm-up:** Modify `IdempotencyKeyDemo` so stored keys expire after a configurable window using a fake clock, and show that a retry after expiry creates a second task. Explain why the window must exceed the client's maximum retry period.

**Core:** Extend `OutboxDemo` so the relay can crash *before* publishing a chosen row, then restart it. Record in a short table which crash points cause loss, duplicates, or neither.

**Core:** Replace the consumer's in-memory set with a small `ProcessedStore` interface and an implementation that simulates a unique constraint. Show that two consumer instances sharing the store still apply each event once.

**Challenge:** Make the saga coordinator persist its progress to a map after every step, simulate a coordinator crash after the second step, and write a `resume` method that continues or compensates correctly. Make every step idempotent so resuming twice is harmless.

**Challenge:** Add single-flight loading to `BoundedTtlCache` so that concurrent misses for the same key trigger only one load. Test it with virtual threads and a loader that counts invocations.

## Check your understanding

1. Why is adding a new value to a response enum riskier than adding a new optional field?
2. In an at-least-once consumer, what exactly must happen before the acknowledgment is sent, and why?
3. Walk through each crash point of an outbox relay. At which point does a duplicate publish become unavoidable, and why can the relay not simply close that gap?
4. Why must an event's unique ID be assigned when the outbox row is written rather than when it is published?
5. Give an example of a saga step whose compensation cannot fully restore the original state, and explain how you would order the steps because of it.
6. A cache key is built from the task ID alone in a multi-tenant service. Describe the failure and the fix.
