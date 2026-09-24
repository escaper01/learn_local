# JSON types, schemas, parsing limits, DTOs, and compatibility

JSON is the de facto data format at almost every HTTP boundary a Java service will ever cross, and the JDK deliberately does not ship a general-purpose object mapper for it — that choice is left to a declared library (Jackson and Gson are the common choices), and this lesson treats JSON handling as boundary code: untrusted input that needs bounded parsing, explicit shape validation, and a deliberate strategy for handling fields you did not expect.

What you will learn:

- JSON's actual type system, and where it does and does not map cleanly onto Java's
- Why a JSON parsing library is a declared dependency, not part of the JDK
- What a DTO (data transfer object) is, and why it should be separate from your domain model
- How to bound JSON parsing against oversized or deeply nested malicious input
- How unknown fields, missing fields, and null values should be handled deliberately
- What forward- and backward-compatible schema evolution means for a long-lived API

## JSON's type system versus Java's

JSON has exactly six kinds of value: object, array, string, number, boolean, and null. Notably, **JSON has one number type** — there is no built-in distinction between an integer and a floating-point value in the JSON specification itself; `42` and `42.0` are both just "number," and a JSON library has to decide, by convention or by the target Java type it is told to produce, whether to materialize `42` as an `int`, a `long`, a `double`, or a `BigDecimal`.

| JSON type | Common Java mapping | Caveat |
|---|---|---|
| object | A class instance, `Map<String, Object>`, or a JSON tree node | Field order is not guaranteed to round-trip |
| array | `List<T>` or an array | Element type is not declared by JSON itself; the mapper infers or is told |
| string | `String` | No native date/time type — dates are conventionally ISO-8601 strings, parsed manually |
| number | `int`, `long`, `double`, `BigDecimal`, depending on target type | A large integer parsed into a `double` can silently lose precision |
| boolean | `boolean` | — |
| null | `null` | Distinct from "field absent entirely" — a mapper must handle both cases |

The precision caveat is not theoretical: a monetary amount or a large database ID represented as a JSON number and deserialized into a Java `double` can lose precision for values beyond `double`'s exact integer range (roughly 2^53), which is exactly why financial and identifier fields are commonly represented as JSON strings in real APIs, deserialized into `BigDecimal` or `long`/`String` rather than `double`.

## Why this is a declared library, not part of the JDK

The JDK ships low-level JSON *tokenizing* pieces in places (and `javax.json`/`jakarta.json` exists as a separate specification some projects add), but there is no general-purpose, schema-aware object mapper in `java.util` or anywhere else in the base JDK. Projects add Jackson (`com.fasterxml.jackson.databind.ObjectMapper`) or Gson (`com.google.gson.Gson`) as an explicit Maven/Gradle dependency, exactly as Chapter 16 described choosing and pinning a dependency deliberately:

```xml
<dependency>
  <groupId>com.fasterxml.jackson.core</groupId>
  <artifactId>jackson-databind</artifactId>
  <version>2.17.0</version>
</dependency>
```

```java
import com.fasterxml.jackson.databind.ObjectMapper;

public class BasicJacksonUsage {
    record Customer(String id, String name, int loyaltyPoints) {}

    public static void main(String[] args) throws Exception {
        ObjectMapper mapper = new ObjectMapper();

        Customer customer = new Customer("c-42", "Ada Lovelace", 1500);
        String json = mapper.writeValueAsString(customer);
        System.out.println(json);

        Customer parsed = mapper.readValue(json, Customer.class);
        System.out.println(parsed);
    }
}
```

```text
{"id":"c-42","name":"Ada Lovelace","loyaltyPoints":1500}
Customer[id=c-42, name=Ada Lovelace, loyaltyPoints=1500]
```

Jackson maps a Java `record` to and from JSON using its canonical constructor and accessor methods with no extra configuration required for this simple shape — a large part of why records became a natural fit for DTOs once Java gained them.

## DTOs: a boundary shape, separate from your domain model

A **DTO** (Data Transfer Object) is a type whose only job is to describe the shape of data crossing a boundary — an HTTP request or response body, in this lesson's context. It should be kept **separate** from your internal domain model, even when the two look similar today, for a specific reason: your domain model is free to evolve for internal reasons (renaming a field for clarity, splitting one field into two, adding business methods) without breaking every client depending on the wire format, as long as the DTO and the translation between DTO and domain model absorb that change.

```java
// DTO: describes exactly what the API contract promises, nothing more.
public record CreateOrderRequest(String customerId, java.util.List<OrderLineDto> lines) {}
public record OrderLineDto(String sku, int quantity) {}

// Domain model: free to have richer behavior, different field names, or validation invariants
// that have nothing to do with the wire format.
public final class Order {
    private final CustomerId customerId;
    private final java.util.List<OrderLine> lines;
    // constructors, business methods, invariants enforced here — not in the DTO
    Order(CustomerId customerId, java.util.List<OrderLine> lines) {
        this.customerId = customerId;
        this.lines = List.copyOf(lines);
    }
}
```

