# Chapter 4 assessment and deliberate practice

This chapter shifted your mental model from "what value is stored?" to "what does this variable actually point to, and who else might point there too?" That question underlies almost every non-trivial Java bug you will meet from here on, and it underlies the object design you will start building in Chapter 5. Review each lesson below, then use the guidance to approach the labs.

## Lesson recaps

### Lesson 1: Arrays, bounds, traversal, copying, and multidimensional data

An array has a fixed length, indexed from 0. Accessing an index outside `0` to `length - 1` throws `ArrayIndexOutOfBoundsException`. Assigning one array variable to another (`int[] b = a;`) creates an alias, not a copy: both names point to the same array object, so mutating through either name is visible through both. `clone()`, `Arrays.copyOf`, `Arrays.copyOfRange`, and `System.arraycopy` create independent copies. Arrays passed to methods share the same object, so element mutations are visible to the caller, but reassigning the parameter is not. `main(String[] args)` receives command-line arguments; always check `args.length` before indexing.

### Lesson 2: String immutability, equality, Unicode, and encodings

`String` methods never modify the original; they return a new string. Identical literals are shared through the string pool, but strings built at runtime are not guaranteed to be, which is exactly why `==` on strings is unreliable and `equals` is the only correct content comparison. `length()` and `charAt` count UTF-16 code units, not Unicode code points, so a supplementary character (many emoji) can make `length()` report more than the number of characters a person would count. Text becomes bytes through an explicit encoding; decoding with the wrong one silently corrupts the text rather than throwing.

### Lesson 3: StringBuilder and efficient text construction

Repeated `String` concatenation inside a loop is slow because each iteration copies everything built so far. `StringBuilder` is a genuinely mutable, resizable buffer with `append`, `insert`, `delete`, `replace`, and `reverse`, all of which modify the same object in place. `capacity()` is the buffer's allocated size; `length()` is how much of it holds real content. Every mutating method returns `this`, enabling fluent chaining.

### Lesson 4: Stack frames, heap objects, references, and garbage collection

A stack frame holds one method call's locals and parameters and is destroyed the instant that call returns. Arguments are always passed by value; for an object, the value passed is a reference, so a method can mutate the shared object through it but cannot make the caller's variable point elsewhere. Heap objects survive for as long as they remain reachable from any active frame, static field, or other live object — regardless of which method created them. Garbage collection reclaims unreachable objects automatically, on its own schedule; `System.gc()` only requests it.

### Lesson 5: Null contracts, defensive copying, and immutable design

Every reference has an implicit null contract: decide whether `null` is meaningful and handle it, or forbid it and enforce that immediately with `Objects.requireNonNull`. Storing or returning a mutable reference (an array, for instance) directly creates hidden aliasing, letting outside code corrupt an object's internal state, or vice versa, without ever touching a private field by name. Defensive copying — on the way in and on the way out — closes that hole. A genuinely immutable class needs none of that at its read boundary, because there is nothing left to mutate.

## Cheat sheet

### Aliasing versus copying

| Code | Effect |
|---|---|
| `int[] b = a;` | alias: `b` and `a` are two names for one array |
| `a.clone()` | independent shallow copy, same length |
| `Arrays.copyOf(a, n)` | independent copy, truncated or padded to length `n` |
| `Arrays.copyOfRange(a, from, to)` | independent copy of a slice, `to` exclusive |
| `a == b` | true only if same object | `Arrays.equals(a, b)` | true if same elements |

### String versus StringBuilder

| | `String` | `StringBuilder` |
|---|---|---|
| Mutable? | No | Yes |
| `+`/`append` in a loop | slow (quadratic) | fast (amortized linear) |
| Compare content | `equals` | convert with `toString()` first |
| `==` meaning | object identity (unreliable for content) | object identity |

### Stack versus heap

| | Stack | Heap |
|---|---|---|
| Holds | locals, parameters, one frame per call | objects created with `new` |
| Lifetime | ends when the method returns | ends when unreachable and collected |
| Failure | `StackOverflowError` (unbounded recursion) | `OutOfMemoryError` (too much reachable) |

### Protecting object state

| Question | If yes, do this |
|---|---|
| Could the caller still hold a reference to what I just stored? | copy it in the constructor/setter |
| Am I about to hand out a reference to my own internal state? | copy it before returning |
| Should this value ever change after construction? | if no, make the class immutable instead |

## Common mistakes checklist

