# Strategy, Command, State, Template Method, Observer, and events

Where the previous lesson's patterns managed construction and wrapping, this lesson's patterns manage **behavior that varies** — an algorithm chosen at runtime, an action represented as an object, a state machine's transitions, a fixed skeleton with pluggable steps, and reactions to something that happened. Each solves a specific, recognizable problem, and each has a specific way of being misused when reached for reflexively rather than for its actual pressure.

What you will learn:

- Strategy: selecting an algorithm at runtime, injected rather than hard-coded
- Command: representing an action (and its parameters) as an object, and why that enables queuing, logging, and undo
- Why a Command interface does not, by itself, make repeated execution safe — idempotency is a separate contract
- State: modeling an object whose behavior changes based on an internal state, without a sprawl of conditionals
- Template Method: a fixed algorithm skeleton with specific steps left to subclasses
- Observer and events: decoupling a source of change from the code that reacts to it

## Strategy: an algorithm chosen at runtime

**Strategy** extracts an algorithm into its own interface, letting the algorithm actually used be selected — and injected — at runtime, rather than hard-coded inside the class that needs it:

```java
public interface PricingStrategy {
    int priceFor(int baseAmountCents);
}

public final class StandardPricing implements PricingStrategy {
    @Override public int priceFor(int baseAmountCents) { return baseAmountCents; }
}

public final class LoyaltyDiscountPricing implements PricingStrategy {
    @Override public int priceFor(int baseAmountCents) { return baseAmountCents * 90 / 100; }
}

public final class Quote {
    private final PricingStrategy pricingStrategy;

    public Quote(PricingStrategy pricingStrategy) { // injected, not hard-coded
        this.pricingStrategy = pricingStrategy;
    }

    public int quote(int baseAmountCents) {
        return pricingStrategy.priceFor(baseAmountCents); // delegates; Quote itself has no pricing logic
    }
}
```

The essential property, and exactly what this chapter's debug lab is built to test: `Quote.quote` must actually route its calculation through the injected strategy. Code that accepts a `PricingStrategy` parameter and then ignores it, computing the result some other way (or simply returning the raw input unchanged), has an unused dependency-injection point that looks correct but is not — the whole reason Strategy exists is defeated the moment the injected behavior stops being what actually determines the result. This is precisely the Dependency Inversion Principle from Lesson 2, applied to a single piece of swappable behavior rather than a whole subsystem.

## Command: an action as an object

**Command** turns a request — an action plus the parameters it needs — into an object, rather than an immediate method call. This enables things a direct call cannot: queuing commands for later execution, logging them for an audit trail, and (with additional support) undoing them.

```java
public interface Command {
    void execute();
}

public final class TransferFundsCommand implements Command {
    private final AccountId from;
    private final AccountId to;
    private final int amountCents;
    private final TransferService transferService;

    public TransferFundsCommand(AccountId from, AccountId to, int amountCents, TransferService transferService) {
        this.from = from;
        this.to = to;
        this.amountCents = amountCents;
        this.transferService = transferService;
    }

    @Override
    public void execute() {
        transferService.transfer(from, to, amountCents);
    }
}
```

```java
// A queue of commands can be built, logged, and executed later — impossible with a direct method call,
// which happens immediately and leaves nothing to queue or replay.
Queue<Command> pendingCommands = new LinkedList<>();
pendingCommands.add(new TransferFundsCommand(accountA, accountB, 5000, transferService));
// ... later, possibly after a review step, or from a durable queue after a restart ...
for (Command command : pendingCommands) {
    command.execute();
}
```

## Idempotency is not automatic — it is a separate contract

This chapter's concept-check question makes a specific, important point that is easy to overlook: wrapping an action in a `Command` object does **not**, by itself, make executing it twice safe. `execute()` is just a method; nothing about the `Command` interface prevents it from running more than once, and nothing about the interface guarantees what happens if it does. Whether repeated execution is safe is exactly the idempotency question from Chapter 18 — a property the *specific* command's implementation must deliberately provide, not something Command as a pattern grants for free:

```java
// NOT automatically safe to execute twice: running it twice transfers funds twice.
public final class TransferFundsCommand implements Command {
    @Override
    public void execute() {
        transferService.transfer(from, to, amountCents); // no deduplication at all
    }
}

// Made safe to retry: the command itself carries an idempotency key the underlying
// service can use to detect and ignore a duplicate execution, exactly as Chapter 18 described.
public final class IdempotentTransferFundsCommand implements Command {
    private final String idempotencyKey;
    // ...
    @Override
    public void execute() {
        transferService.transferIdempotently(idempotencyKey, from, to, amountCents);
    }
}
```

A command queue that might redeliver a command after a crash (a durable, at-least-once queue, common in distributed systems) must be paired with commands that are either naturally idempotent (a `SetBalanceTo(500)` command, unlike `Add(500)`) or explicitly protected with a deduplication key — assuming "it's a Command object, so it's safe to retry" is a direct instance of confusing the pattern's structural benefit (representing an action as a first-class object) with a safety property (idempotency) that the pattern says nothing about at all.

