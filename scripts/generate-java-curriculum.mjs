import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../examples");
const contentRoot = resolve(root, "content");
const projectRoot = resolve(root, "projects");

const modules = [
  {
    title: "Java Origins, Tooling, and First Programs",
    description: "Understand why Java exists, how source becomes bytecode, and how to work productively from an IDE or terminal.",
    lessons: [
      ["Java history, principles, and applications", ["Introduction to Java", "Java history", "Java principles", "Java applications", "Writing first program"]],
      ["Program structure and basic syntax", ["Basic literals: numbers, strings and characters", "Program structure", "Key Java components", "Java syntax rules", "Printing data", "Comments"]],
      ["JVM, JRE, JDK, and bytecode", ["Basic terms: JVM, JRE, JDK", "JVM components", "Class files and Bytecode", "Write, compile, and run", "Compile and run Java from CLI"]],
      ["IDEs and IntelliJ IDEA", ["IDE", "IntelliJ IDEA", "IntelliJ IDEA basics", "Hyperskill Academy plugin"]],
      ["Operating systems and command lines", ["Operating systems", "Introduction to Linux", "Command line overview", "Parameters and options"]]
    ]
  },
  {
    title: "Types, Variables, Input, and Operators",
    description: "Build a precise mental model for Java values, conversions, console input, and expressions.",
    lessons: [
      ["Types, variables, and naming", ["Types and variables", "Primitive and reference types", "Naming variables", "Coding style conventions", "Constants. Final variables"]],
      ["Primitive types and numeric ranges", ["Primitive data types and their sizes", "Integer types and operations", "Floating-point types and operations", "Characters", "Boolean type and operations. True and false"]],
      ["Input and formatted output", ["Reading user input with Scanner", "Formatted output", "Printing data"]],
      ["Arithmetic and remainder", ["Arithmetic operations", "Increment and decrement", "Modulo division"]],
      ["Binary representation and casting", ["Binary numbers", "Binary arithmetic", "Type casting"]],
      ["Comparisons and boolean expressions", ["Comparing values. Relational operators", "Boolean type and operations. True and false"]]
    ]
  },
  {
    title: "Control Flow and Program Decomposition",
    description: "Express decisions and repetition clearly, then break solutions into reusable methods.",
    lessons: [
      ["Conditions and ternary expressions", ["Conditional statement", "One-line condition with ternary operator", "Multiple conditions: switch", "Switch expression"]],
      ["For loops", ["For loop", "Break and continue. Branching"]],
      ["While and do-while loops", ["While and do-while loops", "Break and continue. Branching"]],
      ["Declaring and calling methods", ["Declaring methods", "Calling methods", "Method \"main\""]],
      ["Decomposition and overloads", ["Functional decomposition", "Overloading"]]
    ]
  },
  {
    title: "Arrays, Memory, Strings, and Immutability",
    description: "Work with contiguous data and text while understanding references, stack frames, heap objects, and immutable values.",
    lessons: [
      ["Arrays and iteration", ["Array", "Fixed-size array", "Iterating over arrays", "java.util.Arrays"]],
      ["Arrays across method boundaries", ["Arrays as parameters", "Command-line arguments"]],
      ["Computer memory", ["Computer memory", "Components of computer memory", "Stack and heap memory", "Call stack"]],
      ["Strings and characters", ["Characters", "String", "Processing strings", "StringBuilder"]],
      ["Identity, immutability, and interning", ["Immutability", "Object interning", "Primitive and reference types"]]
    ]
  },
  {
    title: "Build Tools and AI-Assisted Development",
    description: "Organize reproducible builds and use AI tooling as an accountable part of a professional development workflow.",
    lessons: [
      ["Build artifacts and JAR files", ["Build tools", "JAR files"]],
      ["Gradle projects", ["Gradle: overview", "Basic project with Gradle", "Building apps using Gradle", "Gradle build configuration"]],
      ["Dependencies and repositories", ["Dependency management: repositories"]],
      ["AI in software development", ["Introduction to AI in software development", "Core workflows with AI tools", "Integrating AI tools into your workflow"]],
      ["MCP, agent skills, and JetBrains AI", ["Model Context Protocol", "Agent skills", "Getting started with JetBrains AI tools", "Working with JetBrains AI tools"]]
    ]
  },
  {
    title: "Object-Oriented Programming Foundations",
    description: "Model state and behavior using classes, objects, constructors, encapsulation, packages, and modules.",
    lessons: [
      ["Objects and classes", ["What is object-oriented programming", "Defining classes", "Objects and their properties"]],
      ["Constructors and initialization", ["Initializing new instances. Constructor", "Multiple constructors"]],
      ["Instance behavior and encapsulation", ["Instance methods", "Access modifiers", "Getters and setters"]],
      ["Static members", ["Static members"]],
      ["Packages and modules", ["Grouping classes with packages", "Modules"]]
    ]
  },
  {
    title: "Inheritance, Polymorphism, Interfaces, and Enums",
    description: "Design substitutable types, choose abstraction mechanisms, and understand Java's root object model.",
    lessons: [
      ["Inheritance and protected state", ["Inheritance", "Protected modifier", "Keyword \"super\""]],
      ["Object, overrides, and annotations", ["Object class", "Method overriding", "Adding annotations"]],
      ["Polymorphism and subclass references", ["Polymorphism", "Referencing subclass objects"]],
      ["Interfaces and default methods", ["Interfaces", "Declaring functionality with interfaces", "Default methods"]],
      ["Abstract classes and interfaces", ["Abstract class", "Abstract class vs interface"]],
      ["Enums and anonymous classes", ["Combining constants with enum", "Fields and methods in enum", "Anonymous class"]]
    ]
  },
  {
    title: "Files, Streams, Exceptions, and Date-Time",
    description: "Handle external resources safely, model failures explicitly, and work with modern date and time values.",
    lessons: [
      ["Files and paths", ["File class", "Reading files", "Writing files", "Managing files"]],
      ["Byte and character streams", ["What are streams", "Input streams", "Output streams"]],
      ["Errors and exception hierarchy", ["Errors in programs", "First glance at exceptions", "Hierarchy of exceptions", "NullPointerException"]],
      ["Handling and throwing exceptions", ["Exception handling", "Throwing exceptions", "Stack trace"]],
      ["Resource safety", ["Try with resources"]],
      ["Modern date and time", ["LocalDate", "LocalTime", "LocalDateTime"]]
    ]
  },
  {
    title: "Algorithms, Data Structures, and Generics",
    description: "Reason about algorithms independently of syntax and express reusable, type-safe data structures.",
    lessons: [
      ["Algorithms and pseudocode", ["Computer algorithms", "Pseudocode"]],
      ["Abstract and concrete structures", ["Data structures", "Abstract and concrete data structures", "Fixed-size array", "Dynamic array"]],
      ["Stacks, queues, and deques", ["Stack", "Queue", "Deque"]],
      ["Boxing and wrapper classes", ["Wrapping classes. Boxing"]],
      ["Generic programming", ["Introduction to generic programming", "Generics and Object"]],
      ["Recursion and divide-and-conquer", ["Recursion basics", "Divide and conquer"]]
    ]
  },
  {
    title: "Collections, Ordering, Sorting, and Hashing",
    description: "Select the right collection, define ordering, understand standard sorting techniques, and reason about hash tables.",
    lessons: [
      ["The collections framework", ["What are collections", "The Collections framework overview", "The utility class Collections"]],
      ["Lists and linked structures", ["ArrayList", "The List interface", "LinkedList", "Stack"]],
      ["Sets, maps, and enum sets", ["The Set interface", "The Map interface", "Enumset"]],
      ["Natural and custom ordering", ["Comparable", "Ordering and total order", "Comparator"]],
      ["Elementary sorting", ["Sorting problem", "Insertion sort", "Bubble sort"]],
      ["Merge sort", ["Divide and conquer", "Merge sort", "Recursion basics"]],
      ["Hash functions and tables", ["Hashing: overview", "Simplistic hash functions", "Hash function", "Hash table"]],
      ["HashMap internals and use", ["Introduction to HashMap", "HashMap"]]
    ]
  },
  {
    title: "Lambdas, Functional Interfaces, and Composition",
    description: "Treat behavior as data using lambdas, method references, functional contracts, Optional, and composition.",
    lessons: [
      ["Lambda expressions", ["Lambda expressions"]],
      ["Method references", ["Method references"]],
      ["Functional interfaces", ["Functional interfaces", "Standard functional interfaces"]],
      ["Optional", ["Optional"]],
      ["Function composition", ["Function composition"]]
    ]
  },
  {
    title: "Regular Expressions",
    description: "Design, test, and apply regular expressions using Java's Pattern and Matcher APIs.",
    lessons: [
      ["Regex foundations", ["Regular expression", "Regexps in Java"]],
      ["Sets, ranges, and alternation", ["Regex sets, ranges, alternations"]],
      ["Quantifiers and shorthand classes", ["Regex quantifiers", "Regex shorthands"]],
      ["Pattern, Matcher, and results", ["Regexes in programs", "Patterns and Matcher", "Match results"]]
    ]
  },
  {
    title: "Threads and Synchronization",
    description: "Understand Java's thread model, lifecycle, visibility rules, and core synchronization mechanisms.",
    lessons: [
      ["Concurrency vocabulary", ["Synchronous, asynchronous, parallel", "Processes and threads"]],
      ["Creating and managing threads", ["Threads as objects", "Custom threads", "Thread management", "States of a thread"]],
      ["Thread failures and interruption", ["Exceptions in threads", "Interruptions"]],
      ["Shared data and ThreadLocal", ["Shared data", "ThreadLocal"]],
      ["Synchronization and happens-before", ["Thread synchronization", "Thread synchronization. Synchronized in action", "Happens-before"]],
      ["Atomics and locks", ["Atomics", "Reentrant lock"]],
      ["Coordination primitives", ["Semaphores", "CountDownLatch"]]
    ]
  },
  {
    title: "Executors, Futures, and Concurrent Collections",
    description: "Move from raw threads to managed task execution, asynchronous results, virtual threads, and scalable shared collections.",
    lessons: [
      ["Executors and ExecutorService", ["Executors", "ExecutorService"]],
      ["Callable and Future", ["Callable and Future"]],
      ["CompletableFuture", ["CompletableFuture"]],
      ["Timers and scheduling", ["Timers"]],
      ["Virtual threads", ["Virtual threads"]],
      ["Thread-safe collections", ["Collections and thread-safety", "Concurrent queues", "Thread-safe maps", "CopyOnWriteArrayList"]]
    ]
  },
  {
    title: "Functional Data Processing with Streams",
    description: "Build lazy data pipelines and understand collection, reduction, primitive specialization, infinity, and parallel execution.",
    lessons: [
      ["Stream pipelines and filtering", ["Functional data processing with streams", "Stream pipelines", "Stream filtering"]],
      ["Map and flatMap", ["Map and flatMap"]],
      ["Reduction", ["Reduction methods"]],
      ["Collectors and grouping", ["Collectors", "Grouping collectors"]],
      ["Primitive and bounded streams", ["Streams of primitives", "Taking elements"]],
      ["Infinite and parallel streams", ["Infinite streams", "Parallel streams"]],
      ["Stream gatherers", ["Stream gatherers"]]
    ]
  },
  {
    title: "Reflection, Annotations, Class Loading, and Bytecode",
    description: "Inspect types at runtime and understand the machinery that loads, represents, and instruments Java classes.",
    lessons: [
      ["Reflection and runtime type checking", ["Reflection basics", "Runtime type checking", "Retrieving Class instances"]],
      ["Modifiers, fields, and methods", ["Dealing with modifiers", "Manipulating fields and methods"]],
      ["Annotations", ["Detecting annotations", "Custom annotations and types of annotations", "Adding annotations"]],
      ["Class loading and bytecode", ["Class files and Bytecode", "Class Loader"]],
      ["ByteBuddy and instrumentation concepts", ["ByteBuddy"]]
    ]
  },
  {
    title: "Logging, Testing, and Debugging",
    description: "Create feedback loops that expose defects early through logging, tests, stack traces, IDE tools, mocks, and assertions.",
    lessons: [
      ["Bugs and diagnostic thinking", ["What are bugs", "Debugging overview", "Debugging techniques"]],
      ["Logging fundamentals", ["Introduction to logging", "Introduction to logging in Java", "Standard logger", "Logback"]],
      ["Functional and unit testing", ["Functional testing", "Unit testing", "Unit testing with JUnit"]],
      ["JUnit structure and parameterization", ["Test lifecycle annotations", "Parameterized test"]],
      ["Assertions and mocks", ["Assertion libs - AssertJ", "Mockito"]],
      ["Debugger fundamentals", ["Run and debug with IntelliJ IDEA", "Debugging simple constructs", "Debugging methods"]],
      ["Advanced IDE debugging", ["Advanced debugger features", "IntelliJ IDEA run configurations", "Call stack", "Stack trace"]]
    ]
  },
  {
    title: "SQL and JDBC",
    description: "Learn relational data basics and connect Java applications safely using JDBC statements, prepared statements, and transactions.",
    lessons: [
      ["Database and SQL foundations", ["What are databases", "SQL: structured query language"]],
      ["SQL values and expressions", ["Basic data types in SQL", "Literals", "Arithmetic expressions"]],
      ["Defining and reading data", ["Basic CREATE statement", "Basic SELECT statement", "SELECT FROM statement"]],
      ["Changing data", ["Basic INSERT statement", "Basic UPDATE statement"]],
      ["Connecting with JDBC", ["Connecting to a database with JDBC", "JDBC Statements"]],
      ["Prepared statements and transactions", ["JDBC Prepared Statements", "JDBC Transactions"]]
    ]
  },
  {
    title: "Software Architecture and Design Patterns",
    description: "Organize code around responsibilities, dependencies, and collaboration patterns that remain understandable as systems grow.",
    lessons: [
      ["Architecture and diagrams", ["Introduction to software architecture", "Class diagrams", "Code organization. Design principles"]],
      ["SOLID foundations", ["Single responsibility principle", "Open/Closed Principle"]],
      ["Pattern vocabulary", ["Concept of design patterns", "Creational design patterns", "Structural design patterns"]],
      ["Factory families", ["Factory method and prototype", "Factory method", "Abstract factory", "Encapsulating object creation"]],
      ["Builder", ["Builder pattern", "Builder"]],
      ["Proxy and Strategy", ["Proxy pattern", "Strategy"]],
      ["Command and Template Method", ["Command", "Template method"]]
    ]
  },
  {
    title: "Networking, Serialization, and JSON",
    description: "Exchange data through sockets and stable serialized representations while understanding boundaries and security tradeoffs.",
    lessons: [
      ["Sockets", ["Sockets"]],
      ["Serialization fundamentals", ["Serialization basics", "Custom serialization"]],
      ["JSON concepts", ["JSON"]],
      ["Gson and JSON customization", ["Introduction to Gson", "Customizing JSON with Gson"]]
    ]
  }
];

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 58);

