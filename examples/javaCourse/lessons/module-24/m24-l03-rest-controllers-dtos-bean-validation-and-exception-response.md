# REST controllers, DTOs, Bean Validation, and exception responses

## Controllers translate transport contracts
```java
record CreateTaskRequest(
    @jakarta.validation.constraints.NotBlank String title) {}
@org.springframework.web.bind.annotation.RestController
final class TaskController {
    private final CreateTask useCase;
    TaskController(CreateTask useCase) { this.useCase = useCase; }
    @org.springframework.web.bind.annotation.PostMapping("/tasks")
    @org.springframework.web.bind.annotation.ResponseStatus(
        org.springframework.http.HttpStatus.CREATED)
    TaskResponse create(
        @jakarta.validation.Valid
        @org.springframework.web.bind.annotation.RequestBody CreateTaskRequest request) {
        return useCase.handle(request.title());
    }
}
```
The application-specific use case and response plus Spring/validation dependencies must exist. The controller accepts a DTO, validates shape, delegates business behavior, and returns an explicit transport result. It should not serialize a persistence entity accidentally.

## Errors and authorization
Central exception handling can map domain errors to stable status codes and error bodies. Bean Validation does not authorize a caller or prove uniqueness in a database. Keep those responsibilities in their appropriate boundaries.

## Practice
Test valid creation, blank title, malformed JSON, unauthorized access, and duplicate/conflicting requests. Verify 201 and the response schema for success, safe error messages for failure, and no stack trace or internal entity fields in responses.
