# Explicit serialization schemas, compatibility, and native serialization risks

## A format is a long-lived contract
Persistence needs an encoding, schema version, field types, size limits, and missing/unknown-field rules. A line-delimited title format fails when titles contain newlines unless escaping or length framing is defined.

```json
{"schemaVersion":1,"id":"task-42","title":"Review","status":"OPEN"}
```
This is a transport representation, not permission to instantiate arbitrary classes. Parse into a bounded data structure, validate required fields and domain rules, then construct the domain object. Decide how old readers react to new fields and new enum values.

## Java native serialization
Serializable does not make a representation secure or stable. Native object serialization is tightly coupled to class structure and deserializing untrusted graphs can execute dangerous behavior. Prefer explicit schemas for external data; migration and compatibility still need design regardless of format.

## Practice
Define a v1 task format and a v2 adding optional dueDate. Specify defaults and unknown-version rejection. Test truncated input, oversized fields, duplicates, missing IDs, and corrupted encoding. Keep a fixture from the old version and verify migration. Store parsed input in temporary state before replacing a valid repository.
