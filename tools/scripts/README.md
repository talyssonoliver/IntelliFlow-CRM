# Tools Scripts

This directory contains utility scripts for the IntelliFlow CRM project.

## Available Scripts

### validate-turbo.ts

Validates Turborepo configuration and cache behavior.

**Purpose:**

- Ensures turbo.json is correctly configured
- Validates pipeline definitions
- Checks cache configuration
- Verifies input/output patterns
- Analyzes dependency graph
- Tests remote cache setup

**Usage:**

```bash
# Run full validation
npx tsx tools/scripts/validate-turbo.ts

# Run with verbose output
npx tsx tools/scripts/validate-turbo.ts --verbose

# Check cache hit rate
npx tsx tools/scripts/validate-turbo.ts --check-cache

# Display full report
npx tsx tools/scripts/validate-turbo.ts --report
```

**Output:**

- Console output with validation results
- JSON report at `artifacts/reports/turbo-validation.json`

**Validation Checks:**

1. turbo.json exists
2. Schema reference is correct
3. Essential tasks are defined (build, lint, typecheck, test)
4. Task inputs and outputs are configured
5. No circular dependencies in task graph
6. Remote cache is configured with signature verification
7. Cache directory exists
8. Global environment variables are properly set

**Exit Codes:**

- `0`: All validations passed
- `1`: One or more validations failed

### validate-env.ts

Validates all environment variables required for IntelliFlow CRM.

**Purpose:**

- Ensures all required environment variables are present
- Validates variable formats (URLs, keys, ports, etc.)
- Checks security-sensitive variables for placeholder values
- Detects configuration issues before deployment
- Generates validation reports

**Usage:**

```bash
# Validate current environment
pnpm tsx tools/scripts/validate-env.ts

# Validate specific environment
pnpm tsx tools/scripts/validate-env.ts --env=production

# Generate JSON report
pnpm tsx tools/scripts/validate-env.ts --output=artifacts/misc/env-validation-results.json
```

**Output:**

- Color-coded console output with validation status
- JSON report at specified output path
- Exit code for CI integration (0 = success, 1 = failure)

**Validation Checks:**

1. **Required Variables**: DATABASE_URL, SUPABASE_URL, OPENAI_API_KEY, etc.
2. **Format Validation**: URLs, ports, emails, UUIDs using Zod schemas
3. **Security Checks**: Detects placeholder values in sensitive variables
4. **Environment-Specific**: Different requirements for dev/staging/production
5. **Value Validation**: Custom validators for special formats

**Checked Variables (26 total):**

- Vault Configuration (4 vars)
- Database Configuration (6 vars)
- Redis Configuration (2 vars)
- AI/LLM Configuration (4 vars)
- Authentication (3 vars)
- API Configuration (2 vars)
- Observability (2 vars)
- Environment Identifier (2 vars)
- Security (1 var)

**Exit Codes:**

- `0`: All required variables are valid
- `1`: One or more validation errors

### check-dependencies.ts

Validates all system and package dependencies required for development.

**Purpose:**

- Checks Node.js version compatibility (>=20.0.0)
- Validates pnpm version (>=8.0.0)
- Verifies required system tools (Git, Docker, TypeScript)
- Scans all workspaces for dependency inconsistencies
- Identifies outdated packages
- Ensures development environment is properly configured

**Usage:**

```bash
# Run dependency checks
pnpm tsx tools/scripts/check-dependencies.ts

# Run with verbose output
pnpm tsx tools/scripts/check-dependencies.ts --verbose

# Check and suggest fixes
pnpm tsx tools/scripts/check-dependencies.ts --fix
```

**Output:**

- Color-coded console output with check results
- Dependency inconsistencies across workspaces
- Outdated package list (with --verbose)
- Summary statistics

**System Checks (6 total):**

1. **Node.js**: Version >=20.0.0 (required)
2. **pnpm**: Version >=8.0.0 (required)
3. **Git**: Available in PATH (required)
4. **Docker**: Available for containerization (optional)
5. **Docker Compose**: Available for local services (optional)
6. **TypeScript**: tsc compiler available (required)

**Package Checks:**

- Scans all workspace package.json files
- Detects version inconsistencies across workspaces
- Identifies outdated packages
- Provides recommended versions

**Exit Codes:**

- `0`: All required dependencies satisfied
- `1`: One or more required dependencies missing

### health-check.ts

Performs health checks on all infrastructure services.

**Purpose:**

- Validates database connectivity (PostgreSQL/Supabase)
- Checks Redis availability
- Tests external API connections (OpenAI, LangChain)
- Verifies local services (Ollama, Docker)
- Ensures development servers are running
- Measures response times for performance monitoring

**Usage:**

```bash
# Check all services
pnpm tsx tools/scripts/health-check.ts

# Check specific service
pnpm tsx tools/scripts/health-check.ts --service=database
pnpm tsx tools/scripts/health-check.ts --service=redis

# Set custom timeout (default: 5000ms)
pnpm tsx tools/scripts/health-check.ts --timeout=10000
```

