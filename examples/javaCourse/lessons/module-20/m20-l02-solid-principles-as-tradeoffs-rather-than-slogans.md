# SOLID principles as tradeoffs rather than slogans

SOLID is the most quoted set of design principles in object-oriented programming, and one of the most misused. Applied with judgment, the five principles help you keep code easy to change. Applied as slogans, they produce a maze of one-method interfaces, factories for things that never vary, and classes nobody can find. In code reviews you will hear "this violates SRP" or "make it open/closed". This lesson teaches you what those statements really mean, how to apply each principle with a before/after refactoring, and, just as importantly, how to decide when a principle is not worth its cost.

What you will learn:

- The Single Responsibility Principle as "one reason to change", and how to find those reasons
- The Open/Closed Principle: adding behavior by adding code instead of editing stable code
- The Liskov Substitution Principle: why a subtype must keep its parent's promises
- The Interface Segregation Principle: role-shaped interfaces
- The Dependency Inversion Principle: policy depends on abstractions it owns
- How to weigh every abstraction against a concrete change pressure, and how to recognize over-engineering

## The five principles at a glance

| Letter | Principle | Short form | Question to ask in review |
|---|---|---|---|
| S | Single Responsibility | A module should have one reason to change | Who would ask for a change to this class, and for what? |
| O | Open/Closed | Open for extension, closed for modification | When the expected variation arrives, do we add code or edit stable code? |
| L | Liskov Substitution | Subtypes must be usable wherever the supertype is expected | Does every implementation honor the full contract callers rely on? |
| I | Interface Segregation | Clients should not depend on methods they do not use | Does this client see operations it must never call? |
| D | Dependency Inversion | High-level policy should not depend on low-level details; both depend on abstractions | Which way does the import arrow point, and who owns the interface? |

Each principle describes a **pressure** that exists in real code. None of them is free. The skill is recognizing when the pressure is present.

## The cost side of the ledger

Before looking at the principles, be honest about what every abstraction costs:

- **Names:** each interface and class is one more thing a reader must learn.
- **Navigation:** "go to definition" now lands on an interface, and you must hunt for the implementation.
- **Indirection:** the behavior you want to understand is spread across several files.
- **Tests and wiring:** more constructors, more composition code, more fakes.
- **Wrong guesses:** an abstraction built for a change that never comes often has the wrong shape when a different change does come.

> **Note:** An abstraction is justified when a concrete, identifiable pressure pays for it: a variation that already exists or is clearly scheduled, a need to test policy without slow infrastructure, a boundary between teams who own different parts, or an external system you must isolate. "A pattern exists for this" or "we might need it someday" is not such a pressure.

Two heuristics professionals use:

- **YAGNI** ("You Aren't Gonna Need It"): do not build flexibility for a change you cannot name.
- **Rule of three:** the first time you write something, just write it. The second time, notice the duplication. The third time, you know enough about the real variation to extract a good abstraction.

## S: Single Responsibility Principle

"A class should do one thing" is a misleading summary; almost anything can be described as one thing ("it handles orders"). The useful version is: **a module should have one reason to change**, which usually means it serves one group of people or one kind of decision.

### The problem

Imagine a `ReceiptService.process(String csvLine)` method that parses a CSV line, computes tax, formats a receipt string, and sends an email. Four different people can ask for changes: the partner who sends the CSV file, the accountant who knows the tax law, the designer who owns the receipt layout, and the operations team who picks the email provider. Every one of those changes edits the same method, and every change risks the other three behaviors.

```java
// Before: four reasons to change in one method (sketch)
final class ReceiptService {
    void process(String csvLine) {
        String[] parts = csvLine.split(",");            // input format
        long subtotal = Long.parseLong(parts[2]) * Integer.parseInt(parts[3]);
        long tax = subtotal * 8 / 100;                   // tax law
        String body = parts[0] + ": total=" + (subtotal + tax); // layout
        new SmtpClient("smtp.example.com").send(body);   // delivery technology
    }
}
```

### The refactoring

Split along the reasons to change. Each class below changes for exactly one of them, and a small coordinator holds the workflow.

