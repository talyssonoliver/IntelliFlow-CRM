# Engineering Playbook

## Branching & PRs

- Use feature branches
- Keep PRs small and reviewable
- Require CI green before merge

## Required Gates

- `pnpm run validate:sprint0 -- --strict`
- `pnpm run validate:sprint-data -- --strict`
- Typecheck and tests as defined by the repo

## Evidence

- Runtime outputs belong under `artifacts/`
- Metrics under `apps/project-tracker/docs/metrics` must remain canonical

## Incidents

- Write a short incident note and remediation checklist
- Update runbooks where relevant
