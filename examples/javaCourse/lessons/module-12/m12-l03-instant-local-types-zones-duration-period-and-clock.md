# Instant, local types, zones, duration, period, and Clock

"What time is it right now?" and "what time does my calendar say 9:30 AM on June 15th means?" are two genuinely different questions, and conflating them is one of the most common sources of date-time bugs in real software: a meeting scheduled at "9:30 AM" means something different in Tokyo than in Los Angeles, but a server timestamp recording "when did this payment complete" needs to mean the exact same single instant no matter who reads it, anywhere in the world. The `java.time` package (introduced in Java 8, replacing the notoriously error-prone legacy `Date`/`Calendar` classes) is built entirely around keeping these two ideas — a global instant versus a local, human-facing date and time — cleanly, deliberately separate.

What you will learn:

- `Instant`: a single, unambiguous point on the global timeline, with no concept of a "local" time at all
- `LocalDate`, `LocalTime`, `LocalDateTime`: human-facing values with no time zone information whatsoever
- `ZonedDateTime`: attaching a specific time zone to a local date-time, and why the same `Instant` looks completely different in different zones
- `Duration` (a length of time in hours/minutes/seconds) versus `Period` (a length of time in years/months/days), and why they are not interchangeable
- `Clock`: making "the current time" an explicit, injectable dependency so time-dependent code becomes genuinely testable
- Formatting and parsing dates with `DateTimeFormatter`, and why an invalid calendar date is rejected at parse time

## Instant versus local types: global moment or local reading?

An `Instant` represents one specific, unambiguous point on the global timeline — think of it as a single number of seconds since a fixed reference point, the same for every observer everywhere. `LocalDate`, `LocalTime`, and `LocalDateTime` represent exactly what a wall clock or calendar shows a human, with **no time zone attached at all** — they cannot, by themselves, be converted into a specific global instant, because "9:30 AM" alone does not say 9:30 AM *where*.

```java
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

public class InstantVsLocal {
    public static void main(String[] args) {
        Instant fixed = Instant.parse("2024-06-15T12:00:00Z");
        System.out.println("Instant (a single global point in time): " + fixed);

        ZonedDateTime tokyo = fixed.atZone(ZoneId.of("Asia/Tokyo"));
        ZonedDateTime losAngeles = fixed.atZone(ZoneId.of("America/Los_Angeles"));
        System.out.println("same instant in Tokyo:       " + tokyo);
        System.out.println("same instant in Los Angeles: " + losAngeles);
        System.out.println("both represent the identical moment: " + tokyo.toInstant().equals(losAngeles.toInstant()));

        LocalDate date = LocalDate.of(2024, 6, 15);
        LocalTime time = LocalTime.of(9, 30);
        LocalDateTime local = LocalDateTime.of(date, time);
        System.out.println("LocalDate:     " + date + " (no time, no zone)");
        System.out.println("LocalTime:     " + time + " (no date, no zone)");
        System.out.println("LocalDateTime: " + local + " (no zone: 9:30 AM where, exactly?)");
    }
}
```

Output:

```text
Instant (a single global point in time): 2024-06-15T12:00:00Z
same instant in Tokyo:       2024-06-15T21:00+09:00[Asia/Tokyo]
same instant in Los Angeles: 2024-06-15T05:00-07:00[America/Los_Angeles]
both represent the identical moment: true
LocalDate:     2024-06-15 (no time, no zone)
LocalTime:     09:30 (no date, no zone)
LocalDateTime: 2024-06-15T09:30 (no zone: 9:30 AM where, exactly?)
```

This is exactly the chapter's concept-check question: `Instant` is the type that represents a global timestamp — a single moment, `2024-06-15T12:00:00Z` (`Z` meaning UTC, zero offset), that genuinely means the identical thing to every observer on Earth. `ZonedDateTime` attaches a specific `ZoneId` to that instant, producing a **local reading** of it: the same underlying moment displays as `21:00` in Tokyo and `05:00` in Los Angeles — nine hours apart on the clock face, yet `tokyo.toInstant().equals(losAngeles.toInstant())` confirms they genuinely represent the exact same underlying moment. A bare `LocalDateTime`, by contrast, cannot answer "what instant is this?" at all — `9:30 AM on June 15th` is a valid reading on a wall clock in every time zone on Earth simultaneously, each one referring to a *different* actual moment.