```java
import java.util.List;
import java.util.Optional;

public class SrpReceipts {
    public static void main(String[] args) {
        List<String> csv = List.of(
                "order-1,Keyboard,4999,2",
                "order-2,Monitor,18999,1",
                "broken line");
        ReceiptJob job = new ReceiptJob(
                new CsvOrderParser(),
                new TaxCalculator(8),
                new ReceiptFormatter(),
                new ConsoleReceiptSender());
        job.run(csv);
    }
}

record Order(String id, String item, long unitCents, int quantity) {
    long subtotalCents() { return unitCents * quantity; }
}

// Reason to change: the input format.
final class CsvOrderParser {
    Optional<Order> parse(String line) {
        String[] parts = line.split(",", -1);
        if (parts.length != 4) {
            return Optional.empty();
        }
        try {
            return Optional.of(new Order(parts[0].trim(), parts[1].trim(),
                    Long.parseLong(parts[2].trim()), Integer.parseInt(parts[3].trim())));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }
}

// Reason to change: tax law.
final class TaxCalculator {
    private final int percent;

    TaxCalculator(int percent) { this.percent = percent; }

    long taxCents(long subtotalCents) { return subtotalCents * percent / 100; }
}

// Reason to change: how receipts look.
final class ReceiptFormatter {
    String format(Order order, long taxCents) {
        long total = order.subtotalCents() + taxCents;
        return order.id() + ": " + order.quantity() + " x " + order.item()
                + " subtotal=" + money(order.subtotalCents())
                + " tax=" + money(taxCents)
                + " total=" + money(total);
    }

    private static String money(long cents) {
        return String.format("%d.%02d", cents / 100, cents % 100);
    }
}

// Reason to change: delivery technology (console today, email tomorrow).
interface ReceiptSender {
    void send(String orderId, String body);
}

final class ConsoleReceiptSender implements ReceiptSender {
    public void send(String orderId, String body) {
        System.out.println("SEND " + body);
    }
}

// Reason to change: the workflow itself (order of steps, error policy).
final class ReceiptJob {
    private final CsvOrderParser parser;
    private final TaxCalculator tax;
    private final ReceiptFormatter formatter;
    private final ReceiptSender sender;

    ReceiptJob(CsvOrderParser parser, TaxCalculator tax, ReceiptFormatter formatter, ReceiptSender sender) {
        this.parser = parser;
        this.tax = tax;
        this.formatter = formatter;
        this.sender = sender;
    }

    void run(List<String> lines) {
        int skipped = 0;
        for (String line : lines) {
            Optional<Order> order = parser.parse(line);
            if (order.isEmpty()) {
                skipped++;
                continue;
            }
            Order o = order.get();
            sender.send(o.id(), formatter.format(o, tax.taxCents(o.subtotalCents())));
        }
        System.out.println("skipped " + skipped + " malformed line(s)");
    }
}
```

Output:

```text
SEND order-1: 2 x Keyboard subtotal=99.98 tax=7.99 total=107.97
SEND order-2: 1 x Monitor subtotal=189.99 tax=15.19 total=205.18
skipped 1 malformed line(s)
```

Notice what was **not** abstracted. `CsvOrderParser`, `TaxCalculator`, and `ReceiptFormatter` are plain final classes, not interfaces. Only `ReceiptSender` got an interface, because delivery technology is the one thing we know varies (console in development, email in production) and the one thing that is slow and external in tests. Splitting responsibilities and adding interfaces are separate decisions.

## O: Open/Closed Principle

A module is **open for extension** if you can add new behavior, and **closed for modification** if adding that behavior does not require editing its existing, tested code. It matters most for code that many things depend on and that changes along a predictable axis.

### The problem

```java
// Before: every new pricing idea edits this method
long quote(long unitCents, boolean member, int quantity) {
    long price = unitCents * quantity;
    if (member) price -= price * 10 / 100;
    if (price < 500) price = 500;
    // next month: bulk discount? seasonal sale? coupon? edit here again...
    return price;
}
```

If pricing rules change every few weeks, this method becomes a hot spot of merge conflicts and regressions, because every edit risks the rules that were already correct.

### The refactoring

Name the axis of variation (a pricing rule) and make it a type. The checkout applies a list of rules and no longer knows which rules exist.

