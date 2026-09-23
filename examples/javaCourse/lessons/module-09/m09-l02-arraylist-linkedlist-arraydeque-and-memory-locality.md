# ArrayList, LinkedList, ArrayDeque, and memory locality

In the previous lesson you chose *contracts*. Now you choose *data structures*. `ArrayList` and `LinkedList` both implement `List`, and `ArrayDeque` and `LinkedList` both implement `Deque`, so code that compiles with one will compile with the other. Yet on real workloads the difference can be the gap between a request that answers in milliseconds and one that times out. Senior developers do not guess here: they reason about how each structure stores data and what each operation must physically do.

What you will learn:

- The difference between a fixed-size array and a dynamic (growable) array, and how growth works.
- What "amortized O(1)" means for `ArrayList.add`.
- How `LinkedList` stores nodes and why `get(i)` must walk from one end.
- Why an index-based loop over a `LinkedList` can become quadratic.
- How `ArrayDeque` works as both a queue and a stack, and why it replaces the legacy `Stack` class.
- What memory locality is and why contiguous storage is usually faster in practice.
- How to remove elements safely while iterating.

## Fixed-size arrays

A Java array is a single block of memory with a length fixed at creation. Element `i` lives at a position the JVM can compute directly: start address plus `i` times the slot size. That is why `arr[i]` is O(1) no matter how big the array is.

The price is rigidity. You cannot add a fourth element to an array of length 3:

```java
int[] fixed = new int[3]; // fragment
fixed[3] = 40;            // throws ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3
```

To "grow" an array you must allocate a bigger one and copy the old elements across. Doing that by hand every time is tedious and error-prone, which is exactly the job a dynamic array automates.

## Dynamic arrays: how ArrayList grows

A **dynamic array** keeps two numbers: the *capacity* (length of the hidden backing array) and the *size* (how many slots are actually used). Adding an element when `size < capacity` just writes into the next free slot. When the array is full, it allocates a larger array, copies everything, and continues.

The following program builds a tiny dynamic array of `int` values that doubles when full, and reports every growth step.

```java
import java.util.Arrays;

public class GrowableArrayDemo {
    public static void main(String[] args) {
        int[] fixed = new int[3];
        try {
            fixed[3] = 40;
        } catch (ArrayIndexOutOfBoundsException e) {
            System.out.println("fixed array: " + e.getMessage());
        }

        IntList list = new IntList(2);
        for (int value = 10; value <= 70; value += 10) {
            list.add(value);
        }
        System.out.println("list = " + list + ", total elements copied = " + list.copies);
    }
}

// A tiny dynamic array: the same idea ArrayList uses internally.
class IntList {
    private int[] data;
    private int size;
    int copies;

    IntList(int initialCapacity) {
        data = new int[initialCapacity];
    }

    void add(int value) {
        if (size == data.length) {
            int newCapacity = data.length * 2;
            System.out.println("  full at size " + size + ": grow " + data.length + " -> " + newCapacity);
            copies += size;
            data = Arrays.copyOf(data, newCapacity);
        }
        data[size++] = value;
    }

    int get(int index) {
        if (index < 0 || index >= size) {
            throw new IndexOutOfBoundsException("index " + index + ", size " + size);
        }
        return data[index];
    }

    @Override
    public String toString() {
        return Arrays.toString(Arrays.copyOf(data, size)) + " (capacity " + data.length + ")";
    }
}
```

```text
fixed array: Index 3 out of bounds for length 3
  full at size 2: grow 2 -> 4
  full at size 4: grow 4 -> 8
list = [10, 20, 30, 40, 50, 60, 70] (capacity 8), total elements copied = 6
```

Seven adds caused only six element copies in total. That is the key insight behind **amortized O(1)**: an occasional add is expensive (it copies everything), but because capacity grows by a *multiplying factor*, expensive adds become rarer as the list grows. Spread over all operations, the average cost per add is a constant. If capacity grew by a fixed amount instead (say +10 each time), total copying would be quadratic.

