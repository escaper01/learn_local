# Recursion, call stacks, divide-and-conquer, and backtracking

You have already seen recursion twice in this chapter — merge sort split and merged recursively, and binary search can be written recursively too. This lesson makes recursion itself the subject: what actually happens on the call stack (connecting directly back to Chapter 4's stack-frame lesson), why a missing base case produces `StackOverflowError` rather than an infinite loop that never crashes, how memoization turns an exponential recursive algorithm into a fast one, and **backtracking** — a recursive pattern for exploring every possible choice, where forgetting to undo a choice before trying the next one corrupts every result that follows.

What you will learn:

- How each recursive call creates a genuine, separate stack frame, traced explicitly with call and return logging
- Why a recursive method with no reachable base case throws `StackOverflowError`, connecting directly to Chapter 4
- Divide-and-conquer as a general pattern, and why naive recursive Fibonacci is exponentially wasteful
- Memoization: caching recursive results to eliminate redundant work
- Backtracking: exploring choices by making one, recursing, then undoing it — and why the "undoing" step is not optional

## Recursion is real stack frames, not magic

A recursive method is simply a method that calls itself. Nothing about that is special at the level of the JVM: each call, recursive or not, creates its own genuine stack frame, exactly as Chapter 4 described, with its own independent copy of every parameter and local variable.

```java
public class FactorialDemo {
    static long factorial(int n, String indent) {
        System.out.println(indent + "factorial(" + n + ") called");
        if (n <= 1) {
            System.out.println(indent + "factorial(" + n + ") base case returns 1");
            return 1;
        }
        long result = n * factorial(n - 1, indent + "  ");
        System.out.println(indent + "factorial(" + n + ") returns " + result);
        return result;
    }

    public static void main(String[] args) {
        System.out.println("factorial(5) = " + factorial(5, ""));
    }
}
```

Output:

```text
factorial(5) called
  factorial(4) called
    factorial(3) called
      factorial(2) called
        factorial(1) called
        factorial(1) base case returns 1
      factorial(2) returns 2
    factorial(3) returns 6
  factorial(4) returns 24
factorial(5) returns 120
factorial(5) = 120
```

The indentation traces the call stack growing and shrinking exactly as it would for any five nested (non-recursive) method calls: `factorial(5)`'s frame calls `factorial(4)`, whose frame calls `factorial(3)`, and so on, until `factorial(1)` hits the **base case** and returns without recursing further. Then each frame, from the innermost outward, multiplies its own `n` by the result it received and returns — `factorial(2)` computes `2 * 1 = 2`, `factorial(3)` computes `3 * 2 = 6`, and so on back up to `120`. Every one of those five `n` values (5, 4, 3, 2, 1) exists simultaneously in five separate stack frames at the deepest point of the recursion — this is not conceptually different from Chapter 4's `first`/`second`/`third` example, except here the same *method* appears at every level instead of five different methods.

Every recursive method needs exactly two ingredients: a **base case** that stops the recursion for the simplest possible input (here, `n <= 1`), and a **recursive case** that reduces the problem toward that base case (here, calling `factorial(n - 1)`, moving strictly closer to `1` every time).

## Missing a base case: StackOverflowError, not an infinite loop

Chapter 4 first introduced `StackOverflowError` with a method that called itself forever; recursion done correctly on real problems needs a genuine base case for exactly this reason:

```java
public class MissingBaseCase {
    static long factorial(int n) {
        return n * factorial(n - 1);
    }

    public static void main(String[] args) {
        try {
            System.out.println(factorial(5));
        } catch (StackOverflowError e) {
            System.out.println("StackOverflowError: no base case ever stopped the recursion");
        }
    }
}
```

Output:

```text
StackOverflowError: no base case ever stopped the recursion
```

This `factorial` never checks for `n <= 1`, so it calls itself with `4`, then `3`, then `2`, then `1`, then `0`, then `-1`, and so on, forever — each call allocating a **new** stack frame that is never returned from, until the stack's bounded size (Chapter 4) is exhausted. Note precisely what this is not: it is not an infinite *loop* in the ordinary sense (which would run forever without necessarily crashing); it is unbounded *stack growth*, which crashes as soon as the stack's fixed capacity runs out. Every recursive method you write must be able to convince you, by inspection, that its argument moves strictly toward its base case on every call, and that the base case is actually reachable for every valid input.

## Divide-and-conquer and the cost of naive recursion

You already saw the divide-and-conquer pattern in this chapter's merge sort: break a problem into smaller subproblems, solve each recursively, combine the results. But naive recursion can also be a performance trap when subproblems overlap — recomputing the same subproblem repeatedly instead of once:

```java
public class FibonacciDivideConquer {
    static int calls = 0;

    static long fibonacciNaive(int n) {
        calls++;
        if (n <= 1) return n;
        return fibonacciNaive(n - 1) + fibonacciNaive(n - 2);
    }

    static long fibonacciMemoized(int n, long[] memo) {
        calls++;
        if (n <= 1) return n;
        if (memo[n] != -1) return memo[n];
        memo[n] = fibonacciMemoized(n - 1, memo) + fibonacciMemoized(n - 2, memo);
        return memo[n];
    }

    public static void main(String[] args) {
        int n = 20;

        calls = 0;
        long naiveResult = fibonacciNaive(n);
        System.out.println("fibonacci(" + n + ") = " + naiveResult + ", naive calls: " + calls);

        long[] memo = new long[n + 1];
        java.util.Arrays.fill(memo, -1);
        calls = 0;
        long memoResult = fibonacciMemoized(n, memo);
        System.out.println("fibonacci(" + n + ") = " + memoResult + ", memoized calls: " + calls);
    }
}
```

Output:

```text
fibonacci(20) = 6765, naive calls: 21891
fibonacci(20) = 6765, memoized calls: 39
```

Both versions compute the identical, correct answer — `6765`. But `fibonacciNaive(20)` makes **21,891** recursive calls, because `fibonacciNaive(n-1)` and `fibonacciNaive(n-2)` each independently recompute enormous overlapping subtrees of smaller Fibonacci values from scratch, over and over. `fibonacciMemoized` fixes this with **memoization**: before computing `fibonacciMemoized(n, ...)`, it checks whether that exact value was already computed and cached in `memo[n]`; if so, it returns the cached answer immediately instead of recursing again. The result: just **39** calls instead of nearly 22,000, for the identical input and identical answer. This is exactly Lesson 1's Big-O lesson in action: naive recursive Fibonacci is exponential (each call spawns two more, roughly doubling work per level), while memoized Fibonacci is linear in `n`, because each distinct subproblem is now solved exactly once.

## Backtracking: try a choice, recurse, then undo it

**Backtracking** is a recursive pattern for systematically exploring every possible sequence of choices — every subset, every arrangement, every path — by making one choice, recursing to explore everything that follows from it, and then **undoing** that choice before trying the next alternative, so sibling branches of the exploration each start from a clean, correct, shared starting state:

```java
import java.util.ArrayList;
import java.util.List;

public class BacktrackingSubsets {
    static void generate(int[] values, int index, List<Integer> current, List<List<Integer>> results) {
        if (index == values.length) {
            results.add(new ArrayList<>(current));
            return;
        }
        generate(values, index + 1, current, results);

        current.add(values[index]);
        generate(values, index + 1, current, results);
        current.remove(current.size() - 1);
    }

    public static void main(String[] args) {
        int[] values = {1, 2, 3};
        List<List<Integer>> results = new ArrayList<>();
        generate(values, 0, new ArrayList<>(), results);

        System.out.println("all " + results.size() + " subsets of " + java.util.Arrays.toString(values) + ":");
        for (List<Integer> subset : results) {
            System.out.println("  " + subset);
        }
    }
}
```

Output:

```text
all 8 subsets of [1, 2, 3]:
  []
  [3]
  [2]
  [2, 3]
  [1]
  [1, 3]
  [1, 2]
  [1, 2, 3]
```

For each element, `generate` explores two branches: "leave it out" (recurse immediately, without touching `current`) and "include it" (add it to `current`, recurse, then **remove it again** before returning). Three elements, two choices each, gives exactly 2³ = 8 subsets — every one of them appears exactly once. The critical line is `current.remove(current.size() - 1);` right after the "include it" recursive call returns: it restores `current` to exactly the state it was in *before* that branch was explored, so that when control returns to the caller and moves on to the next sibling possibility, `current` correctly reflects only the choices genuinely still in effect at that point in the exploration — not leftover state from a branch that has already been fully explored and abandoned.

## The bug: forgetting to undo the choice

This is precisely the chapter's concept-check question, made concrete. Removing exactly that one restoring line corrupts every result computed afterward, because `current` — a single, shared, mutable list passed by reference to every recursive call (exactly per Chapter 4's parameter-passing rules) — never gets cleaned up between sibling branches:

