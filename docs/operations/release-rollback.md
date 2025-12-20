# Release & Rollback

## Release

- Merge to main with CI green
- Deploy via the standard pipeline
- Confirm health checks and key flows

## Rollback

- Revert the release commit(s)
- Redeploy previous known good build
- Document the incident and follow-up actions
