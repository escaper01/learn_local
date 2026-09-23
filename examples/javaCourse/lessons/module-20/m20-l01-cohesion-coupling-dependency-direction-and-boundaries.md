# Cohesion, coupling, dependency direction, and boundaries

A program with five classes can survive almost any structure. A program with five hundred classes, three developers, a database, a web API, and a two-year history cannot. At that size the question is no longer "does it work?" but "when the business asks for a change, how many files do we touch, how much do we have to understand first, and how likely are we to break something unrelated?" That is what software architecture is about.

This lesson opens the chapter by giving you the vocabulary professionals use when they review designs: cohesion, coupling, dependency direction, and boundaries. You will also learn to read and sketch UML class diagrams, the lightweight notation teams use on whiteboards and in design documents.

What you will learn:

- What software architecture is, and why it is mostly about managing change
- How to recognize high and low cohesion in a class or package
- The kinds of coupling, and which ones hurt most
- The difference between the direction of a runtime call and the direction of a source-code dependency
- How a port interface lets policy code depend on the behavior it needs instead of on storage or transport details
- How to read UML class diagrams: classes, interfaces, visibility, and the relationship arrows
- How to organize packages by feature and by layer, and the tradeoffs of each

## What software architecture actually is

Architecture is the set of decisions that are expensive to change later: how the code is split into parts, which part is allowed to know about which other part, where data lives, and how the system talks to the outside world. A useful working definition:

> **Note:** Architecture is the shape of the code that decides how cheap or expensive the next change will be.

An analogy helps. In a house, you can repaint a wall in an afternoon, but moving the kitchen means rerouting plumbing, electricity, and gas. Good house design keeps the plumbing reachable and puts things that change together near each other. Good software design does the same: code that changes for the same reason lives together, and code that changes for different reasons is separated by a clear, small interface.

Every real application contains at least three kinds of code:

| Kind of code | Examples | How often it changes |
|---|---|---|
| Policy (business rules) | A task cannot be completed twice; an overdue invoice gets a late fee | When the business changes its mind |
| Orchestration (use cases) | "Complete a task": load it, apply the rule, save it, notify the owner | When workflows change |
| Details (mechanisms) | JDBC, HTTP, JSON, the console, files, email, a message broker | When technology or vendors change |

The central goal of this chapter is to keep policy independent of details, so that swapping a database or adding a web interface does not force you to re-test the business rules, and changing a rule does not force you to touch SQL.

## Cohesion: things that change together, live together

**Cohesion** measures how strongly the elements inside one module (a class, a package, a service) belong together. A highly cohesive class has one clear job; every field and method serves that job. A class with low cohesion is a grab bag: some methods parse text, some compute prices, some write to the database, and they share little besides a file.

A practical test: list the reasons a class might change. If the answers are "the input format changes", "the tax rule changes", and "we move from MySQL to PostgreSQL", the class has three reasons to change and low cohesion.

| Cohesion level | Description | Example |
|---|---|---|
| Functional (best) | Every part contributes to one well-defined task | `Task` enforcing its own lifecycle rules |
| Sequential | Output of one part feeds the next | A parser whose output feeds a validator in the same class |
| Communicational | Parts operate on the same data | Several reports built from the same order list |
| Temporal | Grouped because they run at the same time | A `startup()` method that opens files, loads config, and warms caches |
| Logical | Grouped because they are "the same kind" of thing | A `Utils` class with string, date, and math helpers |
| Coincidental (worst) | No meaningful relationship | A `Misc` class |

You do not need to memorize these names. The useful habit is asking "why are these things in the same place?" If the only answer is "they had to go somewhere", cohesion is low.

## Coupling: what one module must know about another

**Coupling** measures how much one module depends on the internals of another. Some coupling is unavoidable: code that collaborates must know something about its collaborator. The question is how much, and what kind.

| Coupling kind | What is shared | Risk |
|---|---|---|
| Data coupling (low) | Simple values passed as parameters | Low: callers only depend on a small, explicit contract |
| Stamp coupling | A whole object passed where only a field is needed | Medium: callee now sees fields it should not care about |
| Control coupling | A flag that tells the callee what to do (`save(task, true)`) | Medium: the caller knows the callee's internal branches |
| External coupling | A shared external format or protocol (a JDBC `ResultSet`, an HTTP request) | High for policy code: technology changes ripple inward |
| Common coupling | Shared mutable global state (static fields) | High: any module can break any other |
| Content coupling (worst) | One module reaches into another's private data or relies on its internal layout | Very high: every internal change breaks callers |

