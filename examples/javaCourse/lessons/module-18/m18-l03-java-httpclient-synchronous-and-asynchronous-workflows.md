# Java HttpClient synchronous and asynchronous workflows

## Reuse a configured client
```java
var client = java.net.http.HttpClient.newBuilder()
    .connectTimeout(java.time.Duration.ofSeconds(2)).build();
var request = java.net.http.HttpRequest.newBuilder(
        java.net.URI.create("https://example.test/tasks"))
    .timeout(java.time.Duration.ofSeconds(5))
    .header("Accept", "application/json").GET().build();
var response = client.send(request,
    java.net.http.HttpResponse.BodyHandlers.ofString());
if (response.statusCode() != 200)
    throw new java.io.IOException("unexpected status " + response.statusCode());
```
example.test is a placeholder; this external lab needs a controlled endpoint. send blocks and declares IOException/InterruptedException. sendAsync returns a CompletableFuture. An HTTP 404 is a received response, not automatically a transport exception.

## Bound the body
ofString buffers the complete body and is suitable only when the response size is trusted or otherwise bounded. For untrusted large responses, stream with a byte limit and close the body. Encode URI components correctly rather than concatenating arbitrary input into a URL.

## Practice
Use a local stub endpoint producing 200, 404, slow, and oversized responses. Verify status handling, charset policy, cancellation, and closure. Restrict redirect and destination behavior when URLs are influenced by users to avoid requests to unintended internal services.