## State: behavior that changes with an object's internal state

The **State** pattern models an object whose allowed behavior depends on which state it is currently in, replacing a sprawl of `if`/`switch` statements checking a status field everywhere that status matters:

```java
// Without State: every method must check the status field, and every new status
// means finding and updating every one of these checks.
public final class OrderWithConditionals {
    private String status; // "PLACED", "SHIPPED", "DELIVERED", "CANCELLED"

    public void ship() {
        if (!status.equals("PLACED")) throw new IllegalStateException("cannot ship from " + status);
        status = "SHIPPED";
    }
    public void cancel() {
        if (status.equals("DELIVERED")) throw new IllegalStateException("cannot cancel a delivered order");
        status = "CANCELLED";
    }
}
```

```java
// With State: each state is its own class, owning exactly the transitions valid from it.
public interface OrderState {
    OrderState ship();
    OrderState cancel();
}

public final class Placed implements OrderState {
    @Override public OrderState ship() { return new Shipped(); }
    @Override public OrderState cancel() { return new Cancelled(); }
}

public final class Shipped implements OrderState {
    @Override public OrderState ship() { throw new IllegalStateException("already shipped"); }
    @Override public OrderState cancel() { throw new IllegalStateException("cannot cancel a shipped order"); }
}

public final class Delivered implements OrderState {
    @Override public OrderState ship() { throw new IllegalStateException("already delivered"); }
    @Override public OrderState cancel() { throw new IllegalStateException("cannot cancel a delivered order"); }
}

public final class Cancelled implements OrderState {
    @Override public OrderState ship() { throw new IllegalStateException("order is cancelled"); }
    @Override public OrderState cancel() { throw new IllegalStateException("already cancelled"); }
}
```

Adding a new state (a `Returned` state, say) now means writing one new class implementing the transitions valid *from* that state, rather than finding and updating every existing conditional across the codebase that branches on the status field — the same Open/Closed Principle benefit from Lesson 2, applied specifically to state-dependent behavior. For a small, stable number of states with simple transition rules, a plain enum with a validating method can be entirely sufficient; State earns its cost when the number of states or the complexity of per-state behavior grows enough that the conditional sprawl becomes genuinely hard to maintain safely.

## Template Method: a fixed skeleton, pluggable steps

**Template Method** defines an algorithm's overall structure in a base class, with specific steps deferred to subclasses (or, in modern Java, to injected functional parameters):

```java
public abstract class ReportGenerator {

    // The template method: fixes the overall algorithm's shape, final so subclasses cannot reorder it.
    public final String generate(List<Record> records) {
        List<Record> filtered = filter(records);
        List<Record> sorted = sort(filtered);
        return format(sorted); // each step below is customizable; the sequence itself is not
    }

    protected List<Record> filter(List<Record> records) { return records; } // default: no filtering
    protected abstract List<Record> sort(List<Record> records);              // subclass must decide ordering
    protected abstract String format(List<Record> records);                  // subclass must decide output format
}

public final class CsvReportGenerator extends ReportGenerator {
    @Override protected List<Record> sort(List<Record> records) {
        return records.stream().sorted(Comparator.comparing(Record::date)).toList();
    }
    @Override protected String format(List<Record> records) {
        return records.stream().map(Record::toCsvLine).collect(Collectors.joining("\n"));
    }
}
```

The `final` on `generate` is deliberate: it is what actually enforces that the algorithm's overall shape (filter, then sort, then format, in that order) cannot be silently rearranged by a subclass — only the individual steps marked as customization points can vary. Without that structural enforcement, "Template Method" degrades into an ordinary base class that happens to have some overridable methods, with nothing actually guaranteeing the sequence subclasses were meant to respect.

## Observer and events: decoupling a change from its reactions

**Observer** lets one or more interested parties register to be notified when something happens, without the source of the change needing to know anything about who is listening or how many listeners exist:

```java
public interface OrderPlacedListener {
    void onOrderPlaced(Order order);
}

public final class OrderService {
    private final List<OrderPlacedListener> listeners = new ArrayList<>();

    public void addListener(OrderPlacedListener listener) { listeners.add(listener); }

    public void placeOrder(Order order) {
        persistOrder(order);
        for (OrderPlacedListener listener : listeners) {
            listener.onOrderPlaced(order); // OrderService has no idea what any listener does
        }
    }

    private void persistOrder(Order order) { /* ... */ }
}
```

```java
orderService.addListener(order -> emailService.sendConfirmation(order));
orderService.addListener(order -> inventoryService.reserveStock(order));
orderService.addListener(order -> analyticsService.recordSale(order));
```

`OrderService.placeOrder` remains entirely unaware of email, inventory, or analytics — adding a fourth reaction to a placed order means registering a new listener, not modifying `OrderService` itself, which is again the Open/Closed Principle in action. At larger scale (across process or service boundaries, rather than within one JVM), this same idea becomes an **event**, typically published to a message queue or event bus rather than called directly through an in-process listener list — the structural benefit (source decoupled from reactions) is identical; only the transport mechanism and the failure modes (a listener that might not receive the event at all, requiring the retry and idempotency discipline from Chapter 18) change.

