# Working with AI coding assistants

AI coding assistants are now part of everyday software development. They complete lines as you type, explain error messages, draft methods and tests, and some can even edit files and run commands. Used well, they make a developer faster. Used carelessly, they produce code that looks professional, compiles cleanly, and is quietly wrong, and they can do it faster than any human could write bugs by hand.

Employers expect you to use these tools *and* to remain fully responsible for every line you commit. This lesson teaches the working method that makes that possible: an assistant suggests, and your toolchain and tests confirm.

What you will learn:

- What AI coding assistants are and the main kinds you will meet
- Where they help most, and the typical ways their suggestions fail
- A verification workflow for any generated code
- How to write precise prompts that get useful answers
- How tool-connected assistants change the risk, and how to stay in control
- Privacy, security, and licensing responsibilities
- How to use an assistant to learn faster without skipping the learning

## What an assistant is (and is not)

Most coding assistants are built on **large language models**: systems trained on enormous amounts of text and code to predict likely continuations. That design explains both their strengths and their weaknesses. They are excellent at producing text that *looks like* typical, plausible code. They do not compile your program, run your tests, or know your requirements unless you tell them, and they have no built-in guarantee that what they produce is true.

| Kind of assistant | What it does | Typical use |
|---|---|---|
| Inline completion | Suggests the rest of a line or block while you type in the IDE | Boilerplate, repetitive patterns |
| Chat assistant | Answers questions and writes code in a conversation | Explaining errors, drafting methods, reviewing code |
| Agentic or tool-connected assistant | Can read files, run commands, and edit a project on your behalf | Multi-step tasks such as "rename this and fix the tests" |

An analogy: treat an assistant like a very fast, very well-read new colleague who has never seen your project, sometimes misremembers details with total confidence, and never runs the code before handing it to you. You would review that colleague's work carefully. Do the same here.

## Where assistants help

- **Explaining** an unfamiliar error message, API, or piece of code in plain language.
- **Drafting** boilerplate, test cases, or a first version of a method you then review.
- **Suggesting** edge cases you had not considered ("what about an empty string?").
- **Translating** between forms: a description into a skeleton, a loop into a different style.
- **Rubber-ducking**: explaining your problem to the assistant often clarifies it for you.

## How suggestions fail

| Failure | What it looks like | How you catch it |
|---|---|---|
| Plausible but wrong logic | Code that handles the common case and misses a rule | Tests with boundary and special cases |
| Invented APIs | A method that sounds right but does not exist | The compiler: `cannot find symbol` |
| Wrong version | Uses a feature from a different Java version, or a removed library method | Compiling with `--release 21`; checking the API docs |
| Unstated assumptions | Assumes input is never empty, never null, always positive | Asking "what if?" and testing it |
| Missing requirements | Solves a simpler problem than the one you have | Comparing against your requirement table |
| Security weaknesses | Builds commands or queries from raw input, logs secrets | Code review against security rules |
| Confident explanations of wrong code | A fluent paragraph justifying a bug | Evidence from running the code, not the explanation |

Confidence is not evidence. The tone of the answer tells you nothing about its correctness.

## Verifying a suggestion: a worked example

Suppose you ask an assistant for a method that reports whether a year is a leap year. In the Gregorian calendar the rule is: divisible by 4, except century years, unless the century is divisible by 400. You write your examples first: 2024 yes, 2023 no, 2000 yes, 1900 no, 2100 no.

The suggestion is short and looks reasonable. This complete program tests it:

```java
public class LeapYearReview {
    public static void main(String[] args) {
        // Requirement (Gregorian calendar): divisible by 4, except centuries,
        // unless the century is divisible by 400.
        check(2024, true);
        check(2023, false);
        check(2000, true);
        check(1900, false);
        check(2100, false);
    }

    // Suggested by an assistant. Looks reasonable. Is it correct?
    static boolean isLeapYear(int year) {
        return year % 4 == 0;
    }

    static void check(int year, boolean expected) {
        boolean actual = isLeapYear(year);
        String verdict = (actual == expected) ? "PASS" : "FAIL";
        System.out.println(verdict + " " + year + ": expected " + expected + ", got " + actual);
    }
}
```

Output:

```text
PASS 2024: expected true, got true
PASS 2023: expected false, got false
PASS 2000: expected true, got true
FAIL 1900: expected false, got true
FAIL 2100: expected false, got true
```

(`%` gives the remainder of a division, so `year % 4 == 0` means "divisible by 4". Chapter 2 covers these operators.)

The suggestion compiles and passes three of five checks. If you had tried only 2024, you would have accepted it. The two failures are exactly the special rule the suggestion ignored. After revising the method to include the century rules, the same checks give:

