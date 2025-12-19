# Sprint 0 Validation Guide

This guide provides quick instructions for validating the Sprint 0 setup and
running the test suites.

## Quick Start

### Validate Sprint 0 Completion

Run the comprehensive validation script to ensure all Sprint 0 requirements are
met:

```bash
pnpm run validate:sprint0
```

### Generate a Human-Readable Log File

If you need to save the validation output to a file (for audits/CI logs), use
the report script. It strips ANSI color codes and avoids encoding issues seen
when piping output on Windows PowerShell:

```bash
pnpm run validate:sprint0:report
```

Writes to: `artifacts/sprint0/codex-run/validation-output.txt`

This will check:

- ✅ Monorepo structure (5 checks)
- ✅ Configuration files (7 checks)
- ✅ Test infrastructure (8 checks)
- ✅ Artifact directories (9 checks)
- ✅ Package structure (8 checks)
- ✅ Documentation (4 checks)
- ✅ NPM scripts (8 checks)
- ✅ Git setup (2 checks)
- ✅ TypeScript config (2 checks)
- ✅ Task metrics (4 checks)

**Total: 57 validation checks**

### Expected Output

If all validations pass, you'll see:

```
======================================================================
IntelliFlow CRM - Sprint 0 Validation
======================================================================

📦 Validating Monorepo Structure...
✅ Root package.json: Root package.json exists
✅ pnpm-workspace.yaml: pnpm workspace configuration exists
✅ turbo.json: Turbo configuration exists
...

======================================================================
Sprint 0 Validation Summary
======================================================================

✅ MONOREPO: 5/5 passed
✅ CONFIG: 7/7 passed
✅ TESTING: 8/8 passed
...

----------------------------------------------------------------------
Total: 57/57 validations passed (100.0%)
----------------------------------------------------------------------

🎉 Sprint 0 is complete! All validations passed.
```

## Running Tests

### Unit Tests

```bash
# Run all unit tests
pnpm run test:unit

# Run with coverage
pnpm run test:unit -- --coverage

# Watch mode (for TDD)
pnpm run test:watch
```

### Integration Tests

Integration tests require a test database and optionally running services.

**Setup:**

1. Create `.env.test` file:

```env
NODE_ENV=test
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/intelliflow_test
TEST_API_URL=http://localhost:3001
TEST_API_AVAILABLE=true
```

2. Start test services (if needed):

```bash
docker-compose -f docker-compose.test.yml up -d
```

**Run tests:**

```bash
# All integration tests
pnpm run test:integration

# Specific test file
pnpm run test:integration -- api.test

# With coverage
pnpm run test:integration -- --coverage

# Watch mode
pnpm run test:integration -- --watch
```

**Note:** Integration tests will skip gracefully if services are not available.

### E2E Tests

End-to-end tests use Playwright to test the application in a real browser.

```bash
# Run all E2E tests
pnpm run test:e2e

# Run in headed mode (see browser)
pnpm run test:e2e:headed

# Run in UI mode (interactive)
pnpm run test:e2e:ui

# View test report
pnpm run test:e2e:report
```

**First-time setup:**

```bash
# Install Playwright browsers
pnpm exec playwright install --with-deps
```

### All Tests

Run the complete test suite:

```bash
# Run all tests (unit, integration, E2E)
pnpm run test:all
```

## Test Coverage

View test coverage:

```bash
# Generate coverage report
pnpm run test:coverage

# Coverage reports are saved to:
# artifacts/coverage/
```

**Coverage Goals:**

- Domain layer: >95%
- Application layer: >90%
- Overall: >90%

## CI/CD Integration

The validation script is designed for CI integration:

```yaml
# GitHub Actions example
- name: Validate Sprint 0
  run: pnpm run validate:sprint0

- name: Run Tests
  run: pnpm run test:all

- name: Check Coverage
  run: pnpm run test:coverage
```

**Exit Codes:**

- `0` - All validations/tests passed
- `1` - One or more validations/tests failed

## Troubleshooting

### Validation Failures

If validation fails, check the specific error messages. Common issues:

1. **Missing configuration files**
   - Ensure you've checked out all files from the repository
   - Run `git status` to see if files are missing

2. **Missing dependencies**
   - Run `pnpm install` to install all dependencies

3. **Missing artifact directories**
   - These are created automatically, but can be recreated with:
   ```bash
   mkdir -p artifacts/{benchmarks,coverage,lighthouse,logs,metrics,misc,reports,test-results}
   ```

### Integration Test Issues

1. **Database connection errors**
   - Ensure `TEST_DATABASE_URL` is set correctly
   - Verify database is running and accessible
   - Check database permissions

2. **API tests being skipped**
   - Set `TEST_API_AVAILABLE=true` in `.env.test`
   - Ensure API server is running on `TEST_API_URL`

3. **Timeout errors**
   - Integration tests have 30s timeout
   - Check service health endpoints
   - Verify network connectivity

### E2E Test Issues

1. **Browsers not installed**
   - Run `pnpm exec playwright install --with-deps`

2. **Application not starting**
   - Playwright auto-starts the dev server
   - Check `webServer` config in `playwright.config.ts`
   - Ensure port 3000 is available

3. **Tests failing intermittently**
   - E2E tests retry 2 times in CI
   - Check for race conditions or timing issues
   - Review test isolation

## File Structure

```
intelliFlow-CRM/
├── tests/
│   ├── setup.ts                    # Unit test setup
│   ├── integration/
│   │   ├── setup.ts                # Integration test setup
│   │   ├── api.test.ts             # API integration tests
│   │   ├── db.test.ts              # Database integration tests
│   │   └── README.md               # Integration test guide
│   └── e2e/
│       ├── smoke.spec.ts           # E2E smoke tests
│       ├── global-setup.ts         # E2E setup
│       └── global-teardown.ts      # E2E teardown
├── tools/
│   └── scripts/
│       ├── sprint0-validation.ts   # Sprint 0 validation script
│       └── README.md               # Scripts documentation
├── vitest.config.ts                # Vitest configuration
├── playwright.config.ts            # Playwright configuration
└── VALIDATION.md                   # This file
```

## Next Steps

After validating Sprint 0:

1. **Review Sprint Plan**
   - Check `Sprint_plan.csv` for Sprint 1 tasks
   - Review dependencies and pre-requisites

2. **Start Development**
   - Run `pnpm run dev` to start development servers
   - Use `pnpm run test:watch` for TDD workflow

3. **Create Features**
   - Follow the workflow in `CLAUDE.md`
   - Write tests first (TDD)
   - Ensure coverage >90%
   - Run validation before committing

## Documentation

- [Sprint 0 Completion Summary](docs/sprint-0-completion-summary.md)
- [Integration Test Guide](tests/integration/README.md)
- [Scripts Documentation](tools/scripts/README.md)
- [CLAUDE.md](CLAUDE.md) - Development guidelines
- [Sprint Plan](Sprint_plan.csv) - Task breakdown

## Support

If you encounter issues not covered in this guide:

1. Check the detailed documentation in the files above
2. Review the Sprint 0 completion summary
3. Run the validation script to identify specific issues
4. Check the test output for detailed error messages

---

**Last Updated:** December 15, 2025 **Sprint:** Sprint 0 (Complete) **Tasks:**
ENV-017-AI, ENV-018-AI
