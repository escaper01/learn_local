# Threat modeling, assets, actors, authentication, and authorization

Most security failures in real Java services are not exotic cryptographic breaks. They are ordinary design gaps: an endpoint that returns a record because the caller is logged in, an update that lets the client overwrite the owner field, an admin operation that is "hidden" only because the UI does not show a button. These bugs pass unit tests, pass code review when nobody asks the right question, and then leak thousands of records in production.

Threat modeling is the habit of asking the right questions *before* the code exists: what is valuable here, who can reach it, through which doors, and what stops the wrong person. Authentication and authorization are the two controls you will write most often as a backend developer, and confusing them is one of the most common vulnerabilities in web APIs.

## What you will learn

- How to describe a system in terms of assets, actors, entry points, and trust boundaries
- How to use STRIDE as a checklist for finding threats
- The precise difference between authentication and authorization
- Why object-level authorization must be checked on the server for every request that names a resource
- How mass assignment lets a client change fields it should never control
- How to design deny-by-default, fail-closed authorization policies
- How to test authenticated-but-unauthorized scenarios

## Assets, actors, entry points, and trust boundaries

A threat model starts with four lists. Keep them short and concrete; a vague model is not useful.

- **Assets** are things worth protecting: private task titles, email addresses, password hashes, API keys, the ability to delete data, the availability of the service itself.
- **Actors** are who interacts with the system: anonymous visitors, registered users, support staff, administrators, other services, and attackers who may be any of these.
- **Entry points** are where input arrives: HTTP endpoints, message queue consumers, file uploads, scheduled jobs reading external data, admin consoles, CLI tools.
- **Trust boundaries** are lines where data moves from less trusted to more trusted code: browser to server, server to database, your service to a third-party API, uploaded file to parser.

An analogy: think of a building. Assets are what is inside the rooms. Actors are the people who walk around. Entry points are doors and windows. Trust boundaries are the places where a guard should check a badge. Threat modeling is walking the floor plan and asking, at every door, "who can open this, and what stops the wrong person?"

For a task-tracking API, a first-pass model might look like this:

| Item | Examples in a task service |
|---|---|
| Assets | Task titles and notes, owner identities, session tokens, audit log, service availability |
| Actors | Anonymous user, task owner, other registered user, support agent, administrator, attacker with a stolen token |
| Entry points | `POST /tasks`, `GET /tasks/{id}`, `PATCH /tasks/{id}`, `DELETE /tasks/{id}`, `GET /admin/export`, CSV import job |
| Trust boundaries | Internet to API gateway, API to database, API to email provider, uploaded CSV to parser |

> **Tip:** Draw the data flow on paper: boxes for processes, cylinders for data stores, arrows for data flows, and a dashed line wherever trust changes. Every arrow that crosses a dashed line is a place where you must validate, authenticate, or authorize.

## Finding threats with STRIDE

Staring at a diagram and "thinking like an attacker" is hard for beginners. STRIDE, a mnemonic from Microsoft, gives you six categories to check against every entry point and data flow.

| Letter | Threat | Property violated | Task-service example | Typical mitigation |
|---|---|---|---|---|
| S | Spoofing | Authentication | Using a stolen or forged session token | Strong authentication, token expiry, MFA |
| T | Tampering | Integrity | Changing `ownerId` in an update body | Server-side field allowlists, integrity checks |
| R | Repudiation | Non-repudiation | User denies deleting a task | Audit log with actor, action, time, target |
| I | Information disclosure | Confidentiality | Reading another user's task by guessing its ID | Object-level authorization |
| D | Denial of service | Availability | Uploading a 5 GB CSV | Size limits, timeouts, rate limits |
| E | Elevation of privilege | Authorization | A normal user calling the admin export | Role checks on the server, least privilege |

For each threat you record: the threat, the mitigation, how you will test it, and any residual assumption ("we assume the API gateway strips spoofed `X-User` headers"). A threat model is a table of *connected* decisions, not a list of security buzzwords.

## Authentication versus authorization

These two words sound alike and are constantly confused, so fix them in your mind now.

- **Authentication** answers "*who* is making this request?" It verifies a credential (password, session cookie, bearer token, client certificate) and produces an identity, often called a principal.
- **Authorization** answers "*may this* principal perform *this* action on *this* specific resource, right now?"

Authentication happens once per request (or once per session). Authorization has to happen for every action and, crucially, for every *object* the action touches. Being logged in proves identity; it grants nothing by itself.

