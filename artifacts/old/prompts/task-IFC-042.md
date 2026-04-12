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

## IFC-042 – tRPC API Client SDK Docs

**Sprint:** 12
**Section:** Documentation
**Owner:** Backend Dev + Tech Writer (STOA-Domain)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-013

Dependency Status:
- IFC-013 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:tRPC client generated;ENV:types exported;FILE:docs/planning/adr/ADR-001-modern-stack.md;FILE:apps/api/src/modules/lead/lead.router.ts

### Definition of Done
1. NPM package docs, TypeScript examples
2. artifacts: README.md, npm-publish-log.txt, autocomplete-demo.gif

### Artifacts to Track
- ARTIFACT:packages/sdk/README.md
- ARTIFACT:artifacts/misc/npm-publish-log.txt
- ARTIFACT:artifacts/misc/autocomplete-demo.gif
- ARTIFACT:apps/project-tracker/docs/metrics/_global/flows/FLOW-002.md
- ARTIFACT:apps/project-tracker/docs/metrics/_global/phase-validations/PHASE-002-validation.md
- EVIDENCE:artifacts/attestations/IFC-042/context_ack.json

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