A translation layer (a mapper method, or a small dedicated class) converts between the two. Skipping this separation — annotating your domain entity directly with JSON library annotations and serializing it straight to clients — couples your wire format to your internal implementation, so an entirely internal refactor (renaming a private field, restructuring an aggregate) becomes, without anyone intending it, a breaking API change for every external client.

## Bounding JSON parsing against malicious or oversized input

JSON parsing is boundary code, and this course's security boundaries apply directly: JSON received from an external client is untrusted input, and a parser configured with no limits is a resource-exhaustion vector, in the same spirit as the unbounded LearnPack archive entries or the unbounded socket message lengths from earlier lessons.

- **Overall size**: reject a request body above a sane maximum before attempting to parse it at all — most HTTP server frameworks let you configure this at the transport layer, which is more efficient than reading the whole oversized body into memory first.
- **Nesting depth**: a deeply nested JSON structure (`[[[[[...]]]]]`, thousands of levels deep) can exhaust the parser's call stack (`StackOverflowError`) even with a small overall byte count. Jackson exposes `StreamReadConstraints` specifically to cap maximum nesting depth, string length, and number length independent of overall payload size.
- **Duplicate or excessive keys**: a JSON object with an enormous number of distinct keys can be used to exhaust memory even within an otherwise size-bounded payload; the same nesting/size constraints generally bound this too, but it is worth testing explicitly for any endpoint accepting attacker-controlled object shapes.

```java
import com.fasterxml.jackson.core.StreamReadConstraints;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;

public class BoundedJsonParsing {

    static final ObjectMapper MAPPER = JsonMapper.builder()
            .streamReadConstraints(StreamReadConstraints.builder()
                    .maxNestingDepth(64)
                    .maxStringLength(1_000_000)
                    .build())
            .build();
}
```

An endpoint that accepts arbitrarily large or arbitrarily deeply nested JSON from an untrusted caller, with no configured limits, is exactly as exposed to a resource-exhaustion attack as the unbounded socket-length example from Lesson 1 — the attack surface moved from raw bytes to structured data, but the underlying discipline (bound everything you accept, before you commit resources to processing it) is identical.

## Unknown fields, missing fields, and null: three distinct cases

A DTO field can be in exactly one of three states relative to the incoming JSON, and conflating them produces subtly wrong behavior:

| Case | What it means | Common handling |
|---|---|---|
| Field present with a value | The client explicitly provided this value | Use it |
| Field present with JSON `null` | The client explicitly wants this field cleared/absent | Distinguish from "not provided" for `PATCH`-style partial updates |
| Field entirely absent from the JSON | The client said nothing about this field | Leave existing value unchanged (for updates) or apply a default (for creates) |

For a `PUT` or full-replacement `POST`, most APIs collapse "absent" and "null" together (both mean "no value"). For a `PATCH`-style partial update, the distinction is essential: a `PATCH {"nickname": null}` that clears a field must be handled differently from a `PATCH {}` that changes nothing, and a mapper deserializing straight into a plain field cannot tell these apart on a primitive or a type that defaults to `null` either way — this is why partial-update DTOs commonly use a wrapper type (an `Optional`-like "was this field present" marker) rather than plain nullable fields.

Unknown fields — keys present in the incoming JSON that the DTO does not declare — should usually be **rejected or ignored deliberately**, not accepted silently by accident:

```java
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;

ObjectMapper strictMapper = new ObjectMapper()
        .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, true);
// A request body with an extra, unexpected field now fails fast with a clear error,
// instead of silently discarding data the client believed the server received.
```

Silently ignoring unknown fields (Jackson's default) is often the right choice for forward compatibility (see below), but choosing it should be a deliberate decision, not an accident — for a security-sensitive endpoint, an unexpectedly accepted extra field going unnoticed is a different kind of risk than a rejected one.

## Schema evolution: adding fields safely, changing them dangerously

A JSON API that lives for years will need to evolve, and some changes are safe for existing clients while others break them:

| Change | Effect on existing clients |
|---|---|
| Adding a new optional field to a response | Safe — old clients that ignore unknown fields are unaffected |
| Adding a new required field to a request | Breaks old clients that do not send it, unless a sensible default exists |
| Removing a field | Breaks any client still reading (or sending) it |
| Renaming a field | Breaks every client, unless both the old and new name are supported temporarily |
| Changing a field's type (e.g., string to number) | Breaks clients parsing it with the old assumption, often silently rather than with a clear error |
| Changing an enum's allowed values | Breaks a client with an exhaustive switch over the old value set, on encountering a new one |

The safest evolutionary path — additive, optional, backward-compatible changes — is exactly what "ignore unknown fields by default" from the previous section supports: an old client's DTO simply does not declare the new field and continues working unaffected, while a new client's DTO can read it. A genuinely breaking change (renaming, removing, retyping a field) should be handled with API versioning (a new endpoint version, or a transition period supporting both shapes) rather than mutating an existing contract out from under clients who have no way to know it changed.

## What happens under the hood: from bytes to a Java object

1. The JSON library reads the input (bytes or a `Reader`) and tokenizes it: braces, brackets, colons, commas, strings, numbers, `true`/`false`/`null` are recognized as discrete tokens, subject to any configured length/depth/size limits.
2. For an object-mapping call (`readValue(json, SomeDto.class)`), the library matches each JSON object key against the target type's fields or constructor parameters (via reflection or, for records, the canonical constructor), converting each JSON value to the declared Java type.
3. An unmatched key is either silently skipped or triggers a failure, depending on the configured `FAIL_ON_UNKNOWN_PROPERTIES` setting.
4. A JSON `null` for a field maps to Java `null` for reference types; a JSON `null` for a primitive field (which cannot hold `null`) typically triggers a mapping error, which is one reason DTOs generally prefer boxed types (`Integer`, not `int`) for optional fields.
5. On the way out (`writeValueAsString`), the library reflects over the object's fields/accessors (or a record's components) and emits corresponding JSON tokens in a library-determined order, which is why field order should never be relied upon by a consumer.

