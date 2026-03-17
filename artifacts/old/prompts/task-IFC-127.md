# Task Execution Prompt

Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.

## IFC-127 – Implement tenant isolation at database and application layers

**Sprint:** 10
**Section:** Security
**Owner:** Backend Dev (STOA-Domain)
**Status:** Completed

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-098
- IFC-072

Dependency Status:
- IFC-098 (DONE)
- IFC-072 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Supabase and RLS features studied;FILE:docs/planning/adr/ADR-004-multi-tenancy.md;FILE:docs/planning/adr/ADR-007-data-governance.md;FILE:docs/architecture/hex-boundaries.md;FILE:packages/db/prisma/schema.prisma;FILE:docs/security/zero-trust-design.md;FILE:docs/security/owasp-checklist.md;FILE:packages/db/prisma/schema-audit.prisma

### Definition of Done
1. Row‑level security policies applied
2. tenant context enforced in services
3. per‑tenant resource limits
4. artifacts: rls-policies.sql, tenant-context.ts, context_ack.json
5. verified by: pnpm test

### Artifacts to Track
- SPEC:.specify/specifications/IFC-127.md
- PLAN:.specify/planning/IFC-127.md
- EVIDENCE:artifacts/attestations/IFC-127/context_pack.md
- EVIDENCE:artifacts/attestations/IFC-127/context_ack.json
- ARTIFACT:infra/supabase/rls-policies.sql
- ARTIFACT:apps/api/src/security/tenant-context.ts

### Validation
VALIDATE:pnpm test;AUDIT:security-review

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