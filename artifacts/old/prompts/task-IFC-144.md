# Task Execution Prompt

Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.

## IFC-144 – Design and implement inbound/outbound email flows: SPF/DKIM/DMARC; inbound parsing; attachments; implement general webhook handling with idempotency and retries; publish public API specification (OpenAPI) with versioning; baseline inbound email feature delivered

**Sprint:** 10
**Section:** Integration
**Owner:** Integration Lead + Backend Dev (STOA-Domain)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-137
- IFC-003
- IFC-150
- IFC-151
- IFC-106

Dependency Status:
- IFC-137 (DONE)
- IFC-003 (DONE)
- IFC-150 (DONE)
- IFC-151 (DONE)
- IFC-106 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;POLICY:Domain events defined; messaging port identified;FILE:docs/operations/quality-gates.md;FILE:docs/design-system/token-mapping.md;FILE:docs/company/brand/visual-identity.md;FILE:packages/domain/src/legal/appointments/Appointment.ts;FILE:apps/api/src/trpc.ts;FILE:docs/events/contracts-v1.yaml;FILE:docs/operations/runbooks/dlq-triage.md;FILE:docs/architecture/hex-boundaries.md

### Definition of Done
1. Outbound emails signed with SPF/DKIM/DMARC configured
2. inbound email parser implemented with attachments handling
3. webhooks infrastructure with idempotency and retries
4. OpenAPI spec version 1 published covering major endpoints
5. baseline email send/receive tested
6. targets: >=95%, >=99%, >=100%

### Artifacts to Track
- ARTIFACT:packages/adapters/src/messaging/email/outbound.ts
- ARTIFACT:packages/adapters/src/messaging/email/inbound.ts
- ARTIFACT:artifacts/misc/webhooks/framework.ts
- ARTIFACT:artifacts/misc/api-spec/openapi-v1.yaml
- EVIDENCE:artifacts/attestations/IFC-144/context_ack.json

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