Two quick rules of thumb:

- Prefer passing the data a method needs over passing a big object it can dig through.
- Policy code should never be externally coupled to a technology. A business rule that imports `java.sql.ResultSet` or an HTTP request class changes every time the technology changes.

## Example 1: a class with low cohesion and high coupling

Here is a tiny task manager written the way many first projects are: one class does everything. It is a complete program you can run.

```java
import java.util.Map;
import java.util.TreeMap;

public class BeforeTaskApp {
    public static void main(String[] args) {
        TaskConsole console = new TaskConsole();
        console.handle("add Write schema");
        console.handle("add Review PR");
        console.handle("done 1");
        console.handle("done 1");
        console.handle("list");
    }
}

// One class knows text commands, business rules, storage layout, and output.
class TaskConsole {
    private final Map<Long, String[]> rows = new TreeMap<>(); // [title, status]
    private long nextId = 1;

    void handle(String line) {
        if (line.startsWith("add ")) {
            String title = line.substring(4).trim();
            if (title.isEmpty() || title.length() > 200) {
                System.out.println("error: bad title");
                return;
            }
            rows.put(nextId, new String[] {title, "OPEN"});
            System.out.println("added #" + nextId++);
        } else if (line.startsWith("done ")) {
            long id = Long.parseLong(line.substring(5).trim());
            String[] row = rows.get(id);
            if (row == null) {
                System.out.println("error: no task " + id);
                return;
            }
            if (row[1].equals("DONE")) {
                System.out.println("error: task " + id + " already done");
                return;
            }
            row[1] = "DONE";
            System.out.println("completed #" + id);
        } else if (line.equals("list")) {
            rows.forEach((id, row) -> System.out.println(id + " " + row[1] + " " + row[0]));
        }
    }
}
```

Output:

```text
added #1
added #2
completed #1
error: task 1 already done
1 DONE Write schema
2 OPEN Review PR
```

It works. Now count the reasons `TaskConsole` might change: the command syntax, the title rule, the "cannot complete twice" rule, the storage structure (`String[]` with magic indexes), and the output format. Five reasons in one class. If you add a web interface, you cannot reuse the completion rule without dragging the console parsing along. If you move to a database, you edit the same method that holds the business rule.

## Dependency direction: calls flow one way, imports can flow the other

This is the single most important idea in the lesson, so go slowly.

When a use case saves a task, the **runtime call** travels outward: the use case calls something, which eventually calls the database. It is tempting to think the **source-code dependency** must follow the same path: the use case imports the JDBC class. But it does not have to.

Instead, the application can declare an interface describing exactly the storage behavior it needs, and let the database code implement that interface:

```java
import java.util.Optional;

// Declared next to the use case that needs it, in the application package.
interface TaskStore {
    Optional<Task> find(long id);
    void save(Task task);
}
```

Now compare the two directions:

| Question | Answer |
|---|---|
| Who calls whom at runtime? | Use case calls `TaskStore.save`, which (in production) runs JDBC code |
| Who imports whom in source code? | The use case imports only `TaskStore`; the JDBC class imports `TaskStore` and `Task` |
| Which way do the arrows point? | Runtime: policy to database. Source: database adapter to policy |

The arrow of source dependency has been flipped so that it points **toward policy**. That flip is called **dependency inversion**. The interface is called a **port**: a socket in the wall of the application, shaped by the application's needs. The JDBC class that plugs into it is an **adapter**.

What does the port buy you?

- The domain and use-case code compile without any JDBC, SQL, or driver classes on the classpath.
- The use case depends on "find a task by id" and "save a task", not on connections, `ResultSet` columns, or SQL dialects.
- You can plug in an in-memory implementation for fast unit tests and a JDBC one in production.
- A database migration or driver change touches the adapter, not the rules.

> **Warning:** A port does not make every implementation correct. A buggy JDBC adapter still loses data. The port lets you test policy in isolation; you still need integration tests that exercise the real adapter against a real database.

