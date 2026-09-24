# Boot auto-configuration, properties, profiles, validation, and startup

Spring Boot's defining feature is **auto-configuration**: it inspects what is on your classpath and what beans you have already declared, and configures sensible defaults for everything else, so that adding a single dependency (a database driver, say) can be enough to get a working, connected `DataSource` bean with no XML and minimal explicit configuration. This lesson demystifies that "magic" as conditional logic you can read and predict, then covers the property and profile system that lets the same code run correctly across development, testing, and production with different configuration — and why validating that configuration at startup, not on first use, is the deliberate, correct default.

What you will learn:

- What auto-configuration actually is: conditional bean registration, not magic
- How to read and reason about `@ConditionalOnClass`/`@ConditionalOnMissingBean` style conditions
- The property source precedence order: command line, environment variables, `application.yml`, defaults
- Profiles: activating different beans and property values for different environments
- `@ConfigurationProperties` and validated, type-safe configuration binding
- Why failing fast on bad configuration at startup is the correct default, not an inconvenience

## Auto-configuration is conditional logic, not magic

An **auto-configuration class** in Spring Boot is an ordinary `@Configuration` class, annotated with conditions that decide, at startup, whether each of its `@Bean` methods should actually run:

```java
@Configuration
@ConditionalOnClass(DataSource.class)          // only applies if a JDBC DataSource class is on the classpath
public class DataSourceAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(DataSource.class) // only applies if YOU have not already declared your own DataSource bean
    public DataSource dataSource(DataSourceProperties properties) {
        return properties.initializeDataSourceBuilder().build();
    }
}
```

`@ConditionalOnClass` means "only register this configuration if a specific class is present on the classpath" — precisely why adding the PostgreSQL driver dependency alone is enough to make Spring Boot's `DataSource` auto-configuration activate at all, since without that dependency, the condition fails and nothing is auto-configured. `@ConditionalOnMissingBean` means "only register this default if the application has not already declared its own bean of this type" — this is the mechanism that lets you override any auto-configured default simply by declaring your own `@Bean` of the same type: your explicit bean wins, and the auto-configuration's condition sees it and steps aside entirely. Understanding auto-configuration as ordinary, readable conditional logic — not an opaque framework decision — is what turns "why did Spring create this bean, or why didn't it" from a mystery into a question you can answer by reading the relevant `@Conditional...` annotations directly.

## Property source precedence: which value actually wins

Spring resolves a given property key from multiple possible sources, in a fixed precedence order — understanding this order is essential for predicting which value actually takes effect when the same key is set in more than one place:

```text
Highest to lowest precedence (a partial, commonly relevant order):
1. Command-line arguments (--server.port=8081)
2. Environment variables (SERVER_PORT=8081)
3. Profile-specific application-{profile}.yml / .properties
4. application.yml / application.properties (the base file)
5. @PropertySource-annotated classes
6. Default values built into Spring Boot itself
```

```yaml
# application.yml (base configuration, applies unless overridden)
server:
  port: 8080

# application-production.yml (only applies when the "production" profile is active)
server:
  port: 443
```

If `SERVER_PORT=9000` is set as an environment variable, it wins over both YAML files regardless of which profile is active, because environment variables sit higher in the precedence order — this is exactly why deployment tooling commonly sets environment-specific overrides (a container's exposed port, a database URL differing per environment) via environment variables rather than editing the checked-in YAML files: it lets the same built artifact (per Chapter 16's "build once, promote the same artifact" principle) run correctly in every environment, with environment-specific values supplied externally rather than baked into different builds.

## Profiles: different beans and values for different environments

A **profile** is a named configuration variant, activated by setting `spring.profiles.active` (via any of the property sources above), that lets both property *values* and entire *beans* differ by environment:

```java
@Configuration
public class MessagingConfiguration {

    @Bean
    @Profile("production")
    public MessageSender productionMessageSender() {
        return new SqsMessageSender(); // the real, external message queue
    }

    @Bean
    @Profile("test")
    public MessageSender testMessageSender() {
        return new InMemoryMessageSender(); // an in-memory fake, per Chapter 20's testability discipline
    }
}
```

