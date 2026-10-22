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

## ENV-008-AI – Automated Observability with Predictive Monitoring

**Sprint:** 18
**Section:** Foundation Setup
**Owner:** Backend Dev + AI Specialist (STOA-Intelligence)
**Status:** In Progress

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- ENV-005-AI

### Pre-requisites
FILE:.specify/memory/Framework.md;FILE:audit-matrix.yml;POLICY:Monitoring tools selected;ENV:AI analysis ready;FILE:docs/shared/review-checklist.md;FILE:docs/operations/pr-checklist.md;FILE:.github/workflows/ci.yml

### Definition of Done
1. OpenTelemetry AI-configured, predictive alerts set, anomaly detection active, self-healing enabled
2. targets: >=100%

### Artifacts to Track
- ARTIFACT:infra/monitoring/otel-config.yaml
- ARTIFACT:infra/monitoring/anomaly-detection.json
- ARTIFACT:infra/monitoring/self-healing-rules.yaml
- ARTIFACT:docs/architecture/observability/correlation-patterns.md
- ARTIFACT:docs/architecture/observability/implementation-guide.md
- ARTIFACT:docs/architecture/observability/instrumentation-checklist.md
- EVIDENCE:.specify/sprints/sprint-0/attestations/ENV-008-AI/attestation.json

### Validation
VALIDATE:pnpm typecheck

### Brand / UX / Flows References
- Brand: docs/company/brand/style-guide.md
- Page Registry: docs/design/page-registry.md
- Sitemap: docs/design/sitemap.md
- Check the relevant Flows: apps/project-tracker/docs/metrics/_global/flows/

### Context Controls
- Build context pack and context ack before coding.
- Evidence folder: .specify/sprints/sprint-{N}/attestations/<task_id>/
- Use spec/plan from .specify/sprints/sprint-{N}/specifications/ and planning/

---

## Delivery Checklist
- Follow TDD: write/extend tests before implementation.
- Respect Definition of Done and produce required artifacts.
- Run lint/typecheck/test/build/security scans.
- Attach evidence (context_pack, context_ack, summaries).