| Type | Represents | Has a time zone? | Answers "what global instant is this?" |
|---|---|---|---|
| `Instant` | a point on the global timeline | not applicable — always UTC internally | Yes, by definition |
| `LocalDate` | a calendar date | No | No |
| `LocalTime` | a time of day | No | No |
| `LocalDateTime` | a date and time together | No | No |
| `ZonedDateTime` | a local date-time plus an explicit zone | Yes | Yes, once the zone is attached |

**Use `Instant`** for anything recording *when something globally happened* — a log timestamp, a payment completion time, an event's creation time in a database. **Use the `Local...` types** for things that are inherently calendar-facing without reference to a specific global moment — a birthday, a recurring "every day at 9 AM" business rule, a hotel checkout date. **Use `ZonedDateTime`** specifically when you need both a human-meaningful local reading *and* the ability to convert it to a genuine global instant, such as scheduling a meeting across time zones.

## Duration and Period: two different notions of "how long"

`Duration` measures an exact length of time in hours, minutes, and seconds — appropriate for machine-precise intervals. `Period` measures a length of time in years, months, and days — appropriate for calendar-based, human-meaningful spans, where "one month" can correctly mean 28, 29, 30, or 31 actual days depending on which month it is.

```java
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.Period;

public class DurationAndPeriod {
    public static void main(String[] args) {
        LocalTime start = LocalTime.of(9, 0);
        LocalTime end = LocalTime.of(17, 30);
        Duration worked = Duration.between(start, end);
        System.out.println("worked duration: " + worked + " (" + worked.toHours() + "h " + worked.toMinutesPart() + "m)");

        Duration meeting = Duration.ofMinutes(90);
        System.out.println("meeting duration: " + meeting);

        LocalDate hireDate = LocalDate.of(2020, 3, 10);
        LocalDate today = LocalDate.of(2024, 6, 15);
        Period employed = Period.between(hireDate, today);
        System.out.println("employed period: " + employed.getYears() + "y " + employed.getMonths() + "m " + employed.getDays() + "d");

        LocalDate nextReview = today.plusMonths(6);
        System.out.println("next review: " + nextReview);

        LocalDate deadline = LocalDate.of(2024, 3, 1).plus(Period.ofMonths(1));
        System.out.println("one month after March 1: " + deadline);
    }
}
```

Output:

```text
worked duration: PT8H30M (8h 30m)
meeting duration: PT1H30M
employed period: 4y 3m 5d
next review: 2024-12-15
one month after March 1: 2024-04-01
```

`Duration`'s `toString()` uses the ISO-8601 duration format (`PT8H30M` means "period of time, 8 hours, 30 minutes") — exact, machine-precise, and independent of any calendar. `Period`, by contrast, is fundamentally calendar-aware: "one month after March 1st" correctly lands on April 1st, regardless of March having 31 days and April having 30 — `Period` operates on calendar units, not a fixed number of elapsed seconds. Mixing these up is a real, subtle bug: using `Duration.ofDays(30)` to mean "one month" is wrong for eleven months of the year, since most months are not exactly 30 days; `Period.ofMonths(1)` is the semantically correct tool for that specific intent.

## Clock: making "now" a testable dependency

Code that calls `LocalDate.now()` or `Instant.now()` directly is calling the **real system clock** — which makes that code fundamentally difficult to test, since "the current date" changes every single day, and a test written today might behave differently (or simply become wrong) tomorrow. `Clock` solves this by making "what time is it" an explicit, injectable parameter rather than a hidden, global dependency:

```java
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;

public class ClockForTesting {
    static boolean isExpired(LocalDate expiry, Clock clock) {
        return LocalDate.now(clock).isAfter(expiry);
    }

    public static void main(String[] args) {
        LocalDate expiry = LocalDate.of(2024, 1, 1);

        Clock beforeExpiry = Clock.fixed(Instant.parse("2023-12-31T00:00:00Z"), ZoneOffset.UTC);
        Clock afterExpiry = Clock.fixed(Instant.parse("2024-06-15T00:00:00Z"), ZoneOffset.UTC);

        System.out.println("expired as of 2023-12-31? " + isExpired(expiry, beforeExpiry));
        System.out.println("expired as of 2024-06-15? " + isExpired(expiry, afterExpiry));

        Clock realClock = Clock.system(ZoneId.of("UTC"));
        System.out.println("using the real system clock gives a real, changing answer: " + isExpired(expiry, realClock));
    }
}
```

