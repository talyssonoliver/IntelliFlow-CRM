# Task Execution Prompt

Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.
### Key Objectives
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

## IFC-126 – Continuously maintain ADR registry and developer guide updates

**Sprint:** 12
**Section:** Documentation
**Owner:** Tech Writer + PM (STOA-Foundation)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-100
- GOV-001

Dependency Status:
- IFC-100 (DONE)
- GOV-001 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:ADR templates ready;FILE:docs/architecture/adr/000-template.md;FILE:docs/company/brand/visual-identity.md;FILE:docs/shared/adr-index.md

### Definition of Done
1. All significant design decisions captured via ADRs
2. developer guide updated per sprint
3. targets: >=100%, >=80%

### Artifacts to Track
- ARTIFACT:docs/dev-guide.md
- ARTIFACT:artifacts/misc/adr-index.csv
- EVIDENCE:artifacts/attestations/IFC-126/context_ack.json

### Validation
AUDIT:code-review;GATE:coverage-gte-80

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