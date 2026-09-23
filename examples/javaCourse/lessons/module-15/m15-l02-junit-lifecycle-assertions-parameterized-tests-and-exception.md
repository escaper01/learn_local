# JUnit lifecycle, assertions, parameterized tests, and exceptions

In the previous lesson you wrote checks by hand with `if` statements and a loop. That works for learning, but real projects have thousands of tests. They need automatic discovery, a fresh fixture for every test, clear failure messages, reports that CI can read, IDE buttons to run one test, and tables of cases that do not require a hand-written loop. **JUnit 5** is the standard tool that provides all of this for Java. Almost every Java job posting assumes you can read and write JUnit tests fluently, and **AssertJ** is the assertion library you will find beside it in most modern codebases.

What you will learn:

- How to add JUnit 5 (Jupiter) and AssertJ to a Maven or Gradle project
- The structure of a test class and the rules test methods must follow
- The lifecycle annotations and the order in which JUnit calls them
- The core JUnit assertions and how to write useful failure messages
- Parameterized tests with `@ValueSource`, `@CsvSource`, `@MethodSource`, and friends
- Testing exceptions correctly with `assertThrows`, and why manual try/catch is risky
- Fluent assertions with AssertJ
- Useful extras: `@DisplayName`, `@Nested`, `@Tag`, `@Disabled`, `@TempDir`

## Setting up: JUnit is a dependency, not part of the JDK

JUnit is not in the standard library. The examples in this lesson that use `org.junit` or `org.assertj` **require a Maven or Gradle project** with these test dependencies (the in-app runner cannot execute them). Versions shown are current reviewed releases at the time of writing; use your team's approved versions.

Gradle (Kotlin DSL, `build.gradle.kts`):

```kotlin
plugins {
    java
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation(platform("org.junit:junit-bom:5.11.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation("org.assertj:assertj-core:3.26.3")
}

tasks.test {
    useJUnitPlatform()
}
```

Maven (`pom.xml` fragment):

```xml
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>org.junit</groupId>
      <artifactId>junit-bom</artifactId>
      <version>5.11.4</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>

<dependencies>
  <dependency>
    <groupId>org.junit.jupiter</groupId>
    <artifactId>junit-jupiter</artifactId>
    <scope>test</scope>
  </dependency>
  <dependency>
    <groupId>org.assertj</groupId>
    <artifactId>assertj-core</artifactId>
    <version>3.26.3</version>
    <scope>test</scope>
  </dependency>
</dependencies>
```

The `junit-bom` ("bill of materials") keeps all JUnit modules on matching versions. The `junit-jupiter` aggregator brings the API, the parameterized-test module, and the engine. Maven Surefire 3.x detects the JUnit Platform automatically; Gradle needs `useJUnitPlatform()`, and without it Gradle runs zero tests and still reports success.

Test code lives in `src/test/java`, mirroring the package of the code under test.

## Anatomy of a test class

The class under test:

```java
package academy.geometry;

public final class Rectangle {
    private Rectangle() { }

    public static int area(int width, int height) {
        if (width < 0) {
            throw new IllegalArgumentException("width must be >= 0, was " + width);
        }
        if (height < 0) {
            throw new IllegalArgumentException("height must be >= 0, was " + height);
        }
        return Math.multiplyExact(width, height);
    }
}
```

A first test class (requires the JUnit setup above):

```java
package academy.geometry;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RectangleTest {

    @Test
    void area_ofThreeByFour_isTwelve() {
        int area = Rectangle.area(3, 4);

        assertEquals(12, area);
    }

    @Test
    @DisplayName("a zero-width rectangle has zero area")
    void area_zeroWidth_isZero() {
        assertEquals(0, Rectangle.area(0, 7));
    }

    @Test
    void area_negativeWidth_isRejected() {
        IllegalArgumentException error = assertThrows(
            IllegalArgumentException.class,
            () -> Rectangle.area(-1, 4));

        assertEquals("width must be >= 0, was -1", error.getMessage());
    }
}
```

