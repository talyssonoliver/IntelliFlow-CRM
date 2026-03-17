# Task Execution Prompt

Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.

## PG-001 – Home Page

**Sprint:** 11
**Section:** Public Pages
**Owner:** Growth FE (STOA-Foundation)
**Status:** Planned

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-076
- GTM-002
- BRAND-001

Dependency Status:
- IFC-076 (DONE)
- GTM-002 (DONE)
- BRAND-001 (DONE)

### Pre-requisites
FILE:docs/design/page-registry.md;FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;POLICY:Design approved;ENV:content ready;FILE:artifacts/misc/accessibility-audit.json;FILE:docs/company/messaging/positioning.md;FILE:docs/company/brand/visual-identity.md;FILE:docs/company/brand/style-guide.md;FILE:docs/company/brand/dos-and-donts.md;FILE:docs/company/brand/accessibility-patterns.md

### Definition of Done
1. Response <200ms, Lighthouse ≥90, SEO optimized
2. artifacts: page.tsx, loading.tsx, error.tsx
3. gates: lighthouse-gte-90

### Artifacts to Track
- SPEC:.specify/specifications/PG-001.md
- PLAN:.specify/planning/PG-001.md
- EVIDENCE:artifacts/attestations/PG-001/context_pack.md
- EVIDENCE:artifacts/attestations/PG-001/context_ack.json
- ARTIFACT:apps/web/app/(public)/page.tsx
- ARTIFACT:apps/web/app/(public)/loading.tsx
- ARTIFACT:apps/web/app/(public)/error.tsx
- ARTIFACT:artifacts/misc/seo-meta.json

### Validation
GATE:lighthouse-gte-90

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