function conceptDetail(topic, chapter) {
  const lower = topic.toLowerCase();
  if (/jvm|jre|jdk|bytecode|class loader/.test(lower)) return `${topic} belongs to Java's execution pipeline. Distinguish compile-time responsibilities from runtime responsibilities, trace what is stored in a .class file, and identify which component loads, verifies, and executes code. This distinction explains portability as well as many startup and compatibility errors.`;
  if (/type|literal|variable|boxing|casting|binary|arithmetic|boolean|modulo|increment|character/.test(lower)) return `${topic} affects how Java represents values and checks operations. Work through its valid range or representation, the conversions Java performs automatically, the conversions that require an explicit cast, and the failure modes caused by overflow, truncation, or mistaken reference assumptions.`;
  if (/loop|condition|switch|break|continue|method|decomposition|overload/.test(lower)) return `${topic} is a control or decomposition tool. Follow execution one decision at a time, state the invariant that remains true, and prefer the smallest construct that expresses the intent. Be able to predict termination, scope, return values, and which overload the compiler selects.`;
  if (/array|string|memory|stack|heap|immutability|interning/.test(lower)) return `${topic} connects Java syntax to its memory model. Track references separately from objects, note which operations create new values, and reason about bounds, aliasing, lifetime, and mutation. Draw a small stack-and-heap diagram when behavior is surprising.`;
  if (/class|object|constructor|instance|access|getter|setter|inherit|polymorph|interface|abstract|enum|super|override|protected|package|module/.test(lower)) return `${topic} is part of Java's object model. Identify the public contract, hidden state, construction rules, and substitution relationships. Evaluate the design by asking whether callers depend on behavior rather than representation and whether a change stays localized.`;
  if (/file|stream|exception|nullpointer|resource|localdate|localtime/.test(lower)) return `${topic} crosses a resource or failure boundary. Define ownership, closing behavior, checked versus unchecked failure, and the information a caller needs to recover. Use deterministic cleanup and preserve the original cause instead of hiding errors.`;
  if (/algorithm|data structure|stack|queue|deque|generic|recursion|sort|hash|list|set|map|collection|comparable|comparator/.test(lower)) return `${topic} should be understood through its operations and costs. Describe the representation, invariants, typical time complexity, ordering guarantees, duplicate rules, and the workload for which it is appropriate. Test boundary cases such as empty input, duplicates, and already ordered data.`;
  if (/lambda|functional|optional|composition|method reference/.test(lower)) return `${topic} expresses behavior as a value. Identify the target functional interface, inputs, output, captured state, and null-handling policy. Favor small pure transformations so composition remains testable and side effects remain visible.`;
  if (/regex|pattern|matcher|match result/.test(lower)) return `${topic} contributes to a pattern language for text. Read the expression left to right, distinguish character selection from repetition, and test both matching and near-miss inputs. Escape once for regex syntax and again when the Java string literal requires it.`;
  if (/thread|synchron|atomic|lock|semaphore|latch|executor|future|parallel|concurrent|interrupt|happens-before|threadlocal|virtual/.test(lower)) return `${topic} participates in concurrent execution. State which thread owns each piece of data, what establishes visibility, how cancellation is signaled, and what prevents races or deadlock. Prefer structured task lifecycles and high-level concurrency utilities over unmanaged threads.`;
  if (/collector|stream|map and flatmap|reduction|filtering|gatherer/.test(lower)) return `${topic} is a stage in a lazy data pipeline. Separate intermediate operations from terminal operations, avoid stateful interference, and check encounter order and associativity before parallelizing. Explain both the element type entering the stage and the type leaving it.`;
  if (/reflection|modifier|annotation|bytebuddy/.test(lower)) return `${topic} exposes or changes metadata normally handled by the compiler and JVM. Identify what is known at compile time versus runtime, account for access restrictions and type erasure, and confine reflective code behind a small validated boundary.`;
  if (/test|junit|assert|mock|bug|debug|logging|logger|logback|stack trace/.test(lower)) return `${topic} improves feedback about correctness. Define the observable behavior, arrange a minimal reproducible case, capture useful context without secrets, and make failures explain what contract was broken. Keep tests deterministic and prefer behavior-focused assertions.`;
  if (/sql|database|jdbc|statement|transaction/.test(lower)) return `${topic} belongs to the relational persistence boundary. Identify rows, columns, keys, types, and transaction scope; separate query text from values; and close JDBC resources predictably. Prepared statements protect value binding, while transactions protect multi-step invariants.`;
  if (/architecture|principle|pattern|factory|builder|proxy|strategy|command|template|diagram/.test(lower)) return `${topic} is a design vocabulary, not a goal by itself. Start from the changing responsibility or collaboration problem, identify participants and dependencies, then measure whether the pattern reduces coupling without adding unnecessary indirection.`;
  if (/socket|json|serializ|gson/.test(lower)) return `${topic} defines a boundary between processes or representations. Specify framing, encoding, schema, failure handling, and compatibility. Treat incoming data as untrusted and avoid serializing implementation details that should remain private.`;
  if (/gradle|build|jar|dependency|repository/.test(lower)) return `${topic} contributes to a reproducible build. Know which inputs it controls, how tasks depend on one another, where artifacts are produced, and why versions must be explicit. Keep generated outputs separate from source and review every external dependency.`;
  if (/ai|model context|agent|jetbrains/.test(lower)) return `${topic} is an assistance workflow that still requires human verification. Bound the context, state acceptance criteria, inspect diffs and tests, protect secrets, and record assumptions. Treat generated code as untrusted until it meets the same review bar as handwritten code.`;
  return `${topic} is a required part of ${chapter}. Define it in your own words, trace a concrete example, contrast it with the nearest alternative, and identify one misuse that would make a Java program incorrect or harder to maintain.`;
}

