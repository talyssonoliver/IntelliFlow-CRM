# ENV-002-AI — Automated Development Tools Configuration (Codex)

Branch: `sprint0/ENV-002-AI-codex` (also included in `sprint0/codex-run`)

## Summary

- Add repo-wide code quality tooling (lint/format/quality scripts) and Sprint data validation wiring.

## Key Changes

- ESLint/Prettier/Husky/commit message conventions and validation scripts.
- Add `validate:sprint-data` script and required dev tooling dependencies.

## Validation

- `pnpm run validate:sprint0` (58/58 passed)
- `pnpm run validate:sprint-data` (passed)

## Patch Files

- `artifacts/sprint0/codex-run/patches/SPRINT0-core-scaffolding.patch`
- `artifacts/sprint0/codex-run/patches/SPRINT0-sprint-data-validation.patch`
- `artifacts/sprint0/codex-run/patches/REPO-ignore-python-cache.patch`

