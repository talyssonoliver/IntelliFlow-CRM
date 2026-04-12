# ADR-022: AI Features Quality and Safety (RAG, Churn Risk, Model Versioning)

**Status:** Accepted  
**Date:** 2026-02-02  
**Deciders:** AI Lead, Product Lead, QA Lead (STOA-Intelligence)  
**Related Tasks:** IFC-039, IFC-085, IFC-086, IFC-095

## Context and Problem

- AI features (RAG, churn risk, model versioning) lack a unified quality/safety
  bar: grounding, evals, versioning, and rollout controls are inconsistent.

## Decision

1. **Grounding/Evals:** All AI outputs must cite retrieved sources; eval suite
   (accuracy, hallucination, latency) runs in CI with real fixtures.
2. **Model Versioning:** Track model + prompt version per response; version
   pinning stored in adapters; rollback supported.
3. **Safety/Guardrails:** PII stripping, content filters, and deterministic
   approvals for high-risk actions; human-in-loop for customer-facing changes.
4. **Metrics:** Capture latency, cost, accuracy; store in
   `artifacts/metrics/ai-evals.json`.
5. **Evidence:** Eval reports, prompt/version manifest, and approval logs
   required for completion.

## Considered Options

- Per-feature ad hoc checks (rejected).
- Centralized eval + version manifest (chosen).

## Consequences

Positive: Safer AI outputs, reproducibility, faster rollback. Negative: More CI
time for evals.

## Implementation Notes

- RAG: enforce top-k retrieval with domain filters; log sources.
- Churn risk: use real datasets; prohibit synthetic placeholders in reports.
- Store manifests in repo; approvals logged with trace IDs.

## Verification

- MATOP Intelligence STOA checks eval report, version manifest, approval logs;
  blocks missing/placeholder evidence.

## Links

- ADR-006 Agent Tools, ADR-007 Data Governance, ADR-015 Security.
