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

**Current Sprint:** 12
**Sprint Progress:** 6/16 (38%)

### Recommended Actions

1. Complete in-progress tasks first: IFC-081, PG-009, PG-011, PG-014, IFC-126, IFC-148, IFC-154, IFC-155
2. Task PG-010 will unblock when you complete: PG-009
3. Task PG-012 will unblock when you complete: PG-011

### In Progress Tasks

- **IFC-081**: API Documentation (tRPC + OpenAPI)
- **PG-009**: Blog Index
- **PG-011**: Careers Page
- **PG-014**: Status Page
- **IFC-126**: Continuously maintain ADR registry and developer guide updates
- **IFC-148**: Implement conversation record entity: store chat transcripts; tool calls; actions per case; enable search and retrieval; integrate audit logging and data retention policies
- **IFC-154**: OCR + text extraction worker for scanned PDFs/images; normalized text artifacts stored for search and RAG
- **IFC-155**: Permissioned indexing for case documents and notes: full-text + embeddings with tenant/case ACL filters

### Blocked Tasks (for context)

- **PG-010** ← blocked by: PG-009
- **PG-012** ← blocked by: PG-011

---

## IFC-148 – Implement conversation record entity: store chat transcripts; tool calls; actions per case; enable search and retrieval; integrate audit logging and data retention policies

**Sprint:** 12
**Section:** AI Assistant
**Owner:** Backend Dev + AI Specialist (STOA-Intelligence)
**Status:** In Progress

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-139
- IFC-126

**Dependency Status:**
- IFC-139 (DONE)
- IFC-126 (IN_PROGRESS)

### Pre-requisites
- [✓] FILE: `artifacts/sprint0/codex-run/Framework.md`
- [✓] FILE: `audit-matrix.yml`
- ENV: Agent tool-calling infrastructure
- ADR registry
- [✓] FILE: `docs/planning/adr/ADR-006-agent-tools.md`
- [✓] FILE: `docs/planning/adr/ADR-007-data-governance.md`
- [✓] FILE: `docs/planning/adr/ADR-008-audit-logging.md`
- [✓] FILE: `docs/planning/DDD-context-map.puml`
- [✓] FILE: `packages/db/prisma/schema.prisma`
- [✓] FILE: `docs/operations/quality-gates.md`
- [✓] FILE: `artifacts/misc/logs/agent-actions.log`
- [✓] FILE: `docs/dev-guide.md`

### Definition of Done
1. Database schema created
2. conversation records stored with metadata (case ID; timestamps; user/agent ID; tool calls)
3. search API implemented
4. access control enforced
5. retention and DSAR compliance built-in
6. tests covering privacy controls
7. targets: >=100%

### Artifacts to Track
- ARTIFACT:packages/db/prisma/conversation.sql
- ARTIFACT:apps/api/src/modules/conversation.ts
- ARTIFACT:artifacts/misc/search/conversation-index.ts
- ARTIFACT:artifacts/misc/data-retention-config.yaml
- EVIDENCE:artifacts/attestations/IFC-148/context_ack.json

### Validation
VALIDATE:pnpm test;VALIDATE:pnpm test:integration

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