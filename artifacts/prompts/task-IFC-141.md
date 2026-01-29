# Task Execution Prompt

Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.

## IFC-141 – Evaluate n8n; custom engine; and Temporal; document decision via ADR; build event-driven minimal rules engine and integrate selected workflow engine

**Sprint:** 10
**Section:** Workflow
**Owner:** Tech Lead + Backend Dev + Product Manager (STOA-Domain)
**Status:** Planned

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-136
- IFC-137
- IFC-135
- IFC-150
- IFC-151

Dependency Status:
- IFC-136 (DONE)
- IFC-137 (DONE)
- IFC-135 (DONE)
- IFC-150 (DONE)
- IFC-151 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Domain events instrumentation ready;FILE:docs/planning/adr/ADR-005-workflow-engine.md;FILE:docs/operations/quality-gates.md;FILE:docs/architecture/adr/000-template.md;FILE:docs/architecture/decision-workflow.md;FILE:docs/company/brand/visual-identity.md;FILE:packages/domain/src/legal/cases/Case.ts;FILE:packages/domain/src/legal/appointments/Appointment.ts;FILE:docs/planning/adr/ADR-004-multi-tenancy.md;FILE:docs/events/contracts-v1.yaml;FILE:docs/operations/runbooks/dlq-triage.md

### Definition of Done
1. Comparative analysis of workflow options
2. ADR published
3. POC implemented
4. events published for case status changes
5. selected engine integrated to process simple workflows
6. Ensure integration with actual implementation
7. artifacts: adr-workflow-decision.md, events-spec.yaml, context_ack.json
8. targets: >=95%
9. verified by: pnpm test

### Artifacts to Track
- SPEC:.specify/specifications/IFC-141.md
- PLAN:.specify/planning/IFC-141.md
- EVIDENCE:artifacts/attestations/IFC-141/context_pack.md
- EVIDENCE:artifacts/attestations/IFC-141/context_ack.json
- ARTIFACT:docs/adr/adr-workflow-decision.md
- ARTIFACT:artifacts/misc/events-spec.yaml

### Validation
VALIDATE:pnpm test;AUDIT:code-review

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