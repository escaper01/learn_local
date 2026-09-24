# TCP sockets, byte-stream framing, timeouts, limits, and cleanup

Every HTTP call, database connection, and message queue client in this course eventually rests on the same foundation: a TCP socket carrying a stream of bytes between two processes. Higher-level libraries hide this, and that is exactly why understanding it matters — when a "simple" network call hangs forever, sends garbled data, or a server slowly runs out of memory under load, the cause is almost always a violated assumption about what TCP actually promises, at this lowest layer.

What you will learn:

- What TCP actually guarantees (ordered, reliable bytes) and what it does not (message boundaries)
- Why one `read()` is not guaranteed to return one complete application message
- How to frame messages: length-prefixing versus delimiters, and why both need a maximum size
- Why every socket operation needs an explicit timeout, and what happens without one
- How partial reads and partial writes happen, and how to loop correctly around each
- Why sockets, streams, and any other closeable resource must be closed in `finally` (or try-with-resources)

## What TCP promises, and what it does not

TCP gives you a **reliable, ordered stream of bytes** between two endpoints: bytes you write on one side arrive on the other side in the same order, or the connection reports failure — TCP will not silently reorder or drop bytes it delivers. What TCP does **not** give you is any concept of "message": there is no built-in way to know, from the raw stream alone, where one application-level message ends and the next begins. If you write `"HELLO"` and then `"WORLD"` in two separate calls, the receiver might see `"HELLOWORLD"` in one read, `"HEL"` then `"LOWORLD"` in two reads, or any other split — TCP is free to buffer, coalesce, or fragment your writes however the network and operating system see fit, as long as the bytes arrive in order.

```java
import java.io.OutputStream;
import java.net.Socket;

public class NaiveSender {
    public static void main(String[] args) throws Exception {
        try (Socket socket = new Socket("example.internal", 9000)) {
            OutputStream out = socket.getOutputStream();
            out.write("HELLO".getBytes());
            out.write("WORLD".getBytes());
            // Nothing here tells the receiver where "HELLO" ends and "WORLD" begins.
        }
    }
}
```

A programmer who assumes "one write equals one read on the other side" has made an assumption TCP never promised, and code built on that assumption works reliably in local testing (where writes are small and the network is fast and quiet) and breaks intermittently in production (where a slow network, a large payload, or an unlucky buffer boundary splits or merges what looked like an atomic message).

## Framing: giving the byte stream message boundaries

**Framing** is the application-level convention that recovers message boundaries from an undifferentiated byte stream. Two common strategies:

| Strategy | How it works | Trade-off |
|---|---|---|
| Length-prefixing | Send a fixed-size integer giving the message's byte length, then exactly that many bytes | Reader must buffer until it has the declared length; requires trusting (and bounding) the declared length |
| Delimiter-based | Send bytes, then a sentinel (like `\n`) that cannot appear inside a message | Simple for text protocols; requires escaping or forbidding the delimiter inside message content |

```java
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class LengthPrefixedFraming {

    static final int MAX_MESSAGE_BYTES = 1_048_576; // 1 MiB cap, see "limits" below

    static void sendMessage(Socket socket, String message) throws IOException {
        byte[] payload = message.getBytes(StandardCharsets.UTF_8);
        DataOutputStream out = new DataOutputStream(socket.getOutputStream());
        out.writeInt(payload.length); // 4-byte length prefix
        out.write(payload);
        out.flush();
    }

    static String readMessage(Socket socket) throws IOException {
        DataInputStream in = new DataInputStream(socket.getInputStream());
        int length = in.readInt();
        if (length < 0 || length > MAX_MESSAGE_BYTES) {
            throw new IOException("declared message length " + length + " exceeds limit");
        }
        byte[] payload = new byte[length];
        in.readFully(payload); // loops internally until exactly `length` bytes are read
        return new String(payload, StandardCharsets.UTF_8);
    }
}
```

`DataInputStream.readFully` is doing exactly the partial-read handling described below, so it is worth using (or replicating) rather than assuming a single `read()` call fills the buffer. The length check before allocating `payload` is not optional: without it, a corrupted or malicious length prefix could ask the JVM to allocate gigabytes for a single message, which is a denial-of-service vector, not just a bug — the same reasoning behind bounding LearnPack archive entries or request bodies anywhere else in this course's security boundaries.

## Partial reads and partial writes

`InputStream.read(byte[] buffer)` returns *up to* `buffer.length` bytes — it is free to return fewer, even one, even when more data is already available on the wire, and it returns `-1` only when the stream is genuinely closed. Code that assumes one `read()` call fills the buffer silently drops the rest of the message under exactly the conditions (large messages, slow networks, small OS buffers) that make it hardest to notice in testing.

