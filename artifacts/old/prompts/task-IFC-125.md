# Task Execution Prompt

Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.

## IFC-125 – Implement guardrails for prompt injection, data leakage, and monitor AI bias

**Sprint:** 11
**Section:** AI Foundation
**Owner:** AI Specialist + Security (STOA-Security)
**Status:** Planned

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-005
- IFC-008

Dependency Status:
- IFC-005 (DONE)
- IFC-008 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:AI models integrated;FILE:docs/planning/adr/ADR-007-data-governance.md;FILE:docs/shared/review-checklist.md;FILE:docs/operations/pr-checklist.md;FILE:apps/ai-worker/src/chains/scoring.chain.ts;FILE:artifacts/reports/compliance-report.md

### Definition of Done
1. Prompt sanitization, output redaction, bias detection metrics
2. incidents logged
3. artifacts: prompt-sanitizer.ts, bias-metrics.csv, ai-guardrails-report.md
4. targets: zero errors
5. verified by: pnpm test

### Artifacts to Track
- SPEC:.specify/specifications/IFC-125.md
- PLAN:.specify/planning/IFC-125.md
- EVIDENCE:artifacts/attestations/IFC-125/context_pack.md
- EVIDENCE:artifacts/attestations/IFC-125/context_ack.json
- ARTIFACT:apps/api/src/shared/prompt-sanitizer.ts
- ARTIFACT:artifacts/metrics/bias-metrics.csv
- ARTIFACT:docs/shared/ai-guardrails-report.md

### Validation
VALIDATE:pnpm test

### Brand / UX / Flows References
- Brand: docs/company/brand/style-guide.md
- Page Registry: docs/design/page-registry.md
- Sitemap: docs/design/sitemap.md
- Check the relevant Flows: apps/project-tracker/docs/metrics/_global/flows/

### Context Controls
- Build context pack and context ack before coding.
- Evidence folder: artifacts/attestations/<task_id>/
- Use spec/plan if present under .specify/.

---

## Delivery Checklist
- Follow TDD: write/extend tests before implementation.
- Respect Definition of Done and produce required artifacts.
- Run lint/typecheck/test/build/security scans.
- Attach evidence (context_pack, context_ack, summaries).