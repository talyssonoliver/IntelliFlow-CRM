# Release and Rollback Strategy

## Overview

This document describes how IntelliFlow CRM is released and what can actually be
rolled back today. It was rewritten on 2026-10-05: the previous version
described a **blue/green deployment** with "instant rollback" that was never
built. The `blue-green-deploy.yml` workflow it relied on had its traffic switch
and rollback steps commented out as TODOs, needed secrets and domains that were
never created, and both of its runs failed. It has been deleted. Nothing below
describes aspirational behaviour.

## What exists

| Layer                    | Release path                                                                 | Rollback path                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Web (`apps/web`, Vercel) | `cd.yml` builds and deploys to Vercel production, then a blocking smoke test | Vercel Instant Rollback via `vercel-rollback.yml` (dry run first) or dashboard |
| API / workers (Railway)  | Outside `cd.yml`; see [Railway runbook](./runbooks/railway-deploy.md)        | Manual, see [Railway API and workers](#railway-api-and-workers)                |
| Database (Supabase)      | `prisma migrate deploy` only, classified A/B/C                               | No automatic rollback; expand-first migrations, restore from backup            |

There is **no** blue/green environment pair, no traffic shifting, no automatic
rollback on failed health checks, and no rollback metrics CSV.

## Rollback Procedures

### Web: Vercel Instant Rollback through the workflow

Workflow: `.github/workflows/vercel-rollback.yml` (`workflow_dispatch` only; no
schedule, no push trigger). Inputs:

| Input     | Meaning                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------- |
| `target`  | Deployment URL or id to roll back to. Empty = newest READY production deployment that is not current |
| `dry_run` | Default **true**. Resolves and reports only, changes nothing                                         |
| `reason`  | Required. Recorded in the job summary                                                                |

1. **Dry run first** (the default):

   ```bash
   gh workflow run vercel-rollback.yml -f reason="checkout 500s after #123"
   ```

   Open the run's job summary and check the current deployment, the target (URL,
   id, created time, git SHA, commit message), the reason and the actor.

2. **Roll back** only when the summary shows the target you intend:

   ```bash
   gh workflow run vercel-rollback.yml -f dry_run=false \
     -f reason="checkout 500s after #123" [-f target=<deployment url or id>]
   ```

   The workflow runs
   `vercel rollback <target-id> --scope <team> --timeout 3m --yes` (Vercel CLI
   pinned to major 54), then re-reads the project from the Vercel API and
   **fails the job unless production now serves the target deployment**.

