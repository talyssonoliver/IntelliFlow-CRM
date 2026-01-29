# Company & Product Master Brief

Single source of truth for IntelliFlow CRM.

## Summary

IntelliFlow CRM is a modern CRM platform built with AI-first principles. The
system prioritizes trustworthy automation, strong governance, and a clear
operational model so teams can ship quickly without losing control of quality.

## Vision

Help teams build and run customer relationships with less manual admin, higher
data quality, and predictable delivery through automation and evidence-based
governance.

## Mission

Deliver an AI-augmented CRM that is fast to operate, safe by default, and
measurable end-to-end (work → build → deploy → observe).

## Product

- **Web app**: Next.js frontend
- **API**: tRPC + domain model + validators
- **AI worker**: agent/automation workflows
- **Project tracker**: sprint metrics and governance gates

## Target Customers (ICP)

- B2B teams that need a lightweight CRM with automation and clear governance
- Teams that ship frequently and need reliable quality gates and observability

## Differentiators

- **AI-first**: automation and assistance built in, not bolted on
- **Governance-grade validation**: sprint completion, hygiene, and canonical
  sources enforced
- **Operational clarity**: explicit playbooks for delivery, quality, and
  incident response

## Success Metrics

- Reduced time-to-update CRM data (measured via workflow metrics)
- Higher completeness/accuracy of customer records (validated via rules)
- Predictable delivery cadence (sprint metrics; fewer “unknown” states)

## Constraints / Guardrails

- No secrets committed; enforce via scanners and templates
- Canonical metrics live under `apps/project-tracker/docs/metrics`
- Runtime outputs go under `artifacts/` (not under `docs/`)

## Open Questions

- Pricing and packaging
- Target vertical(s) and initial wedge workflow
- Model provider strategy (local-first vs hosted-first)
