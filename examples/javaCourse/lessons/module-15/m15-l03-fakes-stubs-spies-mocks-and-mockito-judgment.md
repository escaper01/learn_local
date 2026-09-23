# Fakes, stubs, spies, mocks, and Mockito judgment

Real classes rarely work alone. A `Checkout` asks a price service for prices, charges a payment gateway, and saves an order in a database. If a unit test used the real gateway, every test run would charge a real card; if it used the real database, the test would be slow and would depend on a running server. **Test doubles** are stand-ins for those collaborators, the way a stunt double stands in for an actor in a dangerous scene.

Doubles are powerful and easy to overuse. The same tool that makes a test fast can also make it prove nothing. This lesson teaches both the mechanics (including Mockito, the most widely used mocking library in Java) and the judgment: which double to choose, what it proves, and what it cannot prove.

What you will learn:

- The five kinds of test double: dummy, stub, fake, spy, and mock
- How to write each by hand in plain Java
- How to use Mockito 5 for stubbing, verification, argument capture, and spies
- The difference between testing state and testing interactions
- Why over-mocking makes tests brittle
- What a mocked database or JDBC connection can and cannot prove, and what to use instead

## Why doubles exist

A collaborator is a candidate for replacement in a unit test when it is:

- **Slow**: databases, networks, large files
- **Non-deterministic**: clocks, random numbers, external services
- **Dangerous**: payment, email, deleting files
- **Hard to put into a specific state**: "the gateway times out", "the disk is full"
- **Not built yet**: another team's service

The prerequisite is design: the collaborator must be reachable through an interface or a constructor parameter. If `Checkout` creates `new StripeGateway()` inside a method, nothing can be substituted. Dependency injection (from the object-collaboration chapter) is what makes doubles possible.

## The five kinds of double

| Double | What it does | Typical question it helps answer |
|---|---|---|
| Dummy | Passed only to fill a parameter; never actually used | "Does construction work when this argument is irrelevant?" |
| Stub | Returns pre-programmed answers; records nothing | "How does my code react when the price is 250?" |
| Fake | A real, simplified working implementation (in-memory repository) | "Does the whole flow work with realistic behavior?" |
| Spy | Records how it was called (and may wrap a real object) | "What was sent, and how many times?" |
| Mock | Pre-programmed with expectations about calls, and verified | "Was the card charged exactly once with 750?" |

The words are used loosely in everyday conversation, and Mockito calls everything it creates a "mock". What matters is the *role* the double plays in a particular test.

## Doubles by hand in plain Java

You do not need a library to use doubles. This complete program tests a `Checkout` with a stub price lookup, a fake repository, and a recording (spy-like) gateway:

```java
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class TestDoublesByHand {

    public static void main(String[] args) {
        // STUB: returns a canned answer, records nothing.
        PriceLookup stubPrices = sku -> 250;

        // FAKE: a real, simplified working implementation.
        InMemoryOrderRepository fakeRepo = new InMemoryOrderRepository();

        // SPY-like recorder: remembers every call so the test can inspect it.
        RecordingPaymentGateway recordingGateway = new RecordingPaymentGateway();

        Checkout checkout = new Checkout(stubPrices, fakeRepo, recordingGateway);

        String orderId = checkout.placeOrder("PEN-1", 3);
        System.out.println("order id: " + orderId);
        System.out.println("stored total: " + fakeRepo.findTotal(orderId).orElseThrow());
        System.out.println("charges recorded: " + recordingGateway.charges);

        // The same order placed twice must not charge twice.
        checkout.placeOrder("PEN-1", 3);
        System.out.println("charges after second order: " + recordingGateway.charges.size());

        // Failure path: a stub that always fails.
        PaymentGateway failing = amount -> { throw new IllegalStateException("card declined"); };
        InMemoryOrderRepository emptyRepo = new InMemoryOrderRepository();
        Checkout failingCheckout = new Checkout(stubPrices, emptyRepo, failing);
        try {
            failingCheckout.placeOrder("PEN-1", 1);
        } catch (IllegalStateException e) {
            System.out.println("failure surfaced: " + e.getMessage());
        }
        System.out.println("orders saved after failure: " + emptyRepo.count());
    }
}

interface PriceLookup {
    int priceCents(String sku);
}

interface OrderRepository {
    void save(String orderId, int totalCents);
    Optional<Integer> findTotal(String orderId);
}

interface PaymentGateway {
    void charge(int amountCents);
}

final class InMemoryOrderRepository implements OrderRepository {
    private final Map<String, Integer> orders = new HashMap<>();

    public void save(String orderId, int totalCents) {
        orders.put(orderId, totalCents);
    }

    public Optional<Integer> findTotal(String orderId) {
        return Optional.ofNullable(orders.get(orderId));
    }

    int count() {
        return orders.size();
    }
}

final class RecordingPaymentGateway implements PaymentGateway {
    final List<Integer> charges = new ArrayList<>();

    public void charge(int amountCents) {
        charges.add(amountCents);
    }
}

final class Checkout {
    private final PriceLookup prices;
    private final OrderRepository repository;
    private final PaymentGateway gateway;

    Checkout(PriceLookup prices, OrderRepository repository, PaymentGateway gateway) {
        this.prices = prices;
        this.repository = repository;
        this.gateway = gateway;
    }

    String placeOrder(String sku, int quantity) {
        String orderId = sku + "-x" + quantity;
        if (repository.findTotal(orderId).isPresent()) {
            return orderId; // idempotent: already placed, do not charge again
        }
        int total = prices.priceCents(sku) * quantity;
        gateway.charge(total);            // charge first...
        repository.save(orderId, total);  // ...then persist
        return orderId;
    }
}
```

```text
order id: PEN-1-x3
stored total: 750
charges recorded: [750]
charges after second order: 1
failure surfaced: card declined
orders saved after failure: 0
```

Look at what each double contributed. The stub pinned the price so the expected total (750) could be worked out by hand. The fake behaved like a real repository, which let the idempotency rule ("do not charge twice") be tested through ordinary state. The recorder answered an interaction question that has real business value: *how many times was money taken?* The failing stub drove the error path, where the test checks that nothing was saved.

Notice also what the test *revealed* about the design: the gateway is charged before the order is saved. If saving fails after a successful charge, the customer pays for an order that does not exist. Tests with doubles are a good way to ask "what happens if this step fails?" for every collaborator.

## State testing versus interaction testing

There are two ways to check a result:

- **State verification**: perform the action, then inspect the resulting values. "The repository now contains order PEN-1-x3 with total 750."
- **Interaction verification**: check which calls were made on a collaborator. "The gateway's `charge` method was called once with 750."

Prefer state verification whenever there is observable state, because it tests *what* happened, not *how*. Use interaction verification when the interaction *is* the requirement: money charged, an email sent, an audit event written, a cache invalidated. Those effects happen outside your object, so a call is the only thing you can observe in a unit test.

## Mockito: doubles without hand-written classes

Mockito generates doubles at runtime. It **requires a test project** with these dependencies (versions current at the time of writing):

```kotlin
dependencies {
    testImplementation(platform("org.junit:junit-bom:5.11.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation("org.mockito:mockito-core:5.14.2")
    testImplementation("org.mockito:mockito-junit-jupiter:5.14.2")
    testImplementation("org.assertj:assertj-core:3.26.3")
}
```

For Maven, the same coordinates go in `pom.xml` with `<scope>test</scope>`.

> **Note:** Mockito 5 uses the inline mock maker by default, which can also mock final classes. On JDK 21 it attaches a Java agent dynamically and may print a warning that this will stop working in future JDKs. The Mockito documentation recommends configuring `mockito-core` as a `-javaagent` for the test JVM; follow it when your team upgrades.

The core API, shown against the same `Checkout` classes as above:

