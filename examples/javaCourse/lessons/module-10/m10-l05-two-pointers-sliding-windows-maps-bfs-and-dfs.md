# Two pointers, sliding windows, maps, BFS, and DFS

This closing lesson collects five patterns that appear constantly in real interview questions and real production code alike, each one a specific technique for avoiding the naive, brute-force nested loop this chapter's first lesson identified as an O(n squared) warning sign. Two pointers and sliding windows turn certain O(n squared) array problems into O(n) ones; using a map to remember what you have already seen does the same for a different class of problems; and breadth-first and depth-first search are the two fundamental ways to systematically explore a graph or a tree-shaped structure.

What you will learn:

- The two-pointer technique: converging pointers from both ends of a sorted array to find a pair meeting some condition, in O(n) instead of O(n squared)
- The sliding window technique: maintaining a running window's sum incrementally instead of recomputing it from scratch every time
- Using a `HashMap` to remember values already seen, turning an O(n squared) pair-finding problem into O(n)
- Breadth-first search (BFS): exploring a graph level by level with a queue, and why it finds the shortest path by edge count in an unweighted graph
- Depth-first search (DFS): exploring as deep as possible along one path before backtracking, using recursion

## Two pointers: converge from both ends

Given a **sorted** array, the two-pointer technique starts one pointer at each end and moves them toward each other based on how the pair they currently point to compares to a target — eliminating one entire end of the search space with a single comparison, similar in spirit to binary search's halving:

```java
public class TwoPointerPairSum {
    static boolean hasPairSummingTo(int[] sortedValues, int target) {
        int left = 0, right = sortedValues.length - 1;
        int steps = 0;
        while (left < right) {
            steps++;
            int sum = sortedValues[left] + sortedValues[right];
            System.out.println("  left=" + left + "(" + sortedValues[left] + ") right=" + right + "(" + sortedValues[right] + ") sum=" + sum);
            if (sum == target) {
                System.out.println("  found after " + steps + " step(s)");
                return true;
            } else if (sum < target) {
                left++;
            } else {
                right--;
            }
        }
        System.out.println("  not found after " + steps + " step(s)");
        return false;
    }

    public static void main(String[] args) {
        int[] sorted = {1, 3, 5, 7, 9, 11, 14};
        System.out.println("search for pair summing to 16:");
        hasPairSummingTo(sorted, 16);
        System.out.println("search for pair summing to 4:");
        hasPairSummingTo(sorted, 4);
    }
}
```

Output:

```text
search for pair summing to 16:
  left=0(1) right=6(14) sum=15
  left=1(3) right=6(14) sum=17
  left=1(3) right=5(11) sum=14
  left=2(5) right=5(11) sum=16
  found after 4 step(s)
search for pair summing to 4:
  left=0(1) right=6(14) sum=15
  left=0(1) right=5(11) sum=12
  left=0(1) right=4(9) sum=10
  left=0(1) right=3(7) sum=8
  left=0(1) right=2(5) sum=6
  left=0(1) right=1(3) sum=4
  found after 6 step(s)
```

The logic driving each step exploits the sorted order directly: if the current sum is too small, the *only* way to increase it is to move `left` rightward to a larger value — moving `right` leftward could only make the sum smaller, which would be moving the wrong direction. Symmetrically, if the sum is too large, `right` moves leftward. Each step therefore makes genuine, guaranteed progress toward either finding the target or exhausting the search space, and the pointers can meet at most `n` times total — giving O(n), compared to the O(n squared) of checking every pair with two nested loops (exactly the pattern Lesson 1 identified as a warning sign).

## Sliding window: update incrementally, don't recompute

A **sliding window** problem asks something about every contiguous subarray of a fixed size. The naive approach recomputes each window's sum from scratch — an O(n squared) pattern in disguise, another instance of Lesson 1's warning sign. The sliding window technique instead updates the running sum incrementally: subtract the element leaving the window, add the element entering it.

