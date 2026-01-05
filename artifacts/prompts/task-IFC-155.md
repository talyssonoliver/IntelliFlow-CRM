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

## IFC-155 – Permissioned indexing for case documents and notes: full-text + embeddings with tenant/case ACL filters

**Sprint:** 12
**Section:** Search/AI
**Owner:** Backend Dev + AI Specialist (STOA-Intelligence)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-154
- IFC-127
- ENV-004-AI

Dependency Status:
- IFC-154 (DONE)
- IFC-127 (DONE)
- ENV-004-AI (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:pgvector enabled; ACL model implemented; extracted text available;FILE:docs/planning/adr/ADR-004-multi-tenancy.md;FILE:artifacts/benchmarks/ocr-quality-benchmarks.csv;FILE:infra/supabase/rls-policies.sql;FILE:infra/supabase/config.toml

### Definition of Done
1. FTS index and vector embeddings built
2. retrieval APIs enforce tenant/case ACL
3. re-index job
4. purge on DSAR rules
5. tests
6. targets: >=80%, <200ms, zero errors
7. gates: latency-check

### Artifacts to Track
- ARTIFACT:packages/search/retrieval.ts
- ARTIFACT:artifacts/misc/relevance-eval.json
- EVIDENCE:artifacts/attestations/IFC-155/context_ack.json

### Validation
VALIDATE:pnpm test;GATE:latency-check

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