# Task Execution Prompt

Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.

## IFC-158 – Scheduling communications: ICS invites, reschedule/cancel flows, reminders; integrated with notification service and calendar sync

**Sprint:** 11
**Section:** Scheduling
**Owner:** Backend Dev + Calendar Specialist (STOA-Domain)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-138
- IFC-157
- IFC-137

Dependency Status:
- IFC-138 (DONE)
- IFC-157 (BACKLOG)
- IFC-137 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Calendar sync stable; notification service MVP available; appointment aggregate ready;FILE:docs/architecture/hex-boundaries.md;FILE:packages/adapters/src/calendar/google/client.ts;FILE:docs/operations/runbooks/notifications.md;FILE:packages/domain/src/legal/appointments/Appointment.ts

### Definition of Done
1. ICS generation and delivery implemented
2. reschedule/cancel semantics correct
3. reminders scheduled
4. audit trail
5. integration tests
6. artifacts: context_ack.json
7. targets: >=95%, >=99%, zero errors

### Artifacts to Track
- EVIDENCE:artifacts/attestations/IFC-158/context_ack.json

### Validation
VALIDATE:pnpm test:e2e

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