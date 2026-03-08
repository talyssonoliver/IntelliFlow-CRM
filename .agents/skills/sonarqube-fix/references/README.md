# SonarQube Fix Agent

An intelligent agent specialized in analyzing and resolving SonarQube code quality issues with deep analysis, web research, and automated fixes.

## Overview

The SonarQube Fix Agent is a comprehensive solution for handling SonarQube linter errors and warnings. It combines:

- **Deep Code Analysis**: Extended thinking mode for complex issues
- **Web Research**: Automatic searching for best practices and solutions
- **Multi-Agent Architecture**: STOA pattern with specialized sub-agents
- **MCP Integration**: Direct SonarQube API access and web search capabilities
- **Automated Fixes**: Safe, tested, and reversible code improvements
- **Validation Pipeline**: Comprehensive testing before and after fixes

## Architecture

### STOA Sub-Agents

The agent follows the STOA (Security, Testing, Optimization, Architecture) pattern with specialized sub-agents:

1. **Quality Agent** ([quality-agent.md](./agents/quality-agent.md))
   - Focus: Code smells, complexity, maintainability
   - Rules: Cognitive complexity, duplication, magic numbers
   - Patterns: Extract method, simplify conditionals, DRY

2. **Security Agent** ([security-agent.md](./agents/security-agent.md))
   - Focus: Vulnerabilities, OWASP Top 10, injection prevention
   - Rules: SQL injection, XSS, weak crypto, auth issues
   - Patterns: Input validation, sanitization, parameterization

3. **Automation Agent** ([automation-agent.md](./agents/automation-agent.md))
   - Focus: Pattern-based fixes, automated refactoring
   - Rules: Unused variables, formatting, simple refactors
   - Patterns: ESLint auto-fix, AST transforms, codemods

### MCP Integration

The agent integrates with multiple MCP servers ([mcp-config.json](./mcp-config.json)):

- **SonarQube MCP**: Direct API access to SonarQube server
- **Web Search MCP**: Brave/Google search for research
- **Code Search MCP**: Ripgrep integration for pattern matching
- **Docs Fetch MCP**: External documentation retrieval

All MCP servers are optional with graceful fallbacks to built-in tools.

## Installation

### Prerequisites

```bash
# Required
- Node.js >= 18
- pnpm >= 8
- Claude Code CLI

# Optional (for enhanced functionality)
- SonarQube server (or local reports)
- Brave Search API key (or use built-in WebSearch)
```

### Setup

1. **Install the skill**:
   ```bash
   cd .claude/skills/sonarqube-fix
   ```

2. **Configure environment variables** (`.env`):
   ```bash
   # SonarQube Configuration (optional)
   SONARQUBE_URL=https://sonarqube.example.com
   SONARQUBE_TOKEN=your-token-here
   SONARQUBE_PROJECT_KEY=intelliflow-crm

   # Web Search (optional)
   BRAVE_API_KEY=your-brave-api-key

   # Workspace (auto-detected)
   WORKSPACE_PATH=/path/to/intelliflow-crm
   ```

3. **Install MCP servers** (optional):
   ```bash
   # SonarQube MCP
   npx @modelcontextprotocol/server-sonarqube

   # Brave Search MCP
   npx @modelcontextprotocol/server-brave-search

   # Ripgrep MCP
   npx @modelcontextprotocol/server-ripgrep

   # Fetch MCP
   npx @modelcontextprotocol/server-fetch
   ```

## Usage

### Basic Commands

```bash
# Analyze all issues
/sonarqube-fix

# Analyze by severity
/sonarqube-fix --severity critical
/sonarqube-fix --severity major,minor

# Analyze by type
/sonarqube-fix --type bug
/sonarqube-fix --type vulnerability,code_smell

# Analyze specific file
/sonarqube-fix --file apps/api/src/router.ts

# Focus on specific rule
/sonarqube-fix --rule typescript:S1541

# Generate comprehensive report
/sonarqube-fix --report
```

### Advanced Usage

```bash
# Auto-fix mode (with confirmation)
/sonarqube-fix --auto-fix

# Deep thinking mode (extended analysis)
/sonarqube-fix --deep-think --severity critical

# Combine filters
/sonarqube-fix --severity critical,major --type bug,vulnerability --auto-fix

# Generate report for specific area
/sonarqube-fix --file apps/api/** --report
```

### Aliases

```bash
# Short form
/sq-fix --severity critical

# Alternative
/sonar-fix --auto-fix --deep-think
```

## Workflow

### Phase 1: Discovery & Analysis

The agent starts by fetching SonarQube issues:

1. **MCP Server** (if available): Direct API call to SonarQube
2. **Fallback**: Parse local reports (`artifacts/reports/sonarqube/issues.json`)
3. **Categorization**: Group by severity, type, file, rule
4. **Prioritization**: Critical bugs first, then security, then code smells