```java
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CheckoutTest {

    @Mock PriceLookup prices;          // used as a stub
    @Mock PaymentGateway gateway;      // used as a mock (verified)
    InMemoryOrderRepository repository; // a real fake, no Mockito needed
    Checkout checkout;

    @BeforeEach
    void setUp() {
        repository = new InMemoryOrderRepository();
        checkout = new Checkout(prices, repository, gateway);
    }

    @Test
    void placeOrder_chargesQuantityTimesPrice() {
        when(prices.priceCents("PEN-1")).thenReturn(250);

        checkout.placeOrder("PEN-1", 3);

        verify(gateway).charge(750);
        verifyNoMoreInteractions(gateway);
        assertThat(repository.findTotal("PEN-1-x3")).contains(750);
    }

    @Test
    void placeOrder_sameOrderTwice_chargesOnce() {
        when(prices.priceCents("PEN-1")).thenReturn(250);

        checkout.placeOrder("PEN-1", 3);
        checkout.placeOrder("PEN-1", 3);

        verify(gateway, times(1)).charge(750);
    }

    @Test
    void placeOrder_declinedCard_savesNothing() {
        when(prices.priceCents(anyString())).thenReturn(250);
        doThrow(new IllegalStateException("card declined")).when(gateway).charge(anyInt());

        assertThatThrownBy(() -> checkout.placeOrder("PEN-1", 1))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("card declined");
        assertThat(repository.count()).isZero();
    }

    @Test
    void placeOrder_alreadyStored_neverChargesAgain() {
        repository.save("PEN-1-x3", 750);

        checkout.placeOrder("PEN-1", 3);

        verify(gateway, never()).charge(anyInt());
    }
}
```

Key pieces:

| API | Meaning |
|---|---|
| `@Mock` with `MockitoExtension` | Creates a mock for the field before each test |
| `mock(Type.class)` | Creates a mock without annotations |
| `when(mock.call(args)).thenReturn(value)` | Stub a return value |
| `thenThrow(exception)` | Stub a method to throw |
| `doThrow(e).when(mock).voidCall(args)` | Stub a `void` method to throw |
| `verify(mock).call(args)` | Assert the call happened exactly once |
| `verify(mock, times(n))`, `never()`, `atLeastOnce()` | Assert a call count |
| `verifyNoMoreInteractions(mock)` | Assert nothing else was called |
| `any()`, `anyInt()`, `anyString()`, `eq(x)` | Argument matchers |
| `ArgumentCaptor` | Capture an argument for detailed assertions |
| `spy(realObject)` | Wrap a real object, record calls, optionally override some |

An unstubbed mock method returns a default: `0`, `false`, `null`, an empty collection, or an empty `Optional`. That is convenient, and also a trap: code that forgot to handle a missing price may "work" in the test because the mock quietly returned `0`.

> **Tip:** With `MockitoExtension`, Mockito uses *strict stubs*: a stubbing that the test never uses causes an `UnnecessaryStubbingException`. That is a feature. It tells you the test's setup no longer matches what the code does.

If you mix matchers and plain values in one call, every argument must be a matcher: write `verify(repo).save(eq("A-1"), anyInt())`, not `verify(repo).save("A-1", anyInt())`.

### Capturing arguments

When the argument is a rich value, capture it and assert on its content. Here `ReceiptPrinter` is a small class that formats a total in cents and writes it to the sink:

```java
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

interface ReceiptSink {
    void write(String text);
}

@ExtendWith(MockitoExtension.class)
class ReceiptPrinterTest {

    @Mock ReceiptSink sink;
    @Captor ArgumentCaptor<String> text;

    @Test
    void print_includesTotalLine() {
        new ReceiptPrinter(sink).print(750);

        verify(sink).write(text.capture());
        assertThat(text.getValue()).contains("Total: 7.50 EUR");
    }
}
```

### Spies

A spy wraps a *real* object. Calls go to the real methods unless you override them, and every call is recorded:

```java
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class SpyExampleTest {

    @Test
    void spyCallsRealMethodsAndRecordsThem() {
        List<String> names = spy(new ArrayList<>());

        names.add("pen");

        verify(names).add("pen");
        assertThat(names).containsExactly("pen");   // real behavior happened

        doReturn(100).when(names).size();            // override one method
        assertThat(names.size()).isEqualTo(100);
    }
}
```

Use `doReturn(...).when(spy).method()` with spies. The `when(spy.method())` form calls the real method while setting up the stub, which can throw or cause side effects. Needing many spies is often a design smell: the class probably does too much.

## What a mocked database cannot prove

