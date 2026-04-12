---
name: stoa-security
description:
  Execute Security STOA validation for security-sensitive tasks. Covers secret
  scanning, dependency auditing, SAST, container/IaC scanning, and OWASP
  compliance.
---

# Security STOA Sub-Agent

Validates security gates for tasks involving auth, secrets, dependencies, and
OWASP compliance.

## Responsibility

- Secret scanning and leak prevention
- Dependency vulnerability auditing
- SAST (Static Application Security Testing)
- Container and IaC security scanning
- Authentication/authorization code review
- OWASP Top 10 compliance
- Rate limiting and CSRF protection

## Gate Table

| #   | Gate                      | Command                                                                     | Required?              |
| --- | ------------------------- | --------------------------------------------------------------------------- | ---------------------- |
| 1   | Gitleaks secret detection | `gitleaks detect --source . --redact`                                       | Always                 |
| 2   | pnpm dependency audit     | `pnpm audit --audit-level=high`                                             | Always                 |
| 3   | Snyk test                 | `snyk test --severity-threshold=high`                                       | If `SNYK_TOKEN` set    |
| 4   | Semgrep SAST              | `semgrep --config=p/security-audit --error`                                 | If enabled             |
| 5   | Trivy filesystem          | `trivy fs . --severity HIGH,CRITICAL`                                       | If enabled             |
| 6   | Trivy image               | `trivy image --severity HIGH,CRITICAL --exit-code 1 intelliflow-crm:latest` | If Docker image exists |

**See references/gate-definitions.md** for full commands, log paths, and
execution code.

## Verdict Logic

| Condition                                     | Verdict          |
| --------------------------------------------- | ---------------- |
| All gates exit 0, no findings at any severity | PASS             |
| Any gate exits non-zero                       | FAIL             |
| HIGH/CRITICAL findings detected               | FAIL             |
| MEDIUM findings detected                      | FAIL             |
| Secret leak detected                          | FAIL (immediate) |
| Tool misconfiguration or ambiguous results    | NEEDS_HUMAN      |

**Note**: There is NO WARN verdict. All gates are binary (PASS/FAIL/NEEDS_HUMAN
only).

## Security Finding Severity

| Severity | Action                               |
| -------- | ------------------------------------ |
| CRITICAL | Immediate FAIL, block merge          |
| HIGH     | FAIL, requires fix before completion |
| MEDIUM   | FAIL, requires fix before completion |
| LOW      | FAIL, log finding and require fix    |

## Trigger Conditions

**Primary STOA**: `EXC-SEC-*`, `SEC-*` task prefix

**Supporting STOA** by keywords: `auth`, `jwt`, `token`, `session`, `rbac`,
`permissions`, `secret`, `vault`, `rate-limit`, `csrf`, `xss`, `injection`

**Supporting STOA** by path: `*auth*`, `*security*`, `.env*`, `*vault*`,
`*secrets*`

## Output

Write verdict JSON to:
`artifacts/reports/system-audit/$RUN_ID/stoa-verdicts/Security.json`

**See references/gate-definitions.md** for full verdict JSON schema and
execution code.

## Usage

```
/stoa-security <TASK_ID> [RUN_ID]
```

- `TASK_ID` (required): Task ID being validated
- `RUN_ID` (optional): Run ID from MATOP orchestrator
