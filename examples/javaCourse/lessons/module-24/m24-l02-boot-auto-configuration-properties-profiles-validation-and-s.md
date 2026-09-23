# Boot auto-configuration, properties, profiles, validation, and startup

## Auto-configuration is conditional wiring
Spring Boot chooses configuration based on the classpath, properties, existing beans, and other conditions. It does not remove the need to understand what was created. Inspect startup diagnostics and configuration reports when behavior differs from expectations.
```java
@org.springframework.boot.context.properties.ConfigurationProperties("client")
record ClientSettings(java.net.URI baseUri, java.time.Duration timeout) {
    ClientSettings {
        if (timeout == null || timeout.isZero() || timeout.isNegative())
            throw new IllegalArgumentException("positive timeout required");
    }
}
```
Register configuration properties through the supported scanning or enabling mechanism. This is an external Spring Boot fragment, not a standard-library exercise.

## Configuration precedence
Files, environment, command-line input, and test overrides have defined precedence in the selected Boot version. Profiles group configurations but should not conceal incompatible schemas or secrets. Bind related settings into typed values and validate at startup.

## Practice
Override a timeout through a test configuration and verify the effective value. Make the value invalid and require startup to fail with a useful message. Record the chosen Boot version and Java 21 compatibility. Keep credentials outside packaged defaults and redact them from configuration diagnostics.