```java
import java.util.List;

public class OcpPricing {
    public static void main(String[] args) {
        // Version 1 of the product: two rules.
        Checkout v1 = new Checkout(List.of(new MemberDiscount(10), new MinimumPrice(500)));
        System.out.println("v1 member 2000 -> " + v1.quote(2000, true, 1));
        System.out.println("v1 guest  2000 -> " + v1.quote(2000, false, 1));
        System.out.println("v1 member  520 -> " + v1.quote(520, true, 1));

        // Version 2: a new rule is added by writing a new class.
        // Checkout itself is not edited.
        Checkout v2 = new Checkout(List.of(
                new BulkDiscount(5, 15), new MemberDiscount(10), new MinimumPrice(500)));
        System.out.println("v2 member 2000 x6 -> " + v2.quote(2000, true, 6));
    }
}

record Cart(long unitCents, boolean member, int quantity) {}

interface PriceRule {
    long apply(Cart cart, long currentCents);
}

final class MemberDiscount implements PriceRule {
    private final int percent;

    MemberDiscount(int percent) { this.percent = percent; }

    public long apply(Cart cart, long current) {
        return cart.member() ? current - current * percent / 100 : current;
    }
}

final class MinimumPrice implements PriceRule {
    private final long floorCents;

    MinimumPrice(long floorCents) { this.floorCents = floorCents; }

    public long apply(Cart cart, long current) {
        return Math.max(current, floorCents);
    }
}

final class BulkDiscount implements PriceRule {
    private final int minQuantity;
    private final int percent;

    BulkDiscount(int minQuantity, int percent) {
        this.minQuantity = minQuantity;
        this.percent = percent;
    }

    public long apply(Cart cart, long current) {
        return cart.quantity() >= minQuantity ? current - current * percent / 100 : current;
    }
}

// Closed for modification: new pricing policies do not require edits here.
final class Checkout {
    private final List<PriceRule> rules;

    Checkout(List<PriceRule> rules) { this.rules = List.copyOf(rules); }

    long quote(long unitCents, boolean member, int quantity) {
        Cart cart = new Cart(unitCents, member, quantity);
        long price = unitCents * quantity;
        for (PriceRule rule : rules) {
            price = rule.apply(cart, price);
        }
        return price;
    }
}
```

Output:

```text
v1 member 2000 -> 1800
v1 guest  2000 -> 2000
v1 member  520 -> 500
v2 member 2000 x6 -> 9180
```

Trace the last line: 6 x 2000 = 12000; the bulk rule takes 15% off (10200); the member rule takes 10% off (9180); 9180 is above the 500 floor.

### The tradeoff

The rule order now matters and lives in configuration rather than in one readable method. If pricing had two rules that never change, the `if` statements were clearer. Also note that Java's `sealed` interfaces pull in the opposite direction on purpose: a sealed hierarchy plus an exhaustive `switch` is **closed** to new variants but makes adding new *operations* easy and compiler-checked. Choose the open interface when new variants keep arriving; choose sealed types when the set of variants is fixed and the operations change.

## L: Liskov Substitution Principle

If code works with a supertype, it must keep working when handed any subtype. "Works" means more than "compiles": the subtype must honor every promise the supertype's contract makes, such as accepted inputs, guaranteed outputs, side effects, and exceptions. A subtype may accept *more* inputs and promise *more*, but never less.

### The problem

The classic example: mathematically, a square is a rectangle, so `Square extends Rectangle` looks natural. But a mutable rectangle promises "setting the width does not change the height", and a square cannot keep that promise.

```java
public class LspShapes {
    public static void main(String[] args) {
        System.out.println("--- mutable hierarchy ---");
        stretch(new MutableRectangle());
        stretch(new MutableSquare());

        System.out.println("--- immutable values ---");
        Shape[] shapes = { new Rectangle(5, 4), new Square(4) };
        for (Shape s : shapes) {
            System.out.println(s + " area=" + s.area());
        }
        Rectangle wider = new Rectangle(5, 4).withWidth(10);
        System.out.println("wider " + wider + " area=" + wider.area());
    }

    // Client code written against MutableRectangle's contract:
    // "setting the width does not change the height".
    static void stretch(MutableRectangle r) {
        r.setWidth(5);
        r.setHeight(4);
        int area = r.area();
        String verdict = area == 20 ? "as expected" : "SURPRISE, expected 20";
        System.out.println(r.getClass().getSimpleName() + " area=" + area + " " + verdict);
    }
}

class MutableRectangle {
    protected int width;
    protected int height;

    void setWidth(int width) { this.width = width; }
    void setHeight(int height) { this.height = height; }
    int area() { return width * height; }
}

// Compiles fine, but breaks the parent's promise: setHeight also changes width.
class MutableSquare extends MutableRectangle {
    @Override void setWidth(int side) { this.width = side; this.height = side; }
    @Override void setHeight(int side) { this.width = side; this.height = side; }
}

// Fix: model what callers actually rely on. Both shapes promise only an area.
sealed interface Shape permits Rectangle, Square {
    int area();
}

record Rectangle(int width, int height) implements Shape {
    public int area() { return width * height; }
    Rectangle withWidth(int newWidth) { return new Rectangle(newWidth, height); }
}

record Square(int side) implements Shape {
    public int area() { return side * side; }
}
```

Output:

```text
--- mutable hierarchy ---
MutableRectangle area=20 as expected
MutableSquare area=16 SURPRISE, expected 20
--- immutable values ---
Rectangle[width=5, height=4] area=20
Square[side=4] area=16
wider Rectangle[width=10, height=4] area=40
```