3. **Undo**: the summary prints the previous deployment id. Run
   `vercel promote <previous-id>`, or dispatch the workflow again with that id
   as `target`. Rolling back pauses automatic assignment of production domains
   until you promote ([Vercel docs](https://vercel.com/docs/cli/rollback)), so a
   later merge to `main` will not take over production until you do.

Limits worth knowing:

- Only READY production deployments of this project whose `isRollbackCandidate`
  is not `false` are accepted as targets.
- Vercel Hobby plans can only roll back to the previous production deployment.
- Required configuration: secret `VERCEL_TOKEN`, repository variables
  `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (the same ones `cd.yml` uses).
- **Status:** the target resolution is unit tested and was read-only checked
  against the live Vercel API. The live switch (`dry_run=false`) has not been
  exercised yet; do the first real run deliberately and record the outcome here.

### Web: dashboard or CLI

- **Dashboard:** Vercel project, Deployments, the deployment to restore, then
  **Instant Rollback**.
- **CLI** (emergency, from a machine logged in with access to the team):

  ```bash
  vercel rollback <deployment-url-or-id> --scope <team>
  vercel rollback status          # check a pending rollback
  vercel promote <deployment>     # undo
  ```

### Railway API and workers

The API and workers run on Railway and are **not** touched by `cd.yml` or by
`vercel-rollback.yml`. There is no automated rollback for them. The manual paths
are in the [Railway runbook, section 6](./runbooks/railway-deploy.md): promote
the last good deployment in the Railway dashboard, or pin the previous image SHA
in Terraform and re-apply. Neither path has been rehearsed from this repository,
and `deploy-workers.yml` is dormant until the workers are provisioned.

Because web and API roll back independently, a web rollback is only safe while
the previous web build is compatible with the API currently running.

### Rollback checklist

1. Confirm the problem is real (not a monitoring false positive).
2. Dry-run the workflow and read the target.
3. Roll back; confirm the verify step passes.
4. Check `/api/health` on the production URL and watch error rates for 15
   minutes.
5. Open an incident per [incident-runbook.md](./incident-runbook.md); fix
   forward on a branch, then `vercel promote` the fixed deployment.

## Database Migrations and Rollback

A code rollback does **not** roll the database back. Schema changes must be
**expand-first and backward-compatible** so the previous deployment still works
against the current schema. Classify every migration per
[`./agent-autonomy-policy.md`](./agent-autonomy-policy.md) (ADR-069):

- **Class A** (additive/non-destructive) — compatible with a code rollback; an
  agent may run it autonomously after all Class A gates pass (see
  [`./runbooks/release-checklist.md`](./runbooks/release-checklist.md)
  §Database).
- **Class B** (backfills, `NOT NULL`/uniqueness on populated data, large-table
  or locking ops, type narrowing, contract-phase removal) — **escalate for a
  human go/no-go before the production mutation.**
- **Class C** (drop/truncate/reset, destructive replacement, weakening tenant
  isolation, ad-hoc prod DML) — **human-only. Stop.**

**Production command:** `prisma migrate deploy`
(`pnpm --filter @intelliflow/db db:migrate`) **only** — never `db push`,
`db reset`, or `migrate dev` against production (blocked by the DB guards absent
`ALLOW_PROD_DB_OPS=1`). Contract-phase column/table drops are a **separate,
later** Class B/C release, never bundled with the expand.

## Health Check Endpoints

### Required Endpoints

| Endpoint           | Purpose         | Expected Response                     |
| ------------------ | --------------- | ------------------------------------- |
| `/health`          | Basic health    | `200 OK` with `{"status": "healthy"}` |
| `/health/ready`    | Readiness probe | `200 OK` when ready to serve traffic  |
| `/health/live`     | Liveness probe  | `200 OK` when process is alive        |
| `/health/detailed` | Full status     | `200 OK` with component status        |

Compatibility note: `/api/health`, `/api/health/ready`, `/api/health/live`, and
`/api/health/detailed` are still served as legacy aliases. Use `/health*` for
new infra configuration and rollback automation.

### Health Check Implementation

```typescript
// apps/api/src/http-server.ts + apps/api/src/modules/misc/health.service.ts
// HTTP probes and tRPC diagnostics both delegate to the same health helpers.
//
// Canonical HTTP endpoints:
//   GET /health
//   GET /health/ready
//   GET /health/live
//   GET /health/detailed
//
// Legacy aliases kept for compatibility:
//   GET /api/health*
```

## Emergency Procedures

### Complete Service Outage

1. **Verify the issue** (not a monitoring false positive)
2. **Roll back the web app** with the workflow or dashboard; check the Railway
   API separately
3. **If rollback is not enough**, redeploy a known-good commit
4. **Page engineering leadership** for extended outages (>15 min)

### Database Corruption

1. **Immediately halt all deployments**
2. **Restore from latest backup** (Supabase)
3. **Verify data integrity**
4. **Resume operations**

### Security Incident

1. **Roll back** to a known-clean deployment if the issue shipped in a release
2. **Engage security team**
3. **Do NOT deploy** until cleared

## Related Documentation

- [CI/CD Pipeline](../../.github/workflows/cd.yml)
- [Vercel rollback workflow](../../.github/workflows/vercel-rollback.yml)
- [Railway runbook](./runbooks/railway-deploy.md)
- [Health Check Configuration](../../infra/monitoring/health-checks.yaml)
- [Incident Response](./incident-runbook.md)
