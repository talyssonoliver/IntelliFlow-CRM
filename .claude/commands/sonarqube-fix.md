# SonarQube Linter Fix Agent

**Command**: `/sonarqube-fix` or `/sq-fix`

**Description**: Intelligent agent for resolving SonarQube code quality issues with deep analysis, web research, and automated fixes.

## Overview

This agent specializes in:
- Analyzing SonarQube linter errors and warnings
- Researching best practices and solutions via web search
- Deep thinking analysis for complex code quality issues
- Multi-agent orchestration for comprehensive fixes
- Automated testing and validation

## Architecture

### STOA Sub-Agents

1. **Analysis Agent** - Parses SonarQube reports and categorizes issues
2. **Research Agent** - Searches for solutions and best practices
3. **Quality Agent** - Evaluates code quality and suggests improvements
4. **Security Agent** - Focuses on security-related issues
5. **Automation Agent** - Applies fixes and runs validation

### MCP Integration

- **SonarQube MCP Server**: Connects to SonarQube API for issue data
- **Code Search MCP**: Searches codebase for similar patterns
- **Documentation MCP**: Fetches relevant documentation

## Usage

```bash
/sonarqube-fix [options]

Options:
  --severity <level>    Filter by severity (blocker|critical|major|minor|info)
  --type <type>        Filter by type (bug|vulnerability|code_smell|security_hotspot)
  --file <path>        Analyze specific file
  --rule <rule-id>     Focus on specific SonarQube rule
  --auto-fix          Automatically apply fixes (requires confirmation)
  --deep-think        Enable extended analysis mode
  --report            Generate detailed analysis report
```

## Examples

```bash
# Analyze all critical issues
/sonarqube-fix --severity critical

# Fix specific file
/sonarqube-fix --file apps/api/src/router.ts

# Auto-fix code smells with deep analysis
/sonarqube-fix --type code_smell --auto-fix --deep-think

# Focus on specific rule
/sonarqube-fix --rule typescript:S1541

# Generate comprehensive report
/sonarqube-fix --report
```

## Workflow

1. **Discovery**: Fetch SonarQube issues via MCP
2. **Categorization**: Group by severity, type, and complexity
3. **Research**: Web search for solutions and best practices
4. **Analysis**: Deep thinking on complex issues
5. **Planning**: Generate fix strategy with sub-agents
6. **Implementation**: Apply fixes with validation
7. **Verification**: Run tests and re-scan
8. **Reporting**: Generate summary with metrics

## Sub-Agent Prompts

### Analysis Agent
- Parse SonarQube JSON/XML reports
- Categorize issues by complexity
- Identify patterns and root causes
- Prioritize based on impact

### Research Agent
- Search for official documentation
- Find Stack Overflow solutions
- Research best practices
- Identify common patterns

### Quality Agent
- Evaluate code maintainability
- Suggest refactoring strategies
- Check adherence to SOLID principles
- Review architectural patterns

### Security Agent
- Analyze OWASP violations
- Check for injection vulnerabilities
- Review authentication/authorization issues
- Validate input sanitization

### Automation Agent
- Apply automated fixes
- Run linters and formatters
- Execute test suites
- Verify SonarQube re-scan results

## Integration with Project

- Respects hexagonal architecture boundaries
- Maintains type safety (TypeScript strict mode)
- Ensures test coverage >90%
- Follows DDD principles
- Updates documentation (ADRs)

## TODO Comment Handling

When encountering `// TODO:` comments during fixes:

- **Do NOT just remove them** - read the context and understand the intent
- **Implement the TODO immediately** as part of the fix
- If the TODO requires a separate task, ensure it references a GitHub issue (e.g., `// TODO: Implement caching - #123`)
- Never leave commented-out code - delete it instead of commenting

## Anti-Patterns Avoided

- No blind auto-fixes without analysis
- No breaking changes without tests
- No security compromises for convenience
- No shortcuts that increase technical debt

## Success Metrics

- Issues resolved per session
- Re-scan pass rate
- Test coverage maintained
- Build time impact
- Code quality score improvement

## Configuration

Configuration file: `.claude/sonarqube-agent.config.json`

```json
{
  "sonarqube": {
    "server_url": "${SONARQUBE_URL}",
    "project_key": "intelliflow-crm",
    "token": "${SONARQUBE_TOKEN}"
  },
  "agents": {
    "max_concurrent": 3,
    "timeout_ms": 300000,
    "retry_attempts": 3
  },
  "auto_fix": {
    "enabled": false,
    "require_confirmation": true,
    "run_tests": true
  },
  "deep_think": {
    "enabled": true,
    "max_iterations": 5,
    "web_search_limit": 10
  }
}
```

## MCP Servers Required

1. **sonarqube-mcp** - SonarQube API integration
2. **web-search** - Google/Bing search for research
3. **code-search** - Codebase pattern matching
4. **docs-fetch** - Fetch external documentation

## Output Format

```markdown
# SonarQube Fix Report

## Summary
- Total Issues: 45
- Fixed: 38
- Remaining: 7
- Severity: 5 Critical, 15 Major, 23 Minor

## Fixed Issues

### Critical (5/5)
✅ typescript:S1541 - Cognitive complexity in LeadService.ts:142
  - Strategy: Extracted method, reduced complexity from 25 to 12
  - Research: https://stackoverflow.com/...
  - Tests: ✅ All passing (coverage maintained at 94%)

### Major (15/15)
✅ typescript:S3358 - Nested ternary in router.ts:56
  - Strategy: Replaced with if-else, improved readability
  - Pattern: Found 8 similar instances, fixed all
  - Tests: ✅ All passing

## Remaining Issues

### Major (7)
⚠️ typescript:S1479 - Switch statement in workflow.ts:234
  - Reason: Requires domain knowledge for case consolidation
  - Recommendation: Manual review needed
  - Blocker: Business logic complexity

## Metrics
- Time: 15 minutes
- Automated: 84%
- Tests run: 156
- Coverage: 91.2% (maintained)
- SonarQube Quality Gate: ✅ PASSED
```

## Error Handling

- Graceful degradation if MCP servers unavailable
- Rollback capability for failed fixes
- Detailed error logs in `artifacts/logs/sonarqube-agent.log`
- Human intervention prompts for complex issues

## Future Enhancements

- Machine learning for pattern recognition
- Integration with CI/CD pipelines
- Automated PR creation for fixes
- Historical analysis and trends
- Custom rule definitions