The fix is not "add an `instanceof` check in `stretch`"; that would push the broken contract onto every caller. The fix is to stop claiming a relationship the behavior cannot support. Immutable records that share only the promise they can all keep (`area()`) are substitutable.

### Everyday LSP violations

| Violation | Example | Why it hurts |
|---|---|---|
| Rejecting inputs the parent accepts | A `TaskStore` implementation that throws for titles over 50 characters when the port allows 200 | Callers that were correct become broken |
| Throwing where the parent never throws | `UnsupportedOperationException` from `add` in a class passed where a mutable `List` is expected | Failure appears at runtime far from the cause |
| Weakening a guarantee | A `find` that sometimes returns `null` when the contract promises an `Optional` | Callers crash on a value they were told cannot exist |
| Changing side effects | A `save` that silently skips writes when offline | Data loss the caller cannot detect |

## I: Interface Segregation Principle

Clients should depend only on the operations they use. A "fat" interface forces every client to see, and every implementation to provide, methods unrelated to its role.

### The problem

```java
// Before: one interface for every possible client
interface TaskRepository {
    List<TaskRow> all();
    void add(TaskRow row);
    void delete(long id);
    void purgeArchive();
    byte[] exportPdf();
}
```

A read-only report now has access to `purgeArchive()`. A test fake for the report must implement five methods, four of them with `throw new UnsupportedOperationException()`, which is itself a substitution smell.

### The refactoring (with Dependency Inversion)

Split interfaces by **role**, from the client's point of view. The same class can implement several roles.

## D: Dependency Inversion Principle

