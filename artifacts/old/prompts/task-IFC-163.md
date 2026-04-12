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

## IFC-163 – Standardize worker runtime under apps/workers (events, ingestion, notifications) with shared job framework, metrics, and deployment packaging

**Sprint:** 13
**Section:** Platform
**Owner:** SRE Lead + Backend Dev (STOA-Domain)
**Status:** Planned

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-150
- IFC-151
- IFC-153
- IFC-157
- IFC-106

Dependency Status:
- IFC-150 (DONE)
- IFC-151 (DONE)
- IFC-153 (DONE)
- IFC-157 (DONE)
- IFC-106 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Event infrastructure and ingestion triggers defined; deployment pipeline ready;FILE:docs/operations/release-rollback.md;FILE:docs/events/contracts-v1.yaml;FILE:docs/operations/runbooks/dlq-triage.md;FILE:docs/operations/runbooks/ingestion.md;FILE:docs/operations/runbooks/notifications.md;FILE:docs/architecture/hex-boundaries.md

### Definition of Done
1. apps/workers structure created
2. workers run with shared configuration and telemetry
3. queues configured
4. health checks and dashboards added
5. deployment artifacts produced
6. restore/replay procedures documented
7. targets: >=99%, >=100%, <30s
8. verified by: pnpm test

### Artifacts to Track
- SPEC:.specify/specifications/IFC-163.md
- PLAN:.specify/planning/IFC-163.md
- EVIDENCE:artifacts/attestations/IFC-163/context_pack.md
- EVIDENCE:artifacts/attestations/IFC-163/context_ack.json
- ARTIFACT:apps/workers/events-worker/src/main.ts
- ARTIFACT:apps/workers/events-worker/src/outbox/pollOutbox.ts
- ARTIFACT:apps/workers/ingestion-worker/src/main.ts
- ARTIFACT:apps/workers/ingestion-worker/src/jobs/extractText.job.ts
- ARTIFACT:apps/workers/notifications-worker/src/main.ts
- ARTIFACT:apps/workers/notifications-worker/src/channels/email.ts
- ARTIFACT:infra/monitoring/dashboards/workers.json
- ARTIFACT:docs/operations/workers-runbook.md

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