```java
public class SlidingWindow {
    static int maxSumOfWindow(int[] values, int windowSize) {
        int windowSum = 0;
        for (int i = 0; i < windowSize; i++) {
            windowSum += values[i];
        }
        int best = windowSum;
        System.out.println("  initial window [0," + (windowSize - 1) + "] sum=" + windowSum);

        for (int end = windowSize; end < values.length; end++) {
            windowSum += values[end];
            windowSum -= values[end - windowSize];
            System.out.println("  window [" + (end - windowSize + 1) + "," + end + "] sum=" + windowSum);
            best = Math.max(best, windowSum);
        }
        return best;
    }

    public static void main(String[] args) {
        int[] values = {2, 1, 5, 1, 3, 2};
        int windowSize = 3;
        int best = maxSumOfWindow(values, windowSize);
        System.out.println("max sum of any " + windowSize + "-element window: " + best);
    }
}
```

Output:

```text
  initial window [0,2] sum=8
  window [1,3] sum=7
  window [2,4] sum=9
  window [3,5] sum=6
max sum of any 3-element window: 9
```

The first window `[0,2]` (values 2, 1, 5) is summed directly, once, in O(windowSize) time. Every subsequent window reuses that running total: sliding from `[0,2]` to `[1,3]` simply adds `values[3]` (the newly-included element) and subtracts `values[0]` (the newly-excluded element) — one addition and one subtraction, regardless of how large the window itself is. The entire scan across all windows is O(n), instead of O(n times windowSize) for recomputing each window's sum independently from scratch.

## Using a map to remember what you have already seen

Some problems that look like they need a nested loop — "find two elements satisfying some relationship" — can be solved in one pass by using a `HashMap` (Chapter 9) to remember, as you go, everything you have already encountered:

```java
import java.util.HashMap;
import java.util.Map;

public class TwoSumWithMap {
    static int[] twoSumIndices(int[] values, int target) {
        Map<Integer, Integer> seenValueToIndex = new HashMap<>();
        for (int i = 0; i < values.length; i++) {
            int needed = target - values[i];
            if (seenValueToIndex.containsKey(needed)) {
                return new int[] {seenValueToIndex.get(needed), i};
            }
            seenValueToIndex.put(values[i], i);
        }
        return null;
    }

    public static void main(String[] args) {
        int[] values = {8, 2, 11, 15, 4};
        int[] result = twoSumIndices(values, 6);
        System.out.println("indices summing to 6: " + java.util.Arrays.toString(result)
                + " (values " + values[result[0]] + " and " + values[result[1]] + ")");

        int[] noMatch = twoSumIndices(values, 100);
        System.out.println("indices summing to 100: " + noMatch);
    }
}
```

Output:

```text
indices summing to 6: [1, 4] (values 2 and 4)
indices summing to 100: null
```

At each index, instead of scanning the *rest* of the array for a complement (the nested-loop, O(n squared) approach), the method asks the map: "have I already seen the value I would need to reach the target?" Thanks to `HashMap`'s expected O(1) lookup (Chapter 9), this single question replaces an entire inner loop, turning the whole algorithm into one O(n) pass. This pattern — "remember what you have seen in a map, then check membership instead of re-scanning" — is one of the single most broadly useful tricks for eliminating an O(n squared) nested loop, whenever the relationship you are checking for can be phrased as "does some specific, computable value already exist among what I have processed so far?"

## Breadth-first search: explore level by level with a queue

A **graph** is a set of nodes connected by edges — `Map<String, List<String>>` here represents each node's neighbors directly. **Breadth-first search (BFS)** explores a graph outward in expanding "rings" from a starting node, visiting everything one edge away, then everything two edges away, and so on, using a `Queue` (Chapter 9's `ArrayDeque`) to always process nodes in the order they were first discovered:

