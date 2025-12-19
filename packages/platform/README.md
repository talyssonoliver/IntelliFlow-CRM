# @intelliflow/platform

Sprint 0 scaffolding package for platform primitives.

## Feature flags

`packages/platform/src/feature-flags/*` implements a minimal, deterministic
feature-flag evaluator (no external service required).

### Goals (Sprint 0)

- Provide a typed API for evaluating flags.
- Enable safe local development without external dependencies.
- Keep PII out of analytics/flag contexts by default.

### Non-goals (Sprint 0)

- Predictive rollout automation and AI-driven decisioning.
- Real A/B test statistical analysis.

Those are tracked as follow-up work in later sprints.

