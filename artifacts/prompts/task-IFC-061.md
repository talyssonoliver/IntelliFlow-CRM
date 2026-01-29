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

## IFC-061 – FLOW-006: Lead to Contact Conversion Logic

**Sprint:** 14
**Section:** Core CRM
**Owner:** Backend Dev + Domain Expert (STOA-Domain)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-089
- IFC-101
- IFC-102

Dependency Status:
- IFC-089 (DONE)
- IFC-101 (DONE)
- IFC-102 (DONE)

### Pre-requisites
IMPLEMENTS:FLOW-006;FILE:packages/domain/src/crm/lead/Lead.ts;FILE:packages/domain/src/crm/contact/Contact.ts;FILE:apps/api/src/modules/contact/contact.router.ts

### Definition of Done
1. Lead converts to Contact with all data preserved, audit trail created
2. artifacts: conversion-service.ts, conversion.test.ts
3. targets: <200ms, 100% data integrity

### Artifacts to Track
- ARTIFACT:packages/application/src/usecases/leads/ConvertLeadToContactUseCase.ts
- ARTIFACT:packages/application/src/usecases/leads/__tests__/ConvertLeadToContactUseCase.test.ts
- EVIDENCE:.specify/sprints/sprint-14/attestations/IFC-061/context_ack.json

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