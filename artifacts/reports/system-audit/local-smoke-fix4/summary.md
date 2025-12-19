# System Audit Summary (local-smoke-fix4)

- Commit: `15c538ed6294b64e6875e14c3efd318c661e2bb7`
- Mode: `None`
- Scope: `full`
- Matrix SHA256: `2dee9886863e0e45fbd288f16f012349818f6f1b37f647e9e2a36bd070b887b5`
- Started: `2025-12-18T23:30:04+00:00`
- Finished: `2025-12-18T23:35:37+00:00`
- Result: `fail`

## Tools

| Tier | Tool | Required | Status | Exit | Source | Evidence |
|------|------|----------|--------|------|--------|----------|
| 1 | `commitlint` | yes | pass | 0 | computed | `commitlint.log` |
| 1 | `dependency-cruiser-validate` | yes | skipped | None | computed | `dependency-cruiser-validate.log` |
| 1 | `eslint-max-warnings-0` | yes | pass | 0 | computed | `eslint-max-warnings-0.log` |
| 1 | `gitleaks` | yes | skipped | None | computed | `gitleaks.log` |
| 1 | `pnpm-audit-high` | yes | skipped | None | computed | `pnpm-audit-high.log` |
| 1 | `prettier-check` | yes | fail | 1 | computed | `prettier-check.log` |
| 1 | `semgrep-security-audit` | yes | skipped | None | computed | `semgrep-security-audit.log` |
| 1 | `snyk` | yes | skipped | None | computed | `snyk.log` |
| 1 | `sonarqube-quality-gate` | no | skipped | None | computed | `sonarqube-quality-gate.log` |
| 1 | `sonarqube-scanner` | no | skipped | None | computed | `sonarqube-scanner.log` |
| 1 | `trivy-image` | yes | skipped | None | computed | `trivy-image.log` |
| 1 | `turbo-build` | yes | pass | 0 | computed | `turbo-build.log` |
| 1 | `turbo-test-coverage` | yes | pass | 0 | computed | `turbo-test-coverage.log` |
| 1 | `turbo-typecheck` | yes | pass | 0 | computed | `turbo-typecheck.log` |

