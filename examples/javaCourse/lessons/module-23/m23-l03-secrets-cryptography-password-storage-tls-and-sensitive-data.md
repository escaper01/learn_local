# Secrets, cryptography, password storage, TLS, and sensitive data

Every production service handles secrets: database passwords, API keys, signing keys, session tokens, and the passwords of its users. It also handles sensitive data such as email addresses, payment details, and health information. Mishandling any of these produces the breaches you read about: credentials committed to a public repository, password databases cracked within hours because they used a fast hash, API keys printed in logs shipped to a third-party vendor, or a client that silently accepted any TLS certificate.

The good news is that you almost never need to invent anything. The JDK and well-maintained libraries provide the right tools. Your job is to choose the right tool for each problem, use it correctly, and keep secrets out of places they do not belong.

## What you will learn

- The lifecycle of a secret: provisioning, storage, access, rotation, revocation, and redaction
- The difference between hashing, encryption, encoding, and signing
- Why passwords need a deliberately slow, salted password-hashing algorithm, and which ones to use
- How to generate secure tokens with `SecureRandom`
- How to encrypt data with authenticated encryption (AES-GCM) and why nonces must not repeat
- What TLS protects, and how "trust all certificates" code destroys that protection
- How to keep secrets and sensitive data out of logs, exceptions, and `toString`

## Secrets have a lifecycle

A secret is not just a string; it is a credential with a life. Think of it as a physical key to a building: someone cuts it, hands it to the right people, stores it safely, changes the lock when an employee leaves, and replaces it immediately if it is lost.

| Stage | Question to answer | Good practice |
|---|---|---|
| Provisioning | Who creates it and how does it reach the app? | Secret manager (Vault, cloud secret services), injected at deploy time |
| Storage | Where does it live at rest? | Secret manager or encrypted store, never in Git, images, or JARs |
| Access | Who and what can read it? | Only the service account that needs it; audited access |
| Use | Where does it appear at runtime? | In memory only; never in URLs, logs, exception messages, or metrics labels |
| Rotation | How is it replaced routinely? | Support two valid values during a rollover window |
| Revocation | What happens when it leaks? | Documented procedure: revoke, rotate, audit usage, notify |

Environment variables are a common *delivery mechanism*, but they are not magic. They can be printed by diagnostics endpoints, inherited by child processes, and dumped in crash reports. Treat the value the same way wherever it arrives from.

> **Warning:** Deleting a committed secret in a later commit does not remove it. It remains in Git history and in every clone. Treat any secret that reached a repository as leaked: revoke and rotate it.

## Hashing, encryption, encoding, and signing

Beginners often mix these up. They solve different problems.

| Operation | Reversible? | Needs a key? | Purpose | Java example |
|---|---|---|---|---|
| Encoding | Yes, by anyone | No | Represent bytes as text | `Base64`, `HexFormat` |
| Hashing | No | No | Fingerprint data; detect changes | `MessageDigest.getInstance("SHA-256")` |
| Password hashing | No | No (uses a salt) | Store verifiers for human passwords, slowly | `PBKDF2WithHmacSHA256`, bcrypt, scrypt, Argon2 |
| Encryption | Yes, with the key | Yes | Confidentiality | `Cipher` with `AES/GCM/NoPadding` |
| MAC | No | Yes (shared) | Integrity and authenticity between parties sharing a key | `Mac.getInstance("HmacSHA256")` |
| Digital signature | No | Yes (key pair) | Integrity and authenticity verifiable with a public key | `Signature.getInstance("Ed25519")` |

Base64 is *not* encryption: anyone can decode it. A plain hash is *not* a password store. Encryption without authentication lets an attacker modify ciphertext undetected.

## Password storage

### Why a fast hash fails

When a database of password hashes is stolen, the attacker runs an offline guessing attack: take a candidate password, hash it, compare. The only thing that slows them down is how expensive each guess is.