Rules for test methods in JUnit 5:

- Annotate with `@Test` from `org.junit.jupiter.api` (not the JUnit 4 `org.junit.Test`).
- Return `void`, and do not make them `private` (private test methods are not run).
- Neither the class nor the methods need to be `public`; package-private is the convention.
- One test method should check one behavior.

## The lifecycle: who runs when

By default JUnit creates a **new instance of the test class for every test method**. That is deliberate: instance fields cannot leak state from one test into the next. Around each test, lifecycle methods run:

| Annotation | Runs | Must be static? | Typical use |
|---|---|---|---|
| `@BeforeAll` | Once, before any test in the class | Yes (by default) | Expensive read-only setup |
| `@BeforeEach` | Before every test | No | Build a fresh fixture |
| `@AfterEach` | After every test, even if it failed | No | Release resources, reset files |
| `@AfterAll` | Once, after all tests in the class | Yes (by default) | Shut down shared resources |

`@BeforeAll` and `@AfterAll` must be `static` because they run before any instance exists. Annotating the class with `@TestInstance(TestInstance.Lifecycle.PER_CLASS)` changes that, but then all tests share one instance, so use it with care.

The following runnable program imitates what JUnit does, so you can see the order with your own eyes (no dependencies needed):

```java
import java.util.ArrayList;
import java.util.List;

public class LifecycleByHand {

    // Shared, expensive, read-only setup: done once (like @BeforeAll).
    static List<String> catalog;

    // Fresh per test (like @BeforeEach creating a new fixture).
    List<String> cart;

    static void beforeAll() {
        catalog = List.of("pen", "notebook", "ruler");
        System.out.println("beforeAll: catalog loaded");
    }

    void beforeEach() {
        cart = new ArrayList<>();
        System.out.println("  beforeEach: new empty cart");
    }

    void afterEach() {
        System.out.println("  afterEach: cart had " + cart.size() + " item(s)");
    }

    static void afterAll() {
        System.out.println("afterAll: done");
    }

    void addsOneItem() {
        cart.add(catalog.get(0));
        check(cart.size() == 1, "addsOneItem");
    }

    void startsEmpty() {
        check(cart.isEmpty(), "startsEmpty");
    }

    static void check(boolean ok, String name) {
        if (!ok) {
            throw new AssertionError(name);
        }
        System.out.println("  PASS " + name);
    }

    public static void main(String[] args) {
        beforeAll();
        String[] tests = {"addsOneItem", "startsEmpty"};
        for (String test : tests) {
            LifecycleByHand instance = new LifecycleByHand(); // new instance per test
            instance.beforeEach();
            try {
                if (test.equals("addsOneItem")) {
                    instance.addsOneItem();
                } else {
                    instance.startsEmpty();
                }
            } finally {
                instance.afterEach();
            }
        }
        afterAll();
    }
}
```

```text
beforeAll: catalog loaded
  beforeEach: new empty cart
  PASS addsOneItem
  afterEach: cart had 1 item(s)
  beforeEach: new empty cart
  PASS startsEmpty
  afterEach: cart had 0 item(s)
afterAll: done
```

`startsEmpty` passes even though it runs after `addsOneItem`, because each test got its own cart. The real JUnit version of that class:

```java
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CartTest {
    static List<String> catalog;
    List<String> cart;

    @BeforeAll
    static void loadCatalog() {
        catalog = List.of("pen", "notebook", "ruler");
    }

    @BeforeEach
    void newCart() {
        cart = new ArrayList<>();
    }

    @AfterEach
    void report() {
        // release resources here; runs even when the test fails
    }

    @AfterAll
    static void shutdown() {
        catalog = null;
    }

    @Test
    void addsOneItem() {
        cart.add(catalog.get(0));
        assertEquals(1, cart.size());
    }

    @Test
    void startsEmpty() {
        assertTrue(cart.isEmpty());
    }
}
```

> **Note:** JUnit does not promise any particular order between test methods. Never write a test that relies on another test having run first.

