# Production promotion (Railway images)

**Status:** adopted 2026-10-05. Replaces "every merge to main redeploys
production".

## Why this exists

Until 2026-10-05, `Build & Push Images` ran on every push to main and tagged
`ghcr.io/talyssonoliver/intelliflow-crm-<service>:latest`. Railway production
`api` has **image auto-updates on `:latest`**, so each merge reached production
after Railway's polling delay, with no gate. Evidence:

- Railway "Image Auto Upgraded" emails for `api` (e.g. 2026-10-05 08:53, 13:16,
  13:35, 17:22 and 18:16 UTC).
- On 2026-10-05 the api image for d578933 was pushed at 18:16:29Z, and the
  production API process reported a start at 18:16:36Z.
- That commit's Merge Coverage Gate was red on main (Unit Shard 12/20). It could
  not pass the gates below.

`infra/terraform/environments/production/terraform.tfvars` pins
`api_image_digest`, but the live service tracks `:latest`. The pin is not what
runs. See "Railway settings" below.

## Who does what

| Workflow                                         | Trigger                                    | Writes                                                                                            | Can it change production?          |
| ------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `build-images.yml` (Build & Push Images)         | push to `main`, manual                     | `intelliflow-crm-<svc>:sha-<full 40-char SHA>` only                                               | **No.** It never writes `:latest`. |
| `promote-production.yml` (Promote to Production) | **manual only**                            | `intelliflow-crm-<svc>:latest` → an existing `sha-<SHA>` digest; `railway redeploy`; ledger entry | **Yes.** It is the only one.       |
| `deploy-workers.yml`                             | manual only (was: after every image build) | `railway redeploy` of the workers, dormant until `RAILWAY_WORKERS_DEPLOYED=true`                  | Only when run by hand              |
| `signing.yml`                                    | v\* tags / releases                        | `ghcr.io/<repo>:<version>`, no longer `:latest`                                                   | No (not a Railway image)           |

There is no `v*` tag trigger on build or promotion. `release.yml` pushes a `v*`
tag on most merges, so a tag trigger would make both automatic again.

## Promotion gates

`scripts/ops/promotion-gates.mjs`, run by the workflow before anything moves.
All must hold for the exact main commit:

1. **On main.** `git merge-base --is-ancestor <sha> origin/main`.
2. **Required checks on the main commit**, conclusion `success`. A skipped,
   cancelled, running or missing check fails the gate:
   - Lint & Format
   - Type Check
   - Architecture Tests
   - Build
   - Integration Tests
   - Sprint Plan Validation
   - Unit Tests (sharded) / Merge Coverage Gate
   - Unit Tests (sharded) / SonarCloud Scan
3. **Pre-ship Attestation** succeeded on the head of the merged PR that put the
   commit on main (found through GitHub's commit → PR link).
4. **Build & Push Images** succeeded for that SHA, so the `sha-<SHA>` images
   were built from exactly this commit.

A main commit that touched only CI-ignored paths (docs, metrics) has no CI run
of its own and cannot be promoted. Promote the newest commit that passes.

Check any commit without changing anything:

```bash
GITHUB_TOKEN=$(gh auth token) GITHUB_REPOSITORY=talyssonoliver/IntelliFlow-CRM \
  node scripts/ops/promotion-gates.mjs --sha=<full sha>
```

## How to promote

1. Actions → **Promote to Production** → Run workflow.
   - `sha`: the full main commit.
   - `reason`: why.
   - Leave `dry_run` ticked.
2. Read the run summary: the gate verdict, plus the built digest and the current
   `:latest` digest for each service.
3. Run it again with `dry_run` unticked. The workflow:
   - opens a ledger entry;
   - points each `:latest` at the built digest (crane copies the manifest, so
     the digest is identical) and fails unless `:latest` then resolves to it;
   - runs `railway redeploy --service api --from-source`, which pulls the image
     the tag now points at (plain `redeploy` restarts the previous deployment's
     pinned digest). The `RAILWAY_TOKEN` secret is an account token, so the step
     passes it as `RAILWAY_API_TOKEN` and names the project
     (`vars.RAILWAY_PROJECT_ID`) and environment;
   - waits until the API's own `/api/health/live` uptime shows a restart;
   - closes the ledger entry as success or failure.

Only one promotion runs at a time (`concurrency: promote-production`).

## Ledger

Each real promotion is a GitHub deployment in environment `railway-production`.
`ref` is the promoted SHA. The payload holds, per service, the repo, the new
digest and the previous `:latest` digest, plus the reason, actor and run URL.

```bash
gh api "repos/talyssonoliver/IntelliFlow-CRM/deployments?environment=railway-production" \
  --jq '.[] | {sha: .sha, at: .created_at, by: .payload.actor, reason: .payload.reason, images: .payload.images}'
```

## Rollback

**Normal case.** Promote the previous SHA from the ledger. It passed the gates
when it was promoted, its `sha-<SHA>` images still exist, and nothing is
rebuilt. The redeploy step restarts the API on the old digest.

**When the previous image never passed the gates** (anything that reached
production before 2026-10-05 through auto-update), the workflow refuses it by
design. Move `:latest` back by hand to the digest recorded as `previous` in the
last ledger entry or run summary, then redeploy:

```bash
crane auth login ghcr.io -u <user> -p "$(gh auth token)"
crane tag ghcr.io/talyssonoliver/intelliflow-crm-api@sha256:<previous digest> latest
crane digest ghcr.io/talyssonoliver/intelliflow-crm-api:latest   # must print that digest
railway redeploy --service api --from-source --yes               # or Railway: Cmd+K → "Redeploy source image"
```

## Railway settings (owner, in the dashboard)

The Railway CLI cannot log in from the automation machine, so these are clicks:

1. **Confirm what the service runs.** Railway → project **intelliflow-crm-dev**
   → environment **production** → service **api** → **Settings** → **Source**.
   Expected: image `ghcr.io/talyssonoliver/intelliflow-crm-api:latest`. If it
   shows a GitHub repo instead, Railway builds from the repo on every push and
   this workflow does not control it. Tell the CI lane.
2. **Turn off image auto-updates** once promotion is in use. Same **Source**
   section → **Configure Auto Updates** → off. Promotion redeploys explicitly
   (`railway redeploy --from-source` re-pulls `:latest`), so auto-update is no
   longer needed. Leaving it on only adds a second, delayed redeploy of the same
   digest.
3. **Optional, stricter: pin by digest.** Same **Source** field → set the image
   to `ghcr.io/talyssonoliver/intelliflow-crm-api@sha256:<digest>` from the
   latest ledger entry. Production then cannot change at all unless the field is
   edited. Promotion would then need to update the field through Railway's API
   instead of moving `:latest`; that is a follow-up, not built here.