General-purpose hashes like SHA-256 are designed to be *fast*. Modern GPUs compute billions of SHA-256 hashes per second. Human-chosen passwords come from a small, predictable space (dictionary words, names, leaked-password lists, common patterns). A fast hash lets an attacker try that entire space very quickly.

A random **salt** (unique per user) is necessary: it prevents precomputed tables and ensures two users with the same password get different hashes, so the attacker must attack each hash separately. But a salt does not make each guess more expensive. Salted SHA-256 is still billions of guesses per second per hash.

A **password-hashing algorithm** adds a tunable *work factor* (and, for scrypt and Argon2, memory hardness) so each guess costs milliseconds and, ideally, lots of memory. That turns "hours" into "centuries" for reasonable passwords.

| Algorithm | Status for password storage | Notes |
|---|---|---|
| MD5, SHA-1 | Never | Fast and cryptographically broken |
| SHA-256, SHA-512 (plain or salted) | Never | Fast general-purpose hashes |
| PBKDF2-HMAC-SHA256 | Acceptable | In the JDK; use a high iteration count (OWASP currently suggests 600,000) |
| bcrypt | Good | Widely supported; work factor of at least 10; input limited to 72 bytes |
| scrypt | Good | Memory-hard |
| Argon2id | Preferred for new systems | Memory-hard; winner of the Password Hashing Competition |

### A complete PBKDF2 example

PBKDF2 is available in the JDK with no extra libraries, which makes it a good teaching example. In real projects, prefer a maintained library API such as Spring Security's `PasswordEncoder` implementations.

```java
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.spec.KeySpec;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

public class PasswordHashDemo {
    private static final int ITERATIONS = 600_000;   // current OWASP guidance for PBKDF2-HMAC-SHA256
    private static final int SALT_BYTES = 16;
    private static final int KEY_BITS = 256;
    private static final SecureRandom RANDOM = new SecureRandom();

    public static void main(String[] args) throws Exception {
        char[] password = "correct horse battery staple".toCharArray();

        String stored1 = hash(password);
        String stored2 = hash(password);
        System.out.println("format:                  " + stored1.substring(0, stored1.indexOf('$', 15)) + "$...");
        System.out.println("same password, same hash? " + stored1.equals(stored2));
        System.out.println("verify correct password: " + verify("correct horse battery staple".toCharArray(), stored1));
        System.out.println("verify wrong password:   " + verify("correct horse battery stapler".toCharArray(), stored1));

        // How much work does an attacker do per guess?
        long start = System.nanoTime();
        hash(password);
        long pbkdf2Nanos = System.nanoTime() - start;

        MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
        byte[] guess = "guess".getBytes(StandardCharsets.UTF_8);
        long count = 0;
        start = System.nanoTime();
        while (System.nanoTime() - start < pbkdf2Nanos) {
            sha256.digest(guess);
            count++;
        }
        System.out.println("plain SHA-256 guesses in the time of one PBKDF2 guess > 10,000? " + (count > 10_000));
        Arrays.fill(password, '\0');
    }

    static String hash(char[] password) throws Exception {
        byte[] salt = new byte[SALT_BYTES];
        RANDOM.nextBytes(salt);
        byte[] derived = pbkdf2(password, salt, ITERATIONS);
        Base64.Encoder b64 = Base64.getEncoder().withoutPadding();
        return "pbkdf2-sha256$" + ITERATIONS + "$" + b64.encodeToString(salt) + "$" + b64.encodeToString(derived);
    }

    static boolean verify(char[] candidate, String stored) throws Exception {
        String[] parts = stored.split("\\$");
        int iterations = Integer.parseInt(parts[1]);
        byte[] salt = Base64.getDecoder().decode(parts[2]);
        byte[] expected = Base64.getDecoder().decode(parts[3]);
        byte[] actual = pbkdf2(candidate, salt, iterations);
        return MessageDigest.isEqual(expected, actual); // constant-time comparison
    }

    static byte[] pbkdf2(char[] password, byte[] salt, int iterations) throws Exception {
        KeySpec spec = new PBEKeySpec(password, salt, iterations, KEY_BITS);
        SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
        return factory.generateSecret(spec).getEncoded();
    }
}
```

