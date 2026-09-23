# Dependency scanning, secure configuration, patching, and audit evidence

## Secure configuration is part of delivery
Track runtime, framework, and transitive dependency versions. Review advisories and upgrade with compatibility tests. An SBOM records components but is not evidence that they are safe. Remove unused dependencies and exposed endpoints to reduce attack surface.

```text
Release review:
- controlled dependency versions and provenance
- no embedded credentials
- restricted administrative endpoints
- verified TLS and authorization defaults
- tested rollback and migration compatibility
```
This release checklist belongs in the engineering workflow, not a claim that every item can be proven by a scanner.

## Fail closed where required
If signing keys or authorization configuration are missing, starting in a permissive mode can expose data. Validate essential settings at startup. Distinguish development conveniences from production defaults explicitly.

## Practice
Review a deployment that exposes a debug endpoint, prints configuration including secrets, and uses a privileged database account. Propose targeted corrections and tests. Document how a critical dependency update is assessed, deployed, and verified. Preserve audit events with safe identifiers and a retention/access policy.