This is precisely Chapter 20's hexagonal-architecture "swap the real adapter for an in-memory one in tests" pattern, applied at the framework level: running with `spring.profiles.active=test` wires the application against `InMemoryMessageSender` automatically, with zero code changes needed elsewhere, while `spring.profiles.active=production` wires the genuine `SqsMessageSender` — the exact same application code, `OrderService` and everything it depends on through its own interfaces, runs unmodified against either. Profiles let this environment-specific wiring live as declarative configuration, rather than as scattered `if (isProduction)` conditionals throughout otherwise environment-agnostic business logic.

## @ConfigurationProperties: validated, type-safe configuration binding

Beyond individual `@Value("${some.property}")` injections, Spring Boot supports binding a whole group of related properties into a single, typed, validated object:

```java
@ConfigurationProperties(prefix = "payment-gateway")
@Validated
public class PaymentGatewayProperties {

    @NotBlank
    private String apiKey;

    @Positive
    private int timeoutSeconds;

    // getters and setters omitted for brevity
}
```

```yaml
payment-gateway:
  api-key: "sk_live_..."
  timeout-seconds: 10
```

This combines Bean Validation (the same `@NotBlank`/`@Positive` annotations the next lesson applies to HTTP request DTOs) with configuration binding, meaning a missing `api-key` or a `timeout-seconds` of `0` or `-5` is caught by the exact same validated-shape discipline the next lesson applies to untrusted request bodies — just applied here to configuration values, which are just as capable of being wrong (a typo'd YAML key, a missing environment variable in a new deployment environment) as any other externally-supplied input.

## Failing fast at startup: the correct default, not an inconvenience

This chapter's concept-check question makes the point directly: validating bound configuration **at startup** — rather than waiting until the first request that happens to use the misconfigured value — exists specifically so that **bad required values fail before serving requests**, not after. Compare the two outcomes for a misconfigured `timeout-seconds: 0`:

```text
WITHOUT startup validation:
  - Application starts successfully, appears healthy.
  - Serves requests normally for anything not touching payment processing.
  - The FIRST request that actually calls the payment gateway either hangs
    (a zero timeout misinterpreted as "no timeout" by some clients) or fails
    with a confusing, deep-stack-trace error, discovered by a real user,
    possibly hours or days after the bad deploy.

WITH startup validation (@Validated on @ConfigurationProperties):
  - The application FAILS TO START AT ALL, immediately, with a clear error
    message naming exactly which property failed which constraint:
    "timeoutSeconds: must be greater than 0"
  - The bad deploy is caught in seconds, by the deployment process itself,
    before a single real request is ever served.
```

A service that starts successfully with broken configuration and only reveals the problem the first time a specific code path is exercised has traded an immediate, clear, deployment-time failure for a delayed, confusing, production-time one — exactly backwards from what a well-designed system should do. Startup validation is the deliberate application of "fail fast, fail loud, fail early" to configuration specifically, turning what would otherwise be a runtime surprise into a deployment-time gate no request ever needs to be sacrificed to discover.

## What happens under the hood: from a classpath scan to a fully configured application

1. On startup, Spring Boot scans the classpath and evaluates every auto-configuration class's `@Conditional...` annotations against what is actually present — which dependencies are on the classpath, which beans the application has already explicitly declared — determining which auto-configurations actually activate for this specific application.
2. Property sources are read and merged according to the fixed precedence order (command line, environment variables, profile-specific files, base files, defaults), producing a single resolved value for every property key an active bean or `@ConfigurationProperties` class references.
3. Any active profile's `@Profile`-annotated beans are included in (or excluded from) the container's bean registry, alongside every profile-independent bean, before any bean is actually constructed.
4. `@ConfigurationProperties` classes are instantiated and populated from the resolved property values, and — where `@Validated` is present — checked against their declared Bean Validation constraints immediately as part of this binding step.
5. If any required, validated configuration value fails its constraint, the container's startup fails immediately with a descriptive error identifying the specific property and constraint violated, before any bean depending on that configuration (and, transitively, before the entire application) ever becomes available to serve a single request.

## Common mistakes

**Mistake 1: assuming auto-configuration is an opaque, unpredictable framework decision rather than readable conditional logic.** This makes debugging "why didn't my bean get auto-configured" feel like guesswork rather than a specific, answerable question. Fix: read the relevant auto-configuration class's `@ConditionalOnClass`/`@ConditionalOnMissingBean` annotations directly to understand exactly why a bean was or was not created.

**Mistake 2: editing checked-in YAML files per environment instead of using environment-specific overrides (environment variables, profile-specific files).** This ties a specific build artifact to a specific environment's values, undermining Chapter 16's build-once-promote-the-same-artifact principle. Fix: supply environment-specific values externally (environment variables, or a profile activated per environment), keeping the built artifact itself environment-agnostic.

**Mistake 3: using scattered `if (isProduction)`-style conditionals in business logic instead of profile-specific bean declarations.** This mixes environment-specific wiring concerns into otherwise environment-agnostic code. Fix: declare environment-specific beans behind `@Profile`, keeping business logic itself unaware of which environment it is running in.

**Mistake 4: skipping validation on bound configuration, allowing a misconfigured required value to be discovered only when a specific code path first uses it.** This delays a deployment-time problem into a confusing, delayed, production-time failure. Fix: apply `@Validated` (with appropriate Bean Validation constraints) to every `@ConfigurationProperties` class carrying required or bounded values.

## Best practices

- Read auto-configuration's `@Conditional...` annotations directly when debugging why a bean was or was not created, rather than guessing.
- Supply environment-specific configuration values externally (environment variables, profile-specific files) rather than baking them into different builds of the same artifact.
- Use `@Profile`-annotated beans to vary wiring by environment, keeping business logic itself environment-agnostic.
- Validate every `@ConfigurationProperties` class carrying required or bounded values with `@Validated` and appropriate Bean Validation constraints.
- Treat a startup failure due to bad configuration as the correct, desired outcome — a clear, immediate signal, not an inconvenience to work around.

## Summary

- Auto-configuration is ordinary, readable conditional bean registration (`@ConditionalOnClass`, `@ConditionalOnMissingBean`), not opaque magic — your own explicit bean declarations always take precedence.
- Property sources resolve in a fixed precedence order (command line, environment variables, profile-specific files, base files, defaults), which determines which value wins when the same key is set in more than one place.
- Profiles let both property values and entire beans vary by environment, keeping business logic itself environment-agnostic while wiring differs declaratively.
- `@ConfigurationProperties` binds a group of related properties into a typed, validated object, applying the same Bean Validation discipline used for HTTP DTOs to configuration values.
- Validating configuration at startup, rather than on first use, is the deliberate correct default: it turns a bad deploy into an immediate, clear failure instead of a delayed, confusing production surprise.

## Practice

1. **Warm-up:** For a bean guarded by `@ConditionalOnMissingBean`, explain exactly what happens if the application declares its own bean of the same type — does the auto-configured default still run?
2. **Warm-up:** A property is set in both `application.yml` and as an environment variable, with different values. Explain which one actually takes effect and why.
3. **Core:** Declare a `@ConfigurationProperties` class with at least two validated fields, bind it from a YAML file with an intentionally invalid value, and confirm the application fails to start with a clear error naming the specific violated constraint.
4. **Core:** Configure two profile-specific beans implementing the same interface (a real implementation and an in-memory test double), and demonstrate switching between them purely by changing which profile is active.
5. **Challenge:** Write a small custom auto-configuration class with your own `@ConditionalOnClass` and `@ConditionalOnMissingBean` conditions, and demonstrate it activating or not activating depending on whether a specific dependency is present and whether the application has already declared its own bean.

## Check your understanding

1. What does `@ConditionalOnClass` actually check, and how does it explain why adding a single dependency can enable an entire auto-configuration?
2. What happens when your application declares its own bean of a type an auto-configuration also tries to provide via `@ConditionalOnMissingBean`?
3. In what order does Spring resolve a property set in both an environment variable and a YAML file, and which one wins?
4. Why do profile-specific beans keep business logic itself environment-agnostic, compared to scattered `if (isProduction)` conditionals?
5. Why does `@Validated` on a `@ConfigurationProperties` class matter specifically for values that are required or must fall within a valid range?
6. Why is a startup failure due to bad configuration a better outcome than an application that starts successfully but fails on the first request that uses the bad value?
