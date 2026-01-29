# SonarQube Fix Agent - Test Plan

## Test Categories

### 1. Unit Tests (Agent Logic)
### 2. Integration Tests (MCP Servers)
### 3. End-to-End Tests (Full Workflow)
### 4. Security Tests (Vulnerability Fixes)
### 5. Performance Tests (Batch Processing)

---

## 1. Unit Tests

### Test Suite: Quality Agent

#### Test: Extract Method Pattern
```typescript
describe('Quality Agent - Extract Method', () => {
  it('should identify high cognitive complexity', () => {
    const code = `
      function processLead(lead) {
        if (lead.status === 'NEW') {
          if (lead.score > 80) {
            if (lead.source === 'REFERRAL') {
              // 20 lines of logic
            }
          }
        }
      }
    `;

    const analysis = qualityAgent.analyze(code);
    expect(analysis.complexity).toBeGreaterThan(15);
    expect(analysis.recommendation).toBe('extract_method');
  });

  it('should generate extract method refactoring', () => {
    const result = qualityAgent.refactor(code, 'extract_method');

    expect(result.mainFunction.complexity).toBeLessThan(5);
    expect(result.extractedMethods.length).toBeGreaterThan(0);
    expect(result.extractedMethods.every(m => m.complexity < 15)).toBe(true);
  });
});
```

#### Test: Magic Number Extraction
```typescript
describe('Quality Agent - Magic Numbers', () => {
  it('should detect magic numbers', () => {
    const code = `if (lead.score > 80) { }`;

    const analysis = qualityAgent.analyze(code);
    expect(analysis.magicNumbers).toContain(80);
  });

  it('should generate constant extraction', () => {
    const result = qualityAgent.extractMagicNumber(code, 80);

    expect(result).toContain('const HIGH_QUALITY_SCORE_THRESHOLD = 80');
    expect(result).toContain('> HIGH_QUALITY_SCORE_THRESHOLD');
  });
});
```

### Test Suite: Security Agent

