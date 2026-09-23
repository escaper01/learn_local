# Chapter 5 assessment and deliberate practice

This chapter review pulls together everything you learned about modeling a domain with objects. Read it before attempting the chapter's decision question and labs. It recaps each lesson, gives you a cheat sheet to keep beside your editor, lists the mistakes that most often cost points, and explains how to *reason* about each lab. It deliberately does not give you the answers: the value of the labs comes from working through them yourself.

## Lesson recap

### Lesson 1: Classes, objects, identity, state, and behavior

- A class defines fields (state) and methods (behavior); `new` creates an object and returns a reference to it.
- Fields receive defaults (`0`, `false`, `null`); local variables do not.
- Instance methods act on the receiving object, available as `this`.
- Assigning a reference copies the reference, not the object. `==` on objects compares identity.
- An invariant is a rule that must always hold. The object should own every mutation of the state its invariant governs, validating before mutating so a failed operation leaves state unchanged.

### Lesson 2: Constructors, factories, validation, and valid object state

- Constructors have the class name and no return type; the default constructor exists only when you write none.
- Overloaded constructors chain to one primary constructor with `this(...)`, which must be the first statement.
- Throwing from a constructor means no object is created.
- `final` fields plus constructor validation give objects that stay valid for life.
- Static factories offer names, caching, and flexibility; they still validate.
- Initialization order: defaults, superclass constructor, field initializers and blocks, constructor body. An overridable method called from a superclass constructor sees subclass fields at their defaults.

### Lesson 3: Encapsulation, access modifiers, and information hiding

- Access levels: `private`, package-private, `protected`, `public`. `private` is per class, not per object.
- Getters and setters are fine when they enforce rules; generated blindly, they expose representation.
- A single operation that validates and mutates together keeps an invariant in one place.
- Never return internal mutable collections; return a copy or unmodifiable view.
- Encapsulation gives you one place to add thread safety, but is not thread safety by itself.

### Lesson 4: Static members, dependency injection, and object collaboration

- Static members belong to the class and have no `this`; instance members belong to objects.
- Good static uses: constants, stateless utilities, factories. Static mutable state couples code and makes tests order-dependent.
- `static final` fixes a reference, not the contents of the object it refers to.
- Constructor injection lists required collaborators in the constructor, making them visible and replaceable.
- A composition root wires the application and decides who owns and closes resources.

### Lesson 5: Packages, naming, cohesion, and public API design

- A package gives classes a namespace and an access boundary; directories mirror package names.
- Imports are compile-time name shortcuts: they do not copy code, download libraries, or change access.
- `javac -d out ...` then `java -cp out package.Main` builds and runs packaged code.
- Package-private helpers can be changed freely; public API elements are promises.
- Modules export selected packages; unexported packages are inaccessible to other modules even if their classes are public.

## Cheat sheet

### Anatomy of a well-formed domain class

```java
// fragment
public final class Account {                       // final: no subclass surprises
    private final String id;                       // identity never changes
    private long balanceCents;                     // private state

    public Account(String id, long openingCents) { // establish invariants
        if (id == null || id.isBlank()) throw new IllegalArgumentException("id required");
        if (openingCents < 0) throw new IllegalArgumentException("opening must be >= 0");
        this.id = id;
        this.balanceCents = openingCents;
    }

    public boolean withdraw(long cents) {          // validate, then mutate
        if (cents <= 0 || cents > balanceCents) return false;
        balanceCents -= cents;
        return true;
    }

    public long balanceCents() { return balanceCents; }  // read-only query
}
```

### Access levels

| Modifier | Class | Package | Subclass elsewhere | Everyone |
|---|---|---|---|---|
| `private` | Yes | No | No | No |
| none | Yes | Yes | No | No |
| `protected` | Yes | Yes | Yes | No |
| `public` | Yes | Yes | Yes | Yes |

### Static versus instance

| Question | Static | Instance |
|---|---|---|
| How many copies? | One per class | One per object |
| Has `this`? | No | Yes |
| Called as | `ClassName.method()` | `object.method()` |
| Good for | Constants, pure helpers, factories | Domain state and behavior |

### Construction toolbox

| Tool | Use it to |
|---|---|
| Primary constructor | Validate and assign every field once |
| `this(...)` | Delegate convenience constructors to the primary one |
| Static factory | Name the creation path, cache, or return a subtype |
| `final` field | Make the compiler prove every path assigns it |
| `Objects.requireNonNull(x, "x")` | Reject null with a clear message |

### Compile and run packaged code

```bash
javac -d out $(find src -name "*.java")
java -cp out academy.app.Main
```

## Common-mistakes checklist

Before you submit anything in this chapter, check each item:

