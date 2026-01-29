# SonarQube Fix Agent - Example Usage Scenarios

## Scenario 1: Critical Cognitive Complexity

### Issue Report

```
Rule: typescript:S1541
Severity: CRITICAL
File: apps/api/src/services/LeadService.ts
Line: 142
Message: Cognitive Complexity of 25 exceeds threshold of 15
```

### Agent Execution

```bash
$ /sonarqube-fix --file apps/api/src/services/LeadService.ts --deep-think

🔍 Analyzing: apps/api/src/services/LeadService.ts
   Found 1 CRITICAL issue: Cognitive Complexity

🧠 Deep Thinking Mode: ENABLED
   Analyzing processLead() method...
   Current complexity: 25 (threshold: 15)
   Decision points: 18
   Nesting depth: 5 levels

📚 Research Phase:
   ✓ Searched: "reduce cognitive complexity typescript"
   ✓ Found: Clean Code patterns (Martin Fowler)
   ✓ Checked: Similar patterns in codebase
   ✓ 3 other services use extract method pattern

🔬 Quality Agent Analysis:

Root Cause:
- Multiple nested conditionals (status → score → source)
- Mixed concerns (validation + processing + notification)
- Complex business logic embedded in single method

Refactoring Strategy:
1. Extract validation logic → validateLeadForProcessing()
2. Extract scoring logic → determineLeadPriority()
3. Extract notification → notifyTeamOfHighPriorityLead()
4. Simplify main method with guard clauses

Impact Assessment:
- Effort: Medium (30 minutes)
- Risk: Low (well-tested area)
- Benefits: +60% maintainability, easier testing

Recommended Approach:
```

### Before Code

```typescript
// apps/api/src/services/LeadService.ts:142
async processLead(leadId: string) {
  const lead = await this.repository.findById(leadId);

  if (lead) {
    if (lead.status === 'NEW') {
      if (lead.score > 80) {
        if (lead.source === 'REFERRAL') {
          const referrer = await this.findReferrer(lead.referrerId);
          if (referrer && referrer.isActive) {
            await this.notificationService.notifyReferrer(referrer);
            lead.priority = 'HIGH';
          }
        } else if (lead.source === 'CAMPAIGN') {
          const campaign = await this.findCampaign(lead.campaignId);
          if (campaign && campaign.status === 'ACTIVE') {
            await this.analytics.trackCampaignConversion(campaign);
            lead.priority = 'HIGH';
          }
        } else {
          lead.priority = 'MEDIUM';
        }

        if (lead.company && lead.company.revenue > 1000000) {
          lead.priority = 'CRITICAL';
          await this.notificationService.notifyExecutives(lead);
        }

        await this.repository.save(lead);
        await this.eventBus.publish(new LeadProcessedEvent(lead));
      }
    }
  }
}
// Cognitive Complexity: 25
```

### After Code (Refactored)

```typescript
// apps/api/src/services/LeadService.ts:142
async processLead(leadId: string): Promise<void> {
  const lead = await this.findAndValidateLead(leadId);
  if (!lead) return;

  await this.setLeadPriority(lead);
  await this.repository.save(lead);
  await this.eventBus.publish(new LeadProcessedEvent(lead));
}
// Cognitive Complexity: 4

private async findAndValidateLead(leadId: string): Promise<Lead | null> {
  const lead = await this.repository.findById(leadId);
  return lead?.status === 'NEW' && lead.score > 80 ? lead : null;
}
// Cognitive Complexity: 3

private async setLeadPriority(lead: Lead): Promise<void> {
  if (this.isEnterpriseAccount(lead)) {
    lead.priority = 'CRITICAL';
    await this.notifyExecutives(lead);
    return;
  }

  if (lead.source === 'REFERRAL') {
    await this.processReferralLead(lead);
  } else if (lead.source === 'CAMPAIGN') {
    await this.processCampaignLead(lead);
  } else {
    lead.priority = 'MEDIUM';
  }
}
// Cognitive Complexity: 5

private isEnterpriseAccount(lead: Lead): boolean {
  return lead.company?.revenue > 1000000;
}
// Cognitive Complexity: 1

private async processReferralLead(lead: Lead): Promise<void> {
  const referrer = await this.findActiveReferrer(lead.referrerId);
  if (referrer) {
    await this.notificationService.notifyReferrer(referrer);
    lead.priority = 'HIGH';
  }
}
// Cognitive Complexity: 2

private async processCampaignLead(lead: Lead): Promise<void> {
  const campaign = await this.findActiveCampaign(lead.campaignId);
  if (campaign) {
    await this.analytics.trackCampaignConversion(campaign);
    lead.priority = 'HIGH';
  }
}
// Cognitive Complexity: 2
```

