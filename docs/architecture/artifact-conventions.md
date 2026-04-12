# Artifact Path Conventions

**Version:** 1.0.0 **Last Updated:** 2025-12-14 **Status:** Active
**Enforcement:** Automated via CI/CD

## Overview

This document defines strict conventions for artifact organization in the
IntelliFlow CRM monorepo. Artifacts are non-source files generated during
development, testing, building, and deployment processes.

**Key Principle:** Artifacts are **ephemeral** and **never committed** to
version control.

## Artifact Categories

### 1. Logs (`artifacts/logs/`)

**Purpose:** Store log files generated during development, testing, and
operations.

**Conventions:**

```
artifacts/logs/
├── build/              # Build process logs
├── test/               # Test execution logs
├── deployment/         # Deployment logs
├── ai/                 # AI worker logs
└── error/              # Error logs and stack traces
```

**Naming Pattern:**

```
{process}-{timestamp}.log
{service}-{environment}-{date}.log

Examples:
- build-2025-12-14T10-30-00.log
- api-production-2025-12-14.log
- test-unit-2025-12-14T15-45-23.log
- ai-worker-dev-2025-12-14.log
```

**Retention:**

- Development: 7 days
- CI/CD: 30 days
- Production: 90 days (then archive to S3/GCS)

**Prohibited:**

- ❌ No secrets or credentials in logs
- ❌ No PII (personally identifiable information)
- ❌ No sensitive business data

### 2. Reports (`artifacts/reports/`)

**Purpose:** Generated analysis reports and documentation.

**Conventions:**

```
artifacts/reports/
├── coverage/           # Test coverage reports
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── bundle/             # Bundle analysis reports
│   ├── web/
│   └── api/
├── performance/        # Performance test results
│   ├── lighthouse/
│   └── load-tests/
├── security/           # Security scan reports
│   ├── dependency-audit/
│   └── static-analysis/
└── accessibility/      # a11y audit reports
```

**Naming Pattern:**

```
{report-type}-{scope}-{timestamp}.{format}

Examples:
- coverage-unit-2025-12-14.html
- bundle-web-2025-12-14.json
- lighthouse-homepage-2025-12-14.html
- dependency-audit-2025-12-14.json
```

**Formats:**

- HTML for human-readable reports
- JSON for machine-readable data
- CSV for tabular data
- PDF for formal documentation

**Retention:**

- Keep last 10 reports per type
- Archive monthly summaries

### 3. Metrics (`artifacts/metrics/`)

**Purpose:** Collected metrics data for analysis and monitoring.

**Conventions:**

```
artifacts/metrics/
├── dora/               # DORA metrics (DevOps)
│   ├── deployment-frequency/
│   ├── lead-time/
│   ├── mttr/
│   └── change-failure-rate/
├── ai/                 # AI performance metrics
│   ├── latency/
│   ├── cost/
│   ├── accuracy/
│   └── token-usage/
├── business/           # Business KPIs
│   ├── user-engagement/
│   └── conversion/
└── technical/          # Technical metrics
    ├── api-response-times/
    └── error-rates/
```

**Naming Pattern:**

```
{metric-name}-{date-range}.{format}

Examples:
- deployment-frequency-2025-12-week50.json
- ai-latency-2025-12-14.csv
- api-response-times-2025-12.json
```

**Data Format:**

```json
{
  "metric": "deployment-frequency",
  "period": "2025-12-14",
  "value": 5.2,
  "unit": "deployments/day",
  "timestamp": "2025-12-14T10:30:00Z"
}
```

### 4. Miscellaneous (`artifacts/misc/`)

**Purpose:** Other generated artifacts that don't fit above categories.

**Conventions:**

```
artifacts/misc/
├── schemas/            # Generated schemas (OpenAPI, GraphQL)
├── configs/            # Generated configuration files
├── screenshots/        # E2E test screenshots
├── recordings/         # Test recordings
└── temp/               # Temporary files (cleaned daily)
```

**Naming Pattern:**

- Descriptive names with context
- Include version or timestamp when applicable

**Examples:**

```
openapi-spec-v1.2.3.json
test-failure-screenshot-2025-12-14-103045.png
vault-config.yaml
access-policy.json
```

## Path Validation Rules

### Allowed Paths

**Artifacts Directory:**

```
✅ artifacts/logs/{category}/{filename}.log
✅ artifacts/reports/{type}/{filename}.{html|json|pdf}
✅ artifacts/metrics/{category}/{filename}.{json|csv}
✅ artifacts/misc/{subcategory}/{filename}
```

**Temporary Build Outputs:**

```
✅ dist/
✅ .next/
✅ .turbo/
✅ node_modules/.cache/
```

### Prohibited Paths

**Never Place Artifacts In:**

```
❌ src/**/*                    # Source code directories
❌ packages/*/src/**/*         # Package source
❌ apps/*/src/**/*             # Application source
❌ docs/**/*                   # Documentation
❌ .github/**/*                # GitHub configs
❌ infra/**/*                  # Infrastructure configs
```

**Never Create:**

```
❌ *.secret.*                  # Files with "secret" in name
❌ *.private.*                 # Files with "private" in name
❌ *credentials*               # Credential files
❌ *.pem                       # Private keys
❌ *.key                       # Key files
❌ .env                        # Environment files (except .env.example)
```

## File Size Limits

To prevent repository bloat:

| File Type      | Max Size    | Action if Exceeded       |
| -------------- | ----------- | ------------------------ |
| Logs           | 10 MB       | Compress or split        |
| Reports (HTML) | 5 MB        | Optimize or paginate     |
| Reports (JSON) | 20 MB       | Split or compress        |
| Screenshots    | 2 MB        | Compress images          |
| Videos         | Not allowed | Link to external storage |

