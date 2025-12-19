# Post-Push Hook

Triggers CI/CD pipeline after successful push.

## Trigger

Runs automatically after `git push`

## Actions

1. **Notify CI Pipeline**
   - Triggers GitHub Actions workflow
   - Passes branch and commit information

2. **Update Dashboard**
   - Records push timestamp
   - Updates deployment status

3. **Slack Notification** (if configured)
   - Notifies team channel
   - Includes commit summary

## Configuration

Located in `.husky/post-push`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Get branch and commit info
BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMIT=$(git rev-parse --short HEAD)

# Log push event
echo "Push completed: $BRANCH @ $COMMIT"

# Trigger webhook (if configured)
if [ -n "$CI_WEBHOOK_URL" ]; then
  curl -X POST "$CI_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"branch\": \"$BRANCH\", \"commit\": \"$COMMIT\"}"
fi
```

## Related Workflows

- `.github/workflows/ci.yml` - Continuous Integration
- `.github/workflows/cd.yml` - Continuous Deployment