function exampleFor(title) {
  const lower = title.toLowerCase();
  if (/type|operator|input/.test(lower)) return `int value = 7;\ndouble scaled = value / 2.0;\nboolean inRange = scaled >= 3.0 && scaled < 4.0;\nSystem.out.printf("value=%d scaled=%.1f valid=%s%n", value, scaled, inRange);`;
  if (/control|decomposition/.test(lower)) return `static String classify(int value) {\n    if (value < 0) return "negative";\n    if (value == 0) return "zero";\n    return value % 2 == 0 ? "positive even" : "positive odd";\n}`;
  if (/array|memory|string/.test(lower)) return `int[] values = {3, 1, 4};\nint[] copy = java.util.Arrays.copyOf(values, values.length);\njava.util.Arrays.sort(copy);\nString summary = java.util.Arrays.toString(copy);`;
  if (/object-oriented foundations/.test(lower)) return `final class Account {\n    private int balance;\n    Account(int openingBalance) { balance = openingBalance; }\n    void deposit(int amount) { if (amount <= 0) throw new IllegalArgumentException(); balance += amount; }\n    int balance() { return balance; }\n}`;
  if (/inheritance/.test(lower)) return `interface Shape { double area(); }\nrecord Circle(double radius) implements Shape {\n    public double area() { return Math.PI * radius * radius; }\n}\nShape shape = new Circle(2.0);`;
  if (/file|exception|date/.test(lower)) return `java.nio.file.Path path = java.nio.file.Path.of("notes.txt");\ntry (var reader = java.nio.file.Files.newBufferedReader(path)) {\n    System.out.println(reader.readLine());\n} catch (java.io.IOException error) {\n    System.err.println("Could not read notes: " + error.getMessage());\n}`;
  if (/collection|algorithm|data structure/.test(lower)) return `java.util.Map<String, Integer> counts = new java.util.HashMap<>();\nfor (String word : java.util.List.of("red", "blue", "red")) {\n    counts.merge(word, 1, Integer::sum);\n}`;
  if (/lambda|functional/.test(lower)) return `java.util.function.Predicate<String> useful = text -> text != null && !text.isBlank();\njava.util.function.Function<String, String> normalize = String::trim;\nString result = normalize.apply("  Java  ");`;
  if (/regular expression/.test(lower)) return `java.util.regex.Pattern id = java.util.regex.Pattern.compile("[A-Z]{2}-\\\\d{4}");\nboolean valid = id.matcher("AB-2048").matches();`;
  if (/thread|executor|concurrent/.test(lower)) return `try (var executor = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {\n    var future = executor.submit(() -> "computed");\n    System.out.println(future.get());\n}`;
  if (/functional data/.test(lower)) return `int total = java.util.stream.IntStream.of(1, 2, 3, 4)\n    .filter(value -> value % 2 == 0)\n    .map(value -> value * value)\n    .sum();`;
  if (/reflection/.test(lower)) return `Class<?> type = java.util.ArrayList.class;\nfor (var method : type.getDeclaredMethods()) {\n    if (java.lang.reflect.Modifier.isPublic(method.getModifiers())) {\n        System.out.println(method.getName());\n    }\n}`;
  if (/logging|testing|debugging/.test(lower)) return `java.util.logging.Logger log = java.util.logging.Logger.getLogger("course");\nstatic int divide(int left, int right) {\n    if (right == 0) throw new IllegalArgumentException("right must not be zero");\n    return left / right;\n}`;
  if (/sql|jdbc/.test(lower)) return `String sql = "SELECT title FROM tasks WHERE status = ?";\ntry (var statement = connection.prepareStatement(sql)) {\n    statement.setString(1, "OPEN");\n    try (var rows = statement.executeQuery()) {\n        while (rows.next()) System.out.println(rows.getString("title"));\n    }\n}`;
  if (/architecture|design pattern/.test(lower)) return `interface Pricing { int price(int base); }\nfinal class RegularPricing implements Pricing {\n    public int price(int base) { return base; }\n}\nfinal class Checkout {\n    private final Pricing pricing;\n    Checkout(Pricing pricing) { this.pricing = pricing; }\n}`;
  if (/network|serialization|json/.test(lower)) return `record Message(String type, String body) {}\n// Define a stable wire schema; validate size and fields before constructing Message.\nMessage message = new Message("notice", "Hello");`;
  return `public final class Main {\n    public static void main(String[] args) {\n        System.out.println("Java learning is built one verified step at a time.");\n    }\n}`;
}

