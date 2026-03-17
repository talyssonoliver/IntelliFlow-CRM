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

## IFC-022 – PHASE-011: Structured AI Output Implementation

**Sprint:** 13
**Section:** Intelligence
**Owner:** AI Specialist + Backend Dev (STOA-Intelligence)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-021

Dependency Status:
- IFC-021 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Zod schemas for AI outputs;ENV:validation ready;FILE:docs/architecture/repo-layout.md;FILE:docs/operations/engineering-playbook.md;FILE:artifacts/misc/crew-config.yaml

### Definition of Done
1. AI responses validated, confidence scores included
2. artifacts: output-validation-test.ts, confidence-calibration.json, context_ack.json
3. targets: >=100%

### Artifacts to Track
- ARTIFACT:apps/api/src/shared/output-validation-test.ts
- ARTIFACT:artifacts/misc/confidence-calibration.json
- EVIDENCE:artifacts/attestations/IFC-022/context_ack.json

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