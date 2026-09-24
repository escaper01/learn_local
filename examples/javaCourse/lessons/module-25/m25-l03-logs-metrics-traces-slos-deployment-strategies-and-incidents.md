# Logs, metrics, traces, SLOs, deployment strategies, and incidents

A service running in production, correctly built and correctly containerized, still needs an answer to a harder question than "does it work": *how well* does it work, measured against a target that actually matters to users, and what happens the moment it stops meeting that target? This lesson brings together the observability tools Chapter 15 introduced (structured logging, correlation IDs, metrics, traces), reframes them around **Service Level Objectives** — a precise, measurable reliability target rather than an aspiration — and covers the deployment strategies and incident-response discipline that turn "we watch our metrics" into an actual operational practice.

What you will learn:

- Logs, metrics, and traces reprised: which question each one answers, and how they compose in a distributed system
- What a Service Level Indicator (SLI) and a Service Level Objective (SLO) actually are, precisely
- Why an SLO is a target over a measurement window, never a promise of zero failures
- An error budget: the practical tool an SLO makes possible
- Deployment strategies (rolling, blue-green, canary) and the risk-versus-speed trade-off each makes
- The shape of an incident: detection, mitigation, resolution, and the postmortem that follows

## Logs, metrics, and traces in a distributed system

Chapter 15 established each tool's job: a structured **log** records a specific event with context; a **metric** is a numeric measurement over time, cheap to aggregate but limited to a small, bounded set of labels; a **correlation ID** ties every log line from one logical request together. In a distributed system — the subject of this entire chapter — a single logical request now typically spans multiple services, and a correlation ID alone (tracking one service's internal log lines) is not enough to see the *whole* request's path: a **distributed trace** propagates one trace ID across every service boundary a request crosses, with each service contributing a **span** representing its own portion of the work, so that a single trace reconstructs the entire request's journey — which services it touched, how long each one took, and where, specifically, time was spent or an error occurred.

```text
Trace ID: 7f3c2e1a-9b4d-4e2f-8a11-5c6d7e8f9012
  Span: api-gateway (12ms)
    Span: order-service (145ms)
      Span: inventory-service (38ms)
      Span: payment-service (98ms) <- most of order-service's time is spent here
```

This is exactly the same reasoning Chapter 15 applied within one process, now extended across process boundaries: a correlation ID answers "which log lines belong to this one request, within this one service," while a trace ID answers the same question across an entire distributed call chain, which is essential the moment a "slow request" symptom could originate in any one of several services a request passes through.

## SLI and SLO: precise, measurable, not aspirational

A **Service Level Indicator (SLI)** is a specific, measurable metric describing some aspect of service behavior — the fraction of requests completed successfully, or the fraction completed under a given latency threshold. A **Service Level Objective (SLO)** is a target value for that SLI, over a defined measurement window:

```text
SLI: the fraction of HTTP requests to /api/orders that complete with a
     status code under 500 AND within 300ms.

SLO: 99.9% of requests satisfy the above SLI, measured over a rolling 30-day window.
```

This chapter's concept-check question states the precise meaning directly: an SLO specifies **a reliability target over a defined measurement window** — not a guarantee of zero incidents, and not an exhaustive specification of every implementation detail. `99.9%` over 30 days explicitly, mathematically, permits a bounded amount of failure — roughly 43 minutes of full downtime (or an equivalent amount of partial degradation) across that window — and treating an SLO as "we promise this never breaks" misreads what the number actually states. The whole value of stating a precise SLO, rather than a vague "we aim for high reliability," is that it becomes something you can actually measure against, decide about, and act on with data rather than opinion.

## The error budget: what an SLO makes possible

Once an SLO defines an acceptable failure rate, the gap between "0% failures" and the SLO's stated target becomes an **error budget** — a concrete, spendable quantity of acceptable unreliability, rather than reliability treated as an unlimited resource to maximize without bound:

```text
SLO: 99.9% success over 30 days
Total requests in the window: 10,000,000
Error budget: 0.1% of 10,000,000 = 10,000 failed or slow requests allowed
```

