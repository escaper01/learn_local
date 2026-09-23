# Strategy, Command, State, Template Method, Observer, and events

## Represent varying behavior explicitly
Strategy selects a policy; Command represents an action as data; State changes behavior with lifecycle state; Template Method fixes a superclass algorithm skeleton; Observer publishes notifications to subscribers.

```java
interface Command { void execute(); }
final class CompleteTaskCommand implements Command {
    private final Task task;
    CompleteTaskCommand(Task task) { this.task = task; }
    public void execute() { task.complete(); }
}
```
A command can be queued or logged, but replay and undo are additional contracts, not automatic consequences of the interface. Repeating a command may be unsafe unless designed for idempotency.

## Events
An observer notification in one process can fail synchronously. A broker event crosses a durable boundary with duplication and ordering concerns. Do not assume replacing a direct method call with an event preserves atomicity.

## Practice
Compare Strategy and State for task-priority policy versus task lifecycle. Model one command and define duplicate execution. Document how subscriber failure affects the publisher. Add an unsubscribe policy so long-lived publishers do not retain abandoned subscribers forever.
