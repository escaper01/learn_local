# Logs, metrics, traces, SLOs, deployment strategies, and incidents

## Define reliability in user terms
An SLI measures behavior such as successful requests or latency below a threshold. An SLO sets the target over a window. Error budgets quantify tolerated unreliability and help decide when reliability work takes priority.

```text
Example SLI: successful task reads / eligible task reads
Example SLO: 99.9% over 30 days
Alert: rapid error-budget consumption, with a runbook link
```
Define exclusions and counting rules so the number cannot be improved by hiding failures. Metrics summarize trends; traces explain request paths; logs provide detailed events. Correlation needs propagation across asynchronous and remote boundaries.

## Deployment and incidents
Rolling, canary, and blue-green strategies trade capacity and risk. Mixed versions require compatible schemas and APIs. A rollback may fail after a destructive migration, so test recovery assumptions.

## Practice
Create a dashboard specification and one actionable alert. Write a runbook for database unavailability. Reconstruct a simulated incident timeline including detection delay and mitigation. Separate contributing system conditions from blame and assign concrete follow-up work.
