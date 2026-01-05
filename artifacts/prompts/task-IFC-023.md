# Task Execution Prompt

Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.
### Key Objectives
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Availability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

## IFC-023 – PHASE-011: AI Explainability UI

**Sprint:** 13
**Section:** Intelligence
**Owner:** Frontend Dev + UX (STOA-Domain)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-022

Dependency Status:
- IFC-022 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;POLICY:Scoring factors defined;ENV:UI patterns researched;FILE:docs/company/brand/visual-identity.md;FILE:apps/api/src/shared/output-validation-test.ts

### Definition of Done
1. Score explanations visible, factors breakdown shown
2. artifacts: user-test-results.pdf, context_ack.json

### Artifacts to Track
- ARTIFACT:artifacts/reports/user-test-results.pdf
- EVIDENCE:artifacts/attestations/IFC-023/context_ack.json

### Validation
AUDIT:manual-review

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