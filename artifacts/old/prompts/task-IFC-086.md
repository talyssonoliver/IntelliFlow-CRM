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

## IFC-086 – Model Versioning with Zep

**Sprint:** 14
**Section:** AI/ML
**Owner:** AI Specialist + Backend Dev (STOA-Intelligence)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-020

Dependency Status:
- IFC-020 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Zep configured;POLICY:versioning strategy defined;FILE:packages/db/prisma/schema.prisma;FILE:docs/ai-architecture.md

### Definition of Done
1. All prompts and chains versioned, A/B testable
2. artifacts: prompt-versions.json, rollback-test.log, ab-test-config.yaml
3. targets: >=100%

### Artifacts to Track
- ARTIFACT:artifacts/misc/prompt-versions.json
- ARTIFACT:artifacts/logs/rollback-test.log
- ARTIFACT:artifacts/misc/ab-test-config.yaml
- EVIDENCE:artifacts/attestations/IFC-086/context_ack.json

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