```java
import java.io.IOException;
import java.io.InputStream;

public class PartialReadLoop {

    // WRONG: assumes one read() call returns everything requested.
    static byte[] readNaively(InputStream in, int length) throws IOException {
        byte[] buffer = new byte[length];
        int actuallyRead = in.read(buffer);          // may be far less than `length`
        return buffer; // silently contains trailing zero bytes if actuallyRead < length
    }

    // CORRECT: loop until the requested number of bytes has actually arrived, or the stream ends.
    static byte[] readExactly(InputStream in, int length) throws IOException {
        byte[] buffer = new byte[length];
        int totalRead = 0;
        while (totalRead < length) {
            int justRead = in.read(buffer, totalRead, length - totalRead);
            if (justRead == -1) {
                throw new IOException("stream closed after " + totalRead + " of " + length + " expected bytes");
            }
            totalRead += justRead;
        }
        return buffer;
    }
}
```

Writes have the same property in reverse: `OutputStream.write(byte[])` on a plain socket stream generally does block until all bytes are handed to the OS buffer, but a **non-blocking** channel's `write` can return having written only part of a buffer, and code built on non-blocking `SocketChannel` must loop on write exactly as `readExactly` loops on read. The lesson is the same at both ends: never assume a single I/O call moved as many bytes as you asked for; always check the actual count and loop until you have what you need or the stream tells you it cannot give you any more.

## Timeouts: every blocking call needs a bound

A plain socket read with no timeout configured blocks **forever** if the peer never sends anything and never closes the connection — a silently hung peer, a firewall that drops packets without a reset, or a server that accepted a connection and then deadlocked all look identical to your code: nothing arrives, ever. Without an explicit timeout, one slow or stuck peer can pin a thread indefinitely, and enough stuck threads exhausts your pool exactly as an unbounded queue would.

```java
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;

public class TimeoutDemo {

    public static void main(String[] args) throws IOException {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("example.internal", 9000), 2_000); // connect timeout: 2s
            socket.setSoTimeout(5_000); // read timeout: every subsequent read() waits at most 5s

            try {
                int firstByte = socket.getInputStream().read();
                System.out.println("received: " + firstByte);
            } catch (SocketTimeoutException e) {
                System.out.println("peer did not respond within 5 seconds; treating as a failed call");
                // Decide explicitly: retry with backoff (Lesson 5), fail the caller, or both.
            }
        }
    }
}
```

`connect` and `read` need separate, deliberately chosen timeouts: a slow DNS resolution or a firewall silently dropping SYN packets is a *connect*-phase problem, while a peer that accepts the connection and then never responds is a *read*-phase problem, and conflating the two makes a genuine failure much harder to diagnose from logs alone.

## Bounding what you accept

Framing prevents ambiguity about where a message ends; **limits** prevent a technically well-formed message from exhausting your resources. A length-prefixed protocol with no maximum accepts a client (malicious or merely buggy) declaring a length of two gigabytes and forces you to either allocate that much memory or write more complex incremental parsing than the protocol otherwise needs. The same principle behind bounding LearnPack archive entry counts and sizes elsewhere in this course applies directly to any network protocol you write or consume:

- Cap the maximum message size *before* allocating a buffer for it, exactly as `LengthPrefixedFraming.readMessage` does above.
- Cap the number of connections a server accepts concurrently, so a flood of connection attempts cannot exhaust file descriptors or threads.
- Cap how long an idle connection may remain open without activity, so a client that opens a connection and never sends anything cannot hold a slot forever.

## Cleanup: closing sockets and streams in every path

A `Socket` (and the streams obtained from it) is a real operating-system resource — a file descriptor and, on the peer's side, half of an established connection. Failing to close a socket on every exit path, including exceptional ones, leaks file descriptors until the process can no longer open new connections at all, and leaves the peer holding a connection that may eventually time out on its own, but only after wasting its own limited resources in the meantime.

```java
import java.io.IOException;
import java.net.Socket;

public class CleanupDemo {

    // Try-with-resources closes the socket (and its streams) on every exit path,
    // including when sendMessage or readMessage throws.
    static String roundTrip(String host, int port, String request) throws IOException {
        try (Socket socket = new Socket(host, port)) {
            socket.setSoTimeout(5_000);
            LengthPrefixedFraming.sendMessage(socket, request);
            return LengthPrefixedFraming.readMessage(socket);
        } // socket.close() runs here whether the method returns normally or an exception propagates
    }
}
```

