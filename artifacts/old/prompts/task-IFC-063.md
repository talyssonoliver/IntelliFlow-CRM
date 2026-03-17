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

## IFC-063 – FLOW-007: Pipeline Stage Customization

**Sprint:** 14
**Section:** Core CRM
**Owner:** Frontend Dev + Backend Dev (STOA-Domain)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-091
- IFC-104

Dependency Status:
- IFC-091 (DONE)
- IFC-104 (DONE)

### Pre-requisites
IMPLEMENTS:FLOW-007;FILE:apps/api/src/modules/opportunity/opportunity.router.ts;FILE:packages/domain/src/crm/opportunity/Opportunity.ts

### Definition of Done
1. Users can customize pipeline stages, colors, and order
2. artifacts: pipeline-config.ts
3. targets: <100ms save

### Artifacts to Track
- ARTIFACT:apps/api/src/modules/opportunity/pipeline-config.router.ts
- ARTIFACT:apps/web/src/app/settings/pipeline/page.tsx
- EVIDENCE:.specify/sprints/sprint-14/attestations/IFC-063/context_ack.json

### Validation
VALIDATE:pnpm test

### Brand / UX / Flows References
- Brand: docs/company/brand/style-guide.md
- Page Registry: docs/design/page-registry.md
- Sitemap: docs/design/sitemap.md
- Check the relevant Flows: apps/project-tracker/docs/metrics/_global/flows/

### Context Controls
- Build context pack and context ack before coding.
- Evidence folder: .specify/sprints/sprint-{N}/attestations/<task_id>/
- Use spec/plan from .specify/sprints/sprint-{N}/specifications/ and planning/

---

## Delivery Checklist
- Follow TDD: write/extend tests before implementation.
- Respect Definition of Done and produce required artifacts.
- Run lint/typecheck/test/build/security scans.
- Attach evidence (context_pack, context_ack, summaries).