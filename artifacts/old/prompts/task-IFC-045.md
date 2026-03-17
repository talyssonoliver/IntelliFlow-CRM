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

## IFC-045 – Integration Tests (Vitest + MSW)

**Sprint:** 14
**Section:** Testing
**Owner:** QA + Backend Dev (STOA-Quality)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-044

Dependency Status:
- IFC-044 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:MSW configured;ENV:test data factories ready;FILE:docs/tdd-guidelines.md;FILE:docs/shared/review-checklist.md;FILE:artifacts/coverage/index.html

### Definition of Done
1. API integrations tested with mocks
2. artifacts: integration-coverage.json, context_ack.json

### Artifacts to Track
- ARTIFACT:artifacts/coverage/integration-coverage.json
- EVIDENCE:artifacts/attestations/IFC-045/context_ack.json

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