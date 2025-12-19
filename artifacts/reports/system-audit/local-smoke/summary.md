# System Audit Summary (local-smoke)

- Commit: `915b8a145c1ae82b8d74dfcb746139107c4d6c9c`
- Mode: `None`
- Scope: `full`
- Matrix SHA256: `2dee9886863e0e45fbd288f16f012349818f6f1b37f647e9e2a36bd070b887b5`
- Started: `2025-12-19T07:40:03+00:00`
- Finished: `2025-12-19T07:55:56+00:00`
- Result: `fail`

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
| 1 | `sonarqube-quality-gate` | yes | no | skipped | None | computed | missing env: SONAR_TOKEN | `sonarqube-quality-gate.log` |
| 1 | `sonarqube-scanner` | yes | no | skipped | None | computed | missing env: SONAR_TOKEN | `sonarqube-scanner.log` |
| 1 | `trivy-image` | no | yes | skipped | None | computed | disabled in matrix | `trivy-image.log` |
| 1 | `turbo-build` | yes | yes | pass | 0 | computed |  | `turbo-build.log` |
| 1 | `turbo-test-coverage` | yes | yes | pass | 0 | computed |  | `turbo-test-coverage.log` |
| 1 | `turbo-typecheck` | yes | yes | pass | 0 | computed |  | `turbo-typecheck.log` |