function theory(chapter, title, topics, description) {
  const details = topics.map((topic) => `### ${topic}\n\n${conceptDetail(topic, chapter)}`).join("\n\n");
  return `# ${title}\n\n## Why this lesson matters\n\n${description} This lesson narrows the chapter into a set of related ideas so you can build a durable mental model before attempting an assessment. Read the examples actively: predict each result before running it, then change one assumption at a time.\n\n## Learning objectives\n\n${topics.map((topic) => `- Explain **${topic}** and recognize when it applies.`).join("\n")}\n- Connect these ideas to Java's compiler, runtime, type system, and standard library.\n- Diagnose a common misuse and justify a safer alternative.\n\n## Concepts in detail\n\n${details}\n\n## Worked Java example\n\n\`\`\`java\n${exampleFor(chapter)}\n\`\`\`\n\nTrace the example from inputs to outputs. Identify what is checked by the compiler, what happens at runtime, which values can change, and which assumptions form the code's contract. Then rewrite one part without changing observable behavior.\n\n## A reliable way to practice\n\n1. Restate the problem with concrete inputs and expected outputs.\n2. Choose the smallest Java construct that represents the rule.\n3. Trace normal, boundary, empty, and invalid cases by hand.\n4. Compile with warnings visible, run focused examples, and read the first meaningful error rather than guessing.\n5. Refactor only after behavior is covered by a repeatable check.\n\n## Common mistakes\n\n- Memorizing syntax without tracing values, references, control flow, and ownership.\n- Combining several new ideas in one change, making the source of an error unclear.\n- Ignoring empty inputs, numeric limits, nullability, resource cleanup, or failure paths.\n- Choosing a fashionable API or pattern without explaining the problem it solves.\n- Treating generated code, library calls, or runtime behavior as correct without verification.\n\n## Recap\n\nYou should now be able to define ${topics.join(", ")}, apply them in a small program, and explain the tradeoffs involved. Return to the curriculum for the next reading lesson; the chapter assessment appears after the theory sequence.`;
}

