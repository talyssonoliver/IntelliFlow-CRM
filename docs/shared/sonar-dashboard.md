# SonarQube Dashboard Guide

**Task**: IFC-111 - Set up SonarQube and integrate static analysis into CI/CD
**Owner**: DevOps + QA Lead (STOA-Quality) **Sprint**: 5

## Overview

This document describes the SonarQube/SonarCloud integration for IntelliFlow CRM
static code analysis. The integration provides continuous code quality
monitoring with OWASP security rules and Clean Code standards.

## Access Points

### Local Development (SonarQube)

- **URL**: http://localhost:9000
- **Default Credentials**: admin/admin (change on first login)
- **Docker Compose**: `docker-compose.sonarqube.yml`

### CI/CD (SonarCloud)

- **URL**: https://sonarcloud.io/dashboard?id=IntelliFlow
- **Authentication**: SONAR_TOKEN GitHub secret
- **Organization**: Configured via SONAR_ORGANIZATION GitHub variable

## Quality Gate Configuration

The quality gate enforces the following criteria (IFC-111 KPIs):

| Metric                           | Threshold | Description                        |
| -------------------------------- | --------- | ---------------------------------- |
| **Overall Rating**               | A         | Aggregate quality rating           |
| **Reliability Rating**           | A         | No new bugs allowed                |
| **Security Rating**              | A         | No new vulnerabilities allowed     |
| **Maintainability Rating**       | A         | Technical debt ratio < 3%          |
| **Coverage on New Code**         | >= 80%    | Test coverage for new/changed code |
| **Duplicated Lines on New Code** | < 3%      | Code duplication threshold         |
| **Blocker Issues**               | 0         | No blocker-level issues            |
| **Critical Issues**              | 0         | No critical-level issues           |

## Dashboard Sections

### 1. Overall Project Health

The main dashboard displays:

- **Quality Gate Status**: PASSED/FAILED indicator
- **Reliability**: Bug count and rating (A-E)
- **Security**: Vulnerability count and rating (A-E)
- **Maintainability**: Code smell count and rating (A-E)
- **Coverage**: Line and branch coverage percentages
- **Duplications**: Duplicated code percentage

### 2. Security Hotspots

Review and triage security-sensitive code:

- **OWASP Top 10** vulnerabilities
- **CWE** (Common Weakness Enumeration) classifications
- **Security Review Status**: To Review, Reviewed, Safe

### 3. Issues Tab

Filter and manage issues by:

- **Type**: Bug, Vulnerability, Code Smell, Security Hotspot
- **Severity**: Blocker, Critical, Major, Minor, Info
- **Status**: Open, Confirmed, Resolved, Reopened, Closed
- **Assignee**: Team member responsible for resolution
- **Tag**: Custom labels for categorization

### 4. Measures Tab

Detailed metrics including:

- **Complexity**: Cyclomatic and cognitive complexity
- **Documentation**: Comment density
- **Duplications**: Duplicated blocks and lines
- **Issues**: By severity and type
- **Maintainability**: Technical debt and remediation effort
- **Reliability**: Bugs and reliability remediation effort
- **Security**: Vulnerabilities and security remediation effort
- **Size**: Lines of code, files, functions, classes
- **Tests**: Coverage, test success rate, test execution time

### 5. Code Tab

Interactive code browser with:

- Inline issue annotations
- Coverage highlighting (covered/uncovered lines)
- Duplication markers
- Security hotspot indicators

### 6. Activity Tab

Historical trends showing:

- Quality gate history
- Issue trends over time
- Coverage trends
- Technical debt evolution

## Rule Sets Enabled

### OWASP Top 10 (Security)

1. **A01:2021 - Broken Access Control**
2. **A02:2021 - Cryptographic Failures**
3. **A03:2021 - Injection**
4. **A04:2021 - Insecure Design**
5. **A05:2021 - Security Misconfiguration**
6. **A06:2021 - Vulnerable and Outdated Components**
7. **A07:2021 - Identification and Authentication Failures**
8. **A08:2021 - Software and Data Integrity Failures**
9. **A09:2021 - Security Logging and Monitoring Failures**
10. **A10:2021 - Server-Side Request Forgery**

### Clean Code Rules (Maintainability)

- **Cognitive Complexity**: Functions should not be too complex
- **Code Duplication**: Avoid duplicate code blocks
- **Dead Code**: Remove unused code
- **Naming Conventions**: Follow consistent naming patterns
- **Function Size**: Keep functions focused and small
- **Nesting Depth**: Avoid deeply nested structures
- **Comment Quality**: Meaningful comments, no TODO/FIXME in production