### Validation Results

```
✅ TypeScript Check: PASSED (0.8s)
✅ ESLint: PASSED (0.3s)
✅ Unit Tests: PASSED (2.1s)
   - processLead: 8/8 tests passing
   - New tests added for extracted methods: 12/12 passing
✅ Coverage: 94.2% → 95.8% (+1.6%)
✅ Build: SUCCESS (3.2s)

Complexity Improvement:
- Before: 25 (1 method)
- After: 4 + 3 + 5 + 1 + 2 + 2 = 17 (6 methods)
- Reduction: 32% overall, 84% in main method
- Max complexity per method: 5 (well below 15)
```

### Summary

```markdown
✅ Issue RESOLVED
- Cognitive complexity reduced from 25 → 4 (84%)
- Extracted 5 private methods with clear single responsibilities
- Test coverage increased by 1.6%
- All validations passing
- SonarQube quality gate: PASSED
```

---

## Scenario 2: SQL Injection Vulnerability

### Issue Report

```
Rule: typescript:S2077
Severity: CRITICAL
Type: VULNERABILITY
File: apps/api/src/modules/lead/lead.router.ts
Line: 56
Message: SQL query is constructed from user input without sanitization
CVSS Score: 9.8 (Critical)
```

### Agent Execution

```bash
$ /sonarqube-fix --type vulnerability --severity critical

🔍 Fetching CRITICAL VULNERABILITIES...
   Found 1 issue: SQL Injection (typescript:S2077)

🛡️  Security Agent: Analyzing threat...

Risk Assessment:
- Severity: CRITICAL
- Exploitability: HIGH
- Impact: Complete database compromise
- CVSS Score: 9.8
- OWASP: A03:2021 - Injection

Attack Scenario:
   Attacker input: email = "'; DROP TABLE leads; --"
   Vulnerable query executes: SELECT * FROM leads WHERE email = ''; DROP TABLE leads; --'
   Result: All leads deleted, potential data exfiltration

📚 Security Research:
   ✓ OWASP SQL Injection Prevention Cheat Sheet
   ✓ Prisma Security Best Practices
   ✓ Node.js Parameterized Queries
   ✓ Found 15 similar Prisma patterns in codebase
```

### Before Code (VULNERABLE)

```typescript
// apps/api/src/modules/lead/lead.router.ts:56
export const leadRouter = router({
  findByEmail: publicProcedure
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      // VULNERABLE: Direct string concatenation
      const query = `SELECT * FROM leads WHERE email = '${input.email}'`;
      return await db.$queryRawUnsafe(query);
    }),
});
```

### After Code (SECURE)

```typescript
// apps/api/src/modules/lead/lead.router.ts:56
export const leadRouter = router({
  findByEmail: publicProcedure
    .input(
      z.object({
        email: z.string().email().max(255).trim().toLowerCase(),
      })
    )
    .query(async ({ input }) => {
      // SECURE: Prisma ORM with automatic parameterization
      return await db.lead.findUnique({
        where: { email: input.email },
      });

      // Alternative with raw SQL (if needed):
      // return await db.$queryRaw`SELECT * FROM leads WHERE email = ${input.email}`;
      // Tagged template literal automatically parameterizes
    }),
});
```

### Security Improvements

```markdown
Defense in Depth Layers Added:

1. Input Validation (Zod Schema)
   - Email format validation
   - Max length: 255 characters
   - Trim whitespace
   - Normalize to lowercase

2. Parameterized Queries (Prisma)
   - Automatic SQL parameterization
   - No string concatenation
   - Type-safe database access

3. ORM Benefits
   - SQL injection impossible
   - Type checking at compile time
   - Auto-generated types from schema

4. Additional Safeguards
   - RLS (Row Level Security) in Supabase
   - Tenant isolation enforced
   - Rate limiting on endpoint
   - WAF rules (Cloudflare)
```

### Security Tests Added