### What an adapter looks like (requires a database, not runnable here)

This sketch shows where the JDBC knowledge ends up. It requires a JDBC driver (for example `org.postgresql:postgresql` or `com.h2database:h2`) and a configured `DataSource`, so it is not a standalone program.

```java
import java.sql.SQLException;
import java.util.Optional;
import javax.sql.DataSource;

final class JdbcTaskStore implements TaskStore {
    private final DataSource dataSource;

    JdbcTaskStore(DataSource dataSource) { this.dataSource = dataSource; }

    @Override
    public Optional<Task> find(long id) {
        String sql = "SELECT id, title, status FROM task WHERE id = ?";
        try (var connection = dataSource.getConnection();
             var statement = connection.prepareStatement(sql)) {
            statement.setLong(1, id);
            try (var rows = statement.executeQuery()) {
                if (!rows.next()) return Optional.empty();
                // Task.restore is a factory you would add to rebuild a stored task
                return Optional.of(Task.restore(rows.getLong("id"),
                        rows.getString("title"), rows.getString("status")));
            }
        } catch (SQLException e) {
            throw new IllegalStateException("could not load task " + id, e);
        }
    }

    @Override
    public void save(Task task) { /* INSERT or UPDATE with a PreparedStatement */ }
}
```

Notice that `ResultSet`, `SQLException`, and column names never escape this class. The exception is translated at the boundary so callers do not need to import `java.sql`.

## Example 2: the same app with boundaries

Now the refactoring. The behavior is identical, but responsibilities are split into domain, port, application service, and adapters.

```java
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.TreeMap;

public class AfterTaskApp {
    public static void main(String[] args) {
        TaskStore store = new InMemoryTaskStore();      // adapter chosen at the edge
        TaskService service = new TaskService(store);   // policy receives the port
        ConsoleAdapter console = new ConsoleAdapter(service);
        console.handle("add Write schema");
        console.handle("add Review PR");
        console.handle("done 1");
        console.handle("done 1");
        console.handle("done 9");
        console.handle("list");
    }
}

// ----- domain: pure rules, no I/O -----
enum Status { OPEN, DONE }

final class Task {
    private final long id;
    private final String title;
    private Status status = Status.OPEN;

    Task(long id, String title) {
        if (title == null || title.isBlank() || title.length() > 200) {
            throw new IllegalArgumentException("title must be 1..200 characters");
        }
        this.id = id;
        this.title = title;
    }

    void complete() {
        if (status == Status.DONE) {
            throw new IllegalStateException("task " + id + " already done");
        }
        status = Status.DONE;
    }

    long id() { return id; }
    String title() { return title; }
    Status status() { return status; }
}

// ----- port: owned by the application, describes what the policy needs -----
interface TaskStore {
    long nextId();
    Optional<Task> find(long id);
    void save(Task task);
    List<Task> all();
}

// ----- application service: coordinates one use case at a time -----
final class TaskService {
    private final TaskStore store;

    TaskService(TaskStore store) { this.store = store; }

    long add(String title) {
        Task task = new Task(store.nextId(), title);
        store.save(task);
        return task.id();
    }

    void complete(long id) {
        Task task = store.find(id).orElseThrow(() -> new NoSuchElementException("no task " + id));
        task.complete();
        store.save(task);
    }

    List<Task> list() { return store.all(); }
}

// ----- adapters: translate between the outside world and the application -----
final class InMemoryTaskStore implements TaskStore {
    private final Map<Long, Task> rows = new TreeMap<>();
    private long sequence = 0;

    public long nextId() { return ++sequence; }
    public Optional<Task> find(long id) { return Optional.ofNullable(rows.get(id)); }
    public void save(Task task) { rows.put(task.id(), task); }
    public List<Task> all() { return List.copyOf(rows.values()); }
}

final class ConsoleAdapter {
    private final TaskService service;

    ConsoleAdapter(TaskService service) { this.service = service; }

    void handle(String line) {
        try {
            if (line.startsWith("add ")) {
                System.out.println("added #" + service.add(line.substring(4).trim()));
            } else if (line.startsWith("done ")) {
                long id = Long.parseLong(line.substring(5).trim());
                service.complete(id);
                System.out.println("completed #" + id);
            } else if (line.equals("list")) {
                for (Task t : service.list()) {
                    System.out.println(t.id() + " " + t.status() + " " + t.title());
                }
            }
        } catch (RuntimeException e) {
            System.out.println("error: " + e.getMessage());
        }
    }
}
```