## Core JUnit assertions

All live in `org.junit.jupiter.api.Assertions` and are usually imported statically.

| Assertion | Checks |
|---|---|
| `assertEquals(expected, actual)` | Equality using `equals` (or `==` for primitives) |
| `assertEquals(0.3, sum, 1e-9)` | Floating-point equality within a tolerance |
| `assertTrue(condition)` / `assertFalse(condition)` | A boolean condition |
| `assertNull(value)` / `assertNotNull(value)` | Null or not null |
| `assertSame(a, b)` | The same object identity |
| `assertArrayEquals(expected, actual)` | Arrays element by element |
| `assertIterableEquals(expected, actual)` | Iterables element by element, in order |
| `assertAll(executables...)` | Runs several checks and reports all failures together |
| `assertThrows(type, executable)` | The code throws that type (or a subtype) |
| `assertThrowsExactly(type, executable)` | The code throws exactly that type |
| `assertDoesNotThrow(executable)` | The code completes normally |
| `assertTimeout(duration, executable)` | The code finishes within the duration |
| `fail(message)` | Fails unconditionally |

The parameter order is **expected first, actual second**. Swapping them still detects the bug but produces a confusing message such as "expected 11 but was 12" when 12 was right.

Every assertion accepts an optional message, either a `String` or a `Supplier<String>` (built only when the test fails):

```java
assertEquals(12, Rectangle.area(3, 4), "area of a 3 by 4 rectangle");
assertEquals(expectedTotal, receipt.total(),
    () -> "total for lines " + receipt.lines());

assertAll("receipt totals",
    () -> assertEquals(1_000, receipt.subtotal()),
    () -> assertEquals(190, receipt.tax()),
    () -> assertEquals(1_190, receipt.total()));
```

Without `assertAll`, the first failing line stops the test and hides the others. With it, you see every mismatch in one run.

## Testing exceptions

Failure paths are behavior too. An exception test must fail if the exception does *not* happen. The classic manual pattern is easy to get wrong, because it silently passes when someone forgets the `fail` call. The runnable program below imitates the two styles:

```java
public class ExpectThrowsDemo {

    // Bug: the validation for negative width was forgotten.
    static int rectangleArea(int width, int height) {
        if (height < 0) {
            throw new IllegalArgumentException("height must be >= 0, was " + height);
        }
        return width * height;
    }

    interface Action {
        void run() throws Throwable;
    }

    // A tiny imitation of what a real assertThrows does.
    static <T extends Throwable> T expectThrows(Class<T> expected, Action action) {
        try {
            action.run();
        } catch (Throwable actual) {
            if (expected.isInstance(actual)) {
                return expected.cast(actual);
            }
            throw new AssertionError("expected " + expected.getSimpleName()
                + " but got " + actual.getClass().getSimpleName(), actual);
        }
        throw new AssertionError("expected " + expected.getSimpleName()
            + " but nothing was thrown");
    }

    public static void main(String[] args) {
        // Style 1: manual try/catch with the fail() forgotten.
        try {
            rectangleArea(-1, 4);
            // a fail("should have thrown") line belongs here, but it is missing
        } catch (IllegalArgumentException e) {
            System.out.println("caught: " + e.getMessage());
        }
        System.out.println("manual try/catch test: PASSED (silently wrong)");

        // Style 2: the helper fails when nothing is thrown.
        IllegalArgumentException heightError =
            expectThrows(IllegalArgumentException.class, () -> rectangleArea(2, -5));
        System.out.println("height check message: " + heightError.getMessage());

        try {
            expectThrows(IllegalArgumentException.class, () -> rectangleArea(-1, 4));
            System.out.println("width check: PASSED");
        } catch (AssertionError failure) {
            System.out.println("width check: FAILED -> " + failure.getMessage());
        }
    }
}
```

```text
manual try/catch test: PASSED (silently wrong)
height check message: height must be >= 0, was -5
width check: FAILED -> expected IllegalArgumentException but nothing was thrown
```

