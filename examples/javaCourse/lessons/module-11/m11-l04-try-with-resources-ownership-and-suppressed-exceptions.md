# try-with-resources, ownership, and suppressed exceptions

## Own the lifetime
```java
try (var reader = java.nio.file.Files.newBufferedReader(path);
     var writer = java.nio.file.Files.newBufferedWriter(output)) {
    writer.write(reader.readLine());
}
```
Resources implementing AutoCloseable close when the block exits normally or exceptionally, in reverse declaration order. If opening the second resource fails, the first still closes. If the body fails and close also fails, the body exception remains primary and close failures are suppressed.

## Ownership is separate from usage
A method that opens a stream usually owns closure. A method receiving a caller-owned stream should document whether it closes it; surprising closure can break later work. Closing a buffered wrapper normally closes its underlying stream. Files.lines returns a resource-backed stream and also requires closure.

Resource cleanup is different from garbage collection. A socket or file descriptor can exhaust an operating-system limit long before heap pressure triggers collection.

## Practice
Create a small AutoCloseable whose close records its name; nest two and verify reverse order. Make both the body and close throw, then inspect getSuppressed(). Write a copy function with an explicit ownership policy. Handle an empty file before passing null from readLine to writer.write.