Output:

```text
added #1
added #2
completed #1
error: task 1 already done
error: no task 9
1 DONE Write schema
2 OPEN Review PR
```

Now each change has one home:

| Change request | Class that changes |
|---|---|
| New command syntax, or a web API | `ConsoleAdapter` (or a new adapter) |
| Titles may now be 300 characters | `Task` |
| Store tasks in PostgreSQL | A new `JdbcTaskStore`; the wiring in `main` |
| Completing a task should also notify the owner | `TaskService` (and a new notification port) |

The code is longer. That is the price. It pays off when those changes actually happen; for a throwaway script, the first version would be fine. This chapter keeps returning to that tradeoff.

## Example 3: proving the policy does not care about storage

The last program makes dependency direction concrete. `NotePolicy` holds a business rule (blank notes are ignored, others are trimmed) and depends only on the `NoteStore` port. Two completely different adapters plug in, and the policy code does not change at all.

```java
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class SwapStoreDemo {
    public static void main(String[] args) {
        run("map-backed store", new MapStore());
        run("line-backed store", new LineStore());
    }

    // The policy code never changes; only the adapter handed to it does.
    static void run(String label, NoteStore store) {
        NotePolicy policy = new NotePolicy(store);
        policy.remember("buy milk");
        policy.remember("   ");
        policy.remember(" call Ada ");
        System.out.println(label + " -> " + policy.summary());
        if (store instanceof LineStore lines) {
            System.out.println("  raw storage: " + lines.rawLines());
        }
    }
}

// Port: exactly the storage behavior the policy needs, nothing more.
interface NoteStore {
    void append(String note);
    List<String> all();
}

// Policy: depends on the port, not on any storage technology.
final class NotePolicy {
    private final NoteStore store;

    NotePolicy(NoteStore store) { this.store = store; }

    void remember(String note) {
        if (note.isBlank()) {
            return; // rule: blank notes are ignored
        }
        store.append(note.strip());
    }

    String summary() {
        List<String> notes = store.all();
        return notes.size() + " notes " + notes;
    }
}

final class MapStore implements NoteStore {
    private final Map<Integer, String> notes = new LinkedHashMap<>();

    public void append(String note) { notes.put(notes.size() + 1, note); }
    public List<String> all() { return List.copyOf(notes.values()); }
}

// Pretends to be a file format: "index|text" lines.
final class LineStore implements NoteStore {
    private final List<String> lines = new ArrayList<>();

    public void append(String note) { lines.add((lines.size() + 1) + "|" + note); }

    public List<String> all() {
        List<String> result = new ArrayList<>();
        for (String line : lines) {
            result.add(line.substring(line.indexOf('|') + 1));
        }
        return List.copyOf(result);
    }

    List<String> rawLines() { return List.copyOf(lines); }
}
```

Output:

```text
map-backed store -> 2 notes [buy milk, call Ada]
line-backed store -> 2 notes [buy milk, call Ada]
  raw storage: [1|buy milk, 2|call Ada]
```

## Step-by-step trace: completing a task

Follow `console.handle("done 1")` in Example 2:

1. `ConsoleAdapter` parses the text `"done 1"` into the number `1`. Parsing is a transport concern, so it stays in the adapter.
2. The adapter calls `service.complete(1)`. It knows nothing about storage.
3. `TaskService` calls `store.find(1)` through the `TaskStore` port. At runtime this reaches `InMemoryTaskStore`, but the service only sees the interface.
4. The service calls `task.complete()`. The rule "cannot complete twice" lives in `Task`, the only class that knows what a valid lifecycle is.
5. The service calls `store.save(task)`.
6. Control returns to the adapter, which formats the success message.
7. On the second `"done 1"`, step 4 throws `IllegalStateException`; the adapter translates it to an error line. The domain never prints anything.

## Reading UML class diagrams

Teams sketch these structures with **UML class diagrams**. You will meet them in design documents, textbooks, and interviews. Since this lesson cannot show pictures, here is how each element is drawn, described in words.