const practices = [
  { name: "isPortableClassFile", title: "Recognize a Java class-file name", instruction: "Return true when `fileName` ends with `.class`.", parameters: [{ name: "fileName", type: "string" }], returns: "boolean", implementation: "return false;", tests: [["Main.class", true], ["Main.java", false], ["archive.CLASS", false]], hint: "String suffix checks are case-sensitive." },
  { name: "fitsInByte", title: "Check a primitive range", instruction: "Return true when `value` is inside Java's signed `byte` range, from -128 through 127.", parameters: [{ name: "value", type: "int" }], returns: "boolean", implementation: "return false;", tests: [[127, true], [128, false], [-128, true]], hint: "Both range boundaries are inclusive." },
  { name: "classify", title: "Combine conditions and decomposition", instruction: "Return `negative`, `zero`, `positive even`, or `positive odd` for the supplied integer.", parameters: [{ name: "value", type: "int" }], returns: "string", implementation: "return \"TODO\";", tests: [[-4, "negative"], [0, "zero"], [7, "positive odd"]], hint: "Handle mutually exclusive cases from most general to most specific." },
  { name: "reversedCopy", title: "Reverse an array without aliasing", instruction: "Return a new array containing `values` in reverse order. Do not mutate the input.", parameters: [{ name: "values", type: "int[]" }], returns: "int[]", implementation: "return new int[0];", tests: [[[1, 2, 3], [3, 2, 1]], [[], []], [[5], [5]]], hint: "Allocate a result of the same length and map index i to length - 1 - i." },
  { name: "artifactName", title: "Name a versioned build artifact", instruction: "Return `name-version.jar` using the supplied project name and version.", parameters: [{ name: "name", type: "string" }, { name: "version", type: "string" }], returns: "string", implementation: "return \"TODO\";", tests: [["learnlocal", "1.0.0", "learnlocal-1.0.0.jar"], ["app", "21", "app-21.jar"], ["core", "2.5", "core-2.5.jar"]], hint: "Build the name from the two inputs and the fixed separators." },
  { name: "deposit", title: "Enforce an object invariant", instruction: "Return the balance after depositing `amount`. If `amount` is not positive, return the original balance.", parameters: [{ name: "balance", type: "int" }, { name: "amount", type: "int" }], returns: "int", implementation: "return 0;", tests: [[100, 25, 125], [100, 0, 100], [100, -5, 100]], hint: "Validate the requested state change before applying it." },
  { name: "formatShape", title: "Apply a polymorphic formatting contract", instruction: "Return `TYPE:area`, with `type` converted to uppercase and the integer area unchanged.", parameters: [{ name: "type", type: "string" }, { name: "area", type: "int" }], returns: "string", implementation: "return \"TODO\";", tests: [["circle", 12, "CIRCLE:12"], ["square", 9, "SQUARE:9"], ["shape", 0, "SHAPE:0"]], hint: "Call a String method for the representation, then append the contract separator." },
  { name: "safeDivide", title: "Represent a recoverable failure", instruction: "Return `left / right`; when `right` is zero, return 0 instead of performing the invalid division.", parameters: [{ name: "left", type: "int" }, { name: "right", type: "int" }], returns: "int", implementation: "return 0;", tests: [[12, 3, 4], [9, 0, 0], [-9, 3, -3]], hint: "Guard the failure case before evaluating the division." },
  { name: "stackTop", title: "Read the logical top of a stack", instruction: "Treat the end of `values` as the top of a stack. Return its top value, or -1 when the stack is empty.", parameters: [{ name: "values", type: "int[]" }], returns: "int", implementation: "return 0;", tests: [[[3, 5, 8], 8], [[], -1], [[4], 4]], hint: "Check the length before reading the last index." },
  { name: "countDistinct", title: "Count distinct collection values", instruction: "Return the number of distinct strings in `values`.", parameters: [{ name: "values", type: "string[]" }], returns: "int", implementation: "return 0;", tests: [[['red', 'blue', 'red'], 2], [[], 0], [['x', 'x', 'x'], 1]], hint: "A Set already models uniqueness." },
  { name: "normalize", title: "Compose a text transformation", instruction: "Return trimmed lowercase text.", parameters: [{ name: "text", type: "string" }], returns: "string", implementation: "return \"TODO\";", tests: [["  Java  ", "java"], ["STREAMS", "streams"], [" already clean ", "already clean"]], hint: "Compose trim and lowercase in a readable order." },
  { name: "isCourseCode", title: "Validate text with a regular expression", instruction: "Return true only for two uppercase letters, a hyphen, and four digits, such as `AB-2048`.", parameters: [{ name: "text", type: "string" }], returns: "boolean", implementation: "return false;", tests: [["AB-2048", true], ["ab-2048", false], ["ABC-20", false]], hint: "Use `matches` and remember that a Java string must escape the regex backslash." },
  { name: "sumSafely", title: "Isolate a shared-data calculation", instruction: "Return the sum of all integers. Keep all state local so concurrent callers cannot interfere.", parameters: [{ name: "values", type: "int[]" }], returns: "int", implementation: "return 0;", tests: [[[1, 2, 3], 6], [[], 0], [[-2, 5], 3]], hint: "A local accumulator is confined to one invocation." },
  { name: "completedValue", title: "Model an asynchronous result", instruction: "Return `value * value`, the deterministic value a completed computation would supply.", parameters: [{ name: "value", type: "int" }], returns: "int", implementation: "return 0;", tests: [[4, 16], [0, 0], [-3, 9]], hint: "The function represents the task body; an executor controls where it runs." },
  { name: "sumEvenSquares", title: "Implement a stream-style pipeline", instruction: "Return the sum of the squares of the even values in `values`.", parameters: [{ name: "values", type: "int[]" }], returns: "int", implementation: "return 0;", tests: [[[1, 2, 3, 4], 20], [[], 0], [[-2, 3], 4]], hint: "Filter for even values, map each survivor to its square, then reduce with sum." },
  { name: "simpleClassName", title: "Extract runtime type-style metadata", instruction: "Given a fully qualified class name, return the text after its final dot. If no dot exists, return the input.", parameters: [{ name: "qualifiedName", type: "string" }], returns: "string", implementation: "return \"TODO\";", tests: [["java.util.ArrayList", "ArrayList"], ["Main", "Main"], ["a.b.C", "C"]], hint: "Find the last separator, not the first one." },
  { name: "failureMessage", title: "Create a useful diagnostic message", instruction: "Return `expected=<expected>, actual=<actual>` so a failing test reports both values.", parameters: [{ name: "expected", type: "int" }, { name: "actual", type: "int" }], returns: "string", implementation: "return \"TODO\";", tests: [[5, 3, "expected=5, actual=3"], [0, 0, "expected=0, actual=0"], [-1, 2, "expected=-1, actual=2"]], hint: "Keep the labels and punctuation exact." },
  { name: "placeholders", title: "Create JDBC placeholders safely", instruction: "Return a comma-separated list containing `count` question-mark placeholders. Return an empty string for non-positive counts.", parameters: [{ name: "count", type: "int" }], returns: "string", implementation: "return \"TODO\";", tests: [[3, "?,?,?"], [1, "?"], [0, ""]], hint: "Values belong in prepared-statement parameters, not string concatenation." },
  { name: "discountedPrice", title: "Apply a Strategy-style pricing rule", instruction: "Return `price` after subtracting `percent` percent using integer arithmetic. Clamp percent to the range 0 through 100.", parameters: [{ name: "price", type: "int" }, { name: "percent", type: "int" }], returns: "int", implementation: "return 0;", tests: [[100, 20, 80], [75, 0, 75], [90, 120, 0]], hint: "Normalize the strategy input before applying it." },
  { name: "jsonString", title: "Encode a minimal JSON string", instruction: "Return `text` surrounded by double quotes, escaping backslashes and double quotes inside it.", parameters: [{ name: "text", type: "string" }], returns: "string", implementation: "return \"TODO\";", tests: [["hello", "\"hello\""], ["a\\b", "\"a\\\\b\""], ["say \"hi\"", "\"say \\\"hi\\\"\""]], hint: "Escape backslashes before escaping quotes, then add the surrounding quotes." }
];