An error budget reframes a genuinely common organizational tension — "ship features faster" versus "be more careful and reliable" — into a data-driven decision rather than a political one: if the error budget for the current window is nearly exhausted, that is the objective, agreed-upon signal to slow down releases and prioritize reliability work; if the budget has ample room remaining, that same objective signal supports shipping new, riskier features at a normal pace. This is the practical payoff of stating a precise SLO rather than an aspiration — it converts "how careful should we be right now" from a subjective debate into a number everyone already agreed matters.

## Deployment strategies: trading risk against speed and cost

Chapter 16 established the mechanics of a clean CI build producing a promotable artifact; this lesson covers *how* that artifact actually reaches production traffic, and the different strategies trade risk, rollback speed, and infrastructure cost against each other:

| Strategy | How it works | Trade-off |
|---|---|---|
| **Rolling deployment** | Replace instances of the old version with the new one, a few at a time, until all are updated | Simple, no extra infrastructure cost, but a bug in the new version affects a growing fraction of traffic as the rollout proceeds, and rollback means rolling forward again with the old version |
| **Blue-green deployment** | Deploy the new version fully, alongside the still-running old version, then switch all traffic over at once | Instant rollback (switch traffic back), but requires running two full production-sized environments simultaneously during the transition |
| **Canary deployment** | Route a small percentage of real traffic to the new version, observe its metrics/SLI directly, then gradually increase that percentage if it looks healthy | Limits the blast radius of a bad release to a small fraction of real traffic, but requires the infrastructure and observability maturity to actually detect a problem from a small sample before expanding it |

None of these strategies is universally correct — a canary deployment's safety benefit is only real if the monitoring watching it can actually distinguish a genuinely bad release from ordinary noise in a small traffic sample, and a blue-green deployment's instant-rollback benefit is only real if the new environment was actually validated against production-equivalent load before the traffic switch. Choosing a strategy is, again, a deliberate trade-off decision informed by the specific system's risk tolerance, traffic volume, and observability maturity — not a default picked because it sounds more sophisticated.

## The shape of an incident

An **incident** is a period where a service fails to meet its stated SLO (or otherwise causes real user-facing harm), and a mature incident-response process moves through distinct phases, each with a different priority:

```text
1. DETECTION: an alert (ideally tied directly to an SLI/SLO breach, not an
   arbitrary internal metric threshold) signals something is wrong.
2. MITIGATION: stop the user-facing harm as fast as possible — this may mean
   rolling back a bad deploy, failing over to a backup, or disabling a
   feature flag. Mitigation is NOT the same as fixing the root cause;
   it is stopping the bleeding first.
3. RESOLUTION: once mitigated, find and fix the actual root cause, which may
   take considerably longer than mitigation did.
4. POSTMORTEM: a blameless, written account of what happened, why detection
   and mitigation took as long as they did, and what concrete changes will
   reduce the likelihood or impact of a similar incident recurring.
```

The order matters specifically: an engineer who spends the first hour of an active, user-facing incident diagnosing the precise root cause, rather than immediately rolling back the deploy that coincided with the incident's start, has prioritized understanding over stopping harm — usually the wrong trade during active user impact, even though the deeper diagnosis is genuinely valuable *afterward*, during resolution. A **blameless** postmortem culture — focused on "what about our systems and processes allowed this to happen" rather than "who made the mistake" — is what makes people willing to report and discuss incidents honestly and in detail, which is a prerequisite for the postmortem's own stated purpose: producing concrete, actionable changes, not assigning fault.

## What happens under the hood: from a request to an SLO breach alert

1. Every request emits structured log lines (with a correlation ID) and updates a small number of bounded metrics (request count, latency, status-code class) — exactly Chapter 15's discipline — while, in a distributed call, also propagating a trace ID across every downstream service it touches.
2. An SLI is computed continuously (or on a defined interval) by aggregating these metrics — for example, the fraction of requests in a rolling window that completed successfully and within the latency target.
3. Monitoring compares the current SLI against the stated SLO's target, and against the remaining error budget for the current measurement window, triggering an alert when the SLI drops below what the budget can still absorb.
4. On alert, an on-call engineer moves through detection (confirming the alert reflects a real problem), mitigation (rolling back, failing over, or disabling the offending change as fast as possible), and only then resolution (root-causing and genuinely fixing the underlying issue).
5. A blameless postmortem, written after resolution, documents the timeline, the detection and mitigation delay, and concrete follow-up actions — closing the loop by feeding back into the system's design, its monitoring, or its deployment strategy, exactly the kind of continuous improvement an error budget's data-driven framing is meant to support.