`java.util.ArrayList` works the same way with objects instead of `int`s. In current OpenJDK the backing array grows to roughly 1.5 times its old length, and a list created with `new ArrayList<>()` allocates its first backing array lazily, on the first `add`. These are implementation details, not contract promises. What matters for you:

- `get(i)` and `set(i, e)` are O(1).
- `add(e)` at the end is amortized O(1).
- `add(0, e)` or `remove(0)` shifts every later element one slot: O(n).
- `contains(o)` and `indexOf(o)` scan: O(n).
- If you know the final size, `new ArrayList<>(expectedSize)` avoids repeated growth.

## LinkedList: a chain of nodes

`java.util.LinkedList` is a **doubly linked list**. Every element lives in its own small node object that holds the element plus a reference to the previous node and the next node. The list itself keeps references to the first and last nodes.

```text
 first                                         last
   |                                             |
 [prev|"A"|next] <-> [prev|"B"|next] <-> [prev|"C"|next]
```

This layout gives O(1) insertion and removal *at a node you already hold*, and at either end. But there is no arithmetic that jumps to element `i`. To answer `get(i)`, the list must start at an end and follow links one at a time. OpenJDK starts from whichever end is closer, which halves the walk but does not change its linear growth.

The simplified singly linked list below counts every link it follows, comparing an index-based loop with a sequential walk.

```java
public class NodeWalk {
    public static void main(String[] args) {
        for (int n : new int[] {10, 100, 1000}) {
            ChainList chain = new ChainList();
            for (int i = 0; i < n; i++) {
                chain.addLast(i);
            }

            chain.hops = 0;
            long sum = 0;
            for (int i = 0; i < n; i++) {
                sum += chain.get(i);            // walks from the head every time
            }
            long indexedHops = chain.hops;

            chain.hops = 0;
            long sum2 = 0;
            for (Node node = chain.head; node != null; node = node.next) {
                sum2 += node.value;             // one step per element
                chain.hops++;
            }
            System.out.printf("n=%4d indexed loop hops=%6d  sequential hops=%4d  sums equal=%b%n",
                    n, indexedHops, chain.hops, sum == sum2);
        }
    }
}

class Node {
    final int value;
    Node next;

    Node(int value) {
        this.value = value;
    }
}

// A minimal singly linked list that counts how many links it follows.
class ChainList {
    Node head;
    Node tail;
    long hops;

    void addLast(int value) {
        Node node = new Node(value);
        if (head == null) {
            head = node;
        } else {
            tail.next = node;
        }
        tail = node;
    }

    int get(int index) {
        Node current = head;
        for (int i = 0; i < index; i++) {
            current = current.next;
            hops++;
        }
        return current.value;
    }
}
```

```text
n=  10 indexed loop hops=    45  sequential hops=  10  sums equal=true
n= 100 indexed loop hops=  4950  sequential hops= 100  sums equal=true
n=1000 indexed loop hops=499500  sequential hops=1000  sums equal=true
```

Multiplying `n` by 10 multiplied the indexed-loop work by about 100. That is quadratic growth: `get(0)` walks 0 links, `get(1)` walks 1, and so on, for a total of `n(n-1)/2`. The sequential walk touches each node once. With the real `LinkedList`, the same effect happens with `for (int i = 0; i < list.size(); i++) list.get(i)`; use the enhanced `for` loop or an `Iterator` instead, which move one link per step.

> **Warning:** "LinkedList is faster for insertion" is only true when you already hold the position (for example through a `ListIterator`). `list.add(500_000, x)` must first walk to index 500,000, which is O(n), and then insert.

## Memory locality: why contiguous storage wins

Big-O counts operations, but real hardware adds another factor. A CPU does not read memory one value at a time; it loads a whole *cache line* (commonly 64 bytes) into a small, very fast cache. When your next read is next to your previous one, it is probably already in the cache. This is called **spatial locality**.