### A class box

A class is a rectangle split into three compartments: the name at the top, fields in the middle, and methods at the bottom. An interface is drawn the same way with the label `<<interface>>` above its name (the angle-quote label is called a stereotype). Abstract classes and methods are written in *italics*.

```text
+-----------------------------+
| TaskService                 |
+-----------------------------+
| - store : TaskStore         |
+-----------------------------+
| + add(title: String) : long |
| + complete(id: long) : void |
+-----------------------------+
```

### Visibility and member notation

| Symbol | Java meaning |
|---|---|
| `+` | public |
| `-` | private |
| `#` | protected |
| `~` | package-private (no modifier) |
| underlined member | static |
| `name : Type` | field or parameter declaration (type after the colon) |
| `method(p: Type): Return` | method signature |

### Relationship arrows

| Relationship | How it is drawn | Java meaning | Example |
|---|---|---|---|
| Generalization (inheritance) | Solid line, hollow triangle arrowhead at the parent | `class B extends A` | `DoneState` extends `TaskState` |
| Realization (implementation) | Dashed line, hollow triangle arrowhead at the interface | `class C implements I` | `JdbcTaskStore` implements `TaskStore` |
| Association | Solid line, optionally an open arrowhead showing navigation | A field holding a reference | `TaskService` has a `TaskStore` field |
| Aggregation | Solid line with a hollow diamond at the "whole" end | A whole that references parts which can live on their own | A `Team` aggregates `User`s |
| Composition | Solid line with a filled diamond at the "whole" end | The whole owns the part's lifetime | An `Order` composed of `OrderLine`s |
| Dependency | Dashed line with an open arrowhead | Uses the type only as a parameter, local variable, or return type | `ConsoleAdapter` depends on `Task` when printing |

Association lines may carry **multiplicities** at each end: `1` (exactly one), `0..1` (optional), `*` or `0..*` (any number), `1..*` (at least one). For example, "`User` 1 to `Task` 0..*" means one user owns any number of tasks.

### The diagram for Example 2, described

- `ConsoleAdapter` has a solid association arrow to `TaskService`.
- `TaskService` has a solid association arrow to the `<<interface>>` box `TaskStore`.
- `InMemoryTaskStore` has a dashed line with a hollow triangle pointing to `TaskStore` (realization). A future `JdbcTaskStore` would have the same arrow.
- `TaskService` has a dashed dependency arrow to `Task` (it creates and uses tasks but stores none in a field).
- `Task` has an association to the `Status` enumeration.

Look at the arrows touching `TaskStore`: both point **into** it. Nothing in the application points to the storage adapter. That is dependency inversion made visible, and it is the first thing an experienced reviewer checks on an architecture sketch.

> **Tip:** UML is a communication tool, not a contract. Sketch only the classes and relationships relevant to the decision you are discussing. A diagram with forty boxes communicates nothing.

## Organizing code: packages as boundaries

Java packages are the first boundary tool you have. Two common layouts:

```text
Package by layer                  Package by feature
com.acme.tasks.controller         com.acme.tasks.task
com.acme.tasks.service                Task, TaskService, TaskStore,
com.acme.tasks.repository             JdbcTaskStore, TaskController
com.acme.tasks.model              com.acme.tasks.user
                                      User, UserService, ...
                                  com.acme.tasks.billing
```

| Criterion | Package by layer | Package by feature |
|---|---|---|
| Where a feature change lands | Spread across every layer package | Mostly inside one package |
| Can you hide internals? | Hard: classes must be `public` to cross layer packages | Easy: helpers stay package-private |
| Discoverability | Easy to find "all controllers" | Easy to find "everything about billing" |
| Typical fit | Small apps, tutorials | Growing apps and modular monoliths |

Many teams combine them: package by feature at the top, with small `domain`, `application`, and `adapter` sub-packages inside each feature. Package-private visibility is your friend: a class without the `public` modifier cannot be imported from another package, so the compiler enforces the boundary for you.

## Common mistakes

### Mistake 1: letting technology types leak into the domain

```java
// Wrong: a business rule that needs a JDBC ResultSet to run
final class OverduePolicy {
    boolean isOverdue(java.sql.ResultSet row) throws java.sql.SQLException {
        return row.getDate("due_date").toLocalDate().isBefore(java.time.LocalDate.now());
    }
}
```