| Question | Authentication | Authorization |
|---|---|---|
| What does it decide? | Identity of the caller | Permission for an action on a resource |
| Typical failure status | 401 Unauthorized (really "unauthenticated") | 403 Forbidden, or 404 to hide existence |
| Inputs | Credential: password, token, certificate | Principal, action, resource, context |
| Where it lives | A filter or middleware before your controller | Service or policy code that knows about the resource |
| Example bug | Accepting an expired token | Returning task 102 to a user who does not own it |

### Levels of authorization

Authorization happens at several levels, and you need all of them:

1. **Function level:** may this principal call this operation at all? (Only admins may call `/admin/export`.)
2. **Object level:** may this principal act on *this particular* record? (Alice may read task 101 because she owns it, not task 102.)
3. **Field level:** may this principal read or change *this particular* field? (A user may change `title` but never `ownerId`.)

Object-level authorization failures are so common that API security guidance lists broken object-level authorization as the number one API risk. The pattern is always the same: the request contains an identifier, the server trusts that the identifier is one the caller should see, and never checks.

## A complete example: the insecure direct object reference

The following program models an API with two users. The vulnerable endpoint authenticates the caller and then returns whatever task ID was requested. The fixed endpoint adds the object-level check. This is plain Java 21, so you can run it with `java TaskAccessDemo.java`.

```java
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

public class TaskAccessDemo {
    public static void main(String[] args) {
        TaskStore store = new TaskStore();
        store.add(new Task(101, "alice", "Buy milk"));
        store.add(new Task(102, "bob", "Salary negotiation notes"));
        Authenticator auth = new Authenticator(Map.of(
                "token-alice", "alice",
                "token-bob", "bob"));

        String[][] requests = {
                {"token-alice", "101"},
                {"token-alice", "102"},
                {"token-bob", "102"},
                {"forged-token", "101"},
                {"token-alice", "999"}
        };

        System.out.println("-- vulnerable: authentication only --");
        for (String[] r : requests) {
            System.out.println(r[0] + " GET /tasks/" + r[1] + " -> "
                    + vulnerableGet(auth, store, r[0], Long.parseLong(r[1])));
        }
        System.out.println("-- fixed: authentication + object-level authorization --");
        for (String[] r : requests) {
            System.out.println(r[0] + " GET /tasks/" + r[1] + " -> "
                    + fixedGet(auth, store, r[0], Long.parseLong(r[1])));
        }
    }

    static String vulnerableGet(Authenticator auth, TaskStore store, String token, long id) {
        Optional<String> user = auth.authenticate(token);
        if (user.isEmpty()) {
            return "401 Unauthorized";
        }
        // BUG: any logged-in user can read any task whose ID they can guess.
        return store.find(id).map(t -> "200 " + t.title()).orElse("404 Not Found");
    }

    static String fixedGet(Authenticator auth, TaskStore store, String token, long id) {
        Optional<String> user = auth.authenticate(token);
        if (user.isEmpty()) {
            return "401 Unauthorized";
        }
        String caller = user.get();
        return store.find(id)
                .filter(t -> t.ownerId().equals(caller))   // object-level check
                .map(t -> "200 " + t.title())
                .orElse("404 Not Found");                  // same answer as "missing"
    }
}

record Task(long id, String ownerId, String title) {}

final class TaskStore {
    private final Map<Long, Task> tasks = new HashMap<>();
    void add(Task task) { tasks.put(task.id(), task); }
    Optional<Task> find(long id) { return Optional.ofNullable(tasks.get(id)); }
}

final class Authenticator {
    private final Map<String, String> sessions;
    Authenticator(Map<String, String> sessions) { this.sessions = Map.copyOf(sessions); }
    Optional<String> authenticate(String token) {
        return Optional.ofNullable(sessions.get(token));
    }
}
```

Output:

```text
-- vulnerable: authentication only --
token-alice GET /tasks/101 -> 200 Buy milk
token-alice GET /tasks/102 -> 200 Salary negotiation notes
token-bob GET /tasks/102 -> 200 Salary negotiation notes
forged-token GET /tasks/101 -> 401 Unauthorized
token-alice GET /tasks/999 -> 404 Not Found
-- fixed: authentication + object-level authorization --
token-alice GET /tasks/101 -> 200 Buy milk
token-alice GET /tasks/102 -> 404 Not Found
token-bob GET /tasks/102 -> 200 Salary negotiation notes
forged-token GET /tasks/101 -> 401 Unauthorized
token-alice GET /tasks/999 -> 404 Not Found
```