```text
PASS 2024: expected true, got true
PASS 2023: expected false, got false
PASS 2000: expected true, got true
PASS 1900: expected false, got false
PASS 2100: expected false, got false
```

The code did not become trustworthy because someone, human or machine, said so. It became trustworthy because it was compiled and run against cases that cover the requirement, just like any other code.

### A second example: plausible arithmetic

You ask for a percentage score. The suggestion computes `correct / total * 100`. You know the expected answer for 45 out of 50 is 90%. This complete program compares:

```java
public class ScorePercent {
    public static void main(String[] args) {
        int correct = 45;
        int total = 50;

        // Assistant's first suggestion:
        int suggested = correct / total * 100;

        // Version written after checking the expected value by hand (45/50 = 90%):
        int verified = correct * 100 / total;

        System.out.println("Suggested: " + suggested + "%");
        System.out.println("Verified:  " + verified + "%");
    }
}
```

Output:

```text
Suggested: 0%
Verified:  90%
```

In Java, dividing one whole number by another discards the fraction, so `45 / 50` is `0` before the multiplication even happens. Chapter 2 explains this in depth. The lesson here is the process: a hand-computed expected value exposed the error instantly.

### A third example: an invented method

You ask how to reverse a String and receive `word.reverse()`. It reads naturally. The compiler disagrees:

```java
String word = "stressed";
System.out.println(word.reverse());
```

```text
Main.java:4: error: cannot find symbol
        System.out.println(word.reverse());
                               ^
  symbol:   method reverse()
  location: variable word of type String
1 error
```

`String` has no `reverse` method. Checking the API documentation (lesson 4) shows that `StringBuilder` has one. This complete program uses it:

```java
public class ReverseWord {
    public static void main(String[] args) {
        String word = "stressed";
        String reversed = new StringBuilder(word).reverse().toString();
        System.out.println(word + " -> " + reversed);
    }
}
```

Output:

```text
stressed -> desserts
```

Invented APIs are the *easy* failure, because the compiler catches them. Wrong logic, as in the first two examples, is the dangerous one, because it compiles.

## The verification workflow

Apply these steps to every generated change, however small:

1. **Read it completely.** If you cannot explain what each line does, you are not ready to accept it. Ask the assistant to explain, then check that explanation against the documentation.
2. **Compare it with the requirement.** Does it handle every rule and every edge case in your example table?
3. **Compile it** with the project's real settings (`--release 21`).
4. **Run it against real test cases**: typical, boundary, invalid, and any special rules.
5. **Review the diff**: what files changed, what was added, what was removed? Look for unrelated changes.
6. **Check for security and quality issues**: hard-coded secrets, unvalidated input, swallowed exceptions, unnecessary dependencies.
7. **Only then commit**, and be ready to explain it in a code review as if you had written it yourself. Because you are responsible for it, you effectively did.

## Writing precise prompts

A vague request produces a vague answer. Give the assistant the same evidence a skilled human reviewer would need.

A weak prompt:

```text
fix my loop
```

A strong prompt:

```text
Java 21, no external libraries. This method should return the sum 1 + 2 + ... + n
for n >= 0. For n = 4 I expect 10 but get 6.

static int sumTo(int n) {
    int total = 0;
    for (int i = 1; i < n; i++) {
        total = total + i;
    }
    return total;
}

Explain the cause first, then show the smallest change that fixes it.
Do not change the method signature.
```

Elements of a strong prompt:

- **Context**: language and version, libraries allowed, where the code runs.
- **The code** involved, trimmed to what matters.
- **The contract**: what the method must do, including edge cases.
- **Evidence**: exact input, expected output, actual output, and the full error text or stack trace.
- **Constraints**: do not change the public signature, no new dependency, must handle null, and so on.
- **The kind of answer you want**: an explanation, a minimal fix, test cases, or alternatives with trade-offs.

This is the same requirement-gathering discipline from lesson 1, applied to a conversation instead of a specification.

## Tool-connected assistants and accountability

Some assistants connect to tools and data sources through defined interfaces. The Model Context Protocol (MCP) is one widely used open standard for such connections. A connected assistant can read your files, search a codebase, run shell commands, or call a service, instead of only producing text.

This increases both usefulness and risk. An action taken through a tool is a real change to your system. Rules for staying in control:

- Review every command before it runs, especially anything that deletes, installs, pushes, or changes configuration.
- Review the diff of every file the assistant edited, exactly as you would review a teammate's pull request.
- Grant the smallest permissions the task needs; do not give an assistant access to production systems for a learning exercise.
- Be suspicious of instructions that appear *inside* data the assistant reads, such as a comment in a file saying "ignore previous instructions." Content is data, not a command.