**Output:**

- Color-coded status for each service (✓ healthy, ⚠ degraded, ✗ unhealthy)
- Response times in milliseconds
- Error messages for failed checks
- Overall system health summary

**Service Checks (8 total):**

1. **PostgreSQL Database**: Connection test via psql
2. **Supabase**: API reachability test
3. **Redis**: PING command test
4. **OpenAI API**: Model list endpoint test
5. **Ollama**: Local AI service test
6. **Docker**: Container status check
7. **Next.js Server**: Development server test
8. **API Server**: tRPC API server test

**Health Status:**

- **Healthy**: Service is fully operational
- **Degraded**: Service is reachable but may have issues
- **Unhealthy**: Service is not available or failing
- **Unknown**: Cannot determine service status (not configured)

**Exit Codes:**

- `0`: All services healthy or degraded
- `1`: One or more services unhealthy

### sprint0-validation.ts

Governance-grade sprint validation script (supports any sprint via `--sprint`).

**Purpose:**

- Baseline structure readiness (files/dirs)
- Sprint completion check (CSV status only)
- Evidence integrity for DONE tasks (tracked task JSON semantics)
- Docs hygiene (no runtime artifacts under docs)
- Metrics tracked state (no untracked files under docs/metrics)
- Canonical uniqueness (single tracked copy of key artifacts)

**Usage:**

```bash
# Sprint 0 (default)
pnpm run validate:sprint0

# Sprint 1
pnpm run validate:sprint -- --sprint 1

# Strict mode (WARN => FAIL)
pnpm run validate:sprint -- --strict --sprint 1

# Or directly with tsx
npx tsx tools/scripts/sprint0-validation.ts --sprint 1
```

**Output:**

- Gate-by-gate PASS/WARN/FAIL output plus a final summary
- Exit code for CI integration (`0` = success, `1` = failure; WARN fails in
  strict mode)

**Gates:**

1. Baseline Structure
2. Sprint Completion (CSV status only)
3. Evidence Integrity (DONE semantics)
4. Docs Hygiene
5. Metrics Tracked State
6. Canonical Uniqueness

**Exit Codes:**

- `0`: All gates passed (or only WARNs in default mode)
- `1`: Any gate failed (or WARNs in strict mode)

**Example Output:**

```
======================================================================
IntelliFlow CRM - Sprint 0 Validation
======================================================================

📦 Validating Monorepo Structure...
✅ Root package.json: Root package.json exists
✅ pnpm-workspace.yaml: pnpm workspace configuration exists
✅ turbo.json: Turbo configuration exists
✅ Apps directory: Apps directory exists
✅ Packages directory: Packages directory exists

...

======================================================================
Sprint 0 Validation Summary
======================================================================

✅ MONOREPO: 5/5 passed
✅ CONFIG: 7/7 passed
✅ TESTING: 8/8 passed
✅ ARTIFACTS: 9/9 passed
✅ PACKAGES: 8/8 passed
✅ DOCS: 4/4 passed
✅ SCRIPTS: 8/8 passed
✅ GIT: 2/2 passed
✅ TYPESCRIPT: 2/2 passed
✅ METRICS: 4/4 passed

----------------------------------------------------------------------
Total: 57/57 validations passed (100.0%)
----------------------------------------------------------------------

[OK] Sprint 0 baseline validations passed (structure/config only).
```

### check-dependencies.ts

Checks dependency versions and compatibility (see separate documentation).

## Adding New Scripts

When adding new scripts to this directory:

1. Follow the naming convention: `validate-*.ts` or `check-*.ts`
2. Include shebang: `#!/usr/bin/env node`
3. Add comprehensive JSDoc comments
4. Support `--verbose` and `--help` flags
5. Generate reports in `artifacts/reports/`
6. Update this README with usage instructions
7. Make scripts executable: `chmod +x tools/scripts/your-script.ts`

## CI/CD Integration

These scripts can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Validate Turbo Configuration
  run: npx tsx tools/scripts/validate-turbo.ts
```

```yaml
# Example pre-commit hook
- name: Check environment
  run: npx tsx tools/scripts/validate-env.ts
```

## Testing Scripts

To test a script locally:

```bash
# Make it executable
chmod +x tools/scripts/validate-turbo.ts

# Run with tsx
npx tsx tools/scripts/validate-turbo.ts

# Or directly (if tsx is globally installed)
./tools/scripts/validate-turbo.ts
```

## Troubleshooting

### "tsx: command not found"

Install tsx globally or use npx:

```bash
npm install -g tsx
# OR
npx tsx tools/scripts/validate-turbo.ts
```

### "turbo.json not found"

Ensure you're running from the project root directory.

### Validation failures

Check the detailed report at `artifacts/reports/turbo-validation.json` for
specific issues.