The manual style never printed "caught", yet reported a pass. The helper version detects the missing validation. JUnit's `assertThrows` works the same way: it runs your lambda, returns the exception if it has the expected type, and throws an `AssertionError` (failing the test) if a different exception or no exception occurs.

Because it *returns* the exception, you can check its details:

```java
@Test
void area_negativeHeight_reportsTheBadValue() {
    var error = assertThrows(IllegalArgumentException.class,
        () -> Rectangle.area(2, -5));

    assertTrue(error.getMessage().contains("-5"));
}

@Test
void area_hugeValues_overflowIsReported() {
    assertThrows(ArithmeticException.class,
        () -> Rectangle.area(Integer.MAX_VALUE, 2));
}
```

Check a stable part of the message (a code, a field name, the bad value) rather than every word, so harmless rewording does not break tests. Keep the lambda to the single call that should throw; if setup code inside the lambda throws the same type, the test passes for the wrong reason.

## Parameterized tests: one behavior, many rows

Writing a separate method for each row of a case table is repetitive. `@ParameterizedTest` runs one method once per row. It comes from the `junit-jupiter-params` module, which the `junit-jupiter` aggregator already includes. In the example, `Pricing.discountedCents` is the discount rule from the previous lesson (with its boundary fixed) and `Customer` is a record whose constructor rejects blank names.

```java
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class RectangleParameterizedTest {

    @ParameterizedTest(name = "{0} x {1} = {2}")
    @CsvSource({
        "3, 4, 12",
        "0, 5, 0",
        "1, 1, 1",
        "46340, 46340, 2147395600"
    })
    void area_matchesTable(int width, int height, int expected) {
        assertEquals(expected, Rectangle.area(width, height));
    }

    @ParameterizedTest(name = "width {0} is rejected")
    @ValueSource(ints = {-1, -100, Integer.MIN_VALUE})
    void area_negativeWidth_isRejected(int width) {
        assertThrows(IllegalArgumentException.class, () -> Rectangle.area(width, 1));
    }

    @ParameterizedTest
    @MethodSource("discountCases")
    void discount_matchesRule(int totalCents, int expectedCents) {
        assertEquals(expectedCents, Pricing.discountedCents(totalCents));
    }

    static Stream<Arguments> discountCases() {
        return Stream.of(
            Arguments.of(9_999, 9_999),
            Arguments.of(10_000, 9_000),
            Arguments.of(20_000, 18_000));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t"})
    void customerName_blank_isRejected(String name) {
        assertThrows(IllegalArgumentException.class, () -> new Customer(name));
    }
}
```

| Source | Supplies | Good for |
|---|---|---|
| `@ValueSource` | One literal per run (ints, strings, and so on) | A single varying input |
| `@CsvSource` | Rows of comma-separated values, converted to parameter types | Readable input/expected tables |
| `@CsvFileSource` | Rows from a CSV file on the test classpath | Large tables |
| `@MethodSource` | A static factory method returning a `Stream` of `Arguments` | Objects, records, computed cases |
| `@EnumSource` | Constants of an enum | Behavior that must hold for every enum value |
| `@NullSource`, `@EmptySource`, `@NullAndEmptySource` | `null` and/or empty values | Validation of absent input |

The `name` attribute controls how each row appears in reports: `{0}`, `{1}` refer to arguments, `{index}` to the row number. Make sure a failing row can be identified from its display name alone.

## Fluent assertions with AssertJ

AssertJ (`org.assertj:assertj-core`) does not replace the JUnit runner; it replaces the assertion calls. You start with `assertThat(actual)` and chain expectations that read like sentences. IDE auto-completion then shows only the checks that make sense for that type.