Output:

```text
format:                  pbkdf2-sha256$600000$...
same password, same hash? false
verify correct password: true
verify wrong password:   false
plain SHA-256 guesses in the time of one PBKDF2 guess > 10,000? true
```

Points to notice:

- The stored string records the algorithm, the iteration count, and the salt. That lets you raise the work factor later: verify with the old parameters, then rehash with the new ones on the user's next successful login.
- The same password hashes differently each time because of the random salt.
- `MessageDigest.isEqual` compares in constant time, so response timing does not leak how many bytes matched.
- The timing comparison is the heart of the matter: in the time the slow algorithm checks one guess, a plain SHA-256 loop checks tens of thousands or more (on a GPU the gap is far larger). That is exactly the attacker's advantage you are removing.

### With Spring Security

In a Spring Boot application, add `spring-boot-starter-security` and use a `PasswordEncoder`. This fragment requires that dependency.

```java
@Bean
PasswordEncoder passwordEncoder() {
    // Stores hashes like "{bcrypt}$2a$10$..." so the algorithm can be upgraded later.
    return PasswordEncoderFactories.createDelegatingPasswordEncoder();
}

// Registration
String stored = passwordEncoder.encode(rawPassword);

// Login
boolean ok = passwordEncoder.matches(rawPassword, stored);
```

`Argon2PasswordEncoder`, `SCryptPasswordEncoder`, `BCryptPasswordEncoder`, and `Pbkdf2PasswordEncoder` are also available; Argon2 and scrypt need the Bouncy Castle library on the classpath.

## Secure random tokens

Session IDs, password-reset links, API keys, and CSRF tokens must be unpredictable. `java.util.Random` and `Math.random()` are *predictable*: observing a few outputs lets an attacker compute the rest. Always use `java.security.SecureRandom`.

```java
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

public class TokenAndSecretDemo {
    private static final SecureRandom RANDOM = new SecureRandom();

    public static void main(String[] args) throws Exception {
        // 1. Generate an API token: 32 random bytes = 256 bits of entropy.
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        System.out.println("token length (chars): " + token.length());

        // 2. Store only a digest of the token. A fast hash is acceptable here because
        //    the token is long and random, unlike a human-chosen password.
        String storedDigest = sha256Hex(token);
        System.out.println("stored digest length: " + storedDigest.length());
        System.out.println("presented token valid: " + matches(token, storedDigest));
        System.out.println("guessed token valid:   " + matches("not-the-token", storedDigest));

        // 3. Keep secrets out of toString, logs, and exception messages.
        LeakyConfig leaky = new LeakyConfig("jdbc:postgresql://db/tasks", "app", "s3cr3t-pa55");
        SafeConfig safe = new SafeConfig("jdbc:postgresql://db/tasks", "app", "s3cr3t-pa55".toCharArray());
        System.out.println("leaky: " + leaky);
        System.out.println("safe:  " + safe);

        // 4. Fail fast, without echoing values, when a required secret is missing.
        try {
            requireSecret("TASKS_SIGNING_KEY");
        } catch (IllegalStateException e) {
            System.out.println("startup error: " + e.getMessage());
        }
    }

    static String sha256Hex(String value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(digest);
    }

    static boolean matches(String presented, String storedHex) throws Exception {
        byte[] a = HexFormat.of().parseHex(sha256Hex(presented));
        byte[] b = HexFormat.of().parseHex(storedHex);
        return MessageDigest.isEqual(a, b);
    }

    static String requireSecret(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("required secret " + name + " is not configured");
        }
        return value;
    }
}

record LeakyConfig(String url, String user, String password) {}

record SafeConfig(String url, String user, char[] password) {
    @Override
    public String toString() {
        return "SafeConfig[url=" + url + ", user=" + user + ", password=<redacted>]";
    }
}
```

