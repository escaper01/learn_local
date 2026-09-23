# Layered, hexagonal, clean, and modular-monolith architecture

## Separate policy and adapters
A layered application often has transport, application, domain, and infrastructure responsibilities. Hexagonal architecture describes ports the application offers or needs and adapters connecting them to external systems.

```text
HTTP controller -> CompleteTask use case -> Task domain behavior
                                 |
                           TaskStore port
                                 ^
                            JDBC adapter
```
The vertical call path and source dependency arrows are different concepts. The use case depends on a port, while the adapter implements it.

## Testable boundaries
A use case should run with an in-memory store in a unit test. That proves its decisions, while an integration test proves the JDBC adapter. Framework annotations should not leak everywhere merely for convenience. A modular monolith can enforce feature boundaries within one deployment without introducing network failure between every feature.

## Practice
Implement the same use case through a CLI and HTTP adapter. Reuse domain behavior and validation rather than duplicating them. Define transaction ownership at the use-case boundary. Explain which abstractions are required by actual changes and which could be removed without losing isolation.