What goes wrong: the rule cannot be unit-tested without a database, it breaks when the column is renamed, and it silently depends on the system clock. Fix: map the row to a domain value in the adapter and pass the rule plain values.

```java
final class OverduePolicy {
    boolean isOverdue(java.time.LocalDate dueDate, java.time.LocalDate today) {
        return dueDate != null && dueDate.isBefore(today);
    }
}
```

### Mistake 2: putting the port in the adapter's package

If `TaskStore` lives in `com.acme.persistence.jdbc`, the application must import the JDBC package to use it, and the dependency points the wrong way again. Fix: the port belongs to the code that **needs** it, next to the use case.

### Mistake 3: interfaces for everything

```java
interface StringTrimmer { String trim(String s); }
final class DefaultStringTrimmer implements StringTrimmer {
    public String trim(String s) { return s.strip(); }
}
```

This adds a name, a file, and a level of indirection, and protects against no plausible change. Fix: call `strip()` directly. Introduce an interface where there is real substitution (production versus test storage), independent change, separate ownership, or an external system to isolate.

### Mistake 4: control flags that expose internals

```java
store.save(task, true, false); // what do true and false mean?
```

The caller must know the callee's internal branches (control coupling). Fix: give each behavior a meaningful name, such as `store.insert(task)` and `store.update(task)`, or pass a small enum.

## Best practices

- Name the reasons to change before splitting a class. Split along those reasons, not along arbitrary size limits.
- Keep the domain free of `java.sql`, HTTP, JSON, and framework imports. It should compile on its own.
- Define ports in the language of the application ("find open tasks for owner"), not the language of the technology ("execute query").
- Translate technology exceptions at the adapter boundary, keeping the original as the cause.
- Choose the concrete adapters in one place (the `main` method or a composition root), and pass them in through constructors.
- Draw the import arrows of a design before approving it. Arrows should point toward policy.
- Weigh each new boundary against its cost: names, navigation, tests, and cognitive load.

## Summary

- Architecture is the structure that decides how expensive future changes are.
- Cohesion asks whether the things inside a module belong together; aim for one clear reason to change.
- Coupling asks how much one module knows about another; avoid global state, reaching into internals, and technology types in policy code.
- Runtime calls flow from policy to details, but source dependencies can point toward policy through a port interface. This is dependency inversion.
- A port lets the domain depend on the storage behavior it needs rather than on JDBC details, which enables in-memory testing and technology swaps. It does not prove that adapters are correct.
- UML class diagrams show classes, interfaces, members with visibility symbols, and relationships: inheritance and realization (hollow triangles), association, aggregation and composition (diamonds), and dependency (dashed open arrow).
- Package by feature, with package-private internals, lets the compiler enforce boundaries.

## Practice

**Warm-up.** Take the `BeforeTaskApp` program and list every reason `TaskConsole` could change. For each reason, name the class in `AfterTaskApp` that absorbed it.

**Warm-up.** Describe in words (as in the UML section) the class diagram for `SwapStoreDemo`, including arrow types and where each arrowhead points.

**Core.** Add a `due date` to `Task` and a use case "list overdue tasks". Keep the clock out of the domain by passing `today` in, and add the method the use case needs to the `TaskStore` port. Verify the domain classes still contain no `java.sql` or console code.

**Core.** Add a second adapter that reads commands from a list of strings formatted as JSON-like text, reusing `TaskService` unchanged. Explain which classes you did not have to touch.

**Challenge.** Sketch a `JdbcTaskStore` that implements your extended port against a real database (H2 or PostgreSQL, with the driver on the classpath). Write one test that runs the use case with the in-memory store and one integration test for the adapter. Explain what each test can and cannot prove.

## Check your understanding

1. In your own words, what is the difference between cohesion and coupling?
2. Why can the runtime call go from a use case to the database while the source-code import goes from the database adapter to the use case?
3. What does a port interface let the domain avoid knowing, and what does it not guarantee?
4. In a UML class diagram, how do you distinguish "extends a class" from "implements an interface", and how is a mere dependency drawn?
5. Why is package-by-feature often better at hiding internals than package-by-layer?
6. Give an example of an interface you would not introduce, and explain why.
