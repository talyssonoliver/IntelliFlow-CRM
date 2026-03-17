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

## PG-017 – Sign Up Success

**Sprint:** 13
**Section:** Auth Pages
**Owner:** Platform FE (STOA-Foundation)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- PG-016

Dependency Status:
- PG-016 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Success message;POLICY:next steps defined;FILE:apps/web/app/(auth)/signup/page.tsx

### Definition of Done
1. Response <200ms, Lighthouse ≥90, onboarding started
2. artifacts: page.tsx, onboarding-flow.tsx, tracking-pixel.ts

### Artifacts to Track
- ARTIFACT:apps/web/app/(auth)/signup/success/page.tsx
- ARTIFACT:apps/web/components/shared/onboarding-flow.tsx
- ARTIFACT:apps/web/lib/shared/tracking-pixel.ts
- EVIDENCE:artifacts/attestations/PG-017/context_ack.json

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