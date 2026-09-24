# Dependency graphs, version control, licenses, and supply-chain risk

Adding one dependency to a `pom.xml` or `build.gradle` rarely adds just that one library. It adds every transitive dependency that library needs, each with its own version, license, and maintenance status, none of which you reviewed by hand. This lesson is about treating that graph as a real engineering artifact — something to inspect, version deliberately, and audit — rather than an invisible detail the build tool handles for you.

What you will learn:

- Why a dependency graph is a tree of *someone else's decisions*, not just your own
- How semantic versioning communicates (and sometimes misrepresents) the risk of upgrading
- How to read a license and know when a dependency's license is incompatible with your project
- What supply-chain risk means concretely: compromised packages, typosquatting, and unmaintained code
- How to use `dependency:tree` / `dependencies` output and audit tools to make informed upgrade decisions
- Why pinning and reviewing transitive dependencies is part of the job, not an edge case

## The graph is not just your decisions

When you declare one dependency, the build tool resolves its full transitive graph before your code compiles:

```text
com.example:app:1.0.0
+- org.springframework:spring-web:6.1.6
|  +- org.springframework:spring-core:6.1.6
|  \- org.springframework:spring-beans:6.1.6
+- com.fasterxml.jackson.core:jackson-databind:2.17.0
|  +- com.fasterxml.jackson.core:jackson-core:2.17.0
|  \- com.fasterxml.jackson.core:jackson-annotations:2.17.0
\- org.yaml:snakeyaml:2.2
```

You reviewed `spring-web` and `jackson-databind` when you added them. You did not review `snakeyaml`, `jackson-core`, or `spring-beans` — they arrived because something you chose needed them. Every one of those transitive artifacts runs inside your process with the same privileges as your own code: if one of them has a remote-code-execution vulnerability, or turns out to be malicious, it affects your application exactly as much as a bug you wrote yourself. A dependency graph is a statement of trust in every maintainer along every path from your project to a leaf artifact, whether or not you ever read their code.

## Semantic versioning: a promise, not a guarantee

Most published Java libraries follow **semantic versioning** (`MAJOR.MINOR.PATCH`):

| Change | Meaning | Expected compatibility |
|---|---|---|
| `1.4.2` → `1.4.3` (patch) | Bug fix only | Safe to take automatically |
| `1.4.2` → `1.5.0` (minor) | New functionality, backward compatible | Safe to take, review changelog |
| `1.4.2` → `2.0.0` (major) | Breaking change | Requires reading the migration notes and likely code changes |

This is a **convention the maintainer chooses to follow**, not something the version number enforces. A patch release that accidentally breaks behavior, or a minor release that quietly changes a default, both happen in real projects. Treat the version number as a strong hint about *how much verification an upgrade needs*, not as proof that it is safe: a patch bump still deserves running the test suite before merging, and a major bump deserves reading the release notes before writing any code.

Version **ranges** (`[1.4,2.0)`, `1.+`) let a build resolve to whatever matching version is newest at build time. This trades reproducibility for convenience: the same `pom.xml` can produce a different resolved graph on two different days, which is exactly the kind of nondeterminism a shippable build should not have. Prefer exact versions, managed centrally through `dependencyManagement` or a Gradle version catalog, over ranges.

## Reading a license before you ship it

A dependency's license is a legal condition on how you may use, modify, and redistribute its code, and it applies whether or not anyone on the team read it. A rough, non-exhaustive orientation:

| License family | Typical obligation |
|---|---|
| MIT, Apache-2.0, BSD | Permissive: keep the license/notice file, otherwise free to use and modify in proprietary software |
| LGPL | Permissive for *using* the library, but modifying and redistributing the library itself requires sharing those modifications |
| GPL / AGPL | Copyleft: distributing software that links against it can require releasing your own source under the same license; AGPL extends this to software offered only as a network service |
| No declared license | Legally, "all rights reserved" by default — using it at all is a risk, not merely an oversight to fix later |

This is not a substitute for legal review on anything that matters commercially, but an engineer should be able to say, for every dependency added, what license it carries and whether that license family is one the project already accepts. A GPL dependency pulled in transitively by an otherwise permissively-licensed library is exactly the kind of thing `dependency:tree` output makes visible and a casual "it built, ship it" review does not.

## Supply-chain risk: the graph as an attack surface

The dependency graph is also an attack surface, with failure modes that have nothing to do with code quality:

- **Compromised packages**: a maintainer's account is taken over, or a maintainer is coerced, and a new version of a widely used package is published containing malicious code. Every project that takes that version transitively is affected without ever adding a new direct dependency.
- **Typosquatting**: a malicious package is published under a name deliberately similar to a popular one (`commmons-lang` versus `commons-lang`), hoping a typo in a dependency declaration pulls it in.
- **Unmaintained dependencies**: a library with a known vulnerability and no active maintainer will never receive a fix; the only remedies are forking, replacing it, or accepting the risk explicitly.
- **Build-time code execution**: build plugins and annotation processors run arbitrary code *during your build*, with your build machine's or CI runner's privileges — a compromised plugin is a more direct attack than a compromised runtime dependency.

None of these are prevented by careful application-level code review, because the vulnerable or malicious code was never written by anyone on your team. The mitigations are process, not cleverness:

```text
mvn dependency:tree
mvn org.owasp:dependency-check-maven:check
```

```text
./gradlew dependencies
./gradlew dependencyCheckAnalyze
```

An audit tool compares your resolved graph's artifacts against a database of known vulnerabilities (CVEs) and reports matches with severity. This should run in CI, not only when someone remembers to check, because a dependency that was safe last month can have a vulnerability disclosed today with no code change on your part at all.

