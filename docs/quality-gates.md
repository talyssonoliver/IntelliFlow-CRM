# Code Quality & Validation System

Complete guide to IntelliFlow CRM's automated quality gates and validation
pipeline.

## Overview

The quality system enforces:

- ✅ **Type Safety** - Zero TypeScript errors
- 🔍 **Code Quality** - ESLint standards
- 🧪 **Test Coverage** - Automated testing
- 🔒 **Security** - Vulnerability scanning
- 🧹 **Dead Code** - Unused dependency detection
- 📊 **Static Analysis** - SonarQube integration

## Quick Start

### 1. Install Quality Tools

```bash
# Run setup script (installs all tools globally)
bash scripts/setup-quality-tools.sh

# Or install manually
npm install -g sonarqube-scanner depcheck knip
```

### 2. Start SonarQube Server

```bash
# Start SonarQube with Docker Compose
docker-compose -f docker-compose.sonarqube.yml up -d

# Wait ~2 minutes, then access: http://localhost:9000
# Default credentials: admin/admin
```

### 3. Configure SonarQube Token

```powershell
# 1. Login to SonarQube UI
# 2. Navigate: My Account > Security > Generate Tokens
# 3. Create token: "intelliflow-crm-cli"
# 4. Set environment variable

# PowerShell
$env:SONAR_TOKEN="squ_your_token_here"

# Or add to .env.local (gitignored)
echo "SONAR_TOKEN=squ_your_token_here" >> .env.local
```

### 4. Run Quality Checks

```bash
# Run all quality checks
pnpm run quality:check

# Run specific checks
pnpm run typecheck
pnpm run lint
pnpm test --run
pnpm run quality:deps      # Check unused dependencies
pnpm run quality:security  # Security audit
pnpm run quality:deadcode  # Detect dead code
pnpm run quality:sonar     # SonarQube analysis

# Generate quality report
pnpm run quality:report
```

## Validation Pipeline

### Phase 3.5: Quality Gates (NEW)

Runs **before** YAML validation:

```bash
# Executed by orchestrator automatically
./apps/project-tracker/docs/metrics/orchestrator.sh run <TASK_ID>
```

**Quality Gate Checks:**

1. **TypeScript Type Checking** ⚠️ **CRITICAL** (blocks on failure)

   ```bash
   pnpm run typecheck --filter=!@intelliflow/observability
   ```

2. **ESLint Code Quality** (warnings logged)

   ```bash
   pnpm run lint
   ```

3. **Test Suite Execution** (warnings logged)

   ```bash
   pnpm test --run --passWithNoTests
   ```

4. **Unused Dependencies** (warnings logged)

   ```bash
   npx depcheck
   ```

5. **Security Vulnerabilities** (warnings logged)

   ```bash
   pnpm audit --audit-level=moderate
   ```

6. **Dead Code Detection** (warnings logged)
   ```bash
   npx knip
   ```

### Phase 4: YAML Validation

Enhanced with global quality checks:

- `global_spec_check` - Specification documents
- `global_security_check` - Secret scanning
- `global_quality_check` - TypeCheck, Lint, Tests, Audit, Knip
- `global_sonarqube_check` - SonarQube analysis (conditional)

## Configuration Files

### `sonar-project.properties`

SonarQube project configuration:

```properties
sonar.projectKey=intelliflow-crm
sonar.sources=apps,packages
sonar.exclusions=**/node_modules/**,**/dist/**,**/.next/**
```

### `knip.json`

Dead code detection configuration:

```json
{
  "workspaces": {
    ".": {
      "entry": ["apps/*/src/index.ts", "packages/*/src/index.ts"],
      "project": ["**/*.ts", "**/*.tsx"]
    }
  },
  "ignore": ["**/*.test.ts", "**/dist/**"]
}
```

### `.depcheckrc`

Unused dependency detection:

```json
{
  "ignores": ["@types/*", "eslint-*", "prettier"],
  "ignore-patterns": ["dist", "build", ".next"]
}
```

### `validation.yaml`

Global quality gates applied to ALL tasks:

```yaml
global_quality_check:
  validation_commands:
    - command: 'pnpm run typecheck'
      description: 'TypeScript type checking'
      type: auto
      required: true

    - command: 'pnpm run lint'
      description: 'ESLint checks'
      type: auto
      required: false
```

## Task-Specific Validation

### Example: ENV-014-AI (SonarQube Setup)

```yaml
ENV-014-AI:
  validation_commands:
    - command: 'docker ps | grep -q sonarqube'
      description: 'SonarQube server running'
      required: true

    - command: 'sonar-scanner -Dsonar.qualitygate.wait=true'
      description: 'Run SonarQube analysis'
      required: true

  kpi_checks:
    - metric: 'code_coverage'
      operator: '>='
      threshold: 80
```