## Automated Enforcement

### CI Linter

Location: `tools/lint/artifact-paths.ts`

**Checks:**

1. Artifacts are in correct directories
2. No prohibited patterns exist
3. File sizes within limits
4. No secrets in artifact files
5. Proper naming conventions

**Run Manually:**

```bash
pnpm tsx tools/lint/artifact-paths.ts
```

**CI Integration:**

```bash
# Runs on every PR
.github/workflows/artifact-lint.yml
```

### Pre-commit Hook

Optional local enforcement:

```bash
# .git/hooks/pre-commit
#!/bin/bash
pnpm tsx tools/lint/artifact-paths.ts
if [ $? -ne 0 ]; then
  echo "❌ Artifact path violations detected"
  exit 1
fi
```

## Migration Guide

For existing repositories with misplaced artifacts:

1. **Audit:** Run `pnpm tsx tools/lint/artifact-paths.ts --audit`
2. **Review:** Check generated `scripts/migration/artifact-move-map.csv`
3. **Migrate:** Run automated migration (with backup)
4. **Verify:** Ensure builds and tests still pass
5. **Clean:** Remove old artifact locations

**Migration Script:**

```bash
pnpm run artifacts:migrate
```

## Git Configuration

### .gitignore Patterns

**Entire Artifacts Directory:**

```
# Artifacts (never commit)
artifacts/
```

**Build Outputs:**

```
# Build artifacts
dist/
.next/
.turbo/
*.tsbuildinfo
```

**Cache Directories:**

```
# Caches
.cache/
node_modules/.cache/
.eslintcache
```

**Environment Files:**

```
# Environment files
.env
.env.local
.env.*.local
!.env.example
```

### .gitattributes

For artifacts that might be committed in special cases:

```
# Treat as binary (no diff/merge)
*.log binary
*.coverage binary
*.trace binary
```

## Storage and Archival

### Local Development

- Artifacts stored in `artifacts/` directory
- Cleaned periodically (see retention policies)
- Not synced to cloud by default

### CI/CD Environments

- Artifacts uploaded to CI platform (GitHub Actions artifacts)
- Retention: 30 days
- Download available via CI interface

### Production

- Critical logs forwarded to centralized logging (e.g., CloudWatch, Datadog)
- Metrics sent to monitoring systems (Prometheus, Grafana)
- Long-term storage in S3/GCS with lifecycle policies

**Storage Lifecycle:**

```
Day 0-7:   Hot storage (fast access)
Day 8-30:  Warm storage (moderate access)
Day 31-90: Cold storage (archive)
Day 90+:   Delete or move to glacier
```

## Security Best Practices

### Secrets Scanning

All artifacts scanned for secrets before archival:

```bash
# Using git-secrets or similar
git-secrets --scan artifacts/
```

**Common Patterns to Block:**

- API keys (regex: `[A-Za-z0-9]{32,}`)
- AWS keys (regex: `AKIA[0-9A-Z]{16}`)
- Private keys (`-----BEGIN PRIVATE KEY-----`)
- Passwords in plaintext

### Data Sanitization

Before archiving logs:

1. **Redact PII:** Email addresses, phone numbers, names
2. **Mask secrets:** API keys, tokens, passwords
3. **Remove sensitive paths:** Internal server paths
4. **Anonymize IPs:** Replace with hashed values

**Sanitization Script:**

```bash
pnpm run artifacts:sanitize
```

## Monitoring and Alerts

### Artifact Growth

Monitor artifact directory size:

```bash
# Alert if artifacts/ exceeds 1GB
du -sh artifacts/
```

**Automated Cleanup:**

```bash
# Cron job to clean old artifacts
0 2 * * * /scripts/cleanup-artifacts.sh
```

### CI Failures

Alert on artifact linter failures:

- Slack notification to #dev-ops channel
- Block PR merge until resolved
- Log violation details

## Examples

### Good Artifact Paths

```
✅ artifacts/logs/build/api-build-2025-12-14.log
✅ artifacts/reports/coverage/unit-coverage-2025-12-14.html
✅ artifacts/metrics/dora/deployment-frequency-2025-12.json
✅ artifacts/misc/schemas/openapi-v1.0.0.json
```

### Bad Artifact Paths

```
❌ src/build.log                           # Wrong location
❌ artifacts/secret-keys.json              # Prohibited pattern
❌ apps/web/coverage-report.html           # Should be in artifacts/
❌ tools/output.json                       # Should be in artifacts/misc/
❌ artifacts/my-file.txt                   # Not categorized
```

## Frequently Asked Questions

**Q: Can I commit artifacts for documentation purposes?** A: No. Use examples in
`docs/examples/` instead. Link to CI artifacts if needed.

**Q: What about generated code (e.g., Prisma client)?** A: Generated source code
goes in `node_modules/` or package-specific `generated/` directories, not
`artifacts/`.

**Q: How do I share test results with team?** A: CI uploads artifacts
automatically. For local runs, use CI platform's artifact upload feature.

**Q: What if artifact size exceeds limits?** A: Compress, split into chunks, or
upload to external storage (S3) and link.

**Q: Can I create custom artifact categories?** A: Yes, but document in this
file and update linter rules.

## References

- [Repository Layout](./repo-layout.md)
- [CI/CD Documentation](../guides/ci-cd.md)
- [Git Ignore Best Practices](https://git-scm.com/docs/gitignore)

## Change Log

| Date       | Version | Changes                                    | Author      |
| ---------- | ------- | ------------------------------------------ | ----------- |
| 2025-12-14 | 1.0.0   | Initial artifact conventions documentation | DevOps Team |

---

**Enforcement:** This document is enforced by automated linting in CI/CD.
Violations will block PR merges.