### TypeScript/JavaScript Specific

- **Type Safety**: Prefer explicit types over `any`
- **Null Safety**: Handle null/undefined properly
- **Promise Handling**: Proper async/await usage
- **Error Handling**: Catch and handle errors appropriately
- **React Hooks**: Follow hooks rules (dependencies, ordering)

## Local Development Workflow

### Starting SonarQube

```bash
# Using helper script
node scripts/sonarqube-helper.js start

# Or directly with Docker Compose
docker-compose -f docker-compose.sonarqube.yml up -d

# Wait for SonarQube to be ready
node scripts/sonarqube-helper.js wait
```

### Running Analysis

```bash
# Run tests with coverage first
pnpm run test -- --coverage

# Run SonarQube analysis
node scripts/sonarqube-helper.js analyze

# Or using the scan script
node scripts/sonar-scan.js
```

### Checking Quality Gate Status

```bash
# Check current quality gate status
node scripts/sonar-status.js

# View new issues since baseline
node scripts/sonar-new-issues.js
```

### Stopping SonarQube

```bash
node scripts/sonarqube-helper.js stop
```

## CI/CD Integration

### GitHub Actions Workflow

The `ci-sonar.yml` workflow runs on:

- Push to `main` or `develop` branches
- Pull requests targeting `main` or `develop`
- Manual workflow dispatch

### Required Secrets

| Secret        | Description                     |
| ------------- | ------------------------------- |
| `SONAR_TOKEN` | SonarCloud authentication token |

### Required Variables

| Variable             | Description                 |
| -------------------- | --------------------------- |
| `SONAR_ORGANIZATION` | SonarCloud organization key |

### PR Integration

Pull requests receive:

- Quality gate status check
- Inline code annotations for new issues
- PR comment with analysis summary

## Suppressing False Positives

### In Code

```typescript
// NOSONAR - Explanation of why this is intentional
const intentionallyUnusedVar = 'value'; // NOSONAR
```

### In Configuration

Add to `sonar-project.properties`:

```properties
# Suppress specific rule for specific file
sonar.issue.ignore.multicriteria=key1,key2
sonar.issue.ignore.multicriteria.key1.ruleKey=typescript:S1234
sonar.issue.ignore.multicriteria.key1.resourceKey=path/to/file.ts
```

### Via Dashboard

1. Navigate to the issue in SonarQube/SonarCloud
2. Click "More actions" > "Won't fix" or "False positive"
3. Add justification comment

## Audit Matrix Integration

SonarQube is registered in `audit-matrix.yml`:

```yaml
- id: sonarqube-scanner
  tier: 1
  enabled: true
  required: false # Until CI secrets are configured
  owner: 'DevOps Engineer'
  command: 'node scripts/sonarqube-helper.js analyze'
  thresholds:
    quality_gate: 'A'
    technical_debt_ratio_max: 3

- id: sonarqube-quality-gate
  tier: 1
  enabled: true
  required: false
  owner: 'DevOps Engineer'
  command: 'node scripts/sonar-status.js'
```

## Troubleshooting

### Common Issues

**SonarQube container fails to start**

```bash
# Check Docker logs
docker logs intelliflow-sonarqube

# Increase Docker memory allocation (SonarQube requires >2GB)
# Docker Desktop > Settings > Resources > Memory
```

**Analysis fails with authentication error**

```bash
# Verify SONAR_TOKEN is set
echo $SONAR_TOKEN

# Check .env.local file
cat .env.local | grep SONAR
```

**Coverage report not found**

```bash
# Run tests with coverage first
pnpm run test -- --coverage

# Verify report exists
ls -la artifacts/coverage/lcov.info
```

**Quality gate check fails**

```bash
# View detailed status
node scripts/sonar-status.js

# Check SonarQube dashboard for specific failures
# http://localhost:9000/dashboard?id=IntelliFlow
```

## Best Practices

1. **Review issues regularly**: Don't let technical debt accumulate
2. **Fix blockers immediately**: Zero tolerance for blocker-level issues
3. **Address security hotspots**: Review all security-sensitive code
4. **Maintain coverage**: Keep test coverage above 80% on new code
5. **Use quality profiles**: Customize rules for project-specific needs
6. **Set up notifications**: Alert team on quality gate failures
7. **Document suppressions**: Always explain why a rule is suppressed

## References

- [SonarQube Documentation](https://docs.sonarqube.org/)
- [SonarCloud Documentation](https://docs.sonarcloud.io/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Clean Code Principles](https://www.sonarsource.com/solutions/clean-code/)
- [TypeScript Rules](https://rules.sonarsource.com/typescript)