- An `int[]` or `double[]` stores values contiguously, so scanning it is extremely cache-friendly.
- An `ArrayList<Integer>` stores a contiguous array of *references*; each `Integer` object lives elsewhere on the heap, so there is one level of indirection, but the reference array itself scans well.
- A `LinkedList` scatters node objects across the heap. Following `next` can land anywhere, causing a cache miss on many steps. Each node also carries object header overhead plus two references, so a linked list of `n` elements uses several times more memory than an `ArrayList`.

The practical result: even for operations where both structures are O(n), an `ArrayList` usually finishes much faster. Shifting elements inside an array (for example `add(0, e)`) is a fast bulk memory copy, so `ArrayList` remains competitive for surprisingly large sizes.

> **Tip:** Measure before optimising, and measure properly. One tiny timing run with `System.nanoTime()` is dominated by JIT warm-up and noise. Serious Java benchmarks use a harness such as JMH, several input sizes, and repeated runs.

## ArrayDeque: a circular array for both ends

`ArrayDeque` stores elements in a resizable array used as a **ring buffer**. It keeps a `head` index and a `tail` index; adding at the front moves `head` backwards (wrapping around to the end of the array), adding at the back moves `tail` forwards. Nothing is shifted, so all end operations are amortized O(1), and the elements stay contiguous.

```text
capacity 8, after addLast(A), addLast(B), addFirst(Z):
index:  0   1   2   3   4   5   6   7
       [A] [B] [ ] [ ] [ ] [ ] [ ] [Z]
                ^tail               ^head
logical order: Z, A, B   (head wraps around to the end of the array;
                          tail is the next free slot at the back)
```

Because it supports both ends, one class covers two classic abstract data types:

```java
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.NoSuchElementException;

public class DequeRoles {
    public static void main(String[] args) {
        Deque<String> queue = new ArrayDeque<>();
        queue.addLast("first");
        queue.addLast("second");
        queue.addLast("third");
        System.out.println("FIFO order:  " + queue.removeFirst() + ", " + queue.removeFirst() + ", " + queue.removeFirst());

        Deque<String> stack = new ArrayDeque<>();
        stack.push("first");
        stack.push("second");
        stack.push("third");
        System.out.println("stack view:  " + stack + " peek=" + stack.peek());
        System.out.println("LIFO order:  " + stack.pop() + ", " + stack.pop() + ", " + stack.pop());

        System.out.println("pollFirst on empty: " + stack.pollFirst());
        try {
            stack.removeFirst();
        } catch (NoSuchElementException e) {
            System.out.println("removeFirst on empty: NoSuchElementException");
        }
        try {
            stack.push(null);
        } catch (NullPointerException e) {
            System.out.println("push(null): NullPointerException");
        }
    }
}
```

```text
FIFO order:  first, second, third
stack view:  [third, second, first] peek=third
LIFO order:  third, second, first
pollFirst on empty: null
removeFirst on empty: NoSuchElementException
push(null): NullPointerException
```

Notice that `push` is the same as `addFirst` and `pop` is the same as `removeFirst`. Mixing directions by accident (for example `push` then `removeLast`) silently turns your stack into a queue, so pick one pair of methods per role and stick to it.

## The legacy Stack class

Java 1.0 shipped `java.util.Stack`, and you will meet it in older code and textbooks. It still works, but it has design problems:

- It extends `Vector`, an older list whose every method is `synchronized`. That locking costs time in single-threaded code and still does not make compound actions (check then pop) thread-safe.
- Because it *is a* `Vector`, it inherits index operations like `add(0, x)` and `get(i)`, so any caller can break the LIFO rule.
- It prints and iterates from bottom to top, the opposite of how `ArrayDeque` presents a stack.

