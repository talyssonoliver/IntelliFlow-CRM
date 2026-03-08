# SonarQube Fix Agent - Quick Reference Card

## Commands

```bash
# Basic
/sonarqube-fix                               # Analyze all issues
/sq-fix                                      # Alias (short form)

# By Severity
/sonarqube-fix --severity blocker            # Blocker only
/sonarqube-fix --severity critical           # Critical only
/sonarqube-fix --severity major              # Major only
/sonarqube-fix --severity critical,major     # Multiple

# By Type
/sonarqube-fix --type bug                    # Bugs only
/sonarqube-fix --type vulnerability          # Vulnerabilities only
/sonarqube-fix --type code_smell             # Code smells only
/sonarqube-fix --type security_hotspot       # Security hotspots only

# By File/Rule
/sonarqube-fix --file apps/api/src/router.ts # Specific file
/sonarqube-fix --rule typescript:S1541       # Specific rule

# Modes
/sonarqube-fix --auto-fix                    # Auto-apply fixes
/sonarqube-fix --deep-think                  # Extended analysis
/sonarqube-fix --report                      # Generate report

# Combined
/sonarqube-fix --severity critical --type bug,vulnerability --auto-fix
/sonarqube-fix --file apps/api/** --deep-think --report
```

## Sub-Agents

| Agent | Focus | Rules | Use Case |
|-------|-------|-------|----------|
| **Quality** | Code smells, complexity | S1541, S3358, S109 | Refactoring, maintainability |
| **Security** | Vulnerabilities, OWASP | S2077, S5131, S5247 | Security fixes, hardening |
| **Automation** | Pattern fixes, batch | S1481, S1066, S103 | Automated cleanup |

## MCP Servers

| Server | Purpose | Fallback |
|--------|---------|----------|
| **sonarqube** | Fetch issues from SonarQube API | Parse local reports |
| **web-search** | Research best practices | Built-in WebSearch |
| **code-search** | Find patterns in codebase | Built-in Grep |
| **docs-fetch** | Get external documentation | Built-in WebFetch |

## Workflow Phases

1. **Discovery**: Fetch & categorize issues
2. **Research**: Web search, codebase patterns, docs
3. **Planning**: Sub-agent orchestration
4. **Implementation**: Apply fixes (auto or manual)
5. **Validation**: TypeScript, tests, coverage, build
6. **Reporting**: Metrics, summary, recommendations

## Validation Pipeline

```
Fix Applied
    ↓
✅ TypeScript Check (pnpm run typecheck)
    ↓
✅ ESLint (pnpm run lint)
    ↓
✅ Unit Tests (pnpm test)
    ↓
✅ Coverage Check (>90%)
    ↓
✅ Integration Tests (if needed)
    ↓
✅ Build (pnpm run build)
    ↓
Success → Commit | Failure → Rollback
```

## Common Rules

### Quality (Code Smells)

| Rule | Issue | Auto-Fix |
|------|-------|----------|
| S1541 | Cognitive complexity too high | ⚠️ Manual |
| S3358 | Nested ternary operators | ✅ Yes |
| S109 | Magic numbers | ✅ Yes |
| S1481 | Unused variables | ✅ Yes |
| S1066 | Collapsible if statements | ✅ Yes |
| S4143 | Duplicate conditions | ✅ Yes |

### Security (Vulnerabilities)

| Rule | Issue | Auto-Fix |
|------|-------|----------|
| S2077 | SQL injection | ⚠️ Verify |
| S5131 | XSS vulnerability | ⚠️ Verify |
| S2245 | Weak random | ✅ Yes |
| S5247 | Weak cryptography | ⚠️ Verify |
| S2631 | ReDoS vulnerability | ⚠️ Manual |

## Architecture Constraints

✅ **Maintain**:
- Hexagonal architecture boundaries
- DDD principles (rich domain models)
- Type safety (strict TypeScript)
- Test coverage (>90%)
- No breaking changes

❌ **Avoid**:
- Domain depending on infrastructure
- `any` types
- Suppressing warnings without justification
- Sacrificing security for convenience

