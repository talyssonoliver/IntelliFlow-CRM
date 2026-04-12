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

## IFC-153 – Ingestion pipeline for case files: upload/email attachment intake, antivirus scan, metadata extraction, storage, and indexing triggers

**Sprint:** 12
**Section:** Case Docs
**Owner:** Backend Dev + Integration Eng (STOA-Domain)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-152
- IFC-144
- IFC-151
- IFC-106

Dependency Status:
- IFC-152 (DONE)
- IFC-144 (DONE)
- IFC-151 (DONE)
- IFC-106 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Object storage configured; email inbound baseline; event consumers available;FILE:docs/planning/adr/ADR-007-data-governance.md;FILE:docs/operations/quality-gates.md;FILE:packages/domain/src/legal/cases/case-document.ts;FILE:packages/adapters/src/messaging/email/outbound.ts;FILE:docs/operations/runbooks/dlq-triage.md;FILE:docs/architecture/hex-boundaries.md

### Definition of Done
1. Upload + inbound email attachments land in storage
2. AV scan gate
3. metadata extracted
4. ingestion events emitted
5. failure handling + retries
6. integration tests
7. targets: >=99%, >=100%, >=1%

### Artifacts to Track
- ARTIFACT:docs/operations/runbooks/ingestion.md
- EVIDENCE:artifacts/attestations/IFC-153/context_ack.json

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