High-level policy should not depend on low-level details. Both should depend on an abstraction, and that abstraction is owned by the policy side (see the previous lesson's `TaskStore` port). The time source is a classic hidden detail: a class that calls `LocalDate.now()` directly depends on the machine clock and cannot be tested for "tomorrow". Java already provides the abstraction: `java.time.Clock`.

The program below applies both ISP and DIP. `DailyDigest` depends on the narrow `TaskReader` role and on a `Clock`, so it cannot write tasks by accident and its output is repeatable.

```java
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

public class IspDipDigest {
    public static void main(String[] args) {
        InMemoryTasks tasks = new InMemoryTasks();
        tasks.add(new TaskRow("Pay invoice", LocalDate.of(2026, 9, 20)));
        tasks.add(new TaskRow("Review PR", LocalDate.of(2026, 9, 23)));
        tasks.add(new TaskRow("Plan sprint", LocalDate.of(2026, 9, 30)));

        // A fixed clock makes the "today" dependency explicit and repeatable.
        Clock clock = Clock.fixed(Instant.parse("2026-09-23T08:00:00Z"), ZoneOffset.UTC);
        DailyDigest digest = new DailyDigest(tasks, clock);
        digest.print();
    }
}

record TaskRow(String title, LocalDate due) {}

// Interface segregation: readers and writers are separate roles.
interface TaskReader {
    List<TaskRow> all();
}

interface TaskWriter {
    void add(TaskRow row);
}

final class InMemoryTasks implements TaskReader, TaskWriter {
    private final List<TaskRow> rows = new ArrayList<>();

    public void add(TaskRow row) { rows.add(row); }
    public List<TaskRow> all() { return List.copyOf(rows); }
}

// Depends only on what it uses: reading tasks and knowing the time.
// It cannot accidentally write, and tests can supply any reader and clock.
final class DailyDigest {
    private final TaskReader reader;
    private final Clock clock;

    DailyDigest(TaskReader reader, Clock clock) {
        this.reader = reader;
        this.clock = clock;
    }

    void print() {
        LocalDate today = LocalDate.now(clock);
        System.out.println("Digest for " + today);
        for (TaskRow row : reader.all()) {
            String label;
            if (row.due().isBefore(today)) {
                label = "OVERDUE";
            } else if (row.due().isEqual(today)) {
                label = "TODAY";
            } else {
                label = "upcoming";
            }
            System.out.println("  " + label + ": " + row.title());
        }
    }
}
```

Output:

```text
Digest for 2026-09-23
  OVERDUE: Pay invoice
  TODAY: Review PR
  upcoming: Plan sprint
```

In production you pass `Clock.systemDefaultZone()`; in a test you pass `Clock.fixed(...)`. Dependency inversion does not require a framework; a constructor parameter is enough.

## When principles conflict

The principles pull against each other and against simplicity:

| Tension | What happens | How to decide |
|---|---|---|
| SRP versus cohesion | Splitting too far scatters one concept over ten tiny classes | Split along real reasons to change, not along lines of code |
| OCP versus readability | A rule list is extensible but harder to read than three `if` statements | Is the variation frequent and ongoing? |
| ISP versus discoverability | Twenty one-method interfaces are hard to navigate | Segregate by client role, not by method |
| DIP versus directness | Every dependency behind an interface doubles the files | Invert dependencies on slow, external, or volatile details; call stable, pure code directly |

A good design note states the expected change and the complexity accepted for it, for example: "Pricing rules change monthly and are owned by the marketing team, so they are pluggable `PriceRule`s. Tax is a single rate set by law, so it is a plain method."

## Common mistakes

### Mistake 1: an interface with exactly one implementation, forever

```java
interface TaxCalculator { long taxCents(long subtotal); }
final class TaxCalculatorImpl implements TaxCalculator { /* the only one */ }
```

What goes wrong: double the names, no substitution ever happens, and "go to definition" becomes a two-step hunt. Fix: use the concrete class. Extract an interface later, when a second implementation or a test need actually appears; modern IDEs do this in seconds.

### Mistake 2: citing a principle instead of a change

A review comment that says only "this violates open/closed" does not help. Fix: name the change. "Marketing adds a pricing rule every sprint, and each one edits `quote`; let us make rules pluggable" is a reason someone can evaluate.

### Mistake 3: "fixing" an LSP violation with type checks

```java
if (shape instanceof MutableSquare) { /* special case */ }
```

What goes wrong: every caller must learn about every subtype, which is exactly what the abstraction was meant to prevent. Fix: redesign the hierarchy so all subtypes can keep the contract, or stop sharing the supertype.

### Mistake 4: hidden dependencies

```java
final class Digest {
    void print() {
        LocalDate today = LocalDate.now();          // hidden clock
        List<TaskRow> rows = Database.INSTANCE.all(); // hidden global
    }
}
```

What goes wrong: the class cannot be tested deterministically and silently depends on global state. Fix: accept the `Clock` and the reader through the constructor, as `DailyDigest` does.

## Best practices

- Treat each principle as a review question, not as a rule to satisfy mechanically.
- Before adding an abstraction, write down the concrete change or ownership boundary it serves. If you cannot, do not add it yet.
- Prefer small final classes and records; add interfaces at real seams (external systems, test doubles, genuine variation).
- Write the contract of an interface (inputs, outputs, exceptions, side effects) in its Javadoc so implementers know what substitution requires.
- Keep interfaces role-shaped and owned by their clients.
- Revisit abstractions: if a seam has had one implementation for two years and no test uses a fake, consider inlining it.

## Summary

- SRP: separate code by reason to change; splitting responsibilities does not automatically mean adding interfaces.
- OCP: when a variation keeps arriving, make it a type so new behavior is added, not edited in; sealed types are the deliberate opposite for closed sets.
- LSP: subtypes must keep every promise of the supertype; compiling is not enough.
- ISP: shape interfaces around client roles.
- DIP: policy owns the abstractions it needs; details implement them. `Clock` is a ready-made example.
- Every abstraction costs names, navigation, and indirection. It is justified when a concrete change pressure, testing need, or ownership boundary pays for it, not because a pattern name exists or because it adds structure.

## Practice

**Warm-up.** For `SrpReceipts`, write the name of the person or team who would request a change to each class.

**Warm-up.** Explain in two sentences why `MutableSquare` compiles but still breaks substitution.

**Core.** Add a `CouponRule` to `OcpPricing` that subtracts a fixed amount but never goes below zero. Confirm that `Checkout` needs no edits. Then decide where in the rule list it belongs and justify the order.

**Core.** Change `DailyDigest` so it also shows the number of overdue tasks. Write a small `main` that uses two different fixed clocks and shows the output changing, without touching the task data.

**Challenge.** Take a class you wrote earlier in this course that mixes parsing, rules, and output. List its reasons to change. Refactor it, then write a short design note stating which boundaries you introduced, which obvious abstractions you deliberately did *not* introduce, and the concrete future change that each boundary serves.

## Check your understanding

1. Why is "one reason to change" a more useful definition of SRP than "does one thing"?
2. In `OcpPricing`, what exactly is closed for modification, and what is open for extension?
3. A subtype throws an exception for an input the supertype documents as valid. Which principle does this break, and what does it do to callers?
4. How does depending on `java.time.Clock` instead of calling `LocalDate.now()` illustrate dependency inversion?
5. List three costs of adding an interface, and one situation where those costs are clearly worth paying.
6. When would you prefer a sealed interface and an exhaustive `switch` over an open interface with new implementations?
