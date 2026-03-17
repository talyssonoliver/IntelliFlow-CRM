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

## IFC-143 – Perform threat modeling and abuse-case analysis for multi-tenancy and agent tool-calling; design mitigations; schedule penetration test; implement cookie consent mechanism

**Sprint:** 11
**Section:** Security
**Owner:** Security Lead + AI Specialist (STOA-Security)
**Status:** Planned

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-125
- IFC-136
- IFC-139

Dependency Status:
- IFC-125 (PLANNED)
- IFC-136 (DONE)
- IFC-139 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Architecture diagrams and data flows available;FILE:docs/planning/adr/ADR-006-agent-tools.md;FILE:packages/db/prisma/schema.prisma;FILE:docs/security/zero-trust-design.md;FILE:docs/security/owasp-checklist.md;FILE:docs/tdd-guidelines.md;FILE:docs/design-system/token-mapping.md;FILE:docs/company/brand/visual-identity.md;FILE:apps/api/src/shared/prompt-sanitizer.ts;FILE:packages/domain/src/legal/cases/Case.ts;FILE:artifacts/misc/logs/agent-actions.log

### Definition of Done
1. Threat model documented
2. abuse cases enumerated
3. mitigation tasks created
4. penetration test executed and findings triaged
5. cookie consent banner implemented
6. compliance checks passed

### Artifacts to Track
- SPEC:.specify/specifications/IFC-143.md
- PLAN:.specify/planning/IFC-143.md
- EVIDENCE:artifacts/attestations/IFC-143/context_pack.md
- EVIDENCE:artifacts/attestations/IFC-143/context_ack.json
- ARTIFACT:docs/security/threat-model.puml
- ARTIFACT:docs/security/abuse-cases.md
- ARTIFACT:artifacts/reports/pen-test-report.pdf
- ARTIFACT:artifacts/logs/mitigation-backlog.csv
- ARTIFACT:artifacts/misc/cookie-consent-component.tsx

### Validation
VALIDATE:pnpm test;AUDIT:code-review

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