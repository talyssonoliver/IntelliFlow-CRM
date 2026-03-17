# Task Execution Prompt

Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.

## IFC-157 – Notification service MVP: unified delivery (in-app + email) with preference model (backend), templates, and audit logging

**Sprint:** 11
**Section:** Notifications
**Owner:** Backend Dev + SRE (STOA-Domain)
**Status:** Planned

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
Dependency Status:
- IFC-144 (DONE)
- IFC-098 (DONE)
- IFC-151 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Email outbound configured; audit logging present; event consumer framework ready;FILE:docs/planning/adr/ADR-008-audit-logging.md;FILE:docs/architecture/hex-boundaries.md;FILE:packages/db/prisma/schema.prisma;FILE:docs/shared/review-checklist.md;FILE:docs/operations/pr-checklist.md;FILE:packages/adapters/src/messaging/email/outbound.ts;FILE:packages/db/prisma/schema-audit.prisma;FILE:docs/operations/runbooks/dlq-triage.md

  
### Key Objectives
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

### Definition of Done
1. Notification domain + templates implemented
2. delivery adapters
3. preference defaults stored
4. audit entries
5. retries/DLQ
6. tests
7. targets: >=99%, >=100%

### Artifacts to Track
- SPEC:.specify/specifications/IFC-157.md
- PLAN:.specify/planning/IFC-157.md
- EVIDENCE:artifacts/attestations/IFC-157/context_pack.md
- EVIDENCE:artifacts/attestations/IFC-157/context_ack.json
- ARTIFACT:docs/operations/runbooks/notifications.md

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
**Key Files to Read for Context:**
- \`apps/project-tracker/docs/metrics/_global/Sprint_plan.csv\` - Full task registry
- \`apps/project-tracker/docs/metrics/sprint-*/\` - Previous sprint evidence
- \`artifacts/attestations/<TASK_ID>/\` - Task attestations (schema: \`attestation.schema.json\`)
- \`docs/architecture/\` - Architecture decisions and patterns

**Attestation Structure** (\`artifacts/attestations/<TASK_ID>/\`):
- \`attestation.json\` - Completion evidence with verdict, KPIs, validations
- \`context_pack.md\` - Prerequisites (files read before starting)
- \`context_pack.manifest.json\` - SHA256 hashes of prerequisite files
- \`plan.md\` / \`spec.md\` - Task planning documents (if applicable)

**Manual status updates:**
\`\`\`bash
# Update Sprint_plan.csv directly
# Then sync metrics
pnpm --filter project-tracker sync-metrics
\`\`\`

## Delivery Checklist
- Follow TDD: write/extend tests before implementation.
- Respect Definition of Done and produce required artifacts.
- Run lint/typecheck/test/build/security scans.
- Attach evidence (context_pack, context_ack, summaries).

    'All validation commands pass (exit code 0)',
    'All artifacts listed are created and accessible',
    'All KPIs meet or exceed target values',
    'No blocking issues or errors remain',
    'Status updated to "Done" in Sprint_plan.csv',
    'Attestation created in artifacts/attestations/<TASK_ID>/',
    'Code merged to main branch (if applicable)',

### Final Objectives 
| Principle | Status | Score | Notes |
|-----------|--------|-------|-------|
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs
- Update 
