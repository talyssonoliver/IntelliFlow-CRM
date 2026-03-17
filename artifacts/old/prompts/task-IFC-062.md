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

## Dynamic Project Context

**Current Sprint:** 14
**Sprint Progress:** 16/30 (53%)

### Recommended Actions

1. Ready to start: PG-029, PG-030, PG-031

### Blocked Tasks (for context)

- **IFC-062** ← blocked by: FILE:docs/api/contracts/api-contracts.yaml;IFC-104
- **IFC-063** ← blocked by: FILE:docs/api/contracts/api-contracts.yaml;IFC-104
- **IFC-064** ← blocked by: FILE:docs/api/contracts/api-contracts.yaml;IFC-063
- **IFC-065** ← blocked by: FILE:docs/api/contracts/api-contracts.yaml;IFC-092
- **IFC-066** ← blocked by: FILE:docs/api/contracts/api-contracts.yaml;IFC-092
- ... and 3 more

### Ready to Start (after current task)

- **PG-029**: Payment Methods
- **PG-030**: Subscriptions
- **PG-031**: Receipts
- **TRACK-004**: AI Metrics UI - Model performance drift detection cost tracking
- **TRACK-005**: Security Dashboard UI - Vulnerability tracking scan results security posture

---

## IFC-062 – FLOW-006: Lead to Deal Conversion Logic

**Sprint:** 14
**Section:** Core CRM
**Owner:** Backend Dev + Domain Expert (STOA-Domain)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-061
- FILE:docs/api/contracts/api-contracts.yaml;IFC-104

**Dependency Status:**
- IFC-061 (DONE)
- FILE:docs/api/contracts/api-contracts.yaml;IFC-104 (UNKNOWN)

### Pre-requisites
- IMPLEMENTS: `FLOW-006`
- [✓] FILE: `packages/domain/src/crm/lead/Lead.ts`
- [✓] FILE: `packages/domain/src/crm/opportunity/Opportunity.ts`
- [✓] FILE: `apps/api/src/modules/opportunity/opportunity.router.ts`

### Definition of Done
1. Lead converts to Deal/Opportunity with pipeline assignment
2. artifacts: deal-conversion-service.ts
3. targets: <200ms

### Artifacts to Track
- ARTIFACT:packages/application/src/usecases/leads/ConvertLeadToDealUseCase.ts
- ARTIFACT:packages/application/src/usecases/leads/__tests__/ConvertLeadToDealUseCase.test.ts
- EVIDENCE:artifacts/attestations/IFC-062/context_ack.json

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