This mirrors exactly the "cleanup must run in `finally`" discipline this course applies to sandbox containers and temporary directories: a socket opened without a guaranteed close is a resource leak with the same shape as a container never cleaned up, just at a different layer of the stack.

## What happens under the hood: from `socket.connect` to a delivered byte

1. `connect` initiates a TCP three-way handshake (SYN, SYN-ACK, ACK) with the peer; the connect timeout bounds how long this handshake may take before giving up.
2. Once connected, `write` calls hand bytes to the operating system's send buffer, which the OS transmits according to TCP's own flow-control and retransmission logic — your write call does not correspond one-to-one with a single network packet.
3. On the receiving side, arriving bytes accumulate in the OS receive buffer; a `read` call copies whatever is currently available (up to the buffer size requested), which may be less than a full application message, more than one message concatenated, or exactly one message, depending entirely on timing.
4. The read timeout (`setSoTimeout`) bounds how long a `read` call waits for *any* bytes to become available before throwing `SocketTimeoutException`; it does not bound the total time to receive a large message split across many reads, which is why framing code loops with its own overall accounting when that matters.
5. Closing the socket (explicitly, or via try-with-resources) sends a TCP FIN to the peer, releases the local file descriptor, and — critically — it is the only way the peer learns you are done, absent a protocol-level "goodbye" message.

## Common mistakes

**Mistake 1: assuming one write matches one read.** A message split across two reads, or two messages coalesced into one read, are both `TCP`-legal outcomes. Fix: always frame messages explicitly (length-prefix or delimiter) and parse based on that framing, never on read boundaries.

**Mistake 2: no timeout on a blocking socket call.** A silently hung or unreachable peer blocks the calling thread forever. Fix: set both a connect timeout and a read timeout (`setSoTimeout`) explicitly, and handle `SocketTimeoutException` as an expected, recoverable outcome.

**Mistake 3: allocating a buffer sized by an unvalidated, attacker- or bug-controlled length.** A declared length of two gigabytes, trusted blindly, is a resource-exhaustion vector. Fix: validate the declared length against a sane maximum before allocating anything.

**Mistake 4: a single `read()` call assumed to fill the requested buffer.** This silently truncates or corrupts messages under exactly the load conditions hardest to reproduce in a quick local test. Fix: loop until the expected number of bytes has arrived (as `readExactly` does), or use a method that already loops internally (`DataInputStream.readFully`).

**Mistake 5: not closing the socket on an exceptional path.** A leaked socket per failed request eventually exhausts file descriptors under sustained load. Fix: try-with-resources, every time, with no exceptions.

## Best practices

- Always define explicit framing (length-prefix or delimiter) for any protocol you design; never rely on read/write boundaries matching message boundaries.
- Set both a connect timeout and a read timeout on every socket; never leave a blocking call unbounded.
- Validate any length or size field against a hard maximum before allocating memory based on it.
- Loop on both reads and writes until you have moved the expected number of bytes or the stream signals it cannot give you any more.
- Close sockets and their streams with try-with-resources, on every exit path.
- Treat a caught timeout as an expected, handleable outcome — not a fatal error — since it says nothing about whether the peer actually processed the request (this becomes central in Lesson 5).

## Practice

1. **Warm-up:** Explain why `out.write("HELLO".getBytes()); out.write("WORLD".getBytes());` on the same socket gives the receiver no reliable way to recover the boundary between the two words.
2. **Warm-up:** A socket read with no timeout set hangs indefinitely against an unresponsive peer. Explain, in terms of TCP's guarantees, why TCP itself does not detect and report this automatically.
3. **Core:** Implement a small length-prefixed protocol (send and receive) over a loopback socket, including a maximum message size check, and demonstrate it rejecting an oversized declared length before allocating a buffer for it.
4. **Core:** Write a `readExactly` helper (or use the one above) and demonstrate, with a server that deliberately writes a message in three separate small writes, that a naive single `read()` call would truncate it while `readExactly` does not.
5. **Challenge:** Build a minimal client-server pair with an explicit connect timeout and read timeout, and demonstrate the read timeout firing against a server that accepts the connection but never writes a response.

## Check your understanding

1. What exactly does TCP guarantee about the bytes it delivers, and what does it explicitly not guarantee about message boundaries?
2. Why is a length-prefixed message format still unsafe without a maximum length check, even though it solves the framing problem?
3. What can go wrong if code assumes a single `InputStream.read(buffer)` call always fills the entire buffer?
4. Why do a socket's connect timeout and read timeout need to be considered separately, rather than one single timeout value?
5. What specific resource does an unclosed `Socket` leak, and what eventually happens to a server that leaks one per request under sustained load?
6. Why must a size or length limit be checked before allocating a buffer, rather than after?