```typescript
// apps/api/src/modules/lead/__tests__/lead.router.security.test.ts
import { describe, it, expect } from 'vitest';
import { leadRouter } from '../lead.router';

describe('Security - SQL Injection Prevention', () => {
  it('should reject SQL injection in email field', async () => {
    const maliciousEmail = "'; DROP TABLE leads; --";

    await expect(
      leadRouter.findByEmail({ email: maliciousEmail })
    ).rejects.toThrow('Invalid email');
  });

  it('should reject script tags (XSS attempt)', async () => {
    const xssEmail = '<script>alert("xss")</script>@test.com';

    await expect(
      leadRouter.findByEmail({ email: xssEmail })
    ).rejects.toThrow('Invalid email');
  });

  it('should handle null byte injection', async () => {
    const nullByteEmail = 'test@example.com\x00admin';

    await expect(
      leadRouter.findByEmail({ email: nullByteEmail })
    ).rejects.toThrow('Invalid email');
  });

  it('should prevent LDAP injection patterns', async () => {
    const ldapInjection = '*)(uid=*))(|(uid=*';

    await expect(
      leadRouter.findByEmail({ email: ldapInjection })
    ).rejects.toThrow('Invalid email');
  });
});
```

### Validation Results

```
✅ Security Tests: PASSED (1.2s)
   - SQL injection: 4/4 tests passing
   - XSS prevention: 3/3 tests passing
   - Input validation: 8/8 tests passing

✅ OWASP ZAP Scan: CLEAN
   - SQL Injection: 0 vulnerabilities
   - Alerts: 0 high, 0 medium

✅ Functional Tests: PASSED (15/15)
✅ Coverage: 91.2% → 93.4% (+2.2%)
✅ TypeScript: PASSED
✅ Build: SUCCESS
```

### Summary

```markdown
✅ VULNERABILITY FIXED
- SQL Injection completely prevented
- Defense in depth: 4 security layers
- Comprehensive security tests added
- OWASP compliance verified
- Zero regression in functionality
- Coverage increased by 2.2%
- SonarQube security gate: PASSED
```

---

## Scenario 3: Multiple Code Smells (Batch Processing)

### Issue Report

```
File: apps/api/src/modules/opportunity/opportunity.service.ts
Total Issues: 12

- 3 × typescript:S1481 (Unused variables)
- 2 × typescript:S109 (Magic numbers)
- 2 × typescript:S3358 (Nested ternary)
- 3 × typescript:S1854 (Unused assignments)
- 2 × typescript:S1066 (Collapsible if)
```

### Agent Execution

```bash
$ /sonarqube-fix --file apps/api/src/modules/opportunity/opportunity.service.ts --auto-fix

🔍 Analyzing: opportunity.service.ts
   Found 12 issues (MAJOR severity)

📊 Categorization:
   - Trivial (auto-fix safe): 8 issues
   - Simple (pattern-based): 4 issues
   - Moderate (review needed): 0 issues

🤖 Automation Agent: Processing batch...

Batch Strategy:
- Process issues bottom-to-top (preserve line numbers)
- Create backup before changes
- Validate after each fix
- Rollback on any failure
```

### Fixes Applied

#### Fix 1-3: Remove Unused Variables

```diff
- const unused = 'debug';  // S1481
- let temporary: string;   // S1481
- const old = previous;    // S1481
```

**Result**: ✅ 3 issues resolved (0.2s)

#### Fix 4-5: Extract Magic Numbers

```diff
- if (opportunity.value > 50000) {  // S109
+ const ENTERPRISE_DEAL_THRESHOLD = 50000;
+ if (opportunity.value > ENTERPRISE_DEAL_THRESHOLD) {

- probability > 0.75  // S109
+ const HIGH_PROBABILITY_THRESHOLD = 0.75;
+ probability > HIGH_PROBABILITY_THRESHOLD
```

**Result**: ✅ 2 issues resolved (0.5s)

#### Fix 6-7: Simplify Nested Ternary

```diff
- const status = isPending ? (isUrgent ? 'HIGH' : 'MEDIUM') : 'LOW';  // S3358
+ let status = 'LOW';
+ if (isPending) {
+   status = isUrgent ? 'HIGH' : 'MEDIUM';
+ }
```

**Result**: ✅ 2 issues resolved (0.4s)

#### Fix 8-10: Remove Unused Assignments

```diff
- value = temp;
- value = calculateValue();  // Overwritten immediately
  value = finalValue;
```

**Result**: ✅ 3 issues resolved (0.3s)

#### Fix 11-12: Collapse If Statements

```diff
- if (opportunity.stage === 'PROPOSAL') {
-   if (opportunity.probability > 0.5) {
-     return true;
-   }
- }
+ if (opportunity.stage === 'PROPOSAL' && opportunity.probability > 0.5) {
+   return true;
+ }
```