### Phase 2: Research

For complex issues, the agent performs deep research:

1. **Official Documentation**: SonarQube docs, TypeScript handbook, OWASP
2. **Web Search**: Stack Overflow, GitHub issues, dev.to articles
3. **Codebase Search**: Find similar patterns in the project
4. **ADR Review**: Check architecture decision records

### Phase 3: Sub-Agent Orchestration

Issues are distributed to specialized agents:

```
┌─────────────────────────────────────────────────┐
│           Main SonarQube Fix Agent              │
└──────────────────┬──────────────────────────────┘
                   │
         ┌─────────┴─────────┬─────────────┐
         ▼                   ▼             ▼
  ┌─────────────┐     ┌─────────────┐  ┌─────────────┐
  │   Quality   │     │  Security   │  │ Automation  │
  │    Agent    │     │    Agent    │  │    Agent    │
  └─────────────┘     └─────────────┘  └─────────────┘
   Code Smells         Vulnerabilities  Pattern Fixes
   Complexity          Injection         Unused Vars
   Duplication         Auth Issues       Formatting
```

### Phase 4: Implementation

Depending on the mode:

**Recommendation Mode** (default):
- Generate fix recommendations
- Show before/after code
- Explain rationale with research
- Wait for user approval

**Auto-Fix Mode** (`--auto-fix`):
- Apply fixes automatically
- Run comprehensive validation
- Rollback on failure
- Track metrics

### Phase 5: Validation

All fixes go through strict validation:

1. ✅ **TypeScript Check**: `pnpm run typecheck`
2. ✅ **ESLint**: `pnpm run lint`
3. ✅ **Unit Tests**: Affected test files
4. ✅ **Coverage**: Maintained at >90%
5. ✅ **Integration Tests**: If API changed
6. ✅ **Build**: Full monorepo build

### Phase 6: Reporting

Generate comprehensive reports:

```markdown
# SonarQube Fix Report

## Summary
- Total Issues: 45
- Fixed: 38 (84%)
- Remaining: 7
- Time: 15 minutes

## Metrics
- Automation Rate: 84%
- Test Coverage: 91.2%
- Quality Gate: ✅ PASSED

## Fixed Issues
[Detailed breakdown by severity and type]

## Remaining Issues
[What couldn't be fixed and why]

## Next Steps
[Recommendations for manual fixes]
```

## Configuration

### Skill Configuration

Edit [skill.yaml](./skill.yaml):

```yaml
config:
  max_concurrent_agents: 3      # Parallel sub-agents
  enable_deep_thinking: true     # Extended analysis
  enable_web_search: true        # Web research
  auto_fix_enabled: false        # Require explicit --auto-fix
  require_test_validation: true  # Always validate
```

### MCP Configuration

Edit [mcp-config.json](./mcp-config.json):

```json
{
  "deep_thinking": {
    "enabled": true,
    "max_iterations": 5,
    "timeout_seconds": 60,
    "research_depth": "thorough"
  },
  "caching": {
    "enabled": true,
    "ttl_seconds": 3600
  }
}
```

## Examples

### Example 1: Critical Bugs

```bash
$ /sonarqube-fix --severity critical --auto-fix

🔍 Fetching SonarQube issues...
   Found 5 CRITICAL issues

📊 Analysis Agent: Categorizing issues...
   - 3 × Cognitive Complexity (typescript:S1541)
   - 2 × SQL Injection Risk (typescript:S2077)

🔬 Spawning sub-agents...
   ✓ Quality Agent: Analyzing complexity issues
   ✓ Security Agent: Analyzing injection risks

🛠️  Automation Agent: Applying fixes...
   ✓ Fixed: LeadService.ts:142 - Extracted method (complexity 25→12)
   ✓ Fixed: router.ts:56 - Parameterized query

✅ Validation: All tests passing (156 tests, 91.2% coverage)

📝 Report generated: artifacts/reports/sonarqube-fix-20260101.md
```

### Example 2: Code Smells with Deep Analysis

```bash
$ /sonarqube-fix --type code_smell --deep-think --file apps/api/src/**

🔍 Fetching issues for apps/api/src/**
   Found 15 CODE_SMELL issues

🧠 Deep Thinking Mode: Enabled
   Analyzing root causes...
   Researching best practices...

📚 Research Results:
   - Cognitive Complexity: Clean Code (Martin Fowler)
   - Magic Numbers: Refactoring Guru patterns
   - Duplicate Code: DRY principles (Andy Hunt)

🔬 Quality Agent: Generating refactoring strategies...
   Strategy 1: Extract methods (6 functions)
   Strategy 2: Replace magic numbers (8 constants)
   Strategy 3: Remove duplication (3 blocks)

💬 Recommendations:
   [Detailed fix recommendations with code examples]

Continue with auto-fix? (y/n)
```

### Example 3: Security Vulnerabilities

