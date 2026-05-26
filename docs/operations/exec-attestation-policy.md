# Exec Attestation Policy

**Document ID**: POL-EXEC-001 **Version**: 1.0 **Last Updated**: 2026-05-26
**Owner**: Platform Engineering

## Purpose

This policy codifies the **mandatory pre-attestation checks** that any agent or
human running an `/exec`-style task must perform before writing a Phase 5
attestation that claims `verdict: COMPLETE`. It is the committed, repo-shipped
home for the `fake-green-attestation` recurrence guard tracked in
[`artifacts/reports/ci-failures/registry.json`](../../artifacts/reports/ci-failures/registry.json).

The natural home for this rule is `.claude/skills/exec/SKILL.md`, but that path
is gitignored (per-developer Claude tooling, not repo-shared). This file is the
canonical, committed location instead.

## Rule: re-grep that every Edit persisted on disk

**Before invoking `/exec-attestation` or writing `attestation.json` with
`verdict: COMPLETE`, you MUST re-grep every file listed in the plan's "Files to
Modify" section for the exact expected string and confirm it is still on disk.**

### Why

External tooling — Prettier, ESLint `--fix`, format-on-save, lint-staged, and
other auto-formatters — can revert `Edit`-tool changes AFTER the validation step
has passed but BEFORE the commit lands. The validation output then shows green,
the attestation ships with `verdict: COMPLETE`, and the integration wiring is
silently absent on disk. This is the "fake-green" failure mode.

This has shipped real incidents in this repo:

- **PG-126** (commit `36d9d276d`, follow-up `a0917310d`): public_feedback RLS
  migration shipped with COMPLETE attestation but the integration wiring was
  reverted; required a follow-up "PG-126 follow-up" commit to re-apply.
- **PG-180**: the "verify auth cookies are written before reading them" audit
  surfaced the same family — code passed validation, formatter reverted,
  attestation shipped green, runtime broke.

### What to do

For every entry in the plan's "Files to Modify" section:

1. Identify the expected change (a specific line, import, type, config key —
   whatever the plan said you would add).
2. Run a literal grep against the on-disk file:
   ```bash
   grep -n 'expected-string' path/to/file
   ```
3. If the expected string is missing:
   - Use `Write` to put it back (not `Edit` — `Edit` is what got reverted).
   - Re-run the validation step (`pnpm typecheck`, tests, etc.).
   - Only then write the attestation.

This is non-negotiable. The cost of attesting fake-green is a runtime-broken
merge that ships to main; the cost of an extra grep is seconds.

## Verification command (used by the failure-pattern registry)

The registry entry `fake-green-attestation` in
`artifacts/reports/ci-failures/registry.json` carries this command, which
`tools/scripts/verify-ci-failure-guards.mjs` runs to confirm the guard is still
documented:

```bash
test -f docs/operations/exec-attestation-policy.md && \
  grep -qiE 're-?grep|verify.*persist|reverted by' \
  docs/operations/exec-attestation-policy.md
```

If this file is deleted or the rule text is removed, the verifier flips the
registry entry from PASS to REGRESSION, blocking the next CI run.

## Why this lives in `docs/operations/` and not `.claude/skills/exec/`

- `.claude/skills/exec/SKILL.md` is gitignored — per-developer Claude tooling
  not shared via git.
- The audit-driven guard mechanism (`verify-ci-failure-guards.mjs`) requires a
  committed file to grep against.
- `docs/operations/` is the canonical home for operational policies (see the
  directory's `CLAUDE.md` and `README.md` for the convention).

The exec skill itself, when present locally, should reference this file as the
authoritative source. A pointer in `.claude/skills/exec/SKILL.md` (local-only)
reading "Phase 5 mandatory: see docs/operations/exec-attestation-policy.md" is
sufficient; the policy content lives here.

## See also

- [`./runbooks/ci-cost-monitoring.md`](./runbooks/ci-cost-monitoring.md) — the
  failure-pattern registry runbook
- [`../../artifacts/reports/ci-failures/registry.json`](../../artifacts/reports/ci-failures/registry.json)
  — the registry entry this policy backs
- [`./ci-cost-audit-2026-05-25.md`](./ci-cost-audit-2026-05-25.md) — the audit
  that first surfaced this guard as TODO
