# Spring container, beans, scopes, lifecycle, proxies, and constructor injection

## Dependency injection is object construction
Spring's container discovers or receives bean definitions, creates instances, resolves dependencies, and manages configured lifecycle callbacks. Constructor injection makes required collaborators visible and permits ordinary unit tests.
```java
@org.springframework.stereotype.Service
final class CompleteTask {
    private final TaskRepository tasks;
    CompleteTask(TaskRepository tasks) { this.tasks = tasks; }
}
```
This fragment requires Spring and an application-defined repository. In current supported Spring versions, a single constructor can be used without an explicit @Autowired. Pin and verify the framework version in the external project.

## Scope and proxies
The default singleton scope is one instance per container, not one instance for all JVMs. Such services may serve concurrent requests and should not store mutable per-request state. Proxies wrap beans to provide behavior such as transactions; calls must cross the relevant proxy boundary.

## Practice
Construct CompleteTask manually with a fake repository, then wire it through a small application context. Introduce two repository implementations and resolve the ambiguity explicitly. Explain bean destruction ownership and why field injection makes required dependencies less visible.