Look at the second line of each block. In the vulnerable version, Alice is correctly authenticated, the ID `102` is a perfectly valid number that parses and exists, and she still reads Bob's private notes. Neither "the token is valid" nor "the ID is well-formed" says anything about ownership. The attack input here is nothing clever: just an incremented ID.

### 403 or 404?

The fixed version answers "404 Not Found" for a task that exists but belongs to someone else. That is deliberate: returning 403 would confirm to an attacker that task 102 exists, letting them enumerate valid IDs. Returning 404 for both "missing" and "not yours" hides existence. Use 403 when the resource's existence is not secret (for example, a shared project the user can see but not edit).

> **Note:** Unguessable IDs such as random UUIDs make enumeration harder, but they are not authorization. IDs leak through URLs, logs, browser history, and shared links. Always check ownership on the server.

## The same check in a real service layer

In a Spring application (covered in Chapter 24) the same rule usually lives in the service, where the resource is loaded. This fragment requires Spring and application-defined types; it is shown for shape, not to run here.

```java
@Transactional(readOnly = true)
public TaskView findForCaller(long taskId, UserId caller) {
    Task task = tasks.findById(taskId)
            .filter(t -> t.ownerId().equals(caller))
            .orElseThrow(() -> new TaskNotFoundException(taskId));
    return TaskView.from(task);
}
```

An even stronger pattern is to push ownership into the query itself so the database can never return another user's row:

```sql
SELECT id, title, status
FROM task
WHERE id = ? AND owner_id = ?
```

Scoping queries by owner is also how list endpoints must work: `GET /tasks` must return `WHERE owner_id = ?`, never "all tasks" filtered in the browser.

## Field-level authorization and mass assignment

*Mass assignment* happens when code copies every field from a request body onto a domain object. The client then controls fields you never intended to expose, such as `ownerId`, `role`, `isAdmin`, or `price`. Frameworks that bind JSON directly to entities make this easy to do by accident.

```java
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public class MassAssignmentDemo {
    public static void main(String[] args) {
        // What an attacker sends in a PATCH /tasks/7 body (already parsed from JSON):
        Map<String, String> body = new LinkedHashMap<>();
        body.put("title", "Updated title");
        body.put("ownerId", "mallory");
        body.put("status", "DONE");

        MutableTask a = new MutableTask(7, "alice", "Draft", "OPEN");
        vulnerableBind(a, body);
        System.out.println("vulnerable result: " + a);

        MutableTask b = new MutableTask(7, "alice", "Draft", "OPEN");
        try {
            UpdateTaskRequest request = UpdateTaskRequest.from(body);
            b.title = request.title();
            b.status = request.status();
        } catch (IllegalArgumentException e) {
            System.out.println("fixed binder rejected request: " + e.getMessage());
        }
        System.out.println("fixed result:      " + b);

        Map<String, String> honest = Map.of("title", "Updated title", "status", "DONE");
        UpdateTaskRequest ok = UpdateTaskRequest.from(honest);
        b.title = ok.title();
        b.status = ok.status();
        System.out.println("honest update:     " + b);
    }

    // Copies every incoming key onto the entity: the client controls ownership.
    static void vulnerableBind(MutableTask task, Map<String, String> body) {
        body.forEach((key, value) -> {
            switch (key) {
                case "title" -> task.title = value;
                case "ownerId" -> task.ownerId = value;
                case "status" -> task.status = value;
                default -> { }
            }
        });
    }
}

final class MutableTask {
    final long id;
    String ownerId;
    String title;
    String status;

    MutableTask(long id, String ownerId, String title, String status) {
        this.id = id;
        this.ownerId = ownerId;
        this.title = title;
        this.status = status;
    }

    @Override
    public String toString() {
        return "Task[id=" + id + ", owner=" + ownerId + ", title=" + title + ", status=" + status + "]";
    }
}

// Only the fields a client may change. Owner is never client-controlled.
record UpdateTaskRequest(String title, String status) {
    private static final Set<String> ALLOWED = Set.of("title", "status");

    static UpdateTaskRequest from(Map<String, String> body) {
        for (String key : body.keySet()) {
            if (!ALLOWED.contains(key)) {
                throw new IllegalArgumentException("unknown field '" + key + "'");
            }
        }
        return new UpdateTaskRequest(body.get("title"), body.get("status"));
    }
}
```

Output:

```text
vulnerable result: Task[id=7, owner=mallory, title=Updated title, status=DONE]
fixed binder rejected request: unknown field 'ownerId'
fixed result:      Task[id=7, owner=alice, title=Draft, status=OPEN]
honest update:     Task[id=7, owner=alice, title=Updated title, status=DONE]
```

The fix is a dedicated request type (a DTO) that contains only the client-editable fields. The owner is set by the server from the authenticated principal at creation time and never read from the body. Rejecting unknown fields is stricter than silently ignoring them; either is acceptable as long as the owner never flows from the client.

## Deny by default and fail closed

A good authorization policy is written so that "allowed" must be *earned*. Every rule starts from "no" and adds narrow reasons for "yes". If essential information is missing, such as the principal, the resource, or the policy configuration, the answer is "no".

```java
import java.util.List;
import java.util.Set;

public class PolicyDemo {
    public static void main(String[] args) {
        Principal alice = new Principal("alice", Set.of(Role.USER));
        Principal carol = new Principal("carol", Set.of(Role.USER, Role.SUPPORT));
        Principal admin = new Principal("root", Set.of(Role.ADMIN));
        Principal nobody = null; // identity missing, e.g. a filter was misconfigured

        TaskInfo task = new TaskInfo(42, "alice");

        List<Principal> callers = java.util.Arrays.asList(alice, carol, admin, nobody);
        for (Principal p : callers) {
            StringBuilder line = new StringBuilder(String.format("%-6s", p == null ? "null" : p.id()));
            for (Action action : Action.values()) {
                boolean allowed = TaskPolicy.isAllowed(p, action, task);
                line.append(String.format(" %s=%-5s", action, allowed));
            }
            System.out.println(line.toString().stripTrailing());
        }
    }
}

enum Role { USER, SUPPORT, ADMIN }

enum Action { READ, UPDATE, DELETE, EXPORT_ALL }

record Principal(String id, Set<Role> roles) {}

record TaskInfo(long id, String ownerId) {}

final class TaskPolicy {
    private TaskPolicy() {}

    // Deny by default: every branch must argue its way to "true".
    static boolean isAllowed(Principal principal, Action action, TaskInfo task) {
        if (principal == null || principal.id() == null || task == null) {
            return false; // fail closed when essential facts are missing
        }
        boolean owner = principal.id().equals(task.ownerId());
        return switch (action) {
            case READ -> owner || principal.roles().contains(Role.SUPPORT);
            case UPDATE, DELETE -> owner;
            case EXPORT_ALL -> principal.roles().contains(Role.ADMIN);
        };
    }
}
```

Output:

```text
alice  READ=true  UPDATE=true  DELETE=true  EXPORT_ALL=false
carol  READ=true  UPDATE=false DELETE=false EXPORT_ALL=false
root   READ=false UPDATE=false DELETE=false EXPORT_ALL=true
null   READ=false UPDATE=false DELETE=false EXPORT_ALL=false
```

Notice three design choices:

- The switch over an enum is exhaustive. If someone adds a new `Action`, the compiler forces them to decide its rule instead of silently inheriting "allowed".
- The admin cannot read Alice's task in this policy. Administrators get only the powers they need (least privilege); "admin can do everything" is a decision you should make consciously, not a default.
- A `null` principal is denied everything. A misconfigured authentication filter should produce a locked door, not an open one.

## What happens under the hood: a request's security journey

Trace a single `GET /tasks/102` request through a well-designed service:

1. TLS terminates at the load balancer or server; the request body and token are now readable by the server only.
2. An authentication filter extracts the bearer token, verifies its signature and expiry, and builds a principal (`alice`). Failure stops here with 401.
3. A function-level rule checks that the principal may call `GET /tasks/{id}` at all (any `USER` may). Failure stops with 403.
4. The controller parses and validates the path variable. `"abc"` fails with 400. Validation proves *shape*, not permission.
5. The service loads the task *scoped to the caller* or loads it and checks ownership. Failure returns 404.
6. The response is built from a view DTO containing only fields the caller may see.
7. An audit event records `actor=alice action=READ target=task:102 result=DENIED` without logging the token.

Every step has its own job. Skipping step 5 because steps 2 and 4 succeeded is exactly the bug in the vulnerable demo.

## Least privilege beyond the code

Authorization is not only an `if` statement. Apply the same principle to the infrastructure your code uses:

