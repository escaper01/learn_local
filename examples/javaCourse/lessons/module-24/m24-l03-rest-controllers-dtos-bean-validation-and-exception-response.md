# REST controllers, DTOs, Bean Validation, and exception responses

A Spring Boot REST controller is where every earlier boundary discipline in this course converges into one class: HTTP method and status semantics (Chapter 18), DTOs kept separate from domain models (Chapter 18's JSON lesson, and Chapter 20's architecture material), and validated, bounded input handling (this course's security chapter). This lesson shows exactly how Spring's annotations wire that discipline together — and states plainly what this chapter's concept check insists on: `@Valid` checks the *shape* of a request, never who the caller is or what they are allowed to do.

What you will learn:

- `@RestController` and `@RequestMapping`/`@GetMapping`/`@PostMapping`: mapping HTTP requests to Java methods
- Binding a request body to a DTO, and why the DTO stays separate from the domain entity
- Bean Validation (`@Valid`, `@NotBlank`, `@Size`, and similar) and exactly what it does and does not check
- `@ExceptionHandler`/`@ControllerAdvice`: translating exceptions into structured, correctly-statused HTTP responses
- Why `@Valid` succeeding says nothing at all about authentication or authorization
- Designing a controller layer that stays thin, delegating real logic to services

## Mapping HTTP requests to methods

`@RestController` combines `@Controller` (marks the class as a Spring MVC controller) and `@ResponseBody` (every method's return value is serialized directly into the HTTP response body, typically as JSON, rather than resolved as a view name) — the standard shape for a JSON API endpoint:

```java
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService orderService; // constructor-injected, per the previous lesson

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/{orderId}")
    public OrderResponse getOrder(@PathVariable String orderId) {
        return orderService.findOrder(orderId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED) // maps to Chapter 18's 201 Created semantics
    public OrderResponse createOrder(@Valid @RequestBody CreateOrderRequest request) {
        return orderService.createOrder(request);
    }
}
```

`@PathVariable` binds a URL path segment; `@RequestBody` deserializes the HTTP request body (JSON, per Chapter 18's JSON lesson) into the declared parameter type; `@ResponseStatus` sets the HTTP status Chapter 18 established as the correct one for this specific outcome — `201 Created` for a successful `POST` that creates a new resource, exactly the status code table from that chapter's method-semantics lesson. None of this is new material; it is Spring's declarative syntax for exactly the HTTP method-and-status discipline Chapter 18 already taught you to reason about by hand.

## DTOs stay separate from domain entities, here too

`CreateOrderRequest` and `OrderResponse` are DTOs, in exactly the sense Chapter 18's JSON lesson defined — types whose only job is describing the wire-format shape of a request or response, kept separate from whatever `Order` domain entity or JPA entity (next lesson) the service and repository layers actually work with:

```java
// DTO: describes exactly the HTTP contract, nothing more.
public record CreateOrderRequest(
        @NotBlank String customerId,
        @NotEmpty List<@Valid OrderLineRequest> lines
) {}

public record OrderLineRequest(
        @NotBlank String sku,
        @Positive int quantity
) {}

public record OrderResponse(String orderId, String status, int totalCents) {}
```

The controller's job is translating between this DTO shape and whatever the service layer's own domain types are — `orderService.createOrder(request)` internally converts `CreateOrderRequest` into domain objects, and converts the resulting domain `Order` back into an `OrderResponse` DTO before returning it. Serializing a JPA entity directly as a controller's return type (skipping this translation) is exactly the "domain model leaks into the wire format, and an internal refactor silently becomes a breaking API change" mistake Chapter 18 already warned against — a temptation Spring makes easy to fall into, since a JPA entity often *looks* like it would serialize just fine, right up until an internal-only field, a lazy-loaded association (next lesson), or a bidirectional relationship produces a confusing serialization error or an unintended data leak.

## Bean Validation: checking shape, not identity or permission

The `@NotBlank`, `@NotEmpty`, `@Positive`, and `@Valid` annotations above are **Bean Validation** (JSR 380) constraints, and `@Valid` on a controller parameter tells Spring to check every declared constraint against the deserialized request body *before* the controller method's own body ever runs:

```java
@PostMapping
public OrderResponse createOrder(@Valid @RequestBody CreateOrderRequest request) {
    // If @Valid fails, this method body NEVER RUNS AT ALL — Spring returns
    // a 400 Bad Request automatically, before reaching this line.
    return orderService.createOrder(request);
}
```

This chapter's concept-check question states the essential limit precisely: `@Valid` checks the **declared validation constraints** on the request's *shape* — is `customerId` non-blank, does `lines` have at least one entry, is each line's `quantity` positive — and nothing else. It does **not** log the user in, and it does **not** imply the caller owns anything or is authorized to perform this specific action. A request that is perfectly well-formed (every field present, every constraint satisfied) can still come from a caller with no authentication at all, or from an authenticated caller attempting to create an order on behalf of a `customerId` that is not actually theirs — Bean Validation has nothing whatsoever to say about either of those questions, which are exactly the authentication and object-level-authorization concerns Chapter 23's threat-modeling lesson covered as entirely separate controls, enforced separately (typically via Spring Security, or explicit authorization checks in the service layer), never substituted for by request-shape validation.

## Translating exceptions into structured HTTP responses

A well-designed REST API translates internal exceptions into structured, correctly-statused JSON error responses, rather than leaking a raw stack trace (exactly Chapter 23's "verbose error pages" insecure-default warning) or returning a generic `500` for every failure regardless of its actual nature:

```java
@RestControllerAdvice // @ControllerAdvice + @ResponseBody, applied across every controller
public class ApiExceptionHandler {

    @ExceptionHandler(OrderNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND) // 404, per Chapter 18's status semantics
    public ErrorResponse handleNotFound(OrderNotFoundException e) {
        return new ErrorResponse("ORDER_NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class) // thrown automatically when @Valid fails
    @ResponseStatus(HttpStatus.BAD_REQUEST) // 400
    public ErrorResponse handleValidationFailure(MethodArgumentNotValidException e) {
        String details = e.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .collect(Collectors.joining(", "));
        return new ErrorResponse("VALIDATION_FAILED", details);
    }

    @ExceptionHandler(Exception.class) // last resort: never leak internal details
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR) // 500
    public ErrorResponse handleUnexpected(Exception e) {
        log.error("unexpected error handling request", e); // full details logged server-side only
        return new ErrorResponse("INTERNAL_ERROR", "an unexpected error occurred"); // generic message to the client
    }
}
```

`@RestControllerAdvice` is to `@ControllerAdvice` exactly what `@RestController` is to `@Controller`: it adds `@ResponseBody` semantics to every handler method in the class, so each method's return value is serialized directly into the response body (JSON, via the same `HttpMessageConverter` machinery a controller uses) instead of being resolved as a view name. Using plain `@ControllerAdvice` here, in an application with no view templates configured (the ordinary case for a JSON API), does not throw a clear error — Spring MVC treats the handler's returned `ErrorResponse` as a view name to look up, finds no matching view or static resource, and the request ends up failing with a confusing, unrelated `404 Not Found` instead of the intended `400`/`404`/`500` with the structured JSON body this method was written to produce. `@RestControllerAdvice` (or adding `@ResponseBody` to each individual `@ExceptionHandler` method) is what actually makes the intended behavior happen.

`@RestControllerAdvice` centralizes this translation across every controller, rather than repeating try/catch boilerplate in each one — one place maps each specific exception type to its correct HTTP status and a structured, client-safe error body. The catch-all `Exception` handler at the end is exactly the security-conscious pattern Chapter 23 established: log the *full* internal detail server-side (a stack trace, exact failure context, useful for debugging) while returning only a generic, non-revealing message to the client — the difference between an error response that helps a legitimate developer debug their own request (a specific validation message) and one that would help an attacker map your internal implementation (a raw stack trace or an internal exception class name).

## Keeping controllers thin

A well-designed controller's methods should be short: bind the request, delegate to a service method, map the result (or let a `@ControllerAdvice` map a thrown exception) to the response. Business logic — validation beyond mere shape, authorization decisions, transaction boundaries (next lesson), domain rule enforcement — belongs in the **service layer**, not scattered across controller methods:

```java
// THIN controller: binds, delegates, returns. No business logic here at all.
@PostMapping
@ResponseStatus(HttpStatus.CREATED)
public OrderResponse createOrder(@Valid @RequestBody CreateOrderRequest request, Authentication auth) {
    return orderService.createOrder(request, auth.getName()); // authorization decision made INSIDE the service
}
```

This is directly Chapter 20's hexagonal-architecture separation, applied to a web framework specifically: the controller is the **adapter** at the outer edge, translating an HTTP-shaped request into a call against the domain's own use-case methods; the actual business logic, including authorization decisions the previous section established `@Valid` cannot make, lives in the service layer, which — precisely because it does not depend on any Spring MVC or HTTP-specific type — remains unit-testable exactly as Chapter 20 demonstrated, without needing to stand up a running HTTP server at all.

## What happens under the hood: from an HTTP request to a JSON response

1. Spring's `DispatcherServlet` receives the incoming HTTP request and matches it, based on its method and path, against a controller method's `@GetMapping`/`@PostMapping`/etc. mapping.
2. It binds path variables, query parameters, and (via a configured `HttpMessageConverter`, typically Jackson under the hood, per Chapter 18) the request body into the method's declared parameter types.
3. If a parameter is annotated `@Valid`, Spring Bean Validation checks every declared constraint against the bound object; a failure throws `MethodArgumentNotValidException` immediately, before the controller method's own body ever executes.
4. The controller method (if reached) delegates to the service layer, which performs the actual business logic, including any authorization checks and transaction management (next lesson).
5. The method's return value (or a thrown exception, matched against a registered `@ExceptionHandler`) is converted back into an HTTP response: the return value serialized to JSON via the same `HttpMessageConverter` mechanism, with the status code set by `@ResponseStatus` or the matched exception handler's own status.

## Common mistakes

**Mistake 1: serializing a JPA entity directly as a controller's return type instead of a dedicated DTO.** This risks leaking internal fields, breaking on lazy-loaded associations, and turning an internal refactor into a breaking API change, exactly as Chapter 18 warned. Fix: always translate between domain/entity types and dedicated response DTOs at the controller boundary.

**Mistake 2: assuming `@Valid` passing means the caller is authenticated or authorized.** Bean Validation checks only the request's declared shape constraints, nothing about identity or permission. Fix: enforce authentication and object-level authorization as entirely separate controls, in the service layer or via Spring Security, never substituted for by `@Valid`.

**Mistake 3: letting an unhandled exception propagate as a raw stack trace to the client.** This is exactly Chapter 23's "verbose error pages" insecure default. Fix: use `@RestControllerAdvice` to translate every exception into a structured, correctly-statused, client-safe error response, logging full detail only server-side.

**Mistake 4: putting business logic (authorization decisions, domain rules, multi-step transactions) directly in controller methods.** This makes the logic hard to unit-test without a running HTTP server and blurs the adapter/domain boundary Chapter 20 established. Fix: keep controllers thin, delegating all real logic to the service layer.

**Mistake 5: using plain `@ControllerAdvice` (without `@ResponseBody`) in a JSON API.** The handler's return value is resolved as a view name instead of serialized as JSON, typically surfacing as a confusing, unrelated `404 Not Found` rather than the intended structured error response. Fix: use `@RestControllerAdvice`, or add `@ResponseBody` to each `@ExceptionHandler` method.

## Best practices

- Keep DTOs separate from domain and JPA entities at every controller boundary, translating explicitly between them.
- Use `@Valid` and Bean Validation constraints to check request shape, and enforce authentication/authorization as entirely separate, explicit controls.
- Centralize exception-to-HTTP-response translation in a `@RestControllerAdvice` (not plain `@ControllerAdvice`, which resolves return values as view names instead of JSON), mapping each specific exception type to its correct status and a client-safe message.
- Log full exception detail server-side while returning only generic, non-revealing messages to clients for unexpected failures.
- Keep controller methods thin: bind, delegate to the service layer, return — with business logic living in services that remain testable without a running HTTP server.

## Summary

- `@RestController` methods, annotated with `@GetMapping`/`@PostMapping`/etc., map HTTP requests to Java methods, applying exactly the method-and-status semantics Chapter 18 already established.
- DTOs (`@RequestBody`/return types) must stay separate from domain and JPA entities, translated explicitly at the controller boundary, to avoid leaking internal structure or breaking on an unrelated internal refactor.
- `@Valid` and Bean Validation constraints check a request's declared shape only — they never authenticate the caller or authorize the specific action, which must be enforced as separate, explicit controls.
- `@ControllerAdvice`/`@ExceptionHandler` centralize translating exceptions into structured, correctly-statused, client-safe responses, logging full detail only server-side.
- A well-designed controller stays thin, delegating real business logic to a service layer that remains unit-testable without any HTTP infrastructure.

## Practice

1. **Warm-up:** Explain precisely why a request passing every `@Valid` constraint could still come from a caller who should not be permitted to perform the requested action at all.
2. **Warm-up:** A controller method returns a JPA entity directly instead of a DTO. Describe one concrete way this could break or leak information that a dedicated DTO would have prevented.
3. **Core:** Build a small controller with a `@Valid`-annotated request DTO, at least two Bean Validation constraints, and a `@RestControllerAdvice` mapping both a validation failure and a custom not-found exception to their correct HTTP statuses; confirm the response body is genuine JSON, not a `404` from a misresolved view name.
4. **Core:** Write a unit test for the underlying service method (not the controller) that confirms an authorization check rejects a caller attempting to act on a resource they do not own, entirely without starting an HTTP server.
5. **Challenge:** Design a complete error-response contract (a consistent JSON shape for every error type) for a small API, and implement `@ExceptionHandler`s covering validation failure, not-found, an authorization failure, and an unexpected internal error, each mapped to its correct status and message.

## Check your understanding

1. What does `@Valid` on a controller parameter actually check, and what does a successful validation say about the caller's identity or permissions?
2. Why should a controller's return type be a dedicated DTO rather than a JPA entity or domain object directly?
3. What is the purpose of `@ControllerAdvice`/`@RestControllerAdvice`, and why is centralizing exception handling better than repeating try/catch logic per controller?
7. Why does using plain `@ControllerAdvice` instead of `@RestControllerAdvice` in a JSON API typically surface as a confusing `404 Not Found`, rather than as an obvious error naming the actual problem?
4. Why should an unexpected internal error's full detail be logged server-side but not included in the client-facing response?
5. Why does keeping a controller "thin" make the underlying business logic easier to test?
6. If a request is well-formed and passes every Bean Validation constraint, what two separate concerns (named in this and earlier chapters) still need to be checked before the action should actually be permitted?
