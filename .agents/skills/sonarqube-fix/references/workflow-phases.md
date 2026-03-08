# SonarQube Fix — Workflow Phase Details

## Phase 1: Discovery & Analysis (Analysis Agent)

1. **Fetch SonarQube Issues**
   - Use MCP sonarqube server if available, otherwise parse reports
   - Look for: `artifacts/reports/sonarqube/issues.json`
   - Alternative: `target/sonar/report-task.txt`

2. **Categorize Issues**
   - Group by: severity, type, file, rule
   - Identify patterns (similar issues across files)
   - Calculate complexity score for each issue

3. **Prioritize**
   - Blockers/Critical first
   - Security vulnerabilities
   - Bugs before code smells
   - High-impact, low-effort wins

## Phase 2: Research (Research Agent)

For each issue category:

1. **Official Documentation**
   - Search SonarQube docs for rule explanation
   - Find TypeScript/JavaScript best practices
   - Check MDN, TypeScript handbook

2. **Community Solutions**
   {{#if deep_think}}
   - Enable extended thinking mode
   - Search Stack Overflow (use WebSearch tool)
   - Check GitHub issues/discussions
   - Find real-world examples
   - Analyze multiple approaches
   {{else}}
   - Quick search for common solutions
   - Use cached knowledge
   {{/if}}

3. **Project Context**
   - Search codebase for similar patterns (use Grep/Glob)
   - Check if issue exists in domain/application/adapters layers
   - Review architecture constraints (hexagonal boundaries)
   - Check existing ADRs for guidance

## Phase 3: Planning (Quality + Security Agents)

Spawn sub-agents based on issue type:

**Quality Agent** (stoa-quality):
```
Issues: Code smells, complexity, duplication
Focus: Maintainability, readability, SOLID principles
Actions: Refactoring strategies, extract methods, simplify logic
```

**Security Agent** (stoa-security):
```
Issues: Vulnerabilities, security hotspots, injection risks
Focus: OWASP Top 10, input validation, authentication
Actions: Sanitization, encryption, secure patterns
```

**Automation Agent** (stoa-automation):
```
Issues: Low-complexity, pattern-based fixes
Focus: Automated refactoring, linting, formatting
Actions: Apply ESLint fixes, Prettier formatting, safe refactors
```

For each issue, create a fix strategy:
```json
{
  "issue_id": "AX...",
  "rule": "typescript:S1541",
  "severity": "CRITICAL",
  "file": "apps/api/src/services/LeadService.ts",
  "line": 142,
  "message": "Cognitive Complexity of 25 is too high",
  "strategy": "extract_method",
  "research": {
    "docs": ["https://..."],
    "examples": ["https://stackoverflow.com/..."],
    "best_practice": "Cognitive complexity should be <15 per function"
  },
  "steps": [
    "Extract scoring logic to separate method",
    "Extract validation to helper function",
    "Simplify conditional chains"
  ],
  "impact": "high",
  "effort": "medium",
  "risk": "low",
  "tests_affected": ["LeadService.test.ts"]
}
```

## Phase 4: Implementation

{{#if auto_fix}}
**AUTO-FIX MODE ENABLED**

For each issue in priority order:

1. **Read the file** (use Read tool)
2. **Apply fix** (use Edit tool)
3. **Run tests** (use Bash tool)
   ```bash
   pnpm --filter <package> test <test-file>
   ```
4. **Verify fix**
   - Check TypeScript compilation: `pnpm run typecheck`
   - Run affected tests
   - Verify coverage maintained

5. **Rollback on failure**
   - If tests fail, revert changes
   - Log issue for manual review
   - Continue with next issue

6. **Track changes**
   - Record in `artifacts/metrics/sonarqube-fixes.json`
   - Update progress in todo list

{{else}}
**RECOMMENDATION MODE**

For each issue:
1. Generate fix recommendation
2. Show before/after code snippets
3. Explain rationale with research links
4. Estimate impact and risk
5. Wait for user approval before applying
{{/if}}

## Phase 5: Validation

After applying fixes:

1. **Run Full Test Suite**
   ```bash
   pnpm run test
   ```

2. **Type Checking**
   ```bash
   pnpm run typecheck
   ```

3. **Linting**
   ```bash
   pnpm run lint
   ```

4. **Coverage Check**
   ```bash
   pnpm run test:coverage
   ```
   - Verify: Overall >90%, Domain >95%

5. **SonarQube Re-scan** (if available)
   ```bash
   pnpm run sonar:scan
   ```

## Phase 6: Reporting

{{#if report}}
Generate comprehensive report in `artifacts/reports/sonarqube-fix-{timestamp}.md`.
**See `references/report-template.md`** for the full report format.
{{else}}
Generate summary in chat:
- List fixed issues
- Show key metrics
- Highlight any blockers
{{/if}}

## Deep Thinking Guidelines

{{#if deep_think}}
When analyzing complex issues, use extended thinking:

1. **Break down the problem** — Root cause? Why flagged? Trade-offs?
2. **Consider multiple solutions** — 3-5 approaches with pros/cons, project alignment
3. **Research thoroughly** — Official guidance, real-world examples, project patterns (Grep)
4. **Validate assumptions** — Hexagonal architecture? Domain purity? Performance? Coverage?
5. **Think about edge cases** — What could go wrong? Security? Entity types?
{{/if}}
