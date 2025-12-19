# PARALLEL-C Quick Start Guide

**Sprint 0 - Tasks: EXC-SEC-001 & IFC-160** **Date:** 2025-12-14

## What Was Delivered

### EXC-SEC-001: Secrets Management (HashiCorp Vault)

Complete HashiCorp Vault configuration for secure secrets management across all
services.

### IFC-160: Artifact Path Conventions + CI Lint

Automated enforcement of artifact organization standards with comprehensive
documentation.

---

## Quick Start (5 Minutes)

### 1. Install Dependencies

```bash
pnpm install
```

This will install:

- `tsx` - TypeScript execution
- `glob` - File pattern matching
- `typescript` - TypeScript compiler
- Other required dependencies

### 2. Run Artifact Linter

```bash
pnpm run lint:artifacts
```

Expected output:

```
🔍 IntelliFlow CRM - Artifact Path Linter

Found X files to check

✓ No violations found!

Statistics:
  Total files checked: X
  Files with violations: 0
  Total violations: 0
  Errors: 0
  Warnings: 0
```

### 3. Review Documentation

Open these key files:

- `docs/architecture/repo-layout.md` - Repository structure
- `docs/architecture/artifact-conventions.md` - Artifact standards
- `.env.example` - Environment variables reference

### 4. Check Vault Configuration

Review the Vault setup:

- `artifacts/misc/vault-config.yaml` - Vault server config
- `artifacts/misc/access-policy.json` - Access policies
- `artifacts/logs/secret-retrieval-test.log` - Test results

---

## Common Tasks

### Run Audit to Find Misplaced Artifacts

```bash
pnpm run lint:artifacts:audit
```

This generates `scripts/migration/artifact-move-map.csv` with suggested moves.

### Check for Secrets in Files

The linter automatically scans for:

- API keys
- AWS access keys
- Private keys (PEM format)
- Database passwords
- GitHub tokens
- OpenAI API keys

Run: `pnpm run lint:artifacts`

### Organize New Artifacts

When creating artifacts, use these paths:

```
artifacts/
├── logs/          # All log files
├── reports/       # Coverage, bundle, performance reports
├── metrics/       # Performance and business metrics
└── misc/          # Other generated files
```

Example:

```bash
# ✅ Good
artifacts/logs/build/my-build-2025-12-14.log
artifacts/reports/coverage/unit-coverage.html

# ❌ Bad
src/my-log.log
apps/web/coverage.html
```

---

## For Developers

### Before Committing

1. **Run the linter:**

   ```bash
   pnpm run lint:artifacts
   ```

2. **Fix any violations** reported

3. **Ensure .env.example is updated** if you added new environment variables

### Working with Secrets

**DO:**

- ✅ Add all secrets to `.env.example` as placeholders
- ✅ Reference secrets from Vault in production
- ✅ Use environment variables
- ✅ Document required secrets

**DON'T:**

- ❌ Commit `.env` files
- ❌ Hardcode API keys
- ❌ Put secrets in source code
- ❌ Include secrets in log files

### CI/CD Integration

The artifact linter runs automatically on:

- Every pull request
- Every push to main/develop
- Manual workflow dispatch

GitHub Action location: `.github/workflows/artifact-lint.yml`

---

## For DevOps

### Setting Up Vault

1. **Review configuration:**

   ```bash
   cat artifacts/misc/vault-config.yaml
   ```

2. **Review access policies:**

   ```bash
   cat artifacts/misc/access-policy.json
   ```

3. **Deploy Vault server** using the configuration

4. **Configure service authentication** based on policies

5. **Test secret retrieval** (see test log for examples)

### Vault Service Policies

| Service    | Policy               | Access                    |
| ---------- | -------------------- | ------------------------- |
| API Server | `api-service-policy` | DB, API keys, JWT         |
| AI Worker  | `ai-worker-policy`   | OpenAI, Ollama, LangChain |
| Web App    | `web-app-policy`     | NextAuth, session         |
| CI/CD      | `ci-cd-policy`       | Deployment secrets        |
| Monitoring | `monitoring-policy`  | Sentry, Grafana           |

### Monitoring Artifacts

```bash
# Check artifacts directory size
du -sh artifacts/

# Find large files
find artifacts/ -type f -size +10M

# Clean old logs (example: older than 7 days)
find artifacts/logs/ -type f -mtime +7 -delete
```

---

