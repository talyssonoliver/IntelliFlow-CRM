# Task Execution Prompt

Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.

## IFC-076 – Component Library (shadcn/ui)

**Sprint:** 10
**Section:** Quality
**Owner:** Frontend Dev + UX (STOA-Domain)
**Status:** Planned

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-014
- BRAND-002

Dependency Status:
- IFC-014 (DONE)
- BRAND-002 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:shadcn/ui installed;POLICY:design system defined;FILE:docs/design-system/token-mapping.md;FILE:docs/company/brand/visual-identity.md;FILE:artifacts/reports/web-vitals-report.json

### Definition of Done
1. Reusable components with Storybook docs
2. artifacts: accessibility-audit.json, component-usage.csv, context_ack.json
3. targets: >=100%

### Artifacts to Track
- SPEC:.specify/specifications/IFC-076.md
- PLAN:.specify/planning/IFC-076.md
- EVIDENCE:artifacts/attestations/IFC-076/context_pack.md
- EVIDENCE:artifacts/attestations/IFC-076/context_ack.json
- ARTIFACT:artifacts/misc/accessibility-audit.json
- ARTIFACT:artifacts/misc/component-usage.csv

### Validation
AUDIT:manual-review

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