This is the most important judgment in the lesson. A mock or stub answers exactly what you configured. It does not parse SQL, does not know the schema, does not enforce constraints, and does not run transactions. The following program imitates a mocked JDBC-style executor; the DAO contains two SQL defects that any real database would reject:

```java
import java.util.ArrayList;
import java.util.List;

public class StubbedSqlDemo {

    public static void main(String[] args) {
        RecordingSqlStub stub = new RecordingSqlStub(1);
        UserDao dao = new UserDao(stub);

        int updated = dao.deactivate(42);

        System.out.println("rows updated: " + updated);
        System.out.println("sql sent: " + stub.statements.get(0));
        System.out.println("test verdict: PASS");
    }
}

interface SqlExecutor {
    int executeUpdate(String sql, Object... params);
}

// Behaves like a mocked JDBC connection: it answers whatever it was told to.
final class RecordingSqlStub implements SqlExecutor {
    final List<String> statements = new ArrayList<>();
    private final int cannedRowCount;

    RecordingSqlStub(int cannedRowCount) {
        this.cannedRowCount = cannedRowCount;
    }

    public int executeUpdate(String sql, Object... params) {
        statements.add(sql);
        return cannedRowCount;
    }
}

final class UserDao {
    private final SqlExecutor executor;

    UserDao(SqlExecutor executor) {
        this.executor = executor;
    }

    int deactivate(long userId) {
        // Two defects a real database would reject: "UPDTE" and the column "activ".
        return executor.executeUpdate("UPDTE users SET activ = false WHERE id = ?", userId);
    }
}
```

```text
rows updated: 1
sql sent: UPDTE users SET activ = false WHERE id = ?
test verdict: PASS
```

A Mockito version, `when(statement.executeUpdate()).thenReturn(1)`, behaves identically. Adding `verify` calls only proves the code *sent* a string; it says nothing about whether the string is valid for your schema. The mocked test is useful for the Java-side logic ("if zero rows are updated, report user not found"), but correctness of SQL, column mappings, constraints, and transactions needs a **real database**.

The usual tool is an integration test against the same database engine used in production, often started in a disposable container with Testcontainers (`org.testcontainers:postgresql` plus `org.testcontainers:junit-jupiter` and the `org.postgresql:postgresql` JDBC driver, all test-scoped; Testcontainers requires a running Docker engine). `JdbcUserDao` is the real implementation that uses a `PreparedStatement`:

```java
import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class UserDaoIntegrationTest {

    @Container
    static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void deactivate_updatesExactlyOneRow() throws Exception {
        try (Connection connection = DriverManager.getConnection(
                db.getJdbcUrl(), db.getUsername(), db.getPassword())) {
            connection.createStatement().execute(
                "CREATE TABLE users (id BIGINT PRIMARY KEY, active BOOLEAN NOT NULL)");
            connection.createStatement().execute("INSERT INTO users VALUES (42, TRUE)");

            int updated = new JdbcUserDao(connection).deactivate(42);

            assertThat(updated).isEqualTo(1);
        }
    }
}
```

Against a real engine, the misspelled statement fails immediately with a syntax error. An in-memory database such as H2 is faster but speaks a different SQL dialect, so it can accept or reject statements differently from your production database; treat it as a compromise, not proof.

## Choosing a double: a decision guide

| Situation | Good choice | Why |
|---|---|---|
| Pure domain rule (discount, validation) | No double; real objects | Nothing to replace |
| Collaborator returns data you need to control | Stub (or Mockito `when`) | Pins inputs |
| Repository or port used heavily across tests | Fake (in-memory implementation) | Realistic behavior, state assertions, reusable |
| An outgoing side effect is the requirement | Mock with `verify` | The call is the observable outcome |
| Need to observe a real object | Spy (sparingly) | Keeps real behavior |
| SQL, ORM mapping, file formats, HTTP contracts | Integration test with the real thing | Doubles cannot check them |

A useful guideline is "do not mock types you do not own". Mocking `Connection`, `ResultSet`, or an HTTP client encodes *your guess* about how a third-party library behaves. Wrap the library in a small interface of your own, test your logic against a double of that interface, and test the wrapper with an integration test.

## What happens under the hood

