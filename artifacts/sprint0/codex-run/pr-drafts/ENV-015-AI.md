# ENV-015-AI — AI-Managed Feature Flags with Predictive Rollout

Branch: `sprint0/ENV-015-AI-codex`  
Patch: `artifacts/sprint0/codex-run/patches/ENV-015-AI.patch`

## Summary

- Adds `packages/platform` with a minimal deterministic feature-flag evaluator:
  - In-memory provider
  - Zod-validated config schema
  - Typed context/decision model
- Adds rollout + experiment placeholder artifacts:
  - `artifacts/misc/rollout-config.json`
  - `artifacts/misc/ab-test-results.csv`
  - `artifacts/metrics/prediction-accuracy.json`

## Validation

- `pnpm run validate:sprint0`

## Notes

- Predictive rollout is deferred; Sprint 0 ships deterministic rollouts and placeholders for later automation.