```java
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Stack;

public class LegacyStackVsDeque {
    public static void main(String[] args) {
        Stack<String> legacy = new Stack<>();
        legacy.push("a");
        legacy.push("b");
        legacy.push("c");

        Deque<String> modern = new ArrayDeque<>();
        modern.push("a");
        modern.push("b");
        modern.push("c");

        System.out.println("Stack prints bottom-to-top:      " + legacy);
        System.out.println("ArrayDeque prints top-to-bottom: " + modern);
        System.out.println("both pop: " + legacy.pop() + " and " + modern.pop());

        // Stack inherits Vector's index methods, which break the LIFO abstraction
        legacy.add(0, "sneaky");
        System.out.println("Stack after add(0, ...): " + legacy + " get(0)=" + legacy.get(0));
        System.out.println("Stack is a Vector: " + (legacy instanceof java.util.Vector));
    }
}
```

```text
Stack prints bottom-to-top:      [a, b, c]
ArrayDeque prints top-to-bottom: [c, b, a]
both pop: c and c
Stack after add(0, ...): [sneaky, a, b] get(0)=sneaky
Stack is a Vector: true
```

The `Stack` documentation itself recommends `Deque` implementations for LIFO stacks. In new code, write `Deque<T> stack = new ArrayDeque<>();`.

## Operation cost comparison

| Operation | `ArrayList` | `LinkedList` | `ArrayDeque` |
|---|---|---|---|
| `get(i)` / `set(i, e)` | O(1) | O(n) walk | not offered |
| Add or remove at the end | amortized O(1) | O(1) | amortized O(1) |
| Add or remove at the front | O(n) shift | O(1) | amortized O(1) |
| Insert in the middle by index | O(n) shift | O(n) walk, then O(1) link | not offered |
| `contains(o)` | O(n) | O(n) | O(n) |
| Allows `null` | yes | yes | no |
| Memory per element | one reference slot | node object with two links | one reference slot |
| Cache behaviour on scans | good | poor | good |

Rules of thumb: use `ArrayList` as the default `List`, `ArrayDeque` as the default queue and stack, and reach for `LinkedList` only for a measured need such as many insertions through a `ListIterator` at positions you are already visiting.

## Removing while iterating

Collections track structural changes. If you add or remove through the collection while a for-each loop's hidden iterator is running, the iterator detects it and throws `ConcurrentModificationException` (it is a fail-fast check, not a threading feature).

```java
import java.util.ArrayList;
import java.util.ConcurrentModificationException;
import java.util.Iterator;
import java.util.List;

public class RemoveWhileLooping {
    public static void main(String[] args) {
        List<String> tasks = new ArrayList<>(List.of("done:a", "todo:b", "done:c", "todo:d"));
        try {
            for (String task : tasks) {
                if (task.startsWith("done")) {
                    tasks.remove(task);
                }
            }
        } catch (ConcurrentModificationException e) {
            System.out.println("for-each + remove: ConcurrentModificationException");
        }

        List<String> viaIterator = new ArrayList<>(List.of("done:a", "todo:b", "done:c", "todo:d"));
        Iterator<String> it = viaIterator.iterator();
        while (it.hasNext()) {
            if (it.next().startsWith("done")) {
                it.remove();
            }
        }
        System.out.println("Iterator.remove: " + viaIterator);

        List<String> viaRemoveIf = new ArrayList<>(List.of("done:a", "todo:b", "done:c", "todo:d"));
        viaRemoveIf.removeIf(task -> task.startsWith("done"));
        System.out.println("removeIf:        " + viaRemoveIf);
    }
}
```

```text
for-each + remove: ConcurrentModificationException
Iterator.remove: [todo:b, todo:d]
removeIf:        [todo:b, todo:d]
```

`removeIf` is the clearest choice. On `ArrayList` it is also efficient: it compacts the array in one pass instead of shifting once per removed element.

## Common mistakes

### Indexed loop over a LinkedList

```java
// fragment: quadratic on LinkedList
for (int i = 0; i < orders.size(); i++) {
    process(orders.get(i));
}
```

Each `get(i)` walks nodes, so the loop does roughly `n*n/4` hops. Fix: `for (Order order : orders) process(order);`, which is linear for every `List`.

### Repeated remove(0) on an ArrayList used as a queue