#### Test: SQL Injection Detection
```typescript
describe('Security Agent - SQL Injection', () => {
  it('should detect SQL injection vulnerability', () => {
    const code = `
      const query = \`SELECT * FROM leads WHERE email = '\${email}'\`;
      return await db.raw(query);
    `;

    const analysis = securityAgent.analyze(code);
    expect(analysis.vulnerabilities).toContainEqual({
      type: 'SQL_INJECTION',
      severity: 'CRITICAL',
      cvss: 9.8,
    });
  });

  it('should generate parameterized query fix', () => {
    const fix = securityAgent.fix(code, 'SQL_INJECTION');

    expect(fix).toContain('db.lead.findUnique');
    expect(fix).toContain('where: { email }');
    expect(fix).not.toContain('${}'); // No string interpolation
  });
});
```

#### Test: XSS Detection
```typescript
describe('Security Agent - XSS', () => {
  it('should detect XSS vulnerability', () => {
    const code = `
      <div dangerouslySetInnerHTML={{ __html: userInput }} />
    `;

    const analysis = securityAgent.analyze(code);
    expect(analysis.vulnerabilities).toContainEqual({
      type: 'XSS',
      severity: 'HIGH',
    });
  });

  it('should generate sanitization fix', () => {
    const fix = securityAgent.fix(code, 'XSS');

    expect(fix).toContain('DOMPurify.sanitize');
    expect(fix).toContain('ALLOWED_TAGS');
  });
});
```

### Test Suite: Automation Agent

#### Test: Unused Variable Removal
```typescript
describe('Automation Agent - Unused Variables', () => {
  it('should detect unused variables', () => {
    const code = `
      function test() {
        const unused = 'foo';
        return 'bar';
      }
    `;

    const analysis = automationAgent.analyze(code);
    expect(analysis.unusedVariables).toContain('unused');
  });

  it('should remove unused variables', () => {
    const fix = automationAgent.fix(code, 'UNUSED_VARIABLE');

    expect(fix).not.toContain('const unused');
    expect(fix).toContain('return \'bar\'');
  });
});
```

#### Test: Collapsible If
```typescript
describe('Automation Agent - Collapsible If', () => {
  it('should detect collapsible if statements', () => {
    const code = `
      if (a) {
        if (b) {
          doSomething();
        }
      }
    `;

    const analysis = automationAgent.analyze(code);
    expect(analysis.pattern).toBe('collapsible_if');
  });

  it('should collapse if statements', () => {
    const fix = automationAgent.fix(code, 'COLLAPSIBLE_IF');

    expect(fix).toContain('if (a && b)');
    expect(fix).not.toContain('if (b)');
  });
});
```

---

## 2. Integration Tests (MCP)

### Test Suite: SonarQube MCP Server

#### Test: Fetch Issues
```typescript
describe('SonarQube MCP Integration', () => {
  it('should fetch issues from SonarQube API', async () => {
    const issues = await mcpClient.execute('sonarqube_get_issues', {
      severity: ['CRITICAL'],
      resolved: false,
    });

    expect(issues).toBeInstanceOf(Array);
    expect(issues.every(i => i.severity === 'CRITICAL')).toBe(true);
  });

  it('should fallback to local reports if MCP unavailable', async () => {
    // Disconnect MCP
    await mcpClient.disconnect('sonarqube');

    const issues = await agent.fetchIssues();

    // Should still get issues from local files
    expect(issues).toBeInstanceOf(Array);
    expect(issues.length).toBeGreaterThan(0);
  });
});
```

#### Test: Get Rule Details
```typescript
describe('SonarQube MCP - Rule Details', () => {
  it('should fetch rule documentation', async () => {
    const rule = await mcpClient.execute('sonarqube_get_rule', {
      rule_key: 'typescript:S1541',
    });

    expect(rule.name).toContain('Cognitive Complexity');
    expect(rule.description).toBeDefined();
    expect(rule.severity).toBe('CRITICAL');
  });
});
```

### Test Suite: Web Search MCP

#### Test: Research Best Practices
```typescript
describe('Web Search MCP Integration', () => {
  it('should search for solutions', async () => {
    const results = await mcpClient.execute('web_search', {
      query: 'typescript cognitive complexity best practices',
      limit: 10,
    });

    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBeLessThanOrEqual(10);
    expect(results[0]).toHaveProperty('title');
    expect(results[0]).toHaveProperty('url');
  });

  it('should fallback to built-in WebSearch', async () => {
    await mcpClient.disconnect('web-search');

    const results = await agent.research('typescript patterns');

    // Should use built-in WebSearch tool
    expect(results).toBeInstanceOf(Array);
  });
});
```

### Test Suite: Code Search MCP

#### Test: Find Patterns
```typescript
describe('Code Search MCP Integration', () => {
  it('should find similar patterns in codebase', async () => {
    const results = await mcpClient.execute('code_search', {
      pattern: 'async.*findById',
      file_pattern: '*.ts',
      context_lines: 3,
    });

    expect(results).toBeInstanceOf(Array);
    expect(results.every(r => r.match)).toBe(true);
  });
});
```

---

## 3. End-to-End Tests

### Test Suite: Full Workflow

#### Test: Critical Bug Fix (E2E)
```typescript
describe('E2E - Critical Bug Fix', () => {
  it('should fix critical complexity issue end-to-end', async () => {
    // 1. Setup: Create file with high complexity
    const testFile = 'test-file.ts';
    await writeFile(testFile, HIGH_COMPLEXITY_CODE);

    // 2. Run agent
    const result = await runAgent({
      severity: 'critical',
      autoFix: true,
    });

    // 3. Verify fix applied
    const fixed = await readFile(testFile);
    expect(fixed).not.toEqual(HIGH_COMPLEXITY_CODE);

    // 4. Verify validation passed
    expect(result.validation.typescript).toBe('PASSED');
    expect(result.validation.tests).toBe('PASSED');
    expect(result.validation.coverage).toBeGreaterThanOrEqual(0.9);

    // 5. Verify metrics
    expect(result.metrics.automated_fixes).toBe(1);
    expect(result.metrics.success_rate).toBe(1.0);

    // 6. Cleanup
    await deleteFile(testFile);
  });
});
```

#### Test: Security Vulnerability Fix (E2E)
```typescript
describe('E2E - Security Fix', () => {
  it('should fix SQL injection vulnerability', async () => {
    const testFile = 'router.ts';
    await writeFile(testFile, SQL_INJECTION_CODE);

    const result = await runAgent({
      type: 'vulnerability',
      autoFix: true,
    });

    const fixed = await readFile(testFile);

    // Verify parameterized query
    expect(fixed).toContain('db.lead.findUnique');
    expect(fixed).not.toContain('$queryRawUnsafe');

    // Verify security tests pass
    expect(result.validation.security_tests).toBe('PASSED');

    await deleteFile(testFile);
  });
});
```

#### Test: Batch Processing (E2E)
```typescript
describe('E2E - Batch Processing', () => {
  it('should fix multiple issues in same file', async () => {
    const testFile = 'service.ts';
    await writeFile(testFile, MULTIPLE_ISSUES_CODE);

    const result = await runAgent({
      file: testFile,
      autoFix: true,
    });

    // Verify all issues fixed
    expect(result.metrics.total_issues).toBe(12);
    expect(result.metrics.automated_fixes).toBe(12);
    expect(result.metrics.success_rate).toBe(1.0);

    // Verify no rollbacks
    expect(result.metrics.rollback_rate).toBe(0);

    await deleteFile(testFile);
  });
});
```

#### Test: Rollback on Failure (E2E)
```typescript
describe('E2E - Rollback', () => {
  it('should rollback if validation fails', async () => {
    const testFile = 'critical.ts';
    const original = ORIGINAL_CODE;
    await writeFile(testFile, original);

    // Inject a fix that will break tests
    const result = await runAgent({
      file: testFile,
      autoFix: true,
    });

    const current = await readFile(testFile);

    // Verify rollback occurred
    expect(current).toEqual(original);
    expect(result.metrics.rollback_rate).toBeGreaterThan(0);

    await deleteFile(testFile);
  });
});
```

---

## 4. Security Tests

### Test Suite: OWASP Top 10 Coverage

#### Test: A03 - Injection Prevention
```typescript
describe('Security - Injection Prevention', () => {
  const injectionPayloads = [
    "'; DROP TABLE leads; --",
    "1' OR '1'='1",
    "<script>alert('xss')</script>",
    "admin'--",
    "1; DELETE FROM users",
  ];

  injectionPayloads.forEach(payload => {
    it(`should prevent injection: ${payload}`, async () => {
      const result = await testSecurityFix(SQL_INJECTION_CODE);

      // Test fixed code with malicious input
      await expect(
        result.fixedCode.execute({ input: payload })
      ).rejects.toThrow();
    });
  });
});
```

#### Test: A02 - Cryptographic Failures
```typescript
describe('Security - Cryptographic Failures', () => {
  it('should replace weak random with crypto.randomBytes', async () => {
    const code = `const token = Math.random().toString(36)`;

    const result = await securityAgent.fix(code, 'WEAK_RANDOM');

    expect(result).toContain('crypto.randomBytes');
    expect(result).not.toContain('Math.random');
  });

  it('should replace MD5 with bcrypt for passwords', async () => {
    const code = `const hash = crypto.createHash('md5').update(password)`;

    const result = await securityAgent.fix(code, 'WEAK_HASH');

    expect(result).toContain('bcrypt.hash');
    expect(result).not.toContain('md5');
  });
});
```

#### Test: A07 - Authentication Failures
```typescript
describe('Security - Authentication', () => {
  it('should add JWT expiration', async () => {
    const code = `jwt.sign({ userId }, secret)`;

    const result = await securityAgent.fix(code, 'NO_JWT_EXPIRATION');

    expect(result).toContain('expiresIn');
    expect(result).toMatch(/expiresIn:\s*['"]1h['"]/);
  });

  it('should enforce password strength', async () => {
    const code = `const hash = someWeakHash(password)`;

    const result = await securityAgent.fix(code, 'WEAK_PASSWORD_HASH');

    expect(result).toContain('bcrypt');
    expect(result).toMatch(/saltRounds:\s*12/);
  });
});
```

---

## 5. Performance Tests

### Test Suite: Batch Processing Performance

#### Test: Large File Handling
```typescript
describe('Performance - Large Files', () => {
  it('should handle files with 100+ issues efficiently', async () => {
    const largeFile = generateFileWithIssues(100);

    const start = Date.now();
    const result = await runAgent({
      file: largeFile,
      autoFix: true,
    });
    const duration = Date.now() - start;

    // Should complete in reasonable time
    expect(duration).toBeLessThan(60000); // 1 minute

    // Should fix all issues
    expect(result.metrics.automation_rate).toBeGreaterThan(0.8);
  });
});
```

#### Test: Parallel Agent Execution
```typescript
describe('Performance - Parallel Agents', () => {
  it('should execute sub-agents in parallel', async () => {
    const code = MIXED_ISSUES_CODE; // Quality + Security + Automation

    const start = Date.now();
    const result = await runAgent({ autoFix: true });
    const duration = Date.now() - start;

    // Parallel execution should be faster than sequential
    const sequentialEstimate =
      result.metrics.quality_agent_time +
      result.metrics.security_agent_time +
      result.metrics.automation_agent_time;

    expect(duration).toBeLessThan(sequentialEstimate * 0.6);
  });
});
```

#### Test: Research Caching
```typescript
describe('Performance - Research Caching', () => {
  it('should cache web search results', async () => {
    // First run - no cache
    const start1 = Date.now();
    await agent.research('typescript:S1541');
    const duration1 = Date.now() - start1;

    // Second run - from cache
    const start2 = Date.now();
    await agent.research('typescript:S1541');
    const duration2 = Date.now() - start2;

    // Cache should be significantly faster
    expect(duration2).toBeLessThan(duration1 * 0.1);
  });
});
```

---

## 6. Regression Tests

### Test Suite: No Breaking Changes

#### Test: Type Safety Maintained
```typescript
describe('Regression - Type Safety', () => {
  it('should maintain strict TypeScript compilation', async () => {
    await runAgent({ autoFix: true });

    const result = await exec('pnpm run typecheck');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('error TS');
  });
});
```

#### Test: Test Coverage Maintained
```typescript
describe('Regression - Test Coverage', () => {
  it('should not decrease test coverage', async () => {
    const coverageBefore = await getCoverage();

    await runAgent({ autoFix: true });

    const coverageAfter = await getCoverage();

    expect(coverageAfter.overall).toBeGreaterThanOrEqual(coverageBefore.overall);
    expect(coverageAfter.domain).toBeGreaterThanOrEqual(0.95);
    expect(coverageAfter.application).toBeGreaterThanOrEqual(0.9);
  });
});
```

#### Test: No Test Failures
```typescript
describe('Regression - Tests', () => {
  it('should not break any existing tests', async () => {
    const testsBefore = await runTests();

    await runAgent({ autoFix: true });

    const testsAfter = await runTests();

    expect(testsAfter.passing).toBe(testsBefore.passing);
    expect(testsAfter.failing).toBe(0);
  });
});
```

---

## Test Execution

### Run All Tests

```bash
# Unit tests
pnpm test src/agents/**/*.test.ts

# Integration tests
pnpm test src/integration/**/*.test.ts

# E2E tests
pnpm test:e2e

# Security tests
pnpm test src/security/**/*.test.ts

# Performance tests
pnpm test:performance

# Full suite
pnpm test:all
```

### Coverage Requirements

```
Overall Coverage: >90%
- Agent Logic: >95%
- MCP Integration: >85%
- Security Fixes: >95%
- Automation: >90%
```

### CI/CD Integration

```yaml
# .github/workflows/sonarqube-agent-test.yml
name: SonarQube Agent Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test:all
      - run: pnpm test:coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## Test Data

### Sample Codes for Testing

```typescript
// HIGH_COMPLEXITY_CODE
export const HIGH_COMPLEXITY_CODE = `
function processLead(lead) {
  if (lead.status === 'NEW') {
    if (lead.score > 80) {
      if (lead.source === 'REFERRAL') {
        const referrer = await findReferrer(lead.referrerId);
        if (referrer && referrer.isActive) {
          await notifyReferrer(referrer);
          lead.priority = 'HIGH';
        }
      } else if (lead.source === 'CAMPAIGN') {
        const campaign = await findCampaign(lead.campaignId);
        if (campaign && campaign.status === 'ACTIVE') {
          await trackConversion(campaign);
          lead.priority = 'HIGH';
        }
      }
    }
  }
}
`;

// SQL_INJECTION_CODE
export const SQL_INJECTION_CODE = `
export const findByEmail = async (email: string) => {
  const query = \`SELECT * FROM leads WHERE email = '\${email}'\`;
  return await db.$queryRawUnsafe(query);
};
`;

// XSS_CODE
export const XSS_CODE = `
function displayMessage(userInput: string) {
  return <div dangerouslySetInnerHTML={{ __html: userInput }} />;
}
`;

// MULTIPLE_ISSUES_CODE
export const MULTIPLE_ISSUES_CODE = `
function example() {
  const unused = 'foo';
  let temp: string;
  const old = previous;

  if (value > 50000) {
    const status = isPending ? (isUrgent ? 'HIGH' : 'MEDIUM') : 'LOW';

    if (condition1) {
      if (condition2) {
        return true;
      }
    }
  }
}
`;
```

---

## Success Criteria

All tests must pass before the agent can be considered production-ready:

✅ Unit tests: 100% passing
✅ Integration tests: 100% passing
✅ E2E tests: 100% passing
✅ Security tests: 100% passing
✅ Performance tests: Meet benchmarks
✅ Regression tests: Zero breaking changes
✅ Coverage: >90% overall, >95% for agents

---

## Continuous Testing

### Pre-commit Hook
```bash
#!/bin/bash
# Run quick tests before commit
pnpm test:quick
pnpm run typecheck
```

### Pre-push Hook
```bash
#!/bin/bash
# Run full test suite before push
pnpm test:all
pnpm test:coverage
```

### Nightly Tests
```bash
# Run comprehensive tests including performance
pnpm test:all
pnpm test:performance
pnpm test:security
pnpm test:integration
```

This comprehensive test plan ensures the SonarQube Fix Agent is reliable, secure, and production-ready.
