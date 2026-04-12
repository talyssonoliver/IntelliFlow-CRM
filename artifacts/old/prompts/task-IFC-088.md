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

## IFC-088 – Continuous Quality Metrics

**Sprint:** 14
**Section:** Quality
**Owner:** QA Lead + PM (STOA-Quality)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- IFC-044

Dependency Status:
- IFC-044 (DONE)

### Pre-requisites
FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:SonarQube integrated;ENV:dashboards created;FILE:docs/operations/quality-gates.md;FILE:artifacts/coverage/index.html

### Definition of Done
1. Quality gates enforced, technical debt tracked
2. artifacts: sonarqube-project.properties, quality-gate-config.json, debt-trending.pdf
3. targets: >=3%

### Artifacts to Track
- ARTIFACT:artifacts/misc/sonarqube-project.properties
- ARTIFACT:artifacts/misc/quality-gate-config.json
- ARTIFACT:artifacts/reports/debt-trending.pdf
- ARTIFACT:docs/shared/action-items.md
- ARTIFACT:scripts/sonar-iterative.js
- ARTIFACT:scripts/sonar-new-issues.js
- ARTIFACT:scripts/sonar-report-generator.js
- ARTIFACT:scripts/sonar-scan.js
- ARTIFACT:scripts/sonar-set-new-code-baseline.js
- ARTIFACT:scripts/sonar-status.js
- ARTIFACT:scripts/sonar-tracker.js
- ARTIFACT:scripts/sonarqube-helper.js
- ARTIFACT:scripts/setup-quality-tools.sh
- ARTIFACT:scripts/pnpm-audit-report.js
- EVIDENCE:artifacts/attestations/IFC-088/context_ack.json

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