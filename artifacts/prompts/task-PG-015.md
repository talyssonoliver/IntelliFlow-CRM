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

## PG-015 – Sign In

**Sprint:** 13
**Section:** Auth Pages
**Owner:** Platform FE (STOA-Foundation)
**Status:** Planned

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-076
- IFC-098

Dependency Status:
- IFC-076 (DONE)
- IFC-098 (DONE)

### Pre-requisites
IMPLEMENTS:FLOW-001;FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Auth flow designed;ENV:SSO configured;FILE:artifacts/misc/accessibility-audit.json;FILE:packages/db/prisma/schema-audit.prisma

### Definition of Done
1. Response <200ms, Lighthouse ≥90, auth working
2. artifacts: page.tsx, auth-providers.tsx, login-security.ts
3. verified by: pnpm test

### Artifacts to Track
- SPEC:.specify/specifications/PG-015.md
- PLAN:.specify/planning/PG-015.md
- EVIDENCE:artifacts/attestations/PG-015/context_pack.md
- EVIDENCE:artifacts/attestations/PG-015/context_ack.json
- ARTIFACT:apps/web/app/(auth)/login/page.tsx
- ARTIFACT:apps/web/components/shared/auth-providers.tsx
- ARTIFACT:apps/web/lib/shared/login-security.ts

### Validation
VALIDATE:pnpm test;GATE:lighthouse-gte-90

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