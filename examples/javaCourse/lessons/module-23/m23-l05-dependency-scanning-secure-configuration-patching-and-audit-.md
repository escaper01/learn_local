# Dependency scanning, secure configuration, patching, and audit evidence

Every security discipline this chapter has covered so far — threat modeling, injection prevention, secrets handling, resource limits — protects code you wrote and reviewed. This closing lesson covers the security posture of everything you did *not* write: the dependency graph from Chapter 16, revisited here specifically as an ongoing operational responsibility, not a one-time review; the configuration that governs how securely your own correct code actually runs; and the evidence — an SBOM, a patch record, an audit trail — that turns "we believe this is secure" into something a security review, an auditor, or your own future self can actually verify.

What you will learn:

- Why dependency security is a continuous process, not a one-time check at add-time
- What an SBOM (Software Bill of Materials) is, and precisely what it does and does not prove
- Secure configuration: why insecure defaults are a specific, common vulnerability class
- Patching cadence: why "we'll upgrade eventually" is a policy decision with a measurable risk cost
- What audit evidence is, and why "we did the right thing" needs to be provable, not just true

## Dependency security as a continuous process

Chapter 16 established that a resolved dependency graph needs auditing — reading `dependency:tree` output, running a vulnerability scanner — as part of adding or upgrading a dependency. The security-specific addition this lesson makes: a dependency that was safe when it was added can have a **new** vulnerability disclosed at any later time, with **zero code changes on your part**. A dependency scan run once, at the moment a library was added, tells you nothing about its status six months later — and a critical CVE disclosed in a widely used library (a real, historically recurring event, not a hypothetical) can turn an untouched, "working fine" dependency into an active, exploitable vulnerability overnight, with no warning beyond a public disclosure.

```text
CI pipeline, run on every build (not just when a dependency changes):
mvn org.owasp:dependency-check-maven:check
# or: ./gradlew dependencyCheckAnalyze
```

Running this scan **only** when a dependency is added or upgraded misses every vulnerability disclosed afterward, against a dependency that has not changed at all. Running it on every build (or on a scheduled cadence independent of code changes — nightly, at minimum) is what actually catches a newly disclosed CVE in an existing, unchanged dependency in a timeframe short enough to matter, rather than discovering it only the next time someone happens to touch that part of the dependency graph for an unrelated reason.

## SBOM: an inventory, not a guarantee

A **Software Bill of Materials (SBOM)** is a structured, machine-readable inventory of every component — direct and transitive — that makes up a specific build artifact: its name, version, and often its license and cryptographic hash, in a standard format (CycloneDX and SPDX are the common ones for Java projects).

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.5",
  "components": [
    { "type": "library", "name": "jackson-databind", "version": "2.17.0", "purl": "pkg:maven/com.fasterxml.jackson.core/jackson-databind@2.17.0" },
    { "type": "library", "name": "spring-core", "version": "6.1.6", "purl": "pkg:maven/org.springframework/spring-core@6.1.6" }
  ]
}
```

This chapter's concept-check question states precisely what an SBOM provides, and just as precisely what it does not: an SBOM is **an inventory of components** — it tells you exactly what shipped, at exactly what versions, in a specific build. It is **not proof of zero vulnerabilities**, and it does not, by itself, verify anything about security posture at all. The value of an SBOM is what it makes *possible*, not what it directly proves: when a new CVE is disclosed against, say, a specific version of a logging library, an organization with accurate SBOMs for every deployed artifact can immediately, mechanically query "which of our production artifacts include this exact vulnerable version" — turning what would otherwise be a slow, manual, error-prone audit across every team's dependency files into an instant, precise, and complete lookup. An SBOM without a corresponding, ongoing vulnerability-scanning process is inventory with nobody reading it; the two together are what actually close the gap between "a vulnerability was disclosed" and "we know exactly which of our systems are affected."

## Secure configuration: insecure defaults as a distinct vulnerability class

A piece of software can be entirely free of code-level vulnerabilities — no injection flaws, no broken authentication logic — and still be insecure purely because of how it is **configured**. This is a genuinely distinct vulnerability category from the code-level flaws earlier lessons covered, and it recurs across nearly every technology this course has touched:

| Insecure default | Why it is dangerous | Secure alternative |
|---|---|---|
| A database or admin panel exposed with default or no credentials | Trivially discoverable and exploitable by automated scanners, not even a targeted attack | Require credential rotation on first setup; never ship a working default password |
| Verbose error pages showing stack traces to end users | Leaks internal implementation details (class names, file paths, sometimes SQL queries) useful for crafting further attacks | Return generic error messages to clients; log full details only server-side |
| An overly permissive CORS policy (`Access-Control-Allow-Origin: *` on a sensitive endpoint) | Allows any website to make authenticated requests to the API on a victim's behalf | Restrict allowed origins explicitly to the specific, trusted domains that genuinely need access |
| TLS configured to accept outdated, weak protocol versions or ciphers | Vulnerable to known cryptographic attacks against the weak protocol/cipher itself | Configure TLS to require modern protocol versions and strong cipher suites only |
| Default-open network policies (every port, every service reachable from anywhere) | Maximizes attack surface unnecessarily | Apply least-privilege network access: only the specific ports and sources genuinely required |

The common thread across every row: a **secure-by-default** posture requires deliberately *tightening* a configuration to what is actually needed, and every one of these examples represents a case where the "convenient" or "just works out of the box" default is also the less secure choice — exactly the same "convenient but wrong" trade-off this course's own project guide names for Electron security settings (`nodeIntegration: false`, `contextIsolation: true`, strict CSP) rather than accepting a framework's more permissive defaults. Reviewing configuration for security is not a one-time setup task; it deserves the same periodic, deliberate review as the dependency graph, since a configuration that was reviewed and hardened at launch can drift (a new environment variable added without review, a new endpoint that inherits a permissive CORS default) over the life of a long-running system.

## Patching cadence: "we'll upgrade eventually" is a measurable risk decision

Chapter 16 established that not every available upgrade should be taken immediately — but the security-specific version of that trade-off has a sharper edge: the gap between "a vulnerability is publicly disclosed" and "we have applied the fix" is a window during which the vulnerability is not merely theoretical — it is, in practice, actively more likely to be exploited, precisely *because* the disclosure itself (and the accompanying advisory, and often a public proof-of-concept) hands attackers exactly the information they need. A team's patching cadence — how quickly a critical security fix is applied, versus how quickly an ordinary feature-release upgrade is taken — is a genuine risk-management decision with a measurable cost, not a scheduling convenience:

```text
A reasonable, differentiated patching policy:
  - CRITICAL/HIGH severity CVE with a known exploit: patch within days, treated as an incident
  - CRITICAL/HIGH severity CVE, no known exploit yet: patch within one to two weeks
  - MEDIUM/LOW severity: patch on the next regular maintenance cycle
  - Routine feature-release upgrades (no security content): patch on a normal cadence, tested thoroughly
