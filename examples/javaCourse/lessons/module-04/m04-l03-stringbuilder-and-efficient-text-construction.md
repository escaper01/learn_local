# StringBuilder and efficient text construction

## Why a builder helps
Strings do not change in place. Repeatedly appending to one String in a loop may repeatedly copy the growing prefix, producing quadratic copying work. StringBuilder keeps a mutable buffer that grows as needed.
```java
String[] names = {"Ada", "Lin", "Sam"};
StringBuilder report = new StringBuilder();
for (int i = 0; i < names.length; i++) {
    if (i > 0) report.append(", ");
    report.append(names[i]);
}
String result = report.toString();
System.out.println(result); // Ada, Lin, Sam
```
The delimiter condition avoids both a leading and trailing comma. toString gives an immutable String result. length reports characters currently stored; capacity reports allocated space and can be larger.

## Operations and ownership
append adds at the end; insert and delete modify positions; setLength can truncate or extend. Repeated insertions at the beginning move existing characters and may still be expensive. StringBuilder is not synchronized; keep it local to a thread or protect access. StringBuffer synchronizes individual operations but does not automatically make a multi-operation protocol atomic.

Small fixed concatenations such as "id=" + id are usually clearer than explicit builders; the compiler/runtime can optimize them. Measure meaningful workloads before micro-optimizing every plus sign.

## Practice
Build a line-numbered report with exactly one newline between records and none for empty input. Test zero, one, and three records. Compare a builder implementation with a join operation. Explain why returning a mutable shared builder from a domain object exposes its internal state.