```text
[WARNING] com.fasterxml.jackson.core:jackson-databind:2.9.8
[WARNING]     CVE-2019-12384 (CVSS 8.1: HIGH) - Polymorphic deserialization gadget chain
[WARNING]     Fixed in: 2.9.9
```

A report like this is a prioritized to-do list, not noise to suppress: a HIGH-severity finding in a library that deserializes untrusted input deserves an immediate upgrade; a LOW-severity finding in a build-time-only tool with no path to production data deserves a tracked but less urgent fix.

## Deciding whether to upgrade

Not every available upgrade should be taken immediately, and not every upgrade should be deferred. A reasonable process, in order:

1. Read what changed: the changelog or release notes, not just the version number.
2. Check whether the current version has a known vulnerability with a severity that matters for how you actually use the library (a deserialization CVE matters far more if you deserialize untrusted input than if you never do).
3. If it is a major version, look for automated migration tooling (OpenRewrite recipes exist for many popular Java library upgrades) before doing it by hand.
4. Run the full test suite, not just a subset, since transitive behavior changes rarely announce themselves at the call site you expect.
5. Re-run `dependency:tree` afterward to confirm the graph changed the way you intended, not just that the build still passes.

Deferring an upgrade is a legitimate decision when the risk of the current version is low and the migration cost is high — but it should be a decision someone made and can explain, not silence born of nobody checking.

## What happens under the hood: from one declared dependency to a resolved graph

1. The build tool reads your direct dependency declarations and, for each one, downloads (or reads from local cache) that artifact's own POM/module metadata, which lists *its* dependencies.
2. This repeats recursively until every artifact's metadata has been read, producing a full dependency graph, not just a list.
3. Where two paths in the graph require different versions of the same artifact, the tool applies its conflict resolution strategy (nearest-wins for Maven; a similar highest-version-wins default for Gradle, both overridable) to pick exactly one version per artifact.
4. The resolved set of artifact-version pairs becomes the actual classpath for compiling, testing, and running your code — this is what `dependency:tree` or `./gradlew dependencies` prints.
5. An audit tool takes that resolved list and checks each artifact-version pair against a vulnerability database, independent of the build itself.

## Common mistakes

**Mistake 1: reviewing only direct dependencies.** A team audits the ten libraries in `pom.xml` and ships fifty more that arrived transitively, unreviewed. Fix: read `dependency:tree` output, not just the dependency declarations you wrote.

**Mistake 2: using open version ranges for reproducibility-sensitive builds.** `1.+` resolves to a different concrete version depending on when the build runs, so the same commit can produce different behavior on different days. Fix: pin exact versions centrally.

**Mistake 3: treating a clean build as proof of a safe dependency graph.** A build with no vulnerability scanning can be green while shipping a package with a published critical CVE. Fix: run a dependency audit in CI, not only in code review.

**Mistake 4: ignoring license family when adding a "just for now" dependency.** A GPL-licensed helper library added to save an afternoon of writing utility code can force a licensing conversation months later, once it is deeply embedded. Fix: check the license before adding, not after a legal question is raised.

## Best practices

- Run `dependency:tree` / `./gradlew dependencies` and actually read a sample of transitive dependencies, not only the ones you added.
- Pin exact versions; avoid open version ranges in anything meant to be reproducible.
- Run an automated vulnerability scan (OWASP Dependency-Check or equivalent) in CI, and treat a HIGH/CRITICAL finding as a blocking issue, not a backlog item.
- Know the license family of every direct and significant transitive dependency before shipping.
- Prefer well-maintained, widely used libraries over obscure ones with a single maintainer, all else equal.
- Re-run the dependency tree after any upgrade to confirm the graph changed as intended.

## Summary

- Adding a dependency adds its entire transitive graph, and every artifact in that graph runs with your application's privileges.
- Semantic versioning is a convention that hints at upgrade risk, not a guarantee; even patch releases deserve running the test suite.
- Every dependency carries a license with real obligations, whether or not the team reads it.
- Supply-chain risk (compromised packages, typosquatting, unmaintained code, malicious build plugins) is not mitigated by application-level code review, because the code was never written by your team.
- Automated vulnerability scanning in CI catches newly disclosed CVEs in dependencies that have not changed on your side at all.
- An upgrade decision should weigh changelog content, known vulnerabilities, and migration cost, then be verified with the full test suite and a re-checked dependency tree.

## Practice

1. **Warm-up:** For a library you depend on directly, use `dependency:tree` or `./gradlew dependencies` to find one transitive dependency you did not know you had, and identify its declared version.
2. **Warm-up:** Explain why a patch version bump (`1.4.2` → `1.4.3`) still deserves running the test suite before merging, even though semantic versioning promises it is backward compatible.
3. **Core:** Find the license of three dependencies in a real project (direct or transitive) and classify each as permissive, copyleft, or undeclared.
4. **Core:** Run an OWASP Dependency-Check (or equivalent) scan against a project with at least one deliberately outdated dependency, and read the resulting report's severity and "fixed in" fields.
5. **Challenge:** Add a dependency with an open version range (`1.+` or `[1.0,)`), resolve it twice a day apart if a new version is published in that window (or simulate this by changing the range), and observe that the resolved version differs without any change to your own code.

## Check your understanding

1. Why can a transitive dependency you never explicitly reviewed still be responsible for a production security incident?
2. What does a minor version bump promise under semantic versioning, and why is that promise not a substitute for running your test suite?
3. Give one concrete difference in obligation between an MIT-licensed dependency and a GPL-licensed one.
4. Name two supply-chain risks that exist even when every line of your own application code is correct and well-reviewed.
5. Why does pinning exact dependency versions matter for build reproducibility, specifically compared to using an open version range?
6. Why should a dependency vulnerability scan run in CI on every build, rather than only when a new dependency is added?