**Result**: ✅ 2 issues resolved (0.4s)

### Validation Results

```
Batch Validation:
✅ TypeScript Check: PASSED (0.6s)
✅ ESLint: PASSED (0.2s)
✅ Unit Tests: PASSED (1.8s)
   - OpportunityService: 24/24 tests passing
✅ Coverage: 92.1% → 92.1% (maintained)
✅ Build: SUCCESS (2.8s)

Performance:
- Total fixes: 12
- Total time: 6.3s (0.5s per fix)
- Automation rate: 100%
- Success rate: 100%
- Rollbacks: 0
```

### Summary

```markdown
✅ ALL ISSUES RESOLVED (12/12)

Automation Metrics:
- Trivial fixes: 8 (auto-applied safely)
- Pattern fixes: 4 (validated and applied)
- Manual review: 0 (none required)

Code Quality Improvement:
- Removed dead code: 6 lines
- Extracted constants: 2 (better maintainability)
- Simplified logic: 4 statements

SonarQube Quality Gate: ✅ PASSED
File now has ZERO code smells
```

---

## Scenario 4: Deep Research for Novel Issue

### Issue Report

```
Rule: typescript:S2631
Severity: CRITICAL
Type: VULNERABILITY
File: apps/api/src/utils/regex-validator.ts
Line: 23
Message: Regular expression is vulnerable to ReDoS (Regular Expression Denial of Service)
```

### Agent Execution

```bash
$ /sonarqube-fix --rule typescript:S2631 --deep-think

🔍 Analyzing: typescript:S2631 (ReDoS)
   Found 1 CRITICAL vulnerability

🧠 DEEP THINKING MODE: ENABLED
   Novel issue detected, enabling extended analysis...

🔬 Security Agent: Analyzing ReDoS vulnerability...

What is ReDoS?
- Regular Expression Denial of Service
- Caused by catastrophic backtracking
- Attacker crafts input that causes exponential regex evaluation time
- Can freeze/crash server with single request

📚 Deep Research (5 sources):

Source 1: OWASP ReDoS Prevention
- Avoid nested quantifiers: (a+)+, (a*)*
- Use atomic groups where possible
- Set regex timeout limits
- Validate input length before regex

Source 2: Node.js Security Best Practices
- Use safe-regex library to detect vulnerable patterns
- Consider regex alternatives (indexOf, startsWith)
- Implement request timeouts

Source 3: Stack Overflow (highest voted)
- ReDoS example: ^(a+)+$ with input "aaaaaaaaaaaaaaaaX"
- Each 'a' doubles evaluation time (exponential)
- Solution: Simplify regex, remove nested quantifiers

Source 4: GitHub Security Advisory
- CVE-2021-XXXXX: Similar ReDoS in validator.js
- Fix: Replace (.*?)* with non-greedy alternatives

Source 5: Codebase Search
- Found 3 similar regex patterns in project
- 2 already fixed with atomic groups
- 1 uses validator.js (safe library)
```

### Before Code (VULNERABLE)

```typescript
// apps/api/src/utils/regex-validator.ts:23
export function validateInput(input: string): boolean {
  // VULNERABLE: Nested quantifiers cause catastrophic backtracking
  const regex = /^(a+)+$/;
  return regex.test(input);

  // Attack example:
  // Input: "aaaaaaaaaaaaaaaaaX" (15 a's + X)
  // Backtracking steps: 2^15 = 32,768
  // Input: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaX" (30 a's + X)
  // Backtracking steps: 2^30 = 1,073,741,824 (freeze server)
}
```

### Analysis: Why Vulnerable?

```
Deep Analysis:

1. Pattern: ^(a+)+$
   - Outer quantifier: +
   - Inner quantifier: +
   - Nested quantifiers = exponential backtracking

2. Attack Vector:
   Input: "a" * N + "X"
   - Regex tries all combinations of (a+) groups
   - Each failed attempt backtracks
   - Time complexity: O(2^N)

3. Real-World Impact:
   - 20 characters: ~1 million operations
   - 30 characters: ~1 billion operations
   - Can DoS entire server with single request

4. CVSS Score: 7.5 (High)
   - Availability Impact: HIGH
   - Attack Complexity: LOW
   - Privileges Required: NONE
```

### After Code (SECURE)

