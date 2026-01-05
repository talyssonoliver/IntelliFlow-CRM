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

## IFC-159 – Case timeline enrichment: include documents/versions, communications (email/WhatsApp), and agent actions/approvals as timeline events

**Sprint:** 13
**Section:** UI/Domain
**Owner:** Frontend Dev + Backend Dev (STOA-Domain)
**Status:** Planned

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-147
- IFC-153
- IFC-144
- IFC-149
- IFC-148

Dependency Status:
- IFC-147 (DONE)
- IFC-153 (DONE)
- IFC-144 (DONE)
- IFC-149 (DONE)
- IFC-148 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Timeline UI exists; ingestion pipeline available; comms and agent actions recorded;FILE:docs/planning/adr/ADR-006-agent-tools.md;FILE:docs/shared/review-checklist.md;FILE:docs/operations/pr-checklist.md;FILE:apps/web/src/app/cases/timeline/page.tsx;FILE:docs/operations/runbooks/ingestion.md;FILE:packages/adapters/src/messaging/email/outbound.ts;FILE:apps/web/src/app/agent-approvals/preview/page.tsx;FILE:packages/db/prisma/conversation.sql;FILE:docs/design/sitemap.md;FILE:docs/design/ui-flow-mapping.md;FILE:docs/design/page-registry.md;FILE:apps/project-tracker/docs/metrics/_global/flows/flow-index.md

### Definition of Done
1. Timeline shows unified chronological events (tasks/deadlines/docs/comms/agent actions)
2. filters
3. permissions enforced
4. E2E tests
5. targets: <1s

### Artifacts to Track
- SPEC:.specify/specifications/IFC-159.md
- PLAN:.specify/planning/IFC-159.md
- EVIDENCE:artifacts/attestations/IFC-159/context_pack.md
- EVIDENCE:artifacts/attestations/IFC-159/context_ack.json
- ARTIFACT:apps/api/src/modules/misc/timeline.ts
- ARTIFACT:apps/web/lib/documents/timeline-event-model.ts

### Validation
VALIDATE:pnpm test;VALIDATE:pnpm test:e2e

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