```java
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Queue;

public class BfsShortestPath {
    static int shortestPathEdges(Map<String, List<String>> graph, String start, String target) {
        Queue<String> queue = new ArrayDeque<>();
        Map<String, Integer> distance = new HashMap<>();
        queue.add(start);
        distance.put(start, 0);

        while (!queue.isEmpty()) {
            String current = queue.poll();
            if (current.equals(target)) {
                return distance.get(current);
            }
            for (String neighbor : graph.getOrDefault(current, List.of())) {
                if (!distance.containsKey(neighbor)) {
                    distance.put(neighbor, distance.get(current) + 1);
                    queue.add(neighbor);
                }
            }
        }
        return -1;
    }

    public static void main(String[] args) {
        Map<String, List<String>> graph = new HashMap<>();
        graph.put("A", List.of("B", "C"));
        graph.put("B", List.of("A", "D"));
        graph.put("C", List.of("A", "D", "E"));
        graph.put("D", List.of("B", "C", "F"));
        graph.put("E", List.of("C", "F"));
        graph.put("F", List.of("D", "E"));

        System.out.println("A to F: " + shortestPathEdges(graph, "A", "F") + " edges");
        System.out.println("A to E: " + shortestPathEdges(graph, "A", "E") + " edges");
        System.out.println("A to A: " + shortestPathEdges(graph, "A", "A") + " edges");
    }
}
```

Output:

```text
A to F: 3 edges
A to E: 2 edges
A to A: 0 edges
```

BFS discovers `A`'s direct neighbors (`B`, `C`) first, recording each at distance 1; only after every distance-1 node has been discovered does it move on to their neighbors, discovering distance-2 nodes, and so on. Because the `distance` map records each node's distance the very first time it is *discovered* (added to the queue), and BFS always fully exhausts one distance level before advancing to the next, **the first time BFS reaches the target is guaranteed to be via a shortest path**, measured in number of edges — which is exactly the chapter's concept-check answer: this guarantee holds specifically **for an unweighted graph**, where every edge counts as exactly one step. (For a graph where edges have different weights or costs, a different algorithm — Dijkstra's, beyond this course's scope — is needed instead.)

## Depth-first search: go deep, then backtrack

**Depth-first search (DFS)** takes the opposite exploration strategy: follow one path as deeply as possible before backtracking to try alternatives — precisely the same "recurse, then come back and try something else" shape this chapter's own backtracking lesson just covered, now applied to graph traversal specifically:

```java
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class DfsVisitOrder {
    static void dfs(Map<String, List<String>> graph, String node, Set<String> visited, StringBuilder order) {
        if (visited.contains(node)) {
            return;
        }
        visited.add(node);
        order.append(node);
        for (String neighbor : graph.getOrDefault(node, List.of())) {
            dfs(graph, neighbor, visited, order);
        }
    }

    public static void main(String[] args) {
        Map<String, List<String>> graph = new HashMap<>();
        graph.put("A", List.of("B", "C"));
        graph.put("B", List.of("A", "D"));
        graph.put("C", List.of("A", "D", "E"));
        graph.put("D", List.of("B", "C", "F"));
        graph.put("E", List.of("C", "F"));
        graph.put("F", List.of("D", "E"));

        StringBuilder order = new StringBuilder();
        dfs(graph, "A", new HashSet<>(), order);
        System.out.println("DFS visit order from A: " + order);
        System.out.println("DFS explores deeply along one path before backtracking, unlike BFS's breadth-first spread");
    }
}
```

Output:

```text
DFS visit order from A: ABDCEF
DFS explores deeply along one path before backtracking, unlike BFS's breadth-first spread
```

Starting from `A`, DFS immediately commits to `A`'s first neighbor, `B`, then immediately commits to `B`'s first unvisited neighbor, `D`, going as deep as it possibly can (`A` to `B` to `D`) before ever considering `A`'s *second* neighbor, `C` — which only gets visited once the `D` branch is fully explored and the recursion has "backtracked" all the way up. Compare this order (`ABDCEF`) directly with BFS's level-by-level exploration of the identical graph: DFS's `visited` set plays exactly the role Lesson 4's `distance` map's key-presence check played for BFS — preventing infinite loops in a graph that contains cycles (notice `B`'s own neighbor list includes `A` right back again) by ensuring each node is processed exactly once.

| | BFS | DFS |
|---|---|---|
| Data structure | `Queue` (process in discovery order) | recursion (or an explicit `Stack`) |
| Exploration shape | level by level, outward in rings | as deep as possible, then backtrack |
| Guarantees shortest path (unweighted)? | Yes | No |
| Natural implementation | iterative, with a queue | recursive, or iterative with a stack |

## What happens under the hood