Before submitting either lab, check your code against this list:

- Does any loop bound use `<=` where `<` was intended, or vice versa?
- Is an array ever assigned to another variable when an independent copy was actually needed?
- Does any method mutate an array it received when its contract should be "returns a new array, leaves the input alone"?
- Are two arrays or objects ever compared with `==` when content equality (`Arrays.equals` or `equals`) was intended?
- Could a returned array still be the exact same object as an internal field, letting a caller mutate it?
- Is every reference parameter's null contract decided, and enforced or handled accordingly?

## The judgment question

The judgment question describes an object that is supposed to be immutable but changes after it is constructed. Whenever you see that symptom, the cause is almost always one of the two aliasing holes from Lesson 5: either the constructor stored a caller-provided mutable reference directly instead of copying it, or a getter (or some other method) is handing out a direct reference to internal mutable state. Checking the class name or whether a local variable happens to be `final` will not reveal either problem; you have to trace every point where a mutable reference crosses the class's boundary, in both directions, and ask whether a copy was made there.

## Approaching the implementation lab

The lab asks for a method that reverses an array **without mutating or aliasing the input**.

1. Write the contract first: for an input array, what exact array should be returned? What should happen for an empty array, and for an array of length 1?
2. Build a boundary table: an empty array, a single-element array, an even-length array, an odd-length array.
3. Decide up front how you will guarantee no aliasing: the returned array must be a **new** object, never the same reference as the input, and the input array's contents must be provably untouched afterward.
4. Remember that "the returned values look reversed" is not, by itself, proof of correctness here — a solution that reverses the input array *in place* and then returns that same reference would produce correct-looking values while violating the actual contract. The lab statement says exactly this: result-only tests cannot prove non-mutation, so after you believe your solution is correct, manually create an input array, call your method, and then print the *original* array afterward to confirm with your own eyes that it is unchanged.
5. Keep the method deterministic and free of side effects, consistent with every function lab in this course.

## Approaching the debug lab

The debug lab prints `3:1` where a different pair of numbers appears instead, because sorting one array name reorders both.

1. Run the program and compare the actual output to the expected `3:1`.
2. Identify, using the aliasing model from Lesson 1, exactly which line makes `original` and `sorted` refer to the same array object.
3. Decide which line must change so that `sorted` becomes an **independent copy** rather than a second name for the same array, using one of the copying tools from this chapter's cheat sheet.
4. Confirm your fix preserves the demonstrated behavior (a real sort call still runs, and its result is still visible through `sorted`) while no longer affecting `original`. Do not "fix" this by simply printing the two literal numbers the task expects; that would satisfy this one test while leaving the actual aliasing defect in place for any other input.

## Deliberate practice beyond the labs

The labs check a small, bounded slice of the chapter. To build real fluency, complete these tasks in your own environment:

1. Write a method that takes a `String[]` and returns a new, sorted array (case-insensitively) without modifying the original, then write a test that mutates the original afterward and confirms the returned array is unaffected.
2. Take the `LeakyRoster` pattern from Lesson 5 and deliberately introduce the same bug into a class of your own design (perhaps holding a list of scores, or a set of tags). Write a short program that demonstrates the corruption, then fix it with defensive copying.
3. Benchmark, as in Lesson 3, building a large comma-separated string with `+=` versus `StringBuilder`, but this time also measure memory pressure conceptually: explain in writing why the `+=` version creates far more temporary objects for the garbage collector to reclaim.
4. Write a small recursive method (such as computing a factorial) and deliberately remove its base case to trigger `StackOverflowError`, confirming you can read the resulting trace as taught in Lesson 4, then restore the correct base case.

## Self-assessment

You are ready for Chapter 5 when you can do all of the following without notes:

- Explain, with a concrete example, why `int[] b = a;` does not copy an array, and name at least three ways to actually copy one.
- Explain why `==` is unreliable for comparing string content and state the correct alternative.
- Explain why a supplementary character can make `String.length()` report more than the number of visible characters.
- Explain why building a very long string with repeated `+=` in a loop is slow, and what to use instead.
- Trace, for a small chain of method calls, which stack frame exists at the moment an exception is thrown, and read the resulting stack trace correctly.
- Explain why an object created inside a method can outlive that method's return, using the concept of reachability.
- Given a class with a mutable field (such as an array), identify both places defensive copying must be added, and explain why `private final` alone does not protect the field's contents.
