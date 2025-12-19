# Sprint0 — Human-Readable Validation Output (Codex)

Branch: `sprint0/codex-run`

## Summary

- Ensure saved validation output stays readable (no ANSI/mojibake) by generating a sanitized log file instead of piping colored output.

## Key Changes

- Add `pnpm run validate:sprint0:report` which writes a sanitized log to `artifacts/sprint0/codex-run/validation-output.txt`.
- `artifacts/sprint0/codex-run/validation-output.txt` is now generated in a plain-text format (no ANSI escape codes).

## Validation

- `pnpm run validate:sprint0` (58/58 passed)
- `pnpm run validate:sprint-data` (passed)

## Patch Files

- `artifacts/sprint0/codex-run/patches/SPRINT0-validation-output-human-readable.patch`
- `artifacts/sprint0/codex-run/patches/SPRINT0-validation-output-generator.patch`