Responsibility does not transfer to the tool. If an assistant runs a command that breaks your build, you ran that command.

## Privacy, security, and licensing

- **Never paste secrets** into a prompt: passwords, API keys, tokens, private keys, or connection strings. Assume anything you send may be stored.
- **Never paste other people's private data**, such as customer records or colleagues' personal information.
- **Follow your organization's policy.** Many companies approve specific assistants and forbid others, or forbid sending proprietary code to external services.
- **Mind licensing.** Generated code can resemble existing code. Companies may have rules about reviewing it for license issues.
- **Do not weaken security to make code work.** If a suggestion disables a security check "to fix the error," that is a red flag, not a fix.

## Using assistants to learn, not to skip learning

In this academy, the goal is to become a developer who could do the work *without* the assistant, and therefore can judge the assistant's output. Some habits that help:

- **Try first.** Attempt the exercise yourself before asking. Struggle is where learning happens.
- **Ask for explanations and hints, not answers.** "Why does this loop stop early?" teaches more than "write the loop."
- **Ask it to quiz you.** "Give me five tricky questions about `substring` indexes" is an excellent study tool.
- **Verify its teaching** against the official documentation and your own experiments in JShell.
- **Explain accepted code in your own words.** If you cannot, you have not learned it yet.

## Common mistakes

**Accepting code because it compiles.** Compilation proves the syntax and types are valid, nothing more. The leap-year suggestion compiled perfectly.

**Testing only the example from your prompt.** The assistant may have fitted its answer to that example. Test the cases you did *not* mention.

**Trusting the explanation over the evidence.** If the explanation says the code is correct and a test fails, the test wins.

**Letting an agent apply changes you have not read.** Unreviewed diffs can include unrelated edits, deleted tests, or weakened checks.

**Pasting a whole project with credentials in it.** Trim the code to the relevant part and remove secrets first.

**Asking vague questions and blaming the tool.** "It doesn't work" gives the assistant nothing to reason from.

## Best practices

- Write your requirement examples before you ask for code, and use them to verify the answer.
- Keep changes small, so every suggestion can be reviewed and tested quickly.
- Ask the assistant for test cases too, then check that the expected values are actually right.
- Cross-check API claims against the Java 21 documentation.
- Treat generated code exactly like code from an unfamiliar colleague: read, compile, test, review.
- Record prompts that worked well; precise prompting is a skill you will keep improving.

## Summary

- AI assistants predict plausible code and text; they do not compile, run, or know your requirements unless told.
- They are strong at explaining, drafting, and suggesting edge cases, and weak at guaranteeing correctness.
- Typical failures include wrong logic, invented APIs, wrong versions, and unstated assumptions.
- What establishes correctness is the same as for any code: reading it, compiling it, and running it against real test cases that cover the requirement.
- Precise prompts include context, code, contract, evidence, constraints, and the kind of answer wanted.
- Tool-connected assistants act on real systems; review commands and diffs, grant minimal permissions, and remember responsibility stays with you.
- Never share secrets or private data, and follow your organization's rules.

## Practice

**Warm-up**

1. Rewrite the prompt "my code is broken" into a precise prompt for a real error you met in an earlier lesson, including the exact message.
2. Ask an assistant to explain the difference between `javac` and `java`, then check every claim against lesson 2.

**Core**

3. Ask an assistant for a method that returns the number of vowels in a String. Before running it, write five test cases including an empty string, upper-case vowels, and a string with no vowels. Run them and record every failure.
4. Ask for an explanation of `substring(begin, end)`. Verify each claim in JShell and note anything missing or wrong.
5. Deliberately ask for a method from a library that does not exist in Java 21 (for example, a String method you invent). Observe whether the assistant invents an answer, and confirm with the compiler.

**Challenge**

6. Choose one function exercise from this chapter. Solve it yourself first. Then ask an assistant for its solution and compare: which cases does each handle, and which assumptions does each make? Write a short review as if commenting on a teammate's pull request.
7. Write a one-page personal policy for using assistants in your studies and work: what you will use them for, what you will never share, and your verification steps.

## Check your understanding

1. Why does a confident, well-explained answer from an assistant not count as evidence that the code is correct?
2. What does compiling generated code prove, and what must you do in addition?
3. Name four elements of a precise prompt.
4. Why is an invented method name usually less dangerous than subtly wrong logic?
5. What extra risks appear when an assistant can run commands or edit files, and how do you manage them?
6. Give two kinds of information you must never paste into a prompt.
