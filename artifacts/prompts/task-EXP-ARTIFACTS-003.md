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

**Current Sprint:** 14
**Sprint Progress:** 5/30 (17%)

### Recommended Actions

1. Complete in-progress tasks first: EXP-ARTIFACTS-002, EXP-ARTIFACTS-003

### In Progress Tasks

- **EXP-ARTIFACTS-002**: Cookie Consent Component Implementation (GDPR)
- **EXP-ARTIFACTS-003**: Vulnerability Baseline Documentation

### Blocked Tasks (for context)

- **IFC-062** ← blocked by: IFC-061
- **IFC-064** ← blocked by: IFC-063
- **PG-026** ← blocked by: PG-025
- **PG-027** ← blocked by: PG-025
- **PG-028** ← blocked by: PG-027
- ... and 4 more

### Ready to Start (after current task)

- **IFC-061**: FLOW-006: Lead to Contact Conversion Logic
- **IFC-063**: FLOW-007: Pipeline Stage Customization
- **IFC-065**: FLOW-009: Deal Won Closure Workflow
- **IFC-066**: FLOW-009: Deal Lost Closure Workflow
- **IFC-067**: FLOW-012: Automatic Ticket Routing Engine

---

## EXP-ARTIFACTS-003 – Vulnerability Baseline Documentation

**Sprint:** 14
**Section:** Security
**Owner:** Security Team (STOA-Security)
**Status:** In Progress

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- None

### Pre-requisites
- [✓] FILE: `CLAUDE.md`
- [✓] FILE: `audit-matrix.yml`
- ENV: Security scanning tools configured

### Definition of Done
1. Baseline documented with zero vulnerabilities
2. security baseline maintained
3. targets: zero critical

### Artifacts to Track
- ARTIFACT:artifacts/misc/vulnerability-baseline.json
- EVIDENCE:artifacts/attestations/EXP-ARTIFACTS-003/context_ack.json

### Validation
AUDIT:security-review

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