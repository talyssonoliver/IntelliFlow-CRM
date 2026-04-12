# SonarQube Fix — Report Template

Generate comprehensive report in
`artifacts/reports/sonarqube-fix-{timestamp}.md`:

```markdown
# SonarQube Fix Report

Generated: {timestamp}

## Executive Summary

- **Total Issues**: X
- **Fixed**: Y (Z%)
- **Remaining**: N
- **Time**: M minutes
- **Quality Gate**: PASSED/FAILED

## Issues Fixed

### By Severity

- Blocker: X/Y
- Critical: X/Y
- Major: X/Y
- Minor: X/Y

### By Type

- Bugs: X
- Vulnerabilities: X
- Code Smells: X
- Security Hotspots: X

## Detailed Fixes

[For each fixed issue, include:]

- Rule ID and description
- File and line number
- Fix strategy and rationale
- Research references
- Before/after code snippets
- Test results

## Remaining Issues

[For each unfixed issue, include:]

- Why it wasn't fixed
- Complexity/risk assessment
- Recommendation for manual fix
- Estimated effort

## Metrics

- Automation rate: X%
- Test coverage: X%
- Build time impact: +X seconds
- Quality score improvement: +X points

## Next Steps

[Recommendations for remaining issues]
```