Output:

```text
expired as of 2023-12-31? false
expired as of 2024-06-15? true
using the real system clock gives a real, changing answer: true
```

`isExpired` never calls `LocalDate.now()` with no arguments; it always accepts a `Clock` and calls the overload `LocalDate.now(clock)`, which asks *that specific clock* what "now" is. In production, you pass `Clock.systemDefaultZone()` (or, better, an explicit `Clock.system(ZoneId.of(...))` — never rely on the ambient default zone for anything meaningful, for the same reason Chapter 4 warned against relying on a platform-default charset). In a test, you pass `Clock.fixed(someInstant, someZone)` — a clock permanently frozen at a specific, chosen moment — letting you test "is this expired the day before, and the day after, the expiry date" with completely deterministic, repeatable results, rather than a test that only passes today and silently breaks a year from now. This is exactly the same dependency-injection idea from Chapter 5's constructor lessons, applied specifically to "the current time" as a dependency worth injecting rather than hard-coding.

## Formatting and parsing: DateTimeFormatter

`DateTimeFormatter` converts between `java.time` objects and text, in either direction, and — crucially — parsing rejects genuinely invalid calendar dates rather than silently "fixing" them:

```java
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

public class FormattingAndParsing {
    public static void main(String[] args) {
        LocalDate date = LocalDate.of(2024, 6, 15);
        System.out.println("ISO default: " + date);

        DateTimeFormatter custom = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        System.out.println("custom pattern: " + date.format(custom));

        LocalDate parsedIso = LocalDate.parse("2024-06-15");
        LocalDate parsedCustom = LocalDate.parse("15/06/2024", custom);
        System.out.println("parsed ISO: " + parsedIso + ", parsed custom: " + parsedCustom + ", equal: " + parsedIso.equals(parsedCustom));

        try {
            LocalDate.parse("2024-02-30");
        } catch (DateTimeParseException e) {
            System.out.println("Feb 30 rejected: " + e.getMessage());
        }

        LocalDateTime dateTime = LocalDateTime.of(2024, 6, 15, 9, 30, 0);
        DateTimeFormatter withTime = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
        System.out.println("formatted with time: " + dateTime.format(withTime));
    }
}
```

Output:

```text
ISO default: 2024-06-15
custom pattern: 15/06/2024
parsed ISO: 2024-06-15, parsed custom: 2024-06-15, equal: true
Feb 30 rejected: Text '2024-02-30' could not be parsed: Invalid date 'FEBRUARY 30'
formatted with time: 2024-06-15 09:30
```

`LocalDate.toString()` without any formatter always produces the ISO-8601 standard form (`2024-06-15`) — a good, unambiguous default for machine-to-machine communication (logs, JSON, database columns). `DateTimeFormatter.ofPattern(...)` builds a formatter for any custom, human-facing layout, used identically for both `format` (object to text) and `parse` (text to object). `LocalDate.parse("2024-02-30")` correctly throws `DateTimeParseException`, because 2024, while a leap year, still has no February 30th — the library validates against the real calendar, exactly the "fail loudly on malformed or impossible input" discipline Chapter 2 and Chapter 11 both taught, rather than silently rolling the date forward into March as some older, more permissive date libraries historically did.

## What happens under the hood

