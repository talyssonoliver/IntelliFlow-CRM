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

**Current Sprint:** 1
**Sprint Progress:** 11/13 (85%)

### Recommended Actions

1. Complete in-progress tasks first: ENV-017-AI, BRAND-002

### In Progress Tasks

- **ENV-017-AI**: Automated Integration Testing
- **BRAND-002**: Design Tokens Integration Plan (Tailwind/shadcn theme mapping)

---

## ENV-017-AI – Automated Integration Testing

**Sprint:** 1
**Section:** Foundation Setup
**Owner:** All Teams + AI Orchestrator (STOA-Intelligence)
**Status:** In Progress

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- ENV-001-AI
- ENV-003-AI
- ENV-005-AI
- ENV-010-AI
- IFC-001

**Dependency Status:**
- ENV-001-AI (DONE)
- ENV-003-AI (DONE)
- ENV-005-AI (DONE)
- ENV-010-AI (DONE)
- IFC-001 (DONE)

### Pre-requisites
- [✓] FILE: `artifacts/sprint0/codex-run/Framework.md`
- [✓] FILE: `audit-matrix.yml`
- ENV: All components ready
- ENV: AI orchestration active
- [✓] FILE: `docs/tdd-guidelines.md`
- [✓] FILE: `turbo.json`
- [✓] FILE: `docker-compose.yml`
- [✓] FILE: `.github/workflows/ci.yml`
- [✓] FILE: `artifacts/coverage/index.html`
- [✓] FILE: `docs/planning/adr/ADR-001-modern-stack.md`

### Definition of Done
1. System AI-tested, issues AI-detected and fixed, demo AI-prepared, metrics AI-verified
2. artifacts: test-orchestration.json, bug-fixes.log, confidence-metrics.csv
3. targets: zero errors

### Artifacts to Track
- ARTIFACT:artifacts/misc/test-orchestration.json
- ARTIFACT:artifacts/logs/bug-fixes.log
- ARTIFACT:artifacts/metrics/confidence-metrics.csv
- EVIDENCE:artifacts/attestations/ENV-017-AI/context_ack.json

### Validation
VALIDATE:pnpm test

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