const assessment = (moduleIndex, module) => {
  const number = moduleIndex + 1;
  const prefix = `m${String(number).padStart(2, "0")}`;
  const firstTopic = module.lessons[0][1][0];
  const practice = practices[moduleIndex];
  if (!practice) throw new Error(`Missing practice definition for chapter ${number}`);
  const milestone = number % 3 === 0;
  const finalProject = number === modules.length;
  const exercises = [
    {
      id: `${prefix}-concept-check`, type: "multipleChoice", title: `${module.title}: concept check`,
      instructionMarkdown: `Which study approach best demonstrates real understanding of **${firstTopic}**?`,
      choices: ["Memorize its spelling only", "Explain its contract, trace an example, and test a boundary case", "Use it everywhere without comparing alternatives"], correctChoice: 1,
      hints: ["Understanding includes behavior and tradeoffs, not only vocabulary."]
    },
    {
      id: `${prefix}-coding-practice`, type: "function", title: practice.title,
      instructionMarkdown: `Implement \`${practice.name}\`. ${practice.instruction} Explain which chapter concept the contract exercises before writing code, then check the public and boundary cases.`,
      starterFiles: [{ path: "Solution.java", content: `public class Solution {\n    public static ${practice.returns === "string" ? "String" : practice.returns === "int[]" ? "int[]" : practice.returns} ${practice.name}(${practice.parameters.map((parameter) => `${parameter.type === "string" ? "String" : parameter.type === "string[]" ? "String[]" : parameter.type} ${parameter.name}`).join(", ")}) {\n        ${practice.implementation}\n    }\n}\n` }],
      entrypoint: { kind: "function", className: "Solution", name: practice.name, parameters: practice.parameters, returns: practice.returns },
      tests: practice.tests.map((values, testIndex) => ({ id: `${prefix}-code-${testIndex + 1}`, visibility: testIndex === practice.tests.length - 1 ? "hidden" : "public", arguments: values.slice(0, practice.parameters.length), expected: values.at(-1) })),
      hints: [practice.hint, "Trace an empty, boundary, or invalid input before submitting."],
      limits: { timeoutMs: 3000, memoryMb: 256, maxOutputKb: 64 }
    },
    {
      id: `${prefix}-debug-practice`, type: "debug", title: `${module.title}: debugging practice`,
      instructionMarkdown: `Fix the program so it prints \`chapter-${number}-ready\`. Use the compiler message and the expected output as evidence; change only what is necessary.`,
      starterFiles: [{ path: "Main.java", content: `public class Main {\n    public static void main(String[] args) {\n        String status = "chapter-${number}-ready";\n        System.out.print("wrong-" + status);\n    }\n}\n` }],
      tests: [{ id: `${prefix}-debug-public`, visibility: "public", input: "", expected: `chapter-${number}-ready`, comparison: "exact" }],
      hints: ["Inspect the exact prefix added to status."], limits: { timeoutMs: 3000, memoryMb: 256, maxOutputKb: 64 }
    }
  ];
  if (milestone) exercises.push({
    id: `${prefix}-project-checkpoint`, type: "project", title: `${module.title}: portfolio checkpoint`,
    instructionMarkdown: `Create the chapter checkpoint entry point. It must print \`MILESTONE ${number / 3}: ${module.title}\`. Keep the program offline and use only the Java standard library.`,
    starterFiles: [{ path: "Milestone.java", content: `public class Milestone {\n    public static void main(String[] args) {\n        System.out.println("TODO");\n    }\n}\n` }],
    tests: [{ id: `${prefix}-project-public`, visibility: "public", input: "", expected: `MILESTONE ${number / 3}: ${module.title}`, comparison: "trimmed" }],
    hints: ["Match capitalization and punctuation exactly."], limits: { timeoutMs: 3000, memoryMb: 256, maxOutputKb: 64 }
  });
  if (finalProject) exercises.push({
    id: "java-complete-capstone", type: "project", title: "Complete Java portfolio capstone",
    instructionMarkdown: "Complete the multi-file study tracker so it records all 20 chapters and 277 requested topics, then prints `COMPLETE:20 chapters, 277 topics`. Keep the domain state inside `StudyTracker`; `Main` should only construct the object and display its summary. Extend this starter into a local portfolio application by applying collections, validation, file persistence, tests, logging, JDBC, architecture patterns, concurrency, and JSON concepts from the curriculum.",
    starterFiles: [
      { path: "Main.java", content: "public class Main {\n    public static void main(String[] args) {\n        StudyTracker tracker = new StudyTracker(0, 0);\n        System.out.println(tracker.summary());\n    }\n}\n" },
      { path: "StudyTracker.java", content: "public final class StudyTracker {\n    private final int chapters;\n    private final int topics;\n\n    public StudyTracker(int chapters, int topics) {\n        this.chapters = chapters;\n        this.topics = topics;\n    }\n\n    public String summary() {\n        return \"TODO\";\n    }\n}\n" }
    ],
    tests: [{ id: "java-capstone-public", visibility: "public", input: "", expected: "COMPLETE:20 chapters, 277 topics", comparison: "trimmed" }],
    hints: ["Pass the completed curriculum counts into the domain object.", "Keep the exact output format in StudyTracker.summary()."], limits: { timeoutMs: 3000, memoryMb: 256, maxOutputKb: 64 }
  });
  return { id: `${prefix}-assessment`, title: `Chapter ${number} assessment and deliberate practice`, theoryMarkdown: `# Chapter ${number} assessment\n\nYou have completed the reading sequence for **${module.title}**. Before attempting the tasks, explain the chapter's main contracts aloud, reproduce one worked example without copying, and list two boundary cases.\n\nThe concept check tests understanding, the coding task tests a precise executable contract, and the debugging task asks you to use evidence rather than random edits.${milestone ? " The portfolio checkpoint records cumulative progress at the end of this three-chapter block." : ""}${finalProject ? " The final capstone gives you a multi-file base for integrating the complete curriculum." : ""}`, exercises };
};