```java
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import java.util.List;
import java.util.Optional;
import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.Test;

class AssertJExamplesTest {

    record Line(String sku, int quantity) { }

    @Test
    void readableChecks() {
        assertThat(Rectangle.area(3, 4)).isEqualTo(12).isPositive();
        assertThat(0.1 + 0.2).isCloseTo(0.3, within(1e-9));
        assertThat("receipt-2024-03").startsWith("receipt").contains("2024");
        assertThat(Optional.of("pen")).contains("pen");

        List<Line> lines = List.of(new Line("PEN", 3), new Line("RULER", 1));
        assertThat(lines)
            .hasSize(2)
            .extracting(Line::sku)
            .containsExactly("PEN", "RULER");
    }

    @Test
    void exceptionChecks() {
        assertThatThrownBy(() -> Rectangle.area(-1, 4))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("width");

        assertThatIllegalArgumentException()
            .isThrownBy(() -> Rectangle.area(2, -5))
            .withMessageContaining("-5");
    }

    @Test
    void softAssertionsReportEverything() {
        SoftAssertions.assertSoftly(softly -> {
            softly.assertThat(Rectangle.area(2, 3)).isEqualTo(6);
            softly.assertThat(Rectangle.area(0, 3)).isZero();
        });
    }
}
```

AssertJ failure messages are descriptive. A failed `containsExactly` reports which elements were missing, which were unexpected, and whether only the order differed. The JUnit equivalent would print two list `toString` values for you to compare by eye.

| Need | JUnit `Assertions` | AssertJ |
|---|---|---|
| Equality | `assertEquals(12, area)` | `assertThat(area).isEqualTo(12)` |
| Collection order and contents | `assertIterableEquals(List.of(...), list)` | `assertThat(list).containsExactly(...)` |
| Any order | Manual sorting or sets | `assertThat(list).containsExactlyInAnyOrder(...)` |
| Exception type and message | `assertThrows` then a separate message check | `assertThatThrownBy(...).isInstanceOf(...).hasMessageContaining(...)` |
| Group of checks | `assertAll(...)` | `SoftAssertions.assertSoftly(...)` |
| Extra dependency | None (part of JUnit) | `assertj-core` |

Either style is professional. Pick one per codebase and be consistent.

## Useful extras

- `@DisplayName("...")` gives a test a readable sentence in reports.
- `@Nested` inner (non-static) classes group tests by scenario, such as `class WhenBalanceIsZero`.
- `@Tag("integration")` labels tests so the build can include or exclude groups.
- `@Disabled("reason and ticket")` skips a test; always say why, and remove it quickly.
- `@TempDir Path dir` injects a fresh temporary directory that JUnit deletes afterwards.
- `@RepeatedTest(5)` repeats a test, occasionally useful when investigating flakiness.

```java
import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ReceiptWriterTest {

    @Nested
    class WhenWritingToDisk {

        @TempDir
        Path dir;

        @Test
        void createsUtf8File() throws Exception {
            Path file = dir.resolve("receipt.txt");
            Files.writeString(file, "Total: 12.00 EUR");

            assertThat(Files.readString(file)).isEqualTo("Total: 12.00 EUR");
        }
    }
}
```

## What happens under the hood

1. The build tool starts the **JUnit Platform launcher** with your compiled test classes on the classpath.
2. The launcher asks each registered **test engine** to discover tests. The Jupiter engine scans for `@Test`, `@ParameterizedTest`, and similar annotations.
3. For each test class, `@BeforeAll` methods run once.
4. For each test method, the engine creates a new instance, injects fields and parameters (such as `@TempDir`), runs `@BeforeEach`, the test, then `@AfterEach`.
5. For a parameterized test, steps 4 repeat once per argument row, each with its own display name.
6. A thrown `AssertionError` (or any other exception) marks that test failed; the engine records it and continues.
7. `@AfterAll` runs; results are written as XML reports (for example `build/test-results/test` in Gradle or `target/surefire-reports` in Maven), and the build fails with a nonzero exit code if any test failed.

## Common mistakes

**Mistake 1: manual try/catch without a failure line.**

```java
try {
    Rectangle.area(-1, 4);
} catch (IllegalArgumentException expected) {
    // nothing here, and nothing after the call either
}
```