- Does any method change a field *before* it has finished validating its inputs?
- Does every rejected operation leave every field exactly as it was?
- Is there a public field or an unrestricted setter that lets callers skip a rule?
- Did a constructor use `name = name` instead of `this.name = name`?
- Does a constructor call a method that a subclass could override?
- Does a getter return an internal list, map, or array?
- Is there static mutable state that two callers or two tests share?
- Is a collaborator looked up globally instead of passed in through the constructor?
- Is money stored in `double` instead of `long` cents or `BigDecimal`?
- Could an addition overflow `int` or `long` without being detected?
- Did you hard-code an expected output instead of computing it?

## Approaching the decision question

The judgment question describes a rule that some code path can bypass. For questions like this, ask: *which piece of code is the only one guaranteed to run every time the state changes?* A rule written anywhere else, whether in a user interface, a comment, or a caller that "usually" checks, can be skipped by the next caller who does not know about it. Lessons 1 and 3 give you the vocabulary to justify your choice.

## Approaching the function lab (`deposit`)

The lab asks for a small, pure method: given a balance and an amount, return the resulting balance according to a stated rule. It is deliberately small so that you can practise the professional habit of **specifying before coding**.

1. Reread the contract and underline every condition word: "only when", "otherwise", "nonnegative", "fits".
2. Build a boundary table *before* writing code. Choose amounts that sit on each side of every boundary in the contract: clearly valid, the smallest valid value, the largest invalid value near the boundary, clearly invalid. Include a starting balance at its own lower boundary. For each row, write the expected result from the contract alone.
3. Write the method so that each row of your table maps to an obvious branch. Keep it deterministic and free of printing: the grader reads the return value, not the console.
4. Trace every row by hand through your code, then run the visible test.

A good sign: if a reviewer can read your boundary table and your method side by side and see a one-to-one correspondence, you are done.

## Approaching the debug lab (preserve state on invalid mutation)

The program prints the wrong balance after an operation that should have been rejected. Do not start by editing. Start by predicting.

1. Write down the starting value of every field.
2. Step through the method one statement at a time and write the field values after each line, like the trace tables in Lesson 1.
3. Mark the line where the state first changes and the line where the decision to reject is made. Ask: which happens first, and what should the order be for a rejected operation to leave no trace?
4. Make the smallest change that fixes the *cause*. Keep the method call in `main` exactly as it is; the lab checks that you repaired the operation, not that you changed what is printed.
5. Re-run your trace on your fixed version with an accepted withdrawal too, to make sure you did not break the success path.

Then write two sentences explaining why the order of statements matters for failure atomicity. That explanation is part of what the lab is teaching.

## Approaching the project lab (ledger command processor)

The project is a larger version of everything in this chapter: parse untrusted text, validate it completely, and only then change state. Treat it as a design exercise first.

### Step 1: Turn the specification into a table

Copy the specification into your notes and turn every sentence into a rule you can test: the accepted command shapes, the allowed amount range, what happens on each kind of invalid line, how whitespace and blank lines are treated, the exact output format including the final line and the absence of a trailing newline. For each rule, invent your own sample input and expected output. Aim for at least a dozen rows, including empty input, a line with too few fields, a line with too many fields, a nonnumeric amount, a zero amount, a withdrawal equal to the balance, a withdrawal one more than the balance, and a deposit that would exceed the largest `long`.

### Step 2: Separate the phases

A robust design has three phases per line:

1. **Parse**: split the line into fields and convert text to numbers. Remember that `String.split` drops trailing empty strings unless you pass a negative limit, which can hide malformed input.
2. **Validate**: decide whether the command is acceptable given the current balance, including overflow. `Math.addExact` and `Math.subtractExact` throw `ArithmeticException` instead of silently wrapping.
3. **Apply**: change the balance, and only now.

If any phase fails, emit the error line and move to the next input line with the balance untouched. Consider putting the balance and its operations in their own small class (as in Lessons 1 and 3) so `run` only orchestrates.

### Step 3: Build the output deliberately

Collect output lines in a list and join them once at the end with the required separator. This avoids off-by-one mistakes with a trailing newline.

### Step 4: Verify

Run your own table first, then the visible tests. If a hidden test fails, do not guess: find which rule in your table you did not cover and add that row.

## Self-check before moving on

You are ready for Chapter 6 if you can, without looking back:

1. Explain why a failed operation must leave state unchanged, and show where validation belongs in a mutating method.
2. Write a class with two constructors that share validation through `this(...)`.
3. Explain what an overridden method sees if a superclass constructor calls it.
4. Say which access level you would give a helper used only inside one package.
5. Explain what constructor injection makes visible and why that helps testing.
6. State what an `import` does and does not do.