## Troubleshooting

### Linter Reports Violations

**Problem:** `pnpm run lint:artifacts` shows errors

**Solution:**

1. Read the violation details
2. Move files to correct location
3. Run linter again to verify

Example:

```bash
# If src/build.log is reported:
mkdir -p artifacts/logs/build
mv src/build.log artifacts/logs/build/build-2025-12-14.log
pnpm run lint:artifacts
```

### Secret Detected in File

**Problem:** Linter detects potential secret

**Solution:**

1. Review the file and line number
2. Remove or redact the secret
3. Add to `.env.example` as placeholder
4. Use environment variable instead

### CI/CD Workflow Fails

**Problem:** GitHub Action artifact-lint fails

**Solution:**

1. Check the workflow run logs
2. Look for the violation details in PR comment
3. Fix locally and push changes
4. Workflow will re-run automatically

### File Size Warning

**Problem:** File exceeds size limit

**Solution:**

```bash
# Compress logs
gzip large-file.log

# Split large JSON files
split -l 1000 large-file.json large-file-part-

# Move to external storage and link
aws s3 cp large-file.json s3://bucket/
echo "s3://bucket/large-file.json" > artifacts/misc/large-file-link.txt
```

---

## Environment Variables

The `.env.example` file documents **91 environment variables** across:

- Vault configuration (8 vars)
- Database (10 vars)
- AI/LLM (12 vars)
- Authentication (9 vars)
- API (3 vars)
- Frontend (4 vars)
- Monitoring (10 vars)
- Deployment (5 vars)
- Feature flags (4 vars)
- Integrations (10 vars)
- Development (3 vars)
- Security (6 vars)
- Performance (7 vars)

**To use:**

```bash
cp .env.example .env
# Edit .env with your actual values
# NEVER commit .env file
```

---

## Key Scripts

| Script                          | Purpose                       |
| ------------------------------- | ----------------------------- |
| `pnpm run lint:artifacts`       | Run artifact path linter      |
| `pnpm run lint:artifacts:fix`   | Auto-fix violations (planned) |
| `pnpm run lint:artifacts:audit` | Generate migration map        |

---

## File Locations Reference

### EXC-SEC-001 Files

```
C:\taly\intelliFlow-CRM\
├── .env.example                              # Env vars template
└── artifacts/
    ├── logs/
    │   └── secret-retrieval-test.log         # Vault test results
    └── misc/
        ├── vault-config.yaml                  # Vault configuration
        └── access-policy.json                 # Access policies
```

### IFC-160 Files

```
C:\taly\intelliFlow-CRM\
├── .github/
│   └── workflows/
│       └── artifact-lint.yml                  # CI/CD workflow
├── docs/
│   └── architecture/
│       ├── repo-layout.md                     # Repo structure docs
│       └── artifact-conventions.md            # Artifact standards
├── scripts/
│   └── migration/
│       ├── artifact-move-map.csv             # Migration mapping
│       └── README.md                         # Migration guide
└── tools/
    └── lint/
        └── artifact-paths.ts                  # TypeScript linter
```

---

## Next Steps

### Immediate (Today)

1. ✅ Review this quick start
2. ✅ Run `pnpm install`
3. ✅ Run `pnpm run lint:artifacts`
4. ✅ Review key documentation files

### Short Term (This Week)

1. Deploy Vault server (dev environment)
2. Migrate first service to use Vault
3. Test CI/CD artifact linting
4. Team training on artifact conventions

### Long Term (Sprint 1+)

1. Production Vault deployment
2. All services using Vault
3. Automated artifact cleanup
4. Custom linting rules as needed

---

## Support and Resources

### Documentation

- [Repository Layout](docs/architecture/repo-layout.md)
- [Artifact Conventions](docs/architecture/artifact-conventions.md)
- [Migration Guide](scripts/migration/README.md)
- [Completion Summary](artifacts/misc/PARALLEL-C-COMPLETION-SUMMARY.md)

### Testing

- Vault tests: `artifacts/logs/secret-retrieval-test.log`
- Linter code: `tools/lint/artifact-paths.ts`
- CI workflow: `.github/workflows/artifact-lint.yml`

### Questions?

- Check documentation first
- Review completion summary
- Run `pnpm run lint:artifacts` for specific issues
- Contact DevOps team

---

**Status:** ✅ All deliverables complete and ready for use

**Last Updated:** 2025-12-14