If no exception is thrown the test passes. Fix: `assertThrows(IllegalArgumentException.class, () -> Rectangle.area(-1, 4));`

**Mistake 2: mixing JUnit 4 and JUnit 5 imports.**

```java
import org.junit.Test;               // JUnit 4
import org.junit.jupiter.api.Assertions;
```

With only the Jupiter engine on the classpath, a method annotated with the JUnit 4 `@Test` is never discovered. Fix: use `org.junit.jupiter.api.Test`.

**Mistake 3: forgetting to enable the JUnit Platform in Gradle.**

```kotlin
tasks.test { }   // no useJUnitPlatform()
```

The build succeeds and zero tests ran. Fix: `tasks.test { useJUnitPlatform() }`, and glance at the test count in reports.

**Mistake 4: non-static `@BeforeAll`.** JUnit reports an error because there is no instance yet. Fix: make it `static`, or deliberately switch to `PER_CLASS` lifecycle.

**Mistake 5: swapped expected and actual.** `assertEquals(area, 12)` gives misleading messages. Fix: expected first.

**Mistake 6: a lambda that does too much.**

```java
assertThrows(IllegalArgumentException.class, () -> {
    Customer c = new Customer("");   // throws here, earlier than intended
    c.rename("   ");
});
```

Fix: arrange outside the lambda; put only the one call that should throw inside.

## Best practices

- Keep one behavior per test and use Arrange, Act, Assert with blank lines between.
- Build fixtures in `@BeforeEach` or directly in the test; avoid mutable `static` state.
- Prefer parameterized tests when rows differ only in data; use separate tests when the scenario differs.
- Use `assertThrows` (or AssertJ's `assertThatThrownBy`) for every failure path, and check the stable details of the exception.
- Give parameterized rows readable names.
- Make failures informative: messages, `assertAll`, or AssertJ.
- Run a new test against a deliberately broken implementation to see it fail for the right reason.
- Keep the build honest: check that the reported test count is not zero.

## Summary

- JUnit 5 (Jupiter) is added as a test dependency; Gradle also needs `useJUnitPlatform()`.
- JUnit creates a new test-class instance per test; `@BeforeEach`/`@AfterEach` wrap every test, `@BeforeAll`/`@AfterAll` run once and are static by default.
- Assertions take expected first; messages and `assertAll` make failures readable.
- `assertThrows` fails the test when the expected exception does not occur, and returns the exception for further checks.
- Parameterized tests turn a case table into one method with many named rows.
- AssertJ provides fluent, type-aware assertions with detailed failure messages.

## Practice

1. **Warm-up:** Set up a Gradle or Maven project with the dependencies above and write three `@Test` methods for `Rectangle.area`, including one failure path.
2. **Warm-up:** Rewrite a JUnit assertion-based test using AssertJ, and compare the two failure messages by breaking the code on purpose.
3. **Core:** Convert the withdrawal table from the previous lesson into a `@CsvSource` parameterized test with readable row names, plus a separate test for each rejection that asserts the balance is unchanged.
4. **Core:** Write a `@MethodSource` test for a `Receipt` record list, and a `@NullAndEmptySource` test for name validation.
5. **Challenge:** Build a `ReceiptFileWriter` and test it with `@TempDir`, `@Nested` scenario classes, and `assertAll`. Add a lifecycle method that proves (with a counter) that JUnit creates a new instance per test.

## Check your understanding

1. Why does JUnit create a new instance of the test class for each test method, and what kind of bug does that prevent?
2. Why must `@BeforeAll` methods be static in the default lifecycle?
3. What happens to a test using `assertThrows` if the code under test completes normally? Compare that with a manual try/catch that has no failure line.
4. When would you choose `@MethodSource` over `@CsvSource`?
5. What does the `name` attribute of `@ParameterizedTest` improve, and why does that matter in CI?
6. Give two concrete advantages of AssertJ's `containsExactly` over comparing two lists with `assertEquals`.
