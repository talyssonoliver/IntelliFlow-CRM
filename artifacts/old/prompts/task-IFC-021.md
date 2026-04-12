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

## IFC-021 – PHASE-011: CrewAI Agent Framework

**Sprint:** 13
**Section:** Intelligence
**Owner:** Backend Dev + AI Specialist (STOA-Intelligence)
**Status:** Planned

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-020

Dependency Status:
- IFC-020 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:CrewAI setup;POLICY:agent roles defined;FILE:docs/planning/adr/ADR-006-agent-tools.md;FILE:docs/ai-architecture.md

### Definition of Done
1. Lead qualifier, email writer, follow-up agents
2. artifacts: crew-config.yaml, agent-interaction-logs.json, orchestration-test.ts
3. verified by: pnpm test

### Artifacts to Track
- SPEC:.specify/specifications/IFC-021.md
- PLAN:.specify/planning/IFC-021.md
- EVIDENCE:artifacts/attestations/IFC-021/context_pack.md
- EVIDENCE:artifacts/attestations/IFC-021/context_ack.json
- ARTIFACT:artifacts/misc/crew-config.yaml
- ARTIFACT:artifacts/logs/agent-interaction-logs.json
- ARTIFACT:apps/api/src/agent/orchestration-test.ts

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