## What happens under the hood: from an injected strategy to a decoupled listener call

1. A `Strategy` implementation is chosen (by a factory, configuration, or direct construction) and passed into the class that will use it; that class's methods call the strategy's interface method wherever the swappable algorithm is needed, never containing the algorithm's logic itself.
2. A `Command` object is constructed with everything `execute()` will need already captured as fields; calling `execute()` later performs the action using exactly that captured state, which is what makes queuing, logging, or delaying execution possible at all.
3. A `State` object's transition method returns a *new* state object (or the same one, for a no-op transition), and the owning object replaces its held reference — each subsequent call is dispatched to whichever concrete state object is currently held, with no conditional needed at the call site.
4. `Template Method`'s fixed method calls each customization-point method in a fixed order, dispatching virtually to whichever subclass override is present — the caller of the template method sees only the fixed method, unaware of which specific steps ran underneath.
5. An `Observer`'s subject iterates its registered listener list synchronously (for the in-process case) at the moment the event occurs, calling each listener in turn; for a message-queue-based event, the publish and the eventual delivery to each subscriber are decoupled in time as well as in code, which is exactly why event-based reactions need the retry/idempotency discipline from Chapter 18.

## Common mistakes

**Mistake 1: accepting an injected Strategy but not actually using it.** The dependency-injection point exists but the computation happens some other way, defeating the entire purpose. Fix: verify every code path that should use the injected behavior actually calls it, exactly as this chapter's debug lab tests.

**Mistake 2: assuming a Command is safe to execute more than once because it is "just an object."** Idempotency is a property of the specific implementation, not a guarantee the Command interface provides. Fix: design idempotency deliberately (a natural absolute-value command, or an explicit deduplication key) for any command that might be retried or redelivered.

**Mistake 3: using State for a small, stable set of states with trivial transition logic.** A full class hierarchy for two or three states with simple rules is unnecessary ceremony. Fix: a validated enum is often sufficient until the transition complexity actually grows.

**Mistake 4: a "Template Method" that is not actually `final`, letting subclasses silently reorder the algorithm's steps.** This removes the one guarantee the pattern is meant to provide. Fix: make the template method itself `final`, leaving only the designated customization points overridable.

## Best practices

- Verify an injected Strategy is genuinely on every code path that computes the result it is meant to control.
- Design command idempotency deliberately wherever a command might be retried or redelivered; never assume the pattern grants it.
- Reach for State only once conditional sprawl on a status field has become genuinely hard to maintain; a validated enum is often enough for a small state space.
- Mark a Template Method's fixed method `final`, so only its designated customization points can vary.
- Keep an Observer's subject fully unaware of what its listeners do; adding a new reaction should never require modifying the subject.

## Summary

- Strategy injects a swappable algorithm; the injected behavior must actually be used, or the pattern's purpose is defeated.
- Command represents an action as an object, enabling queuing, logging, and (with support) undo — but idempotency is a separate, deliberately designed contract, not a free property of the pattern.
- State replaces status-field conditional sprawl with one class per state, each owning its own valid transitions; a small stable state space may not need it.
- Template Method fixes an algorithm's overall shape while leaving specific steps to subclasses; making the template method `final` is what actually enforces the fixed sequence.
- Observer (and, at larger scale, events) decouples a source of change from the code that reacts to it, letting new reactions be added without modifying the source.

## Practice

1. **Warm-up:** Explain, precisely, why accepting a `PricingStrategy` parameter but computing the price a different way defeats the pattern, even though the code compiles and the parameter is technically used somewhere.
2. **Warm-up:** Design a `Command` that is naturally idempotent (its repeated execution produces the same end state) without needing an explicit deduplication key, and explain why.
3. **Core:** Implement an `OrderState` hierarchy (or a validated enum, if the state space is small) for a simple order lifecycle, and write tests confirming both valid and invalid transitions behave correctly.
4. **Core:** Implement a `Template Method` report generator with at least two subclasses providing different formatting, and confirm the `final` template method prevents a subclass from reordering its steps.
5. **Challenge:** Implement an in-process Observer for a domain event (like "order placed"), with at least two independent listeners, and then describe (in prose) how the same reactions would need to change if the event were instead published to a message queue consumed by separate services.

## Check your understanding

1. What does it mean for a Strategy to be "injected but unused," and why does that defeat the pattern's purpose?
2. Why does wrapping an action in a Command object not, by itself, make repeated execution of that action safe?
3. What specific problem does the State pattern solve compared to a status field checked by conditionals scattered throughout a class?
4. Why is marking a Template Method `final` important to the guarantee the pattern is meant to provide?
5. What does an Observer's subject remain unaware of, and why is that unawareness the whole point of the pattern?
6. What changes about the failure modes of an event-based reaction when the event is published to a message queue rather than called through an in-process listener list?
