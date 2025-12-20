# Project Operating Model & Delivery Playbook

## Purpose

Define a lightweight operating model for IntelliFlow CRM so delivery is
predictable and governance gates stay truthful.

## Cadence

- Planning: weekly or per sprint
- Daily: async standup notes + blocker escalation
- Review: sprint review + validation report review

## Workflow

1. Define work in `Sprint_plan.csv`
2. Keep sprint JSON in sync under `apps/project-tracker/docs/metrics/sprint-*`
3. Enforce CI governance via validators
4. Capture evidence under `artifacts/`

## Definition of Done (DoD)

- Feature meets acceptance criteria
- Required validations recorded and passing
- No runtime artifacts under `docs/`
- Canonical metrics artifacts are unique and consistent
