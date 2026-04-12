# Task Execution Prompt

Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.

## PG-004 – About Page

**Sprint:** 11
**Section:** Public Pages
**Owner:** Growth FE (STOA-Foundation)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- PG-001
- GTM-002
- BRAND-001

Dependency Status:
- PG-001 (BACKLOG)
- GTM-002 (DONE)
- BRAND-001 (DONE)

### Pre-requisites
FILE:docs/design/page-registry.md;FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Company story written;ENV:team photos ready;FILE:apps/web/app/(public)/page.tsx;FILE:docs/company/messaging/positioning.md;FILE:docs/company/brand/visual-identity.md;FILE:docs/company/brand/style-guide.md;FILE:docs/company/brand/dos-and-donts.md;FILE:docs/company/brand/accessibility-patterns.md

### Definition of Done
1. Response <200ms, Lighthouse ≥90, team displayed
2. artifacts: page.tsx, team-data.json, about-content.md

### Artifacts to Track
- ARTIFACT:apps/web/app/(public)/about/page.tsx
- ARTIFACT:artifacts/misc/team-data.json
- ARTIFACT:docs/about/about-content.md
- EVIDENCE:artifacts/attestations/PG-004/context_ack.json

### Validation
AUDIT:manual-review;GATE:lighthouse-gte-90

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