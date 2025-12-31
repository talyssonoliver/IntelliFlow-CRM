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

## PG-006 – Partners Page

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
- PG-001 (PLANNED)
- GTM-002 (DONE)
- BRAND-001 (DONE)

### Pre-requisites
FILE:docs/design/page-registry.md;FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Partner logos;ENV:benefits outlined;FILE:apps/web/app/(public)/page.tsx;FILE:docs/company/messaging/positioning.md;FILE:docs/company/brand/visual-identity.md;FILE:docs/company/brand/style-guide.md;FILE:docs/company/brand/dos-and-donts.md;FILE:docs/company/brand/accessibility-patterns.md

### Definition of Done
1. Response <200ms, Lighthouse ≥90, logos displayed
2. artifacts: page.tsx, partner-benefits.json, context_ack.json

### Artifacts to Track
- ARTIFACT:apps/web/app/(public)/partners/page.tsx
- ARTIFACT:artifacts/misc/partner-benefits.json
- EVIDENCE:artifacts/attestations/PG-006/context_ack.json

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