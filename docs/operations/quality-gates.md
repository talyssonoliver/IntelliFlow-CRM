# Quality Gates

## Governance Validators

- `validate:sprint0`: baseline + sprint completion + docs hygiene + uniqueness
- `validate:sprint-data`: CSV ↔ JSON consistency

## Engineering Quality

- Typecheck
- Unit/integration/E2E tests (where present)
- Linting (non-blocking unless configured as required)

## Static Analysis (IFC-111)

### SonarQube/SonarCloud Integration

SonarQube provides continuous code quality and security analysis. The
integration supports both local development (SonarQube Docker) and CI/CD
(SonarCloud).

**Configuration Files:**

- `sonar-project.properties` - Project configuration (repo root)
- `docker-compose.sonarqube.yml` - Local SonarQube server
- `.github/workflows/sonar.yml` - CI/CD integration
- `docs/shared/sonar-dashboard.md` - Dashboard documentation

**Quality Gate Criteria:**

| Metric                   | Threshold | Blocking |
| ------------------------ | --------- | -------- |
| Reliability Rating       | A         | Yes      |
| Security Rating          | A         | Yes      |
| Maintainability Rating   | A         | Yes      |
| Coverage on New Code     | >= 80%    | Yes      |
| Duplications on New Code | < 3%      | Yes      |
| Blocker Issues           | 0         | Yes      |
| Critical Issues          | 0         | Yes      |

**Rule Sets:**

- OWASP Top 10 security rules
- Clean Code maintainability rules
- TypeScript/JavaScript best practices

**Local Usage:**

```bash
# Start SonarQube
node scripts/sonarqube-helper.js start

# Run analysis
node scripts/sonarqube-helper.js analyze

# Check quality gate status
node scripts/sonar-status.js
```

**Audit Matrix Integration:**

- Tool ID: `sonarqube-scanner` (Tier 1, enabled)
- Tool ID: `sonarqube-quality-gate` (Tier 1, enabled)
- Owner: DevOps Engineer
- Required: false (until CI secrets configured)
