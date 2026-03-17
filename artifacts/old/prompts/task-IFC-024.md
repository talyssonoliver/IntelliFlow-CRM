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

## IFC-024 – PHASE-011: Human-in-the-Loop Feedback

**Sprint:** 14
**Section:** Intelligence
**Owner:** Full Stack Dev (STOA-Foundation)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-023

Dependency Status:
- IFC-023 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Feedback UI designed;ENV:learning pipeline ready;FILE:artifacts/reports/user-test-results.md

### Definition of Done
1. Score adjustments tracked, model improvement loop
2. artifacts: feedback-analytics.json, context_ack.json

### Artifacts to Track
- ARTIFACT:artifacts/misc/feedback-analytics.json
- EVIDENCE:artifacts/attestations/IFC-024/context_ack.json

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