```bash
$ /sonarqube-fix --type vulnerability,security_hotspot --report

🔍 Fetching security issues...
   Found 3 VULNERABILITY, 5 SECURITY_HOTSPOT

🛡️  Security Agent: Analyzing threats...
   CRITICAL: SQL Injection in findByEmail() - CVSS 9.8
   HIGH: XSS in displayMessage() - CVSS 7.3
   MEDIUM: Weak random in generateToken() - CVSS 5.9

🔬 Deep analysis:
   - Attack vectors identified
   - Exploitability: HIGH
   - OWASP mapping: A03:2021 (Injection)

🛠️  Secure Code Patterns:
   ✓ Parameterized queries (Prisma)
   ✓ Input sanitization (DOMPurify)
   ✓ Crypto.randomBytes (Node.js)

📝 Comprehensive report:
   artifacts/reports/sonarqube-security-20260101.md
   - Threat models
   - Fix strategies
   - Security tests
   - OWASP compliance
```

## Best Practices

### When to Use Auto-Fix

✅ **Safe for auto-fix**:
- Unused variables/imports
- Formatting issues
- Simple refactors (collapse if, remove duplicates)
- Magic number extraction
- Type annotations

❌ **Require manual review**:
- Complex business logic
- Cross-layer changes
- Security vulnerabilities (verify fix)
- Performance optimizations
- API contract changes

### Deep Thinking Mode

Enable `--deep-think` when:
- Issue is complex or novel
- Multiple solutions exist
- Architecture impact unclear
- Security implications
- Need research for best practices

### Research Strategies

The agent prioritizes:
1. **Official Docs** (SonarQube, TypeScript, OWASP)
2. **Project Patterns** (search codebase for existing solutions)
3. **Community** (Stack Overflow, GitHub)
4. **Books** (Clean Code, Refactoring Guru)

## Metrics & Reporting

### Tracked Metrics

```json
{
  "automation_metrics": {
    "total_issues": 45,
    "automated_fixes": 38,
    "automation_rate": 0.84,
    "success_rate": 1.0,
    "avg_fix_time": 3200,
    "rollback_rate": 0.0
  },
  "quality_metrics": {
    "coverage_before": 0.912,
    "coverage_after": 0.915,
    "complexity_reduction": 0.52,
    "tests_passing": 156,
    "build_time": 180000
  }
}
```

Metrics saved to: `artifacts/metrics/sonarqube-fixes.json`

### Report Locations

- **Fix Reports**: `artifacts/reports/sonarqube-fix-{timestamp}.md`
- **Security Reports**: `artifacts/reports/sonarqube-security-{timestamp}.md`
- **Metrics**: `artifacts/metrics/sonarqube-automation.json`
- **Logs**: `artifacts/logs/sonarqube-agent.log`

## Troubleshooting

### MCP Servers Not Available

The agent gracefully falls back to built-in tools:
- SonarQube MCP → Parse local reports
- Web Search MCP → Use built-in WebSearch tool
- Code Search MCP → Use built-in Grep tool
- Docs Fetch MCP → Use built-in WebFetch tool

### Validation Failures

If validation fails:
1. Changes are automatically rolled back
2. Issue logged for manual review
3. Next issue processed
4. Summary includes failed fixes

### Coverage Drops

If test coverage decreases:
1. Fix is rejected
2. Changes rolled back
3. Agent requests additional tests
4. Escalates to human review

## Integration with Project

### Hexagonal Architecture

The agent respects architecture boundaries:
- Domain layer: No infrastructure dependencies
- Application layer: Use cases and ports
- Adapters layer: Infrastructure implementations

Architecture tests (`packages/architecture-tests/`) enforce boundaries.

### DDD Principles

Fixes maintain DDD patterns:
- Rich domain models (not anemic)
- Business logic in domain
- Value objects for validations
- Aggregates for consistency

### Type Safety

All fixes maintain strict TypeScript:
- No `any` types
- Null safety enforced
- Zod schemas for validation
- End-to-end type safety (tRPC)

## Contributing

### Adding New Rules

1. Identify rule category (quality/security/automation)
2. Add to appropriate agent ([agents/](./agents/))
3. Create fix pattern with examples
4. Add tests for the fix
5. Update documentation

### Enhancing Research

1. Add sources to `mcp-config.json`
2. Prioritize by reliability
3. Cache results (TTL: 1 hour)
4. Test fallback strategies

### Improving Automation

1. Identify safe auto-fix patterns
2. Implement in automation agent
3. Add comprehensive validation
4. Test rollback scenarios
5. Track success metrics

## License

This skill is part of the IntelliFlow CRM project.

## Support

- **Documentation**: See individual agent docs in [agents/](./agents/)
- **Issues**: Report via GitHub issues
- **Questions**: Ask in project discussions

---

**Remember**: Quality and security are not negotiable. When in doubt, request human review.