## Output Files

```
artifacts/
├── reports/
│   ├── sonarqube-fix-{timestamp}.md          # Fix report
│   └── sonarqube-security-{timestamp}.md     # Security report
├── metrics/
│   ├── sonarqube-fixes.json                  # Fix metrics
│   └── sonarqube-automation.json             # Automation metrics
└── logs/
    └── sonarqube-agent.log                   # Execution logs
```

## Metrics Tracked

```json
{
  "total_issues": 45,
  "automated_fixes": 38,
  "automation_rate": 0.84,
  "success_rate": 1.0,
  "avg_fix_time": 3200,
  "coverage_before": 0.912,
  "coverage_after": 0.915
}
```

## OWASP Top 10 Coverage

| Risk | Rules | Fix Pattern |
|------|-------|-------------|
| A03: Injection | S2077, S5131, S5146 | Parameterized queries, sanitization |
| A02: Crypto Failures | S5247, S4790 | bcrypt, crypto.randomBytes |
| A07: Auth Failures | S2245 | Strong passwords, JWT, MFA |
| A01: Access Control | S5122 | RLS, RBAC, tenant isolation |

## When to Use

### Auto-Fix (✅)
- Unused variables/imports
- Formatting issues
- Simple refactors
- Magic number extraction
- Duplicate code removal

### Manual Review (⚠️)
- Complex business logic
- Security vulnerabilities (verify fix)
- Cross-layer changes
- API contract modifications
- Performance optimizations

### Deep Think (🧠)
- Complex/novel issues
- Multiple solution approaches
- Architecture implications
- Security concerns
- Need for research

## Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| MCP unavailable | Auto-fallback to built-in tools |
| Validation fails | Auto-rollback, logged for review |
| Coverage drops | Fix rejected, tests requested |
| Complex issue | Escalated to human review |

## Example Commands by Scenario

```bash
# Critical bugs before release
/sq-fix --severity critical,blocker --auto-fix

# Security audit
/sq-fix --type vulnerability,security_hotspot --report

# Code quality improvement
/sq-fix --type code_smell --deep-think

# Specific file cleanup
/sq-fix --file apps/api/src/router.ts --auto-fix

# Research mode (complex issue)
/sq-fix --rule typescript:S2631 --deep-think --report

# Batch cleanup
/sq-fix --severity minor,info --auto-fix
```

## Research Sources Priority

1. **Official Docs**: SonarQube, TypeScript, OWASP
2. **Project Patterns**: Codebase search (Grep)
3. **Community**: Stack Overflow, GitHub
4. **Books**: Clean Code, Refactoring Guru

## Success Criteria

✅ Issues analyzed
✅ Fixes applied (if auto-fix)
✅ All tests passing
✅ TypeScript compilation successful
✅ Coverage maintained (>90%)
✅ No architecture violations
✅ SonarQube quality gate passes
✅ Report generated (if requested)

## Environment Variables

```bash
# Optional
SONARQUBE_URL=https://sonarqube.example.com
SONARQUBE_TOKEN=your-token
SONARQUBE_PROJECT_KEY=intelliflow-crm
BRAVE_API_KEY=your-brave-key
```

## Key Principles

1. **Quality First**: Never compromise on quality or security
2. **Test Coverage**: Maintain >90% coverage always
3. **Reversibility**: All changes must be rollback-capable
4. **Architecture**: Respect hexagonal boundaries
5. **When in Doubt**: Request human review

---

## Quick Start

```bash
# 1. Run analysis
/sonarqube-fix --severity critical

# 2. Review recommendations
# [Agent shows fixes with research and rationale]

# 3. Auto-apply if confident
/sonarqube-fix --severity critical --auto-fix

# 4. Generate report
/sonarqube-fix --report
```

## Help

- **Full Docs**: [README.md](./README.md)
- **Examples**: [examples/example-usage.md](./examples/example-usage.md)
- **Agents**: [agents/](./agents/)
- **Config**: [skill.yaml](./skill.yaml), [mcp-config.json](./mcp-config.json)
