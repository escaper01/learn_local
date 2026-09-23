# JSON types, schemas, parsing limits, DTOs, and compatibility

## JSON is a transport data model
JSON supports objects, arrays, strings, numbers, booleans, and null. It has no native LocalDate, UUID, or Java integer-width type.
```json
{"id":"42","title":"Review","dueDate":"2024-12-31","tags":["java"]}
```
Define whether IDs are strings, how timestamps are formatted, and whether a missing field differs from an explicit null. Use a maintained parser such as a declared Jackson or Gson dependency; Java 21's standard library does not provide a general JSON object-mapping API. Production Java code almost always binds JSON through one of these libraries' object mappers rather than hand-writing a parser, since correct escaping, streaming, and schema validation are easy to get wrong by hand.

## Parse, validate, map
Transport DTOs should expose only approved fields. Bound body size and nesting, define duplicate-key behavior, validate required values, then construct domain objects. Avoid polymorphic deserialization driven by arbitrary type names supplied by the input. Handwritten quote replacement is not a complete JSON encoder: control characters and escaping rules matter.

## Practice
Define a task schema and fixtures for missing title, null title, unknown fields, duplicate IDs, Unicode, and control characters. Round-trip valid fixtures through a real library in an external project. Keep old-version fixtures to test compatibility. Do not claim that a String-formatting exercise validates a JSON boundary.
