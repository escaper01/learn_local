# TCP sockets, byte-stream framing, timeouts, limits, and cleanup

## TCP has no message boundaries
A single write can be split across reads, and several writes can arrive in one read. Your protocol must define length-prefix or delimiter framing, encoding, size limits, EOF behavior, and timeouts.
```java
try (var socket = new java.net.Socket()) {
    socket.connect(new java.net.InetSocketAddress("localhost", 9000), 2000);
    socket.setSoTimeout(3000);
    var input = new java.io.DataInputStream(socket.getInputStream());
    int length = input.readInt();
    if (length < 0 || length > 65536) throw new java.io.IOException("bad frame");
    byte[] body = new byte[length];
    input.readFully(body);
}
```
This external lab needs a cooperating local server. readFully either fills the frame or fails on premature EOF. Validate the length before allocation. Closing the socket closes its streams.

## Practice
Write a local server that deliberately sends a frame in small chunks. Test zero length, maximum length, truncated data, and a silent peer. Explain why available() is not the total message length and why a read timeout does not necessarily bound the whole request's elapsed lifetime.
