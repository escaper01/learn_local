# Byte versus character streams, buffering, and UTF-8

## Bytes and characters are different layers
InputStream/OutputStream transport bytes. Reader/Writer decode or encode characters through a charset. Buffering groups small operations to reduce underlying I/O calls.
```java
try (var reader = java.nio.file.Files.newBufferedReader(
        path, java.nio.charset.StandardCharsets.UTF_8)) {
    String line;
    while ((line = reader.readLine()) != null) {
        System.out.println(line);
    }
}
```
readLine removes line terminators and returns null at EOF, not an empty string. A blank line returns "". If exact line endings matter, line-oriented reading is the wrong representation.

## Large and binary data
Do not read a binary image through a Reader. Do not assume read(buffer) fills the buffer; process the returned count and distinguish -1 EOF. Loading a whole file is convenient only under a size contract. UTF-8 must be selected consistently on writing and reading.

## Practice
Round-trip accented characters and supplementary Unicode. Compare blank-file and blank-line behavior. Write a byte-copy loop that handles short reads. Add an input-size limit enforced during reading, rather than trusting metadata that might be missing or change.
