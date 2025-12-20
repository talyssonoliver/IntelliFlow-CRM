# System Audit Summary (local-sonar-smoke)

- Commit: `5e684432e1c60eecdfa038ebf9043e66882990c2`
- Mode: `None`
- Scope: `full`
- Matrix SHA256: `798cb88f1d797340232cbd23951a763bd8ee1c21e27f3e50551c380d4732fec2`
- Started: `2025-12-19T21:10:04+00:00`
- Finished: `2025-12-19T21:55:02+00:00`
- Result: `fail`

## Environment

- Dotenv: `.env.local` (keys loaded: `1`)

## Services

- `sonarqube`: needed=True was_running=False start_exit=0 stop_exit=0

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
| 1 | `sonarqube-scanner` | yes | no | pass | 0 | computed |  | `sonarqube-scanner.log` |
| 1 | `trivy-image` | no | yes | skipped | None | computed | disabled in matrix | `trivy-image.log` |
| 1 | `turbo-build` | yes | yes | pass | 0 | computed |  | `turbo-build.log` |
| 1 | `turbo-test-coverage` | yes | yes | pass | 0 | computed |  | `turbo-test-coverage.log` |
| 1 | `turbo-typecheck` | yes | yes | pass | 0 | computed |  | `turbo-typecheck.log` |