Every `java.time` type in this lesson is, by design, **immutable** — exactly the Chapter 6 record-style immutability discipline, applied to dates and times specifically because a mutable date object was one of the most notorious sources of subtle bugs in the legacy `java.util.Date`/`Calendar` classes this package replaced (a shared `Calendar` instance silently mutated by one part of a program corrupting another part's assumptions). Every "modifying" method you called in this lesson — `plusMonths`, `atZone`, `format` — returns a **new** object, leaving the original completely untouched, the identical pattern `String` established all the way back in Chapter 4.

## Common mistakes

**1. Using `LocalDateTime` for anything that must represent a specific global moment.** It has no zone information at all; use `Instant` or `ZonedDateTime` instead.

**2. Using `Duration` where `Period` is semantically correct, or vice versa.** `Duration.ofDays(30)` is not the same thing as "one calendar month"; choose based on whether the length of time is exact-and-machine-precise or calendar-based-and-human-meaningful.

**3. Calling `LocalDate.now()`/`Instant.now()` directly inside business logic that needs to be tested.** This makes the code's behavior depend on the real wall clock at the moment the test runs; inject a `Clock` instead.

**4. Assuming an invalid calendar date will be silently corrected during parsing.** `java.time` rejects it outright with `DateTimeParseException`.

**5. Relying on the JVM's default time zone implicitly**, rather than specifying a `ZoneId` explicitly wherever a computation's correctness depends on which zone is used.

## Best practices

- Use `Instant` for anything recording when something globally happened; use the `Local...` types for calendar-facing values with no inherent global moment; use `ZonedDateTime` only when you genuinely need both.
- Choose `Duration` for exact, machine-precise time spans and `Period` for calendar-based ones; do not use one to approximate the other.
- Accept a `Clock` parameter (or otherwise make "now" injectable) in any method whose behavior depends on the current date or time, so it can be tested deterministically.
- Always specify an explicit `ZoneId` rather than relying on a JVM's default zone for anything whose correctness matters.
- Use `DateTimeFormatter` for both formatting and parsing, and let parsing failures surface as the exception they naturally are, rather than trying to guess or repair malformed input yourself.

## Summary

- `Instant` represents a single, unambiguous global moment; `LocalDate`/`LocalTime`/`LocalDateTime` represent calendar-facing values with no time zone at all; `ZonedDateTime` combines a local reading with an explicit zone, letting it convert to and from a real `Instant`.
- `Duration` measures exact, machine-precise time spans (hours/minutes/seconds); `Period` measures calendar-based spans (years/months/days); they are not interchangeable.
- `Clock` makes "the current time" an explicit, injectable parameter, letting time-dependent code be tested deterministically with `Clock.fixed(...)` instead of depending on the real, ever-changing system clock.
- `DateTimeFormatter` converts between `java.time` objects and text in both directions; parsing an impossible calendar date (like February 30th) throws `DateTimeParseException` rather than silently correcting it.
- Every `java.time` type is immutable; every "modifying" method returns a new object, exactly like `String`.

## Practice

Warm-up:

1. Create an `Instant` for a specific moment and view it through two different `ZoneId` values, confirming both represent the identical underlying instant.
2. Compute the `Duration` between two `LocalTime` values representing a workday's start and end, and print the hours and minutes separately.
3. Compute the `Period` between your own birth date (or any date of your choosing) and today, printing years, months, and days.

Core:

1. Write a method `static boolean isBusinessHours(LocalTime time)` returning whether a given time falls between 9 AM and 5 PM, and a second method that uses `Clock` to check "is it business hours right now" testably, with at least one test using a fixed clock before opening, during, and after closing.
2. Write a method that adds a `Period` of one month to the last day of a 31-day month (for example, January 31st) and explain, based on the actual output, how `java.time` handles the resulting day-of-month overflow.
3. Build a small `DateTimeFormatter` for a custom log-timestamp format of your choosing, and write both a formatting and a parsing test confirming round-trip correctness.

Challenge:

1. Design a small "subscription" class that stores a start `LocalDate` and a `Period` length, with a method `isActive(Clock clock)` that correctly determines whether the subscription is still active as of the clock's current date, and write tests using fixed clocks for before, during, and after the subscription period.
2. Write a method that schedules a meeting given a `LocalDateTime` and a `ZoneId` for the organizer, and computes what local time each of several attendees (each with their own `ZoneId`) would see, using `ZonedDateTime` conversions.

## Check your understanding

1. What is the fundamental difference between what `Instant` and `LocalDateTime` each represent?
2. Why can two different `ZonedDateTime` values, with completely different displayed times, represent the exact same underlying instant?
3. When should you use `Duration` instead of `Period`, and why does using the wrong one produce subtly incorrect results for calendar-based calculations?
4. Why does injecting a `Clock` parameter make date-dependent code more testable than calling `LocalDate.now()` directly?
5. What happens when you attempt to parse `"2024-02-30"` as a `LocalDate`, and why?
6. Are `java.time` objects mutable or immutable, and what does that mean for a method like `plusMonths`?