```java
// fragment: every remove(0) shifts all remaining elements, O(n) each
while (!jobs.isEmpty()) {
    run(jobs.remove(0));
}
```

Fix: store jobs in an `ArrayDeque` and call `pollFirst()`, which is O(1).

### Storing null in an ArrayDeque

`deque.push(null)` throws `NullPointerException`, as the program above showed. If "no value" is meaningful, model it explicitly (for example an `Optional` or a dedicated sentinel object), or check for `null` before adding.

### Using java.util.Stack in new code

It compiles and runs, but you inherit locking overhead and index methods that bypass LIFO. Fix: `Deque<T> stack = new ArrayDeque<>();`.

### Assuming capacity equals size

`new ArrayList<>(100)` has capacity 100 but `size()` 0; calling `get(0)` throws `IndexOutOfBoundsException`. Capacity is internal room, not elements.

## Best practices

- Default to `ArrayList` for lists and `ArrayDeque` for stacks and queues.
- Pre-size with `new ArrayList<>(n)` when you know the approximate final size of a large list.
- Traverse with for-each, `Iterator`, or streams; use indexes only on random-access lists (`ArrayList`, arrays).
- Remove matching elements with `removeIf` rather than manual loops.
- Keep a deque in one role: `push`/`pop`/`peek` for a stack, `offerLast`/`pollFirst` for a queue.
- Prefer primitive arrays (`int[]`) for large numeric workloads where boxing overhead and locality matter.
- State data sizes and the operations that dominate before arguing about performance, and benchmark with realistic data.

## Summary

- Arrays have fixed length and O(1) indexing because elements are contiguous.
- A dynamic array (like `ArrayList`) grows by allocating a larger array and copying; multiplicative growth makes appends amortized O(1).
- `LinkedList` stores separate nodes; indexing must walk links, so an index-based loop can cost O(n squared). Iterate sequentially instead.
- Contiguous storage is cache-friendly; scattered nodes cause cache misses and use more memory.
- `ArrayDeque` is a ring buffer with O(1) operations at both ends and serves as both queue and stack; it rejects `null`.
- The legacy `Stack` extends `Vector`, synchronizes everything, and exposes index methods; prefer `ArrayDeque`.
- Remove during iteration with `Iterator.remove` or `removeIf` to avoid `ConcurrentModificationException`.

## Practice

### Warm-up

1. Predict the capacity sequence of the `IntList` class above if it starts at capacity 1 and you add 20 elements. Then run it to check.
2. Rewrite an index-based loop over a `List<String>` as an enhanced `for` loop and as an explicit `Iterator` loop.

### Core

1. Implement an undo history with `ArrayDeque` using `push`/`pop`, and a breadth-first task processor using `offerLast`/`pollFirst`. Then deliberately swap one method and describe how the processing order changes.
2. Change `IntList` to grow by a fixed `+2` instead of doubling, and count total copies for 10, 100, and 1000 adds. Explain the difference in growth.
3. Write a method that removes every even number from a `List<Integer>` three ways (index loop going backwards, `Iterator.remove`, `removeIf`) and confirm they agree.

### Challenge

1. Implement a small generic ring-buffer `IntDeque` with `addFirst`, `addLast`, `pollFirst`, `pollLast`, and growth when full, using a head index and a size field with modulo arithmetic. Test wrap-around after many mixed operations.

## Check your understanding

1. Why can an array compute the location of element `i` directly, and why can a linked list not do the same?
2. What does "amortized O(1)" mean for appending to an `ArrayList`, and why does growing by a multiplying factor matter?
3. Why can a loop that calls `get(i)` for every index of a `LinkedList` become quadratic?
4. What is memory locality, and why does it favour `ArrayList` and `ArrayDeque` over `LinkedList`?
5. Give two reasons to prefer `ArrayDeque` over `java.util.Stack`.
6. Which exception occurs when you remove from a list inside a for-each loop over that list, and what are two correct alternatives?