1. `mock(PaymentGateway.class)` asks Mockito's mock maker to generate a class at runtime that implements the interface (or, with the inline mock maker, to instrument the class bytecode).
2. Every method call on the mock is intercepted and handed to a handler instead of real code.
3. The handler records the invocation (method, arguments) in the mock's invocation list.
4. It then searches the stubbings configured with `when(...)`/`doX(...)` for a matching method and arguments, and answers with the stubbed value or the default.
5. `verify(mock).charge(750)` searches the recorded invocations for a match and throws a descriptive failure (listing the actual calls) if the count is wrong.
6. `MockitoExtension` creates fresh mocks for each test and, after the test, checks for unused stubbings.

## Common mistakes

**Mistake 1: verifying implementation details.**

```java
InOrder order = inOrder(prices, repository, gateway);
order.verify(repository).findTotal("PEN-1-x3");
order.verify(prices).priceCents("PEN-1");
order.verify(gateway).charge(750);
```

Reordering two harmless internal lookups now fails the test, even though behavior is identical. Fix: verify only outcomes that matter to the business (the charge, the saved order).

**Mistake 2: mocking the class under test's values.**

```java
Money price = mock(Money.class);
when(price.plus(any())).thenReturn(total);
```

Value objects are cheap and deterministic; mocking them means you test your stub, not the arithmetic. Fix: use real value objects.

**Mistake 3: trusting mocks for SQL.** A mocked `Connection` returning `1` "proves" any SQL string. Fix: an integration test against the real database engine.

**Mistake 4: stubbing everything "just in case".** Unused stubs clutter tests and, with strict stubs, fail them. Fix: stub only what the scenario needs.

**Mistake 5: `when(spy.method())` on a spy.** It calls the real method during setup. Fix: `doReturn(value).when(spy).method()`.

## Best practices

- Test domain logic with real objects first; introduce doubles only at real boundaries.
- Prefer fakes for your own ports that many tests use; keep fakes small and test them too.
- Verify interactions only when the interaction is the requirement.
- Use a double to explore every failure of a collaborator: timeouts, exceptions, empty results.
- Keep at least one integration test for each real boundary your doubles stand in for.
- If a test needs many mocks, consider whether the class has too many responsibilities.
- Write down, next to a mock-based test, what it does *not* prove.

## Summary

- Doubles replace slow, dangerous, or uncontrollable collaborators; they require injectable dependencies.
- Stubs supply answers, fakes are simplified working implementations, spies record, and mocks verify expected interactions.
- Mockito creates doubles at runtime with `when`, `thenReturn`, `thenThrow`, `verify`, matchers, captors, and spies.
- State verification is usually more robust; interaction verification suits side effects that are the requirement.
- A mocked JDBC connection or repository never checks SQL, schema, or constraints; only a real database integration test does.

## Practice

1. **Warm-up:** Classify each as dummy, stub, fake, spy, or mock: an in-memory `Map`-based repository; a gateway that records charges; a `Clock.fixed`; a `null` logger passed to satisfy a constructor.
2. **Warm-up:** Add a failing `ReceiptSink` to the hand-written program and decide, in writing, whether an order should still be saved if printing the receipt fails.
3. **Core:** Rewrite the `Checkout` tests with Mockito, using a real fake repository and a mocked gateway. Include a test for a gateway timeout exception.
4. **Core:** Change `Checkout` so a failure while saving after a successful charge triggers a refund call. Write the tests first.
5. **Challenge:** Wrap JDBC behind a `UserRepository` interface. Test the service with a fake, then write an integration test (Testcontainers or a local database) that would catch a misspelled column. Document which bugs each test can and cannot detect.

## Check your understanding

1. What is the difference between a stub and a mock, in terms of what the test asserts?
2. Why is a fake repository often preferable to a mocked repository when many tests use it?
3. A test stubs a mocked `PreparedStatement` to return 1 and passes. List three kinds of defect that could still be present in the SQL-related code.
4. When is verifying an interaction the right thing to do? Give an example from a payment or email flow.
5. Why do tests that verify the exact order of internal calls break during harmless refactoring?
6. What does Mockito return from an unstubbed method that returns `int`, `boolean`, or `List`, and why can that hide bugs?