- The application's database account should have `SELECT`, `INSERT`, `UPDATE`, `DELETE` on its own tables, not `DROP` or superuser rights. Migrations can run with a separate, more privileged account.
- The process should run as a non-root OS user with write access only to the directories it needs.
- API keys for third-party services should be scoped to the minimum operations (send email, not manage account).
- Internal admin endpoints should sit behind a separate network boundary *and* require authorization; network location alone is not identity.

## Common mistakes

### Mistake 1: trusting identity from the request body

```java
// WRONG: the client says who it is
TaskView create(CreateTaskRequest request) {
    return service.create(request.ownerId(), request.title());
}
```

Any client can put any `ownerId` in the body. **Fix:** take identity only from the authenticated principal established by the server, and remove `ownerId` from the request DTO.

```java
TaskView create(CreateTaskRequest request, UserId caller) {
    return service.create(caller, request.title());
}
```

### Mistake 2: hiding instead of authorizing

```java
// WRONG: "the admin button is only shown to admins"
@GetMapping("/admin/export")
List<TaskView> exportAll() { return service.all(); }
```

Attackers do not use your UI; they send HTTP requests directly. **Fix:** enforce the role check on the server for the endpoint itself.

### Mistake 3: checking on read but not on write

A team adds ownership checks to `GET /tasks/{id}` and forgets `PATCH` and `DELETE`, which call a different service method. **Fix:** put the check in one reusable place (a policy method or an owner-scoped repository query) and test every verb.

### Mistake 4: filtering on the client

Returning all tasks and letting the front end show only the user's own is disclosure: the full list is in the network response. **Fix:** filter in the query.

### Mistake 5: failing open

```java
// WRONG: if the policy lookup fails, let the request through
try {
    return policy.check(user, task);
} catch (Exception e) {
    return true;
}
```

**Fix:** errors in authorization produce a denial (and an alert), never an approval.

## Best practices

- Model assets, actors, entry points, and trust boundaries for every new feature, even in a ten-minute whiteboard session.
- Keep authentication in infrastructure (filters, framework security) and authorization close to the resource (services, policies, scoped queries).
- Check object-level authorization on every operation that accepts an identifier: read, update, delete, list, export, and nested resources like `/tasks/{id}/comments`.
- Use request DTOs that expose only client-editable fields; set ownership and roles on the server.
- Deny by default and fail closed; make rule sets exhaustive so new actions require explicit decisions.
- Prefer 404 for "exists but not yours" when existence itself is sensitive.
- Write tests for the *authenticated-but-unauthorized* actor, not just "anonymous gets 401". This is the test case most teams forget.
- Record security decisions (who, what, which object, allowed or denied) in an audit log without secrets.

## Summary

- A threat model lists assets, actors, entry points, and trust boundaries, then applies a checklist like STRIDE to each flow.
- Authentication establishes *who* the caller is; authorization decides *what that caller may do to this specific object*.
- A valid login plus a valid, parseable ID proves nothing about ownership. Object-level authorization is a separate, mandatory check.
- Mass assignment lets clients change fields such as owner or role; dedicated DTOs and server-set ownership prevent it.
- Deny by default, fail closed, grant least privilege, and test every verb with a logged-in user who does not own the resource.

## Practice

### Warm-up

1. For a simple notes API (create, read, update, delete, list, share), write the four threat-model lists: assets, actors, entry points, trust boundaries.
2. Classify ten example bugs (such as "expired token accepted" or "user reads another user's note") as authentication or authorization failures.

### Core

1. Extend `TaskAccessDemo` with `update` and `delete` operations and apply the object-level check to both. Add request cases proving Alice cannot modify Bob's task.
2. Add a `share` feature where an owner can grant read access to another user. Update the policy so shared users can read but not delete, and print a decision table like `PolicyDemo` does.
3. Write a STRIDE table for the notes API with at least one threat per letter, a mitigation, and a test idea for each.

### Challenge

1. Design an owner-scoped repository interface where it is impossible to load a task without supplying the caller's identity. Discuss what this makes harder for developers and what it makes impossible for attackers.
2. Add an audit trail to your demo that records every allowed and denied decision with actor, action, target, and result, and never includes tokens.

## Check your understanding

1. What is the difference between an asset and an entry point? Give one example of each for a banking app.
2. A request carries a valid token and a well-formed task ID. List the checks that must still happen before returning the task.
3. Why might an API return 404 instead of 403 when a user requests a resource they do not own?
4. How does a dedicated update DTO protect against mass assignment?
5. What does "fail closed" mean for an authorization policy, and why is it safer than failing open?
6. Why is an unguessable UUID not a substitute for an ownership check?