await rm(contentRoot, { recursive: true, force: true });
await rm(projectRoot, { recursive: true, force: true });
await mkdir(contentRoot, { recursive: true });
await mkdir(projectRoot, { recursive: true });

const modulePaths = [];
for (const [moduleIndex, module] of modules.entries()) {
  const number = String(moduleIndex + 1).padStart(2, "0");
  const path = `content/module-${number}-${slug(module.title)}.json`;
  modulePaths.push(path);
  const lessons = module.lessons.map(([title, topics], lessonIndex) => ({
    id: `m${number}-l${String(lessonIndex + 1).padStart(2, "0")}-${slug(title)}`,
    title,
    theoryMarkdown: theory(module.title, title, topics, module.description),
    exercises: []
  }));
  lessons.push(assessment(moduleIndex, module));
  const output = { id: `module-${number}-${slug(module.title)}`, title: `Chapter ${moduleIndex + 1}: ${module.title}`, description: module.description, lessons };
  await writeFile(resolve(root, path), `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

const projects = [];
for (let milestone = 1; milestone <= 6; milestone += 1) {
  const endChapter = milestone * 3;
  const startChapter = endChapter - 2;
  const path = `projects/milestone-${milestone}.json`;
  projects.push(path);
  const included = modules.slice(startChapter - 1, endChapter).map((module) => module.title);
  await writeFile(resolve(root, path), `${JSON.stringify({
    id: `milestone-${milestone}`,
    title: `Milestone ${milestone}: Chapters ${startChapter}-${endChapter}`,
    descriptionMarkdown: `Consolidate **${included.join("**, **")}** in a small offline Java program. Review the reading lessons, complete each chapter assessment, and use the checkpoint as a clean, explainable portfolio snapshot.`,
    learningObjectives: included.map((title) => `Apply and explain the key contracts from ${title}`),
    checkpointExerciseIds: [`m${String(endChapter).padStart(2, "0")}-project-checkpoint`]
  }, null, 2)}\n`, "utf8");
}

projects.push("projects/final-capstone.json");
await writeFile(resolve(projectRoot, "final-capstone.json"), `${JSON.stringify({
  id: "complete-java-capstone",
  title: "Complete Java 21 portfolio capstone",
  descriptionMarkdown: "Integrate the complete theory-first curriculum in a local Java application. Begin with the validated multi-file checkpoint, then evolve it with clear domain modeling, collections and algorithms, durable file and JDBC storage, structured logging, automated tests, concurrency where justified, an architectural pattern you can defend, and a documented JSON boundary.",
  learningObjectives: [
    "Combine language fundamentals, object-oriented design, collections, streams, and error handling",
    "Use tests, diagnostics, persistence, concurrency, architecture, and serialization deliberately",
    "Explain the contracts, tradeoffs, security boundaries, and failure behavior of the finished application"
  ],
  checkpointExerciseIds: ["java-complete-capstone"]
}, null, 2)}\n`, "utf8");

const lessonCount = modules.reduce((total, module) => total + module.lessons.length + 1, 0);
await writeFile(resolve(root, "manifest.json"), `${JSON.stringify({
  format: "learnpack",
  schemaVersion: "1.0.0",
  id: "complete-java-21-curriculum",
  version: "2.0.0",
  course: {
    title: "Complete Java 21: From First Program to Architecture",
    description: `A theory-first Java curriculum with ${modules.length} detailed chapters and ${lessonCount} focused lessons, progressing from first principles through concurrency, streams, reflection, testing, JDBC, architecture, networking, and JSON. Assessments follow teaching rather than replacing it.`,
    language: "java",
    languageVersion: "21",
    fileExtension: "java",
    level: "beginner",
    estimatedHours: 140,
    authors: [{ name: "LearnLocal curriculum team" }]
  },
  runtime: { adapter: "java", adapterRange: ">=0.1.0 <2.0.0", runtimeVersion: "21", containerRequirements: "Java 21 JDK with the standard library" },
  modules: modulePaths,
  projects
}, null, 2)}\n`, "utf8");

console.log(`Generated ${modules.length} chapters and ${lessonCount} lessons in ${root}.`);