## Common mistakes

**Mistake 1: treating an SLO as a promise of zero failures.** A stated SLO of 99.9% explicitly, mathematically permits a bounded amount of failure; misreading it as "never fails" leads to either unrealistic expectations or wasted effort chasing reliability beyond what the SLO actually requires. Fix: read an SLO as a target over a measurement window, and use the resulting error budget to make deliberate release-pace decisions.

**Mistake 2: alerting on an arbitrary internal metric threshold instead of a genuine SLI/SLO breach.** This produces noisy, low-signal alerts disconnected from actual user impact. Fix: tie alerts directly to SLI degradation relative to the stated SLO and its error budget.

**Mistake 3: spending the first phase of an active incident on root-cause diagnosis instead of mitigation.** This prolongs real user-facing harm in favor of understanding that could wait until after mitigation. Fix: mitigate first (rollback, failover, feature flag), root-cause afterward during resolution.

**Mistake 4: running a blame-oriented postmortem process.** This discourages honest, detailed incident reporting, undermining the postmortem's own purpose. Fix: keep postmortems blameless, focused on systemic and process changes rather than individual fault.

**Mistake 5: choosing a deployment strategy by reputation rather than the system's actual risk tolerance and observability maturity.** A canary deployment provides no real safety benefit if nothing is actually watching its metrics closely enough to catch a problem in a small traffic sample. Fix: choose a deployment strategy deliberately, matched to what the team can actually observe and respond to.

## Best practices

- Propagate a trace ID across every service boundary a request crosses, so a single trace reconstructs a distributed request's entire path.
- Define SLIs and SLOs precisely, as measurable targets over a stated window, and use the resulting error budget to make data-driven release-pace decisions.
- Tie alerts directly to SLI/SLO degradation, not arbitrary internal thresholds disconnected from actual user impact.
- Mitigate first during an active incident; root-cause and fix afterward during resolution.
- Run blameless postmortems focused on systemic changes, and choose deployment strategies deliberately, matched to the team's actual observability and risk tolerance.

## Summary

- Distributed tracing extends Chapter 15's correlation-ID discipline across service boundaries, letting a single trace ID reconstruct a request's entire multi-service journey.
- An SLI is a specific, measurable metric; an SLO is a target value for that SLI over a defined measurement window — never a promise of zero failures.
- An error budget (the gap between 100% and the SLO) turns "how careful should we be right now" into a data-driven decision rather than a subjective debate.
- Rolling, blue-green, and canary deployments each trade risk, rollback speed, and infrastructure cost differently; the right choice depends on the system's actual risk tolerance and observability maturity.
- A mature incident response mitigates user-facing harm first, root-causes during resolution afterward, and closes with a blameless postmortem producing concrete, actionable follow-up.

## Practice

1. **Warm-up:** Explain why a distributed trace ID is necessary in addition to Chapter 15's per-service correlation ID, once a request spans multiple services.
2. **Warm-up:** A team states "our SLO is 99.9% availability" and treats any downtime at all as an SLO violation. Explain precisely what is wrong with this interpretation.
3. **Core:** Define an SLI and SLO for a small service you have built or could build, calculate its error budget over a 30-day window given a specific request volume, and describe what decision that budget being nearly exhausted should trigger.
4. **Core:** Compare rolling, blue-green, and canary deployment strategies for a specific hypothetical service, and justify which one fits its actual risk tolerance and traffic volume best.
5. **Challenge:** Write a short, blameless postmortem for a hypothetical incident (a bad deploy causing elevated error rates for 20 minutes), covering detection, mitigation, resolution, and at least two concrete follow-up actions.

## Check your understanding

1. What does a distributed trace provide that a single service's correlation ID alone does not?
2. What is the precise difference between an SLI and an SLO?
3. Why does a stated SLO of 99.9% not mean "this service never fails," and what does the resulting error budget actually represent?
4. What is the key risk-versus-cost trade-off between a rolling deployment and a blue-green deployment?
5. During an active incident, why should mitigation generally come before root-cause diagnosis?
6. Why does a blameless postmortem culture matter for the postmortem process's own stated goal of producing concrete improvements?