## Common mistakes

**Mistake 1: representing large IDs or monetary amounts as JSON numbers deserialized into `double`.** Precision loss beyond `double`'s exact integer range silently corrupts values. Fix: use strings (for IDs) or a decimal type like `BigDecimal` for money, both round-tripped as JSON strings if precision must be exact.

**Mistake 2: serializing the domain model directly instead of a dedicated DTO.** An internal refactor becomes an unintended breaking API change. Fix: keep a translation layer between DTOs and domain types, even when they currently look identical.

**Mistake 3: parsing JSON from an untrusted client with no size or nesting limits.** This is a resource-exhaustion vector, exactly like an unbounded socket message length. Fix: configure maximum body size, nesting depth, and string/number length explicitly.

**Mistake 4: not distinguishing "field absent" from "field explicitly null" in a partial-update endpoint.** This makes it impossible to correctly implement "clear this field" versus "leave it alone." Fix: use a presence-aware wrapper type for `PATCH`-style DTOs, not plain nullable fields.

**Mistake 5: treating any schema change as safe because "it still parses."** Removing or retyping a field can break consumers, sometimes silently rather than with a clear parse error. Fix: classify every schema change against the compatibility table above before shipping it, and version the API for breaking changes.

## Best practices

- Keep DTOs separate from domain models; translate explicitly between them.
- Use `BigDecimal`/string representations for money and large identifiers, never `double`, to avoid silent precision loss.
- Configure explicit size, depth, and length limits on any JSON parser that processes untrusted input.
- Decide deliberately whether unknown fields should be rejected or ignored, rather than accepting the library's default unreflectively.
- Distinguish "absent," "null," and "present with a value" explicitly for any partial-update endpoint.
- Classify every API schema change (additive, breaking) before shipping it, and version the API for breaking changes rather than mutating an existing contract.

## Summary

- JSON has one number type and no native date type; mapping to Java types (especially precision-sensitive ones) requires deliberate choices, not defaults.
- JSON parsing is a declared library dependency (Jackson, Gson), not part of the base JDK.
- DTOs should be kept separate from domain models so internal refactors do not silently become breaking API changes.
- JSON parsing from untrusted input needs explicit size and nesting-depth limits, exactly like any other boundary-handling code in this course.
- "Absent," "null," and "present with a value" are three distinct states a partial-update endpoint must be able to tell apart.
- Additive, optional changes are backward compatible; removing, renaming, or retyping a field is a breaking change that needs versioning, not a silent update.

## Practice

1. **Warm-up:** Explain why a JSON number like `9223372036854775807` (a valid `long`) can lose precision if deserialized into a Java `double`, and what type should be used instead.
2. **Warm-up:** A domain entity is annotated directly with JSON library annotations and returned straight from an HTTP endpoint. Describe a refactor to that entity that would silently break existing clients, and how a separate DTO would have prevented it.
3. **Core:** Configure a JSON mapper with explicit maximum nesting depth and string length, and demonstrate it rejecting a deeply nested or oversized input that an unconfigured mapper would accept.
4. **Core:** Design a `PATCH`-style DTO for a `Customer` resource that can distinguish "leave the nickname unchanged," "clear the nickname," and "set the nickname to a new value," and show how each JSON body maps to each case.
5. **Challenge:** Take a versioned API response DTO, add a new optional field (demonstrate old-style deserialization still works), then simulate a breaking change (renaming a field) and design a transition period where both the old and new field names are accepted.

## Check your understanding

1. Why does JSON's single "number" type create a practical risk for large integers and monetary values in Java, and how is that risk avoided?
2. Why should a DTO be a separate type from the domain model it is translated to and from, rather than the same class serialized directly?
3. Name two specific limits worth configuring on a JSON parser that processes untrusted client input, and what attack each one mitigates.
4. Why can a plain nullable field be insufficient to correctly implement a `PATCH` endpoint that must distinguish "absent" from "explicitly null"?
5. Classify each of the following as backward compatible or breaking: adding an optional response field, removing a request field, renaming an enum value.
6. Why is silently ignoring unknown JSON fields sometimes the right default, and when might you want to reject them instead?
