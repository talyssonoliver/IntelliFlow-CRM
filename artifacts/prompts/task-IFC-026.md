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

**Current Sprint:** 15
**Sprint Progress:** 0/16 (0%)

### Recommended Actions

1. Ready to start: IFC-026, PG-032, PG-124

### Impact of Completing This Task

Completing **IFC-026** will unblock: IFC-027

### Blocked Tasks (for context)

- **IFC-027** ← blocked by: IFC-026
- **PG-033** ← blocked by: PG-032
- **PG-034** ← blocked by: PG-032
- **PG-035** ← blocked by: PG-032
- **PG-036** ← blocked by: PG-032
- ... and 6 more

### Ready to Start (after current task)

- **PG-032**: Docs Index
- **PG-124**: Implement SSO (SAML/OAuth) and social login providers
- **EXC-VOIP-001**: VoIP adapter and call recording integration for telephony workflows
- **EXC-RULES-001**: Business rules engine module for workflow automation and decision logic

---

## IFC-026 – PHASE-011: Playwright E2E Testing

**Sprint:** 15
**Section:** Intelligence
**Owner:** QA + AI Specialist (STOA-Quality)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-022
- IFC-024

**Dependency Status:**
- IFC-022 (DONE)
- IFC-024 (DONE)

### Pre-requisites
- [✓] FILE: `artifacts/sprint0/codex-run/Framework.md`
- [✓] FILE: `audit-matrix.yml`
- ENV: Playwright setup
- POLICY: test scenarios defined
- [✓] FILE: `docs/tdd-guidelines.md`
- [✓] FILE: `apps/api/src/shared/output-validation.test.ts`
- [✓] FILE: `artifacts/misc/feedback-analytics.json`

### Definition of Done
1. E2E tests for AI features, visual regression
2. artifacts: index.html, context_ack.json

### Artifacts to Track
- ARTIFACT:artifacts/misc/playwright-report/index.html
- EVIDENCE:artifacts/attestations/IFC-026/context_ack.json

### Validation
VALIDATE:pnpm test:e2e

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