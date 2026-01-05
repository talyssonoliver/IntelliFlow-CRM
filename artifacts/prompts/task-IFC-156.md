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

## IFC-156 – Case RAG tool: agent retrieval tool constrained by tenant/case permissions; citations + source trace; prompt-injection hardening for retrieved content

**Sprint:** 13
**Section:** AI Assistant
**Owner:** AI Specialist + Security (STOA-Security)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-155
- IFC-139
- IFC-125

Dependency Status:
- IFC-155 (DONE)
- IFC-139 (DONE)
- IFC-125 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Agent tool-calling exists; guardrails baseline; permissioned retrieval APIs available;FILE:docs/planning/adr/ADR-004-multi-tenancy.md;FILE:docs/planning/adr/ADR-006-agent-tools.md;FILE:docs/shared/review-checklist.md;FILE:docs/operations/quality-gates.md;FILE:docs/operations/pr-checklist.md;FILE:packages/search/retrieval.ts;FILE:artifacts/misc/logs/agent-actions.log;FILE:apps/api/src/shared/prompt-sanitizer.ts

### Definition of Done
1. Agent tool implemented (retrieve_case_context)
2. responses include source references
3. injection defenses applied
4. approval needed for external send
5. tests
6. artifacts: retrieve-case-context.ts, case-rag.md, context_ack.json
7. targets: <2s

### Artifacts to Track
- ARTIFACT:packages/ai/tools/retrieve-case-context.ts
- ARTIFACT:docs/agent/case-rag.md
- EVIDENCE:artifacts/attestations/IFC-156/context_ack.json

### Validation
AUDIT:manual-review;VALIDATE:pnpm test

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