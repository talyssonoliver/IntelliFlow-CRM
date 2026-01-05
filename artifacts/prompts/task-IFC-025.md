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

## IFC-025 – PHASE-011: A/B Testing Framework

**Sprint:** 14
**Section:** Intelligence
**Owner:** Act as Data Scientist + Backend Dev (STOA-Intelligence)
**Status:** Planned

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-022

Dependency Status:
- IFC-022 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Feature flags setup;POLICY:metrics defined;FILE:docs/tdd-guidelines.md;FILE:apps/api/src/shared/output-validation-test.ts, FILE: docs\design\UI_DEVELOPMENT_PROMPT.md, FILE: docs\company\brand\DESIGN_SYSTEM_LLM_INDEX.md

### Definition of Done
1. AI vs manual scoring comparison, statistical analysis
2. artifacts: ab-test-config.json, statistical-analysis.ipynb, experiment-dashboard.png

### Artifacts to Track
- SPEC:.specify/specifications/IFC-025.md
- PLAN:.specify/planning/IFC-025.md
- EVIDENCE:artifacts/attestations/IFC-025/context_pack.md
- EVIDENCE:artifacts/attestations/IFC-025/context_ack.json
- ARTIFACT:artifacts/misc/ab-test-config.json
- ARTIFACT:artifacts/misc/statistical-analysis.ipynb
- ARTIFACT:artifacts/misc/experiment-dashboard.png

### Validation
AUDIT:manual-review scripts (check package.json)
Run STOA-Intelligence
**Architecture Summary**

  packages/domain (const arrays with `as const`) 
         ↓
  packages/validators (Zod schemas derived from domain)
         ↓
  packages/application (use cases, ports)
         ↓
  packages/adapters (infrastructure implementations)
         ↓
  apps/api & apps/web (consuming packages)

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