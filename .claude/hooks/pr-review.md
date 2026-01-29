# PR Review Automation Hook

Automated pull request review with AI assistance.

## Trigger

Runs on PR creation and updates via GitHub webhook

## Automated Reviews

1. **Code Quality Analysis**
   - TypeScript strict mode compliance
   - ESLint rule violations
   - Code coverage changes

2. **Security Scan**
   - Dependency vulnerabilities (npm audit)
   - Secret detection
   - OWASP Top 10 checks

3. **Architecture Validation**
   - Domain boundary violations
   - Import restrictions
   - Layer dependency rules

4. **Performance Impact**
   - Bundle size changes
   - Query complexity analysis
   - API response time estimates

## AI Review Features

- Summarizes changes in plain language
- Identifies potential bugs
- Suggests improvements
- Checks against coding standards

## GitHub Action Configuration

```yaml
# .github/workflows/pr-review.yml
name: PR Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run AI Review
        uses: intelliflow/ai-review-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

## Review Output

Posted as PR comment with:

- Summary of changes
- Quality score (0-100)
- List of issues/suggestions
- Approval recommendation
