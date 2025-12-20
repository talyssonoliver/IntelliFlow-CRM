# System Audit Summary (ui-audit-20251219T215101.162Z-qnel6t)

- Commit: `5e684432e1c60eecdfa038ebf9043e66882990c2`
- Mode: `pr`
- Scope: `affected`
- Matrix SHA256: `55884bb02d7e0661d6f9496bf76f6be8adc09b5757d4d17a48b70fb98bf13c92`
- Started: `2025-12-19T21:51:05+00:00`
- Finished: `2025-12-19T22:06:09+00:00`
- Result: `fail`

## Environment

- Dotenv: `.env.local` (keys loaded: `1`)

## Services

- `sonarqube`: needed=True was_running=True start_exit=None stop_exit=None

## Tools

| Tier | Tool | Enabled | Required | Status | Exit | Source | Reason | Evidence |
|------|------|---------|----------|--------|------|--------|--------|----------|
| 1 | `commitlint` | yes | yes | pass | 0 | computed |  | `commitlint.log` |
| 1 | `dependency-cruiser-validate` | no | yes | skipped | None | computed | disabled in matrix | `dependency-cruiser-validate.log` |
| 1 | `eslint-max-warnings-0` | yes | yes | pass | 0 | computed |  | `eslint-max-warnings-0.log` |
| 1 | `gitleaks` | no | yes | skipped | None | computed | disabled in matrix | `gitleaks.log` |
| 1 | `pnpm-audit-high` | no | yes | skipped | None | computed | disabled in matrix | `pnpm-audit-high.log` |
| 1 | `prettier-check` | yes | yes | fail | 1 | computed |  | `prettier-check.log` |
| 1 | `semgrep-security-audit` | no | yes | skipped | None | computed | disabled in matrix | `semgrep-security-audit.log` |
| 1 | `snyk` | no | yes | skipped | None | computed | disabled in matrix | `snyk.log` |
| 1 | `sonarqube-quality-gate` | yes | no | pass | 0 | computed |  | `sonarqube-quality-gate.log` |
| 1 | `sonarqube-scanner` | yes | no | warn | 124 | computed |  | `sonarqube-scanner.log` |
| 1 | `trivy-image` | no | yes | skipped | None | computed | disabled in matrix | `trivy-image.log` |
| 1 | `turbo-build` | yes | yes | fail | 1 | computed |  | `turbo-build.log` |
| 1 | `turbo-test-coverage` | yes | yes | pass | 0 | computed |  | `turbo-test-coverage.log` |
| 1 | `turbo-typecheck` | yes | yes | pass | 0 | computed |  | `turbo-typecheck.log` |
| 2 | `bearer` | no | no | skipped | None | computed | disabled in matrix | `bearer.log` |
| 2 | `codeql-analysis` | no | no | skipped | None | computed | disabled in matrix | `codeql-analysis.log` |
| 2 | `cspell` | no | no | skipped | None | computed | disabled in matrix | `cspell.log` |
| 2 | `depcheck` | no | no | skipped | None | computed | disabled in matrix | `depcheck.log` |
| 2 | `knip` | no | no | skipped | None | computed | disabled in matrix | `knip.log` |
| 2 | `madge-circular` | no | no | skipped | None | computed | disabled in matrix | `madge-circular.log` |
| 2 | `markdownlint` | no | no | skipped | None | computed | disabled in matrix | `markdownlint.log` |
| 2 | `osv-scanner` | no | no | skipped | None | computed | disabled in matrix | `osv-scanner.log` |
| 2 | `stryker` | no | no | skipped | None | computed | disabled in matrix | `stryker.log` |
| 2 | `ts-prune` | no | no | skipped | None | computed | disabled in matrix | `ts-prune.log` |