```

Treating every upgrade — a critical, actively-exploited CVE fix and a routine minor-version bump alike — with the same unhurried "we'll get to it" cadence is itself a security decision, just an unstated, unreviewed one; making the cadence explicit and severity-differentiated, as above, is what turns "we patch things" into an actual, accountable policy.

## Audit evidence: making "we did the right thing" provable

The cumulative theme across this entire chapter, made explicit here: security is not just about *doing* the right thing (validating input, binding SQL parameters, hashing passwords correctly, bounding resources) — for any system with real users, a compliance obligation, or a security review process, it is also about being able to **prove**, after the fact, that the right thing was done, consistently, over time. This is what **audit evidence** provides:

- A CI pipeline's recorded dependency-scan results over time, showing scans actually ran on every build, not merely that a scan tool is configured somewhere.
- A record of when each CVE affecting a deployed dependency was identified, and when the corresponding patch was actually applied — the concrete evidence behind a stated patching-cadence policy, rather than a policy nobody can confirm was followed.
- Access logs and authorization decision logs (structured, per the observability chapter) showing who accessed what, and when — the evidence a genuine incident investigation, or a compliance audit, actually needs.
- Version-controlled configuration (infrastructure as code, rather than manual, undocumented changes made directly against a running system) giving a reviewable history of exactly what security-relevant configuration changed, when, and by whom.
- Signed, verifiable build artifacts (connecting to Chapter 16's "build once, promote the same artifact" principle) proving the artifact running in production is genuinely the one that was reviewed and tested, not a different, unaudited build.

None of this evidence *makes* a system more secure by itself — a beautifully kept audit log of a system that never actually validates its inputs proves nothing except that the team is good at logging. The discipline this lesson closes on is that audit evidence and actual security practice must be two honest reflections of the same real behavior: the evidence exists specifically so that "we did the right thing" is not merely asserted, but demonstrable, to a reviewer, an auditor, or a future engineer trying to understand exactly what happened and when.

## What happens under the hood: from a disclosed CVE to a verified, patched system

1. A vulnerability is publicly disclosed against a specific version range of a library, typically with a CVE identifier, a severity score, and often technical details (sometimes including a proof-of-concept exploit).
2. A scheduled or CI-triggered dependency scan compares an organization's SBOMs (or a live `dependency:tree`-equivalent resolution) against the updated vulnerability database, flagging every build artifact that includes an affected version.
3. Based on the severity and the organization's stated patching-cadence policy, the affected dependency is scheduled for an upgrade within the corresponding time window, following Chapter 16's dependency-upgrade discipline (reading the changelog, running the full test suite, re-checking the dependency tree afterward).
4. The patched artifact is built once (per Chapter 16's build-once-promote-the-same-artifact principle) and promoted through the same verification pipeline every other change goes through, with the specific commit, build, and deployment timestamps recorded as part of the organization's audit trail.
5. A subsequent audit or security review can, from the recorded evidence alone — the scan history, the patch timeline, the deployment record — reconstruct exactly when the vulnerability was identified, when it was fixed, and how long the exposure window actually was, without needing to rely on anyone's memory or an untracked, informal account of what happened.

## Common mistakes

**Mistake 1: running a dependency vulnerability scan only when a dependency is added or upgraded.** This misses every vulnerability disclosed afterward against an otherwise unchanged dependency. Fix: run scans on every build, or on an independent scheduled cadence, not only at dependency-change time.

**Mistake 2: treating an SBOM as proof of security, rather than as an inventory.** An SBOM alone verifies nothing about vulnerability status; it only makes a fast, accurate lookup possible once a vulnerability is disclosed. Fix: pair SBOM generation with an ongoing, active vulnerability-scanning process.

**Mistake 3: accepting a framework's or platform's convenient default configuration without reviewing it for security implications.** Verbose error pages, permissive CORS, default credentials, and weak TLS settings are all "convenient" defaults that are also insecure. Fix: treat secure configuration as requiring deliberate hardening away from convenient defaults, reviewed periodically, not just at initial setup.

**Mistake 4: treating every dependency upgrade, security-critical or routine, with the same unhurried cadence.** This is an unstated, unreviewed risk decision, not a neutral scheduling choice. Fix: adopt an explicit, severity-differentiated patching policy, and treat a critical, actively-exploited CVE as an incident, not a backlog item.

**Mistake 5: doing the right thing without being able to prove it afterward.** A security practice with no recorded evidence cannot survive an audit, a compliance review, or an incident investigation that needs to reconstruct what actually happened. Fix: keep audit evidence — scan history, patch timelines, access logs, version-controlled configuration — as a genuine reflection of real practice, not an afterthought.

## Best practices

- Run dependency vulnerability scans on every build (or on an independent scheduled cadence), never only at dependency-change time.
- Maintain accurate SBOMs for deployed artifacts, and pair them with an active scanning process that actually uses them.
- Review configuration for security deliberately and periodically, hardening away from convenient-but-insecure defaults rather than accepting them.
- Adopt an explicit, severity-differentiated patching cadence, treating critical, actively-exploited vulnerabilities as incidents rather than backlog items.
- Keep audit evidence (scan history, patch timelines, access logs, version-controlled configuration, signed build artifacts) as an honest, ongoing reflection of actual security practice.

## Summary

- Dependency security is a continuous process: a dependency safe when added can become vulnerable later with zero code changes on your part, so scanning must run continuously, not only at add-time.
- An SBOM is an inventory of components, not proof of security; its value is making a fast, accurate lookup possible once a new vulnerability is disclosed, paired with an active scanning process.
- Secure configuration is a distinct vulnerability class from code-level flaws — insecure defaults (verbose errors, permissive CORS, default credentials, weak TLS) require deliberate hardening, reviewed periodically.
- A patching cadence is a genuine, measurable risk decision; treating every upgrade with the same unhurried pace is itself an unstated, unreviewed security choice.
- Audit evidence turns "we did the right thing" from an assertion into something provable — scan history, patch timelines, access logs, and version-controlled configuration are what a real audit or incident investigation actually needs.

## Practice

1. **Warm-up:** Explain why a dependency vulnerability scan run only when a dependency is added or upgraded misses a real, common class of security risk.
2. **Warm-up:** Explain precisely what an SBOM does and does not prove about a system's security posture.
3. **Core:** Configure a dependency vulnerability scan to run on a schedule independent of code changes (a nightly CI job, for instance), and simulate a newly disclosed CVE by testing against a known-vulnerable dependency version.
4. **Core:** Review a small application's configuration (error handling, CORS policy, TLS settings) against the insecure-defaults table in this lesson, and harden at least two settings you find left at a convenient-but-insecure default.
5. **Challenge:** Design a complete audit-evidence scheme for a hypothetical production service: what gets logged, where scan and patch history is recorded, and how a hypothetical security review would use each piece of evidence to verify a specific security claim.

## Check your understanding

1. Why must dependency vulnerability scanning run continuously, rather than only when a dependency is added or changed?
2. What does an SBOM actually provide, and what specifically does it not prove on its own?
3. Give two examples of an insecure default configuration, and explain why each is dangerous despite being "convenient."
4. Why is treating every dependency upgrade with the same unhurried cadence itself a risk decision, even if nobody explicitly decided it?
5. What is audit evidence, and why does "we did the right thing" need to be provable rather than merely true?
6. What specific gap does pairing an SBOM with an active vulnerability-scanning process close that neither one alone can close?
