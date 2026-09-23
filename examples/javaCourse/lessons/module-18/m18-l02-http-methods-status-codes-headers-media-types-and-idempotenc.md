# HTTP methods, status codes, headers, media types, and idempotency

## HTTP carries semantics
GET retrieves and should be safe; PUT replaces a resource and is idempotent by contract; POST commonly creates or executes an operation and is not assumed idempotent. Idempotent means repeating the request has the same intended effect, not that every response is identical.

```http
POST /tasks HTTP/1.1
Content-Type: application/json
Accept: application/json

{"title":"Review"}
```
A creation response may use 201 and a Location header. Distinguish 400 malformed input, 401 authentication required, 403 forbidden, 404 absent, 409 conflict, and server-side 5xx failures. Never map every exception to 200 with an error hidden in the body.

## Representation and caching
Content-Type describes the body sent; Accept expresses desired response formats. Cache-Control and validators such as ETag govern reuse and conditional requests. Define pagination and maximum page size for collections.

## Practice
Write request/response examples for create, read, update, and delete. State which operations can be retried after an unknown outcome. Include an error schema with stable codes and safe messages. Document compatibility for adding a field and for changing an existing field's meaning.