```java
import java.util.ArrayList;
import java.util.List;

public class ForgottenRestore {
    static void generate(int[] values, int index, List<Integer> current, List<List<Integer>> results) {
        if (index == values.length) {
            results.add(new ArrayList<>(current));
            return;
        }
        generate(values, index + 1, current, results);

        current.add(values[index]);
        generate(values, index + 1, current, results);
        // BUG: forgot current.remove(current.size() - 1) here
    }

    public static void main(String[] args) {
        int[] values = {1, 2, 3};
        List<List<Integer>> results = new ArrayList<>();
        generate(values, 0, new ArrayList<>(), results);

        System.out.println("expected 8 distinct subsets, got " + results.size() + ":");
        for (List<Integer> subset : results) {
            System.out.println("  " + subset);
        }
    }
}
```

Output:

```text
expected 8 distinct subsets, got 8:
  []
  [3]
  [3, 2]
  [3, 2, 3]
  [3, 2, 3, 1]
  [3, 2, 3, 1, 3]
  [3, 2, 3, 1, 3, 2]
  [3, 2, 3, 1, 3, 2, 3]
```

The count is still 8 — that count comes purely from the number of times `results.add(...)` runs, which the missing line does not affect. But every single subset's **content** is wrong, and the corruption compounds visibly with each step: `current` never shrinks back down after an "include it" branch finishes, so leftover elements from already-completed sibling branches bleed into every subsequent branch's result. This is exactly why the concept-check answer is "sibling branches must start from the correct prior state" — not garbage collection, and not sharing every prior choice (the whole point of backtracking is that each branch explores *its own* independent hypothetical set of choices, built on a shared history but not permanently contaminated by a sibling's abandoned attempt).

## What happens under the hood

Backtracking's "make a choice, recurse, undo the choice" shape is really just an explicit, disciplined version of what the call stack already does for you implicitly with local variables: when `factorial`'s recursive call returns, that frame's local `n` and `result` simply vanish, with no risk of leaking into the caller. Backtracking needs an *explicit* undo step specifically because `current` is a single object shared **by reference** across every recursive call, rather than an independent local variable per frame — the object's mutations persist across calls exactly as Chapter 4 taught for any shared mutable reference, so backtracking's own logic, not the call stack automatically, is responsible for restoring shared state to a clean condition before a sibling branch runs.

## Common mistakes

**1. Writing a recursive method with a base case that is never actually reachable for some valid inputs.** Recursing on `n - 1` when `n` might already be negative on entry, for instance, can miss the intended base case entirely.

**2. Forgetting the base case altogether**, producing `StackOverflowError` rather than a wrong answer — at least this failure is loud and immediate, unlike some of this lesson's other mistakes.

**3. Writing naive recursive solutions to problems with overlapping subproblems** (Fibonacci, and many others) without recognizing the resulting exponential blow-up; memoize when the same subproblem would otherwise be recomputed many times.

**4. Forgetting to undo a mutation in a backtracking algorithm.** As `ForgottenRestore` shows dramatically, this does not necessarily change the *count* of results, only their (badly wrong) *content*, which can make the bug harder to notice at a glance than a simple crash.

**5. Passing a mutable "current path" object by reference into recursive calls without a clear, consistent add-then-remove discipline around every recursive call site that mutates it.**

## Best practices

- Before writing a recursive method, identify its base case explicitly and convince yourself every valid input eventually reaches it.
- Trace a small example by hand (or with print statements, as this lesson did) before trusting a recursive method's correctness on larger inputs.
- Recognize overlapping-subproblem recursion (multiple recursive calls that can reach the identical smaller input) as a strong signal to consider memoization.
- In any backtracking algorithm, pair every mutation of shared state with its exact undo, placed immediately after the recursive call that explored the mutated state — treat the pair as a single, inseparable unit.
- Prefer building a **new** object at each step (as `results.add(new ArrayList<>(current))` does when recording a completed subset) over holding a live reference to a mutable object that will keep changing after you have stored it — a direct callback to Chapter 4's aliasing lessons.

## Summary

- Each recursive call creates a genuine, independent stack frame, exactly like any other method call; recursion is not conceptually special at the JVM level.
- A recursive method needs a reachable base case and a recursive case that moves strictly toward it; missing either produces `StackOverflowError` from unbounded stack growth, not an ordinary infinite loop.
- Divide-and-conquer recursion can be exponentially wasteful when subproblems overlap, as naive recursive Fibonacci demonstrates; memoization caches results to eliminate the redundant recomputation.
- Backtracking explores every combination of choices by making one, recursing, and then undoing it, so that sibling branches each start from the correct, shared prior state.
- Forgetting to undo a backtracking mutation does not necessarily change how many results are produced, only silently corrupts their content — often a more dangerous kind of bug than an outright crash.

## Practice

Warm-up:

1. Write a recursive method to compute the sum of the first `n` positive integers, identify its base case, and trace it by hand for `n = 4`.
2. Deliberately write a recursive method with an unreachable base case for some inputs (for example, only checking `n == 0` for a method that might be called with a negative number), and demonstrate the resulting `StackOverflowError`.
3. Add call-counting (as `FibonacciDivideConquer` did) to a recursive method of your own, and observe how the count grows as the input grows.

Core:

1. Implement a recursive method that reverses a `String` (no loops), identify its base case, and trace it for a short string.
2. Add memoization to a recursive method that computes binomial coefficients (`n choose k`), and compare call counts with and without memoization for a moderately large `n`.
3. Write a backtracking method that generates all permutations of a small array (not subsets), and verify the count matches `n!` for several sizes.

Challenge:

1. Implement a backtracking solution to a simple constraint problem of your choosing (a small N-Queens instance, or filling a small Sudoku-like grid), applying the same choose-recurse-undo discipline as this lesson's subset generator.
2. Take `ForgottenRestore` and add a comment above `generate` documenting the invariant `current` must satisfy immediately before and after each recursive call for the algorithm to be correct — then use that invariant to explain, in writing, exactly which line's absence breaks it.

## Check your understanding

1. What two ingredients does every correct recursive method need, and what happens if the second one does not actually reach the first for some input?
2. Why does a missing base case cause `StackOverflowError` rather than a loop that simply runs forever without crashing?
3. Why does naive recursive Fibonacci make an exponential number of calls, and what technique reduces that to a linear number?
4. What is the "undo" step in a backtracking algorithm restoring, and why is it necessary even though each recursive call gets its own separate stack frame?
5. In the forgotten-restore bug, why does the number of results stay the same (8) even though every result's content becomes wrong?
6. Why is it safer to store `new ArrayList<>(current)` in a backtracking algorithm's results list, rather than storing `current` itself?