## Orchestrator Integration

### Automatic Execution

The orchestrator runs quality gates automatically:

```bash
# Run task with full quality validation
./apps/project-tracker/docs/metrics/orchestrator.sh run ENV-014-AI

# Execution flow:
# Phase 1: Architect (MCP Spec)
# Phase 2: Enforcer (Codex TDD)
# Phase 3: Builder (Claude Code)
# Phase 3.5: Quality Gates ⬅️ NEW
# Phase 4: Validation (YAML)
# Phase 5: Auditor (Gemini)
```

### Manual Quality Check

```bash
# Run only quality gates for a task
./apps/project-tracker/docs/metrics/orchestrator.sh validate <TASK_ID>
```

## Quality Reports

### Generate Report

```bash
pnpm run quality:report
```

**Report includes:**

- TypeScript errors count
- ESLint warnings/errors
- Test pass/fail status
- Security vulnerabilities breakdown
- Unused dependencies
- Dead code metrics
- SonarQube quality gate status

**Report location:**

```
artifacts/reports/quality-report-<timestamp>.json
```

### View in SonarQube Dashboard

Access comprehensive metrics at: http://localhost:9000

- **Bugs** - Logic errors
- **Vulnerabilities** - Security issues
- **Code Smells** - Maintainability issues
- **Coverage** - Test coverage %
- **Duplications** - Code duplication %
- **Technical Debt** - Estimated fix time

## CI/CD Integration

### GitHub Actions

```yaml
name: Quality Gates

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      - name: Run quality checks
        run: pnpm run quality:check

      - name: SonarQube Scan
        uses: sonarsource/sonarqube-scan-action@master
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}
```

### Pre-commit Hooks

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "pnpm run typecheck && pnpm run lint",
      "pre-push": "pnpm run quality:check"
    }
  }
}
```

## Troubleshooting

### TypeCheck Failures

```bash
# Run typecheck with verbose output
pnpm run typecheck 2>&1 | tee typecheck.log

# Check specific package
pnpm --filter @intelliflow/api typecheck

# Common fixes:
# 1. Run pnpm install to update types
# 2. Check tsconfig.json paths
# 3. Ensure all imports have proper extensions (.js for ESM)
```

### SonarQube Issues

```bash
# Check if SonarQube is running
docker ps | grep sonarqube

# View logs
docker logs intelliflow-sonarqube

# Restart SonarQube
docker-compose -f docker-compose.sonarqube.yml restart

# Check API status
curl http://localhost:9000/api/system/status
```

### Depcheck False Positives

Add to `.depcheckrc`:

```json
{
  "ignores": ["@types/your-package", "your-dev-tool"]
}
```

### Knip Excessive Warnings

Configure in `knip.json`:

```json
{
  "ignore": ["path/to/generated/**", "legacy-code/**"]
}
```

## Best Practices

### 1. Run Checks Locally Before Committing

```bash
# Quick check
pnpm run typecheck && pnpm run lint

# Full validation
pnpm run quality:check
```

### 2. Fix Critical Issues First

Priority order:

1. 🔴 TypeScript errors (blocks deployment)
2. 🟠 Test failures (blocks deployment)
3. 🟡 Security vulnerabilities (high/critical)
4. 🟢 ESLint errors
5. 🔵 Code smells & dead code

### 3. Monitor Technical Debt

```bash
# Weekly review of SonarQube dashboard
# Track debt trend over time
# Allocate time for debt reduction sprints
```

### 4. Use IDE Integrations

- **VS Code**: Install SonarLint extension
- **Enable connected mode** with local SonarQube
- **Real-time feedback** while coding

## References

- [SonarQube Setup Guide](./docs/setup/sonarqube-setup.md)
- [Orchestrator Documentation](./apps/project-tracker/docs/metrics/orchestrator.sh)
- [Validation Rules](./apps/project-tracker/docs/metrics/validation.yaml)
- [TypeScript Configuration](./packages/typescript-config/)

## Scripts Reference

```bash
# Quality checks
pnpm run quality:check        # Run all checks
pnpm run quality:deps         # Check unused deps
pnpm run quality:security     # Security audit
pnpm run quality:deadcode     # Dead code detection
pnpm run quality:sonar        # SonarQube analysis
pnpm run quality:report       # Generate report
pnpm run quality:all          # Everything + SonarQube

# Individual tools
pnpm run typecheck            # TypeScript
pnpm run lint                 # ESLint
pnpm test                     # Tests
npx depcheck                  # Unused deps
npx knip                      # Dead code
sonar-scanner                 # SonarQube CLI
```

## Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review validation logs: `logs/validation-*.log`
3. Check quality reports: `artifacts/reports/`
4. Review SonarQube dashboard: http://localhost:9000