Every technique in this lesson solves the identical underlying problem this entire chapter has circled around: replacing an expensive, naive re-scan (checking every pair, recomputing every window, exploring every path with no memory of what has already been tried) with a strategy that reuses information already gathered — a running sum instead of a fresh sum, a map lookup instead of an inner loop, a `visited` set instead of infinite re-exploration. Recognizing which of these five shapes fits a given problem, rather than reflexively reaching for nested loops, is the single practical skill this entire chapter has been building toward.

## Common mistakes

**1. Using the two-pointer technique on data that is not actually sorted.** Its correctness depends entirely on the sorted-order property that lets moving one pointer reliably move the sum in one, predictable direction.

**2. Recomputing a sliding window's sum from scratch on every step**, missing the O(n squared)-to-O(n) improvement that incremental updates provide.

**3. Reaching for a nested loop to find a pair or check membership when a `HashMap`-based single pass would work**, missing an easy O(n squared)-to-O(n) improvement.

**4. Using DFS when BFS's shortest-path guarantee is actually needed**, or vice versa when deep, path-committed exploration is what the problem actually calls for.

**5. Forgetting a `visited` set (or equivalent) in either BFS or DFS on a graph containing cycles**, causing infinite re-exploration of the same nodes.

## Best practices

- Reach for two pointers specifically when data is sorted and you are looking for a pair (or more) satisfying some sum- or difference-based condition.
- Reach for a sliding window specifically when a problem concerns every contiguous subrange of a fixed or shrinking/growing size.
- Reach for a `HashMap`-based single pass whenever a nested loop's only real job is checking "have I seen something related to this before?"
- Choose BFS when you specifically need shortest paths by edge count in an unweighted graph; choose DFS when you need to explore full paths, detect cycles, or the specific order of exploration does not matter.
- Always track visited nodes explicitly when traversing a graph that might contain cycles, in either BFS or DFS.

## Summary

- Two pointers converge from both ends of a sorted array, turning an O(n squared) pair-search into O(n).
- A sliding window updates a running total incrementally instead of recomputing it, turning an O(n times window size) scan into O(n).
- Using a `HashMap` to remember values already seen replaces an inner loop with an O(1) expected lookup, commonly turning O(n squared) into O(n).
- BFS explores a graph level by level using a queue and is guaranteed to find the shortest path by edge count in an unweighted graph.
- DFS explores as deep as possible along one path before backtracking, typically implemented recursively, and does not guarantee shortest paths.

## Practice

Warm-up:

1. Use the two-pointer technique to find whether a sorted array contains a pair summing to a given target, and trace it by hand for a small array.
2. Compute the maximum sum of any 4-element window in an array using the sliding window technique, tracing each window's sum update.
3. Use a `HashMap` to find the first repeated element in an array in a single pass.

Core:

1. Adapt the two-pointer technique to count *all* pairs (not just find one) in a sorted array summing to a target, being careful to advance both pointers correctly past duplicate values.
2. Implement a sliding window that finds the length of the longest substring without repeating characters, using a `HashSet` to track characters currently in the window and shrinking the window from the left when a repeat is found.
3. Given a small graph of your own design (as a `Map<String, List<String>>`), implement both BFS and DFS from the same starting node, print both visit orders, and explain why they differ.

Challenge:

1. Use BFS to find not just the shortest distance but the actual shortest *path* (the sequence of nodes) between two nodes in a graph, by tracking each node's predecessor during the search and reconstructing the path afterward.
2. Combine techniques from this lesson: given a graph representing a maze (nodes are cells, edges connect adjacent open cells), use BFS to find the shortest route from an entrance to an exit, and report both the distance and the full path.

## Check your understanding

1. Why does the two-pointer technique require the input to already be sorted?
2. In the sliding window technique, what two specific values are added and subtracted when the window moves forward by one position, and why does this avoid recomputing the whole window's sum?
3. How does using a `HashMap` to remember previously seen values turn an O(n squared) pair-finding algorithm into O(n)?
4. Why does BFS, specifically, guarantee finding the shortest path by edge count in an unweighted graph, while DFS does not offer that guarantee?
5. What role does a `visited` set play in both BFS and DFS, and what could go wrong on a graph with cycles if it were omitted?
6. Give an example of a problem better suited to DFS than BFS, and explain why.