Output:

```text
token length (chars): 43
stored digest length: 64
presented token valid: true
guessed token valid:   false
leaky: LeakyConfig[url=jdbc:postgresql://db/tasks, user=app, password=s3cr3t-pa55]
safe:  SafeConfig[url=jdbc:postgresql://db/tasks, user=app, password=<redacted>]
startup error: required secret TASKS_SIGNING_KEY is not configured
```

Why is a fast SHA-256 acceptable for the API token when it was unacceptable for passwords? Because the token has 256 bits of randomness. Guessing it is hopeless no matter how fast the hash is. Passwords are weak because *humans* choose them; the slow hash compensates for that weakness. Storing only the digest means a database leak does not hand out working tokens.

Notice also the record trap: a record's generated `toString` prints *every* component, so a record holding a password leaks it the first time someone logs the object. Override `toString`, or better, do not put raw secrets in general-purpose objects at all.

## Authenticated encryption with AES-GCM

When you must store data you can read back later (for example, a third-party API key or a bank account number), you encrypt it. Use an *authenticated* mode: AES-GCM provides both confidentiality and integrity, so any modification of the ciphertext is detected on decryption.

```java
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class AesGcmDemo {
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    public static void main(String[] args) throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        SecretKey key = generator.generateKey();   // in production: from a key management service

        byte[] plaintext = "IBAN DE89 3704 0044 0532 0130 00".getBytes(StandardCharsets.UTF_8);
        byte[] context = "task:42".getBytes(StandardCharsets.UTF_8); // associated data, not secret

        Sealed sealed = encrypt(key, plaintext, context);
        System.out.println("plaintext bytes:  " + plaintext.length);
        System.out.println("nonce bytes:      " + sealed.nonce().length);
        System.out.println("ciphertext bytes: " + sealed.ciphertext().length + " (includes 16-byte tag)");
        System.out.println("decrypted:        " + new String(decrypt(key, sealed, context), StandardCharsets.UTF_8));

        byte[] tampered = sealed.ciphertext().clone();
        tampered[0] ^= 1; // flip one bit
        tryDecrypt("tampered ciphertext", key, new Sealed(sealed.nonce(), tampered), context);
        tryDecrypt("wrong context", key, sealed, "task:43".getBytes(StandardCharsets.UTF_8));

        Sealed again = encrypt(key, plaintext, context);
        System.out.println("fresh nonce each time? " + !java.util.Arrays.equals(sealed.nonce(), again.nonce()));
    }

    static Sealed encrypt(SecretKey key, byte[] plaintext, byte[] aad) throws Exception {
        byte[] nonce = new byte[NONCE_BYTES];
        RANDOM.nextBytes(nonce); // never reuse a nonce with the same key
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
        cipher.updateAAD(aad);
        return new Sealed(nonce, cipher.doFinal(plaintext));
    }

    static byte[] decrypt(SecretKey key, Sealed sealed, byte[] aad) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, sealed.nonce()));
        cipher.updateAAD(aad);
        return cipher.doFinal(sealed.ciphertext());
    }

    static void tryDecrypt(String label, SecretKey key, Sealed sealed, byte[] aad) throws Exception {
        try {
            decrypt(key, sealed, aad);
            System.out.println(label + ": decrypted (unexpected)");
        } catch (AEADBadTagException e) {
            System.out.println(label + ": rejected, authentication tag mismatch");
        }
    }
}

record Sealed(byte[] nonce, byte[] ciphertext) {}
```

Output:

```text
plaintext bytes:  32
nonce bytes:      12
ciphertext bytes: 48 (includes 16-byte tag)
decrypted:        IBAN DE89 3704 0044 0532 0130 00
tampered ciphertext: rejected, authentication tag mismatch
wrong context: rejected, authentication tag mismatch
fresh nonce each time? true
```