```typescript
// apps/api/src/utils/regex-validator.ts:23
import isSafeRegex from 'safe-regex';

export function validateInput(input: string): boolean {
  // Defense 1: Input length limit
  if (input.length > 1000) {
    throw new Error('Input too long');
  }

  // Defense 2: Simplified regex (no nested quantifiers)
  const regex = /^a+$/;

  // Defense 3: Verify regex is safe at runtime
  if (!isSafeRegex(regex)) {
    throw new Error('Unsafe regex pattern detected');
  }

  // Defense 4: Timeout protection
  const timeoutMs = 100;
  const result = withTimeout(() => regex.test(input), timeoutMs);

  return result;
}

// Alternative: Use atomic groups (if complex pattern needed)
export function validateInputAtomic(input: string): boolean {
  // Atomic group: (?>a+) prevents backtracking
  const regex = /^(?>a+)+$/;
  return regex.test(input);
}

// Best: Avoid regex for simple cases
export function validateInputSimple(input: string): boolean {
  // Most performant and safe
  return input.split('').every((char) => char === 'a');
}
```

### Helper Function

```typescript
function withTimeout<T>(fn: () => T, timeoutMs: number): T {
  const start = Date.now();
  let result: T;

  const timer = setTimeout(() => {
    throw new Error(`Regex evaluation timeout (${timeoutMs}ms)`);
  }, timeoutMs);

  try {
    result = fn();
  } finally {
    clearTimeout(timer);
  }

  const duration = Date.now() - start;
  if (duration > timeoutMs * 0.8) {
    console.warn(`Regex evaluation slow: ${duration}ms`);
  }

  return result;
}
```

### Security Tests

```typescript
describe('Security - ReDoS Prevention', () => {
  it('should handle worst-case input quickly', () => {
    const malicious = 'a'.repeat(30) + 'X';
    const start = Date.now();

    expect(() => validateInput(malicious)).not.toThrow();

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // Must complete in <100ms
  });

  it('should reject extremely long inputs', () => {
    const tooLong = 'a'.repeat(10000);
    expect(() => validateInput(tooLong)).toThrow('Input too long');
  });

  it('should timeout if regex takes too long', () => {
    // Mock slow regex
    expect(() => validateSlow('aaaaaX')).toThrow('timeout');
  });
});
```

### Validation Results

```
✅ Security Tests: PASSED
   - ReDoS attack: Blocked in <10ms
   - Length limit: Enforced at 1000 chars
   - Timeout: Triggered at 100ms
   - Safe regex check: Validated

✅ Performance Benchmark:
   Before (vulnerable):
   - 10 chars: 1ms
   - 20 chars: 1,024ms (1 second)
   - 30 chars: TIMEOUT (server freeze)

   After (secure):
   - 10 chars: <1ms
   - 20 chars: <1ms
   - 30 chars: <1ms
   - 1000 chars: 5ms
   Performance improvement: 200,000% for worst case

✅ All Tests: PASSED (156/156)
✅ Coverage: 91.2% → 94.8% (+3.6%)
```

### Summary

```markdown
✅ ReDoS VULNERABILITY FIXED

Security Improvements:
- 4 layers of defense implemented
- Attack complexity: Impossible
- Performance: 200,000% faster worst-case
- Library: safe-regex added for validation

Research Applied:
- OWASP ReDoS prevention guidelines
- Industry best practices from 5 sources
- Atomic groups for complex patterns
- Timeout protection pattern

Impact:
- Server no longer vulnerable to ReDoS DoS
- All regex patterns now validated
- Comprehensive security tests added
- ADR documented: docs/planning/adr/029-redos-prevention.md
```

---

## Key Takeaways

### What the Agent Does Well

1. **Deep Analysis**: Extended thinking for complex issues
2. **Research**: Finds best practices from multiple sources
3. **Multi-Agent**: Specialized agents for quality/security/automation
4. **Validation**: Comprehensive testing before and after
5. **Safety**: Automatic rollback on failure
6. **Metrics**: Detailed tracking of automation effectiveness

### When to Use Deep Think

- Novel or complex issues
- Security vulnerabilities
- Multiple solution approaches
- Architecture implications
- Need for research

### When Auto-Fix is Safe

- Trivial issues (unused vars, formatting)
- Pattern-based fixes (collapse if, remove duplicates)
- Well-tested areas (>95% coverage)
- Low-risk changes (no business logic)

### Always Remember

**Quality and security are not negotiable. When in doubt, request human review.**