Rules for this code in real life:

- **Never reuse a nonce with the same key.** GCM nonce reuse can reveal plaintext relationships and let attackers forge messages. A random 12-byte nonce per message is standard; store it next to the ciphertext (it is not secret).
- **Associated data** (here `task:42`) binds the ciphertext to its context, so an attacker cannot copy an encrypted value from one row to another.
- **Keys** come from a key management service or hardware module, not from source code. Plan key rotation by storing a key ID with each ciphertext.
- Avoid `AES/ECB` (the default if you write just `"AES"` with some providers) and unauthenticated `AES/CBC` for new designs.

> **Note:** Encryption at rest protects against stolen disks and backups. It does *not* protect against an attacker who compromises the running application, because the application holds the key and decrypts on demand. Authorization and injection defenses still matter.

## TLS: encryption in transit

TLS does two jobs: it *encrypts* traffic, and it *authenticates* the server through its certificate, which is checked against trusted certificate authorities and the expected hostname. Without the second job, the first is nearly worthless: an attacker in the middle can present their own certificate, decrypt everything, and re-encrypt it to the real server.

Java's `HttpClient` verifies certificates and hostnames by default. The dangerous code is the "fix" developers paste when they hit a certificate error in a test environment:

```java
// WRONG: disables server authentication entirely. Never ship this.
TrustManager[] trustAll = { new X509TrustManager() {
    public void checkClientTrusted(X509Certificate[] chain, String authType) {}
    public void checkServerTrusted(X509Certificate[] chain, String authType) {}
    public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
}};
SSLContext context = SSLContext.getInstance("TLS");
context.init(null, trustAll, new SecureRandom());
```

**Fix:** keep default verification. For an internal certificate authority, add that CA to a dedicated trust store and load it; do not disable checks.

```java
// Default client: verifies certificate chain and hostname, prefers modern TLS versions.
HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build();
```

Also: redirect HTTP to HTTPS, set `Strict-Transport-Security` on web responses, keep the JDK updated so that weak protocols and cipher suites stay disabled, and never send credentials over plain HTTP, even inside a data center.

## Sensitive data beyond secrets

Personal data (emails, addresses, dates of birth), financial data, and health data need handling rules too:

- **Minimize:** do not collect or keep fields you do not need. Data you never stored cannot leak.
- **Classify:** label fields (public, internal, confidential, secret) so reviewers know which rules apply.
- **Omit from logs:** log IDs, not contents. Logging the last few characters of an identifier can help support staff, but credentials should simply be omitted.
- **Keep out of URLs:** query strings end up in browser history, proxy logs, and `Referer` headers. Tokens belong in headers or bodies.
- **Response DTOs:** never serialize entities that contain password hashes or internal notes.
- **Error messages:** say "invalid credentials", not "password for alice@example.com was wrong"; never include SQL, stack traces, or configuration values.
- **Retention:** delete data on schedule; backups count too.

## What happens under the hood: a login request

1. The browser sends the password inside a TLS connection whose server certificate it verified.
2. The server looks up the user record (with a bound SQL parameter) and reads the stored `algorithm$params$salt$hash` string.
3. It recomputes the password hash with the stored salt and parameters, taking tens to hundreds of milliseconds by design.
4. It compares the result in constant time.
5. On success it generates a session token with `SecureRandom`, stores only its digest server-side (or signs it), and returns it in a `Secure; HttpOnly; SameSite` cookie.
6. If the stored parameters are outdated, it rehashes the password with current parameters now that it knows the plaintext.
7. It logs `login succeeded user_id=812`, never the password, the token, or the hash.

## Common mistakes

### Mistake 1: hashing passwords with a general-purpose digest

```java
// WRONG: fast, and unsalted
String stored = HexFormat.of().formatHex(
        MessageDigest.getInstance("SHA-256").digest(password.getBytes(UTF_8)));
```

Adding a salt still leaves each guess cheap. **Fix:** a dedicated password-hashing algorithm (Argon2id, bcrypt, scrypt, or PBKDF2 with a high iteration count) through a maintained API.

### Mistake 2: using `Random` for tokens

```java
String resetToken = Long.toHexString(new Random().nextLong()); // WRONG: predictable
```

**Fix:** `SecureRandom` with at least 128 bits (preferably 256) of output.

### Mistake 3: secrets in source or configuration committed to Git

```yaml
spring:
  datasource:
    password: s3cr3t-pa55   # WRONG: now in every clone forever
```

**Fix:** reference an externally provided value such as `${TASKS_DB_PASSWORD}`, supplied by a secret manager at deploy time, and rotate anything that was ever committed.

### Mistake 4: logging whole objects or requests

`log.info("Login request: {}", request)` prints the password if the DTO's `toString` includes it. **Fix:** log specific safe fields and override `toString` on types that carry secrets.

### Mistake 5: inventing crypto

Writing your own XOR "encryption", combining hashes in creative ways, or reusing a fixed IV. **Fix:** use standard constructions (AES-GCM, HMAC-SHA256, Ed25519) through reviewed APIs, or a higher-level library such as Google Tink.

## Best practices

- Keep secrets in a secret manager; inject at runtime; never commit them; rotate on a schedule and on suspicion.
- Hash passwords with Argon2id, bcrypt, scrypt, or PBKDF2 with a strong work factor; store algorithm and parameters with each hash.
- Use `SecureRandom` for anything security-relevant.
- Use authenticated encryption (AES-GCM) with unique nonces and managed keys.
- Keep TLS verification on; add private CAs to a trust store instead of disabling checks.
- Minimize, classify, and redact sensitive data; keep it out of logs, URLs, and error bodies.
- Use constant-time comparison for secrets and digests.

## Summary

- Secrets have a lifecycle; environment variables deliver them but do not protect them from diagnostics.
- Encoding is not encryption, hashing is not password storage, and encryption without authentication is incomplete.
- Plain SHA-256, salted or not, is a fast general hash: attackers can test enormous numbers of guesses per second. Passwords need a deliberately slow, salted password-hashing algorithm.
- `SecureRandom` produces unpredictable tokens; high-entropy tokens can be stored as simple digests.
- AES-GCM gives confidentiality plus tamper detection, but only with unique nonces and properly managed keys.
- TLS protects transport only while certificate and hostname verification remain enabled.

## Practice

### Warm-up

1. Classify each as encoding, hashing, password hashing, encryption, MAC, or signature: Base64, SHA-256, bcrypt, AES-GCM, HMAC-SHA256, Ed25519.
2. Search a sample project for `password`, `secret`, `apiKey`, and `token` in source, YAML, and test files. List every place a secret could leak.

### Core

1. Extend `PasswordHashDemo` with a `needsRehash(String stored)` method that returns true when the stored iteration count is below the current setting, and simulate upgrading a user from 100,000 to 600,000 iterations on login.
2. Add a key ID to the `Sealed` record in `AesGcmDemo` and support decrypting with either of two keys, simulating key rotation.
3. Write a `toString` audit: create three records that carry sensitive fields and make sure none of them print those fields.

### Challenge

1. Design the password-reset flow for the task service: token generation, storage, expiry, single use, rate limiting, and what the email and logs contain. Explain each decision.
2. Write a short incident runbook for "a production database password was pushed to a public repository": who does what, in which order, and how you verify the old credential no longer works.

## Check your understanding

1. Why does adding a unique salt not make a fast hash suitable for passwords?
2. What property of Argon2id, bcrypt, scrypt, and PBKDF2 makes them appropriate for password storage?
3. Why is SHA-256 acceptable for storing a digest of a 256-bit random API token?
4. What goes wrong if an AES-GCM nonce is reused with the same key?
5. What does TLS lose if certificate verification is disabled, and why does that matter?
6. What does encryption at rest fail to protect against?
