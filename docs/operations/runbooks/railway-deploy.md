# Railway Build & Deploy Runbook

End-to-end runbook for provisioning and deploying the IntelliFlow CRM backend
(API + ai-worker) to Railway. Vercel (frontend) and Supabase (database) are
covered by their own runbooks.

> **Token hygiene** — the Railway personal token lives only in `.env`,
> `.env.local`, and `infra/terraform/.env` (all gitignored). Rotate it at
> <https://railway.app/account/tokens> the moment shared provisioning work is
> finished.
>
> **Two token names, on purpose**:
>
> - `RAILWAY_API_TOKEN` — account-wide token. Required for management commands
>   (`railway whoami`, `railway list`, `railway init`, cross-project ops).
> - `RAILWAY_TOKEN` — project-scoped token. Required by `railway up --ci` and
>   `railway link` in CI environments where the deploy targets a single project.
>   The Terraform provider also reads this generic name.
> - If you only hold an account token, set both to the same value (current state
>   of `.env` / `.env.local`). For prod CI prefer a real project token.

## 1. Deployment topology

| Layer       | Source of truth                                    | What it does                                                            |
| ----------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| Provision   | `infra/terraform/modules/railway/`                 | Creates project, services (`api`, `ai-worker`), env vars, custom domain |
| Image build | `.github/workflows/build-images.yml`               | Publishes `ghcr.io/<owner>/intelliflow-crm-{api,ai-worker}:latest`      |
| Deploy A    | Terraform re-apply OR Railway auto-pull on new tag | Production-grade, reproducible                                          |
| Deploy B    | `.github/workflows/railway-deploy.yml`             | Direct `railway up` for hot-fixes / matrixed dev+staging                |

Both deploy paths read `RAILWAY_TOKEN` from the same secret.

## 2. One-time setup

### 2.1 Local prerequisites

```bash
# macOS
brew install terraform
brew install railwayapp/tap/railway

# Windows (Chocolatey)
choco install terraform
iwr -useb https://railway.app/install.ps1 | iex

# Linux
curl -fsSL https://get.terraform.io | bash
curl -fsSL https://railway.app/install.sh | sh
```

Verify:

```bash
terraform version   # >= 1.6.0
railway --version
```

### 2.2 Secrets

Already present (gitignored) on this workstation:

- `<repo>/.env` — has `RAILWAY_TOKEN` + `TF_VAR_railway_token`
- `<repo>/.env.local` — same
- `<repo>/infra/terraform/.env` — `export TF_VAR_railway_token=...` for shell
  sourcing

For CI, set these on the GitHub repo:

| Where                   | Name                               | Notes                                      |
| ----------------------- | ---------------------------------- | ------------------------------------------ |
| Repo Secrets            | `RAILWAY_API_TOKEN`                | Account-wide token (provisioning, listing) |
| Repo Secrets            | `RAILWAY_TOKEN`                    | Project-scoped token (CI deploys)          |
| Repo Secrets            | `RAILWAY_TOKEN_PROD`               | Separate project token for production      |
| Repo Secrets            | `SUPABASE_ACCESS_TOKEN`            | Used by Terraform plan/apply               |
| Repo Secrets            | `SUPABASE_ACCESS_TOKEN_PROD`       | Production variant                         |
| Repo Secrets            | `VERCEL_API_TOKEN`                 | Already in use                             |
| Repo Secrets            | `DB_PASSWORD` / `DB_PASSWORD_PROD` | Supabase DB master password                |
| Repo Secrets            | `AWS_ACCESS_KEY_ID/SECRET`         | S3 backend (see backend.tf.example)        |
| Env Variables (per env) | `RAILWAY_PROJECT_ID`               | Filled in after first `terraform apply`    |

### 2.3 Terraform backend

Copy `infra/terraform/backend.tf.example` to `infra/terraform/backend.tf` (the
file is gitignored). The CI workflow injects the per-env `key` at
`terraform init` time.

## 3. Provision dev + staging (first run)

```bash
cd infra/terraform
source .env                           # loads TF_VAR_* into the shell
terraform init                         # uses backend.tf if present, else local state

# --- dev ---
terraform plan  -var-file=environments/dev/terraform.tfvars      -out=dev.tfplan
terraform apply  dev.tfplan

# --- staging ---
terraform plan  -var-file=environments/staging/terraform.tfvars  -out=staging.tfplan
terraform apply  staging.tfplan
```

Capture the outputs printed at the end:

```bash
terraform output railway_project_id    # paste into GH Settings -> Environments -> <env> -> Variables (RAILWAY_PROJECT_ID)
terraform output railway_api_url
terraform output railway_worker_url
```

> The `dev` and `staging` `terraform.tfvars` files are gitignored copies of the
> matching `.example` templates. Edit them, never the templates, for
> environment-specific changes.

## 4. Ongoing deploys

### Path A — Image refresh (production-grade)

1. Push to `main` (or tag `vX.Y.Z`) — triggers `build-images.yml`.
2. New tags `:latest` and `:sha-<short>` land on GHCR.
3. Either:
   - **Auto:** if Railway services were created with
     `RAILWAY_DEPLOY_ON_IMAGE_UPDATE=true`, Railway pulls automatically.
   - **Manual:** re-run `terraform apply` so the `railway_deployment` resource
     sees the new `image` tag.

### Path B — Direct `railway up` (hot-fix or local-only changes)

Run the new workflow manually:

```text
GitHub -> Actions -> Railway Deploy -> Run workflow
  environment = dev | staging | production
  service     = all | api | ai-worker
```

Or locally:

```bash
railway login                          # browser OAuth, OR
railway login --token "$RAILWAY_TOKEN"

railway link --project <project-id> --environment dev

pnpm deploy:railway:api                # railway up --service api --path-as-root apps/api
pnpm deploy:railway:worker             # railway up --service ai-worker --path-as-root apps/ai-worker

pnpm deploy:railway:logs:api           # tail logs
```

## 5. Health verification

After every deploy:

```bash
curl -fsSL "$(terraform -chdir=infra/terraform output -raw railway_api_url)/health"
curl -fsSL "$(terraform -chdir=infra/terraform output -raw railway_worker_url)/health"
```

Both should respond `200 OK`. If `/health` 5xxs:

```bash
railway logs --service api --deployment latest
railway status --service api
```

## 6. Rollback

Two mechanisms:

- **Railway dashboard:** Deployments tab -> three-dot menu on the last good
  deployment -> _Promote to active_. Sub-30s.
- **Terraform:** pin the previous image SHA in
  `railway_services.{api,ai-worker}.image` and re-`apply`.

If a bad config landed in env vars, edit the matching block in
`environments/<env>/terraform.tfvars` and re-`apply`.

## 7. Token rotation

```bash
# 1. Create a new token at https://railway.app/account/tokens
# 2. Update both local secrets files (gitignored):
#    .env, .env.local, infra/terraform/.env
# 3. Rotate the GitHub secret(s): RAILWAY_TOKEN [+ _PROD]
# 4. Re-run Terraform to confirm the provider still authenticates:
cd infra/terraform && source .env && terraform plan -var-file=environments/dev/terraform.tfvars
# 5. Revoke the old token from the Railway dashboard.
```

## 8. Troubleshooting

| Symptom                                             | Likely cause                                                      | Fix                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `railway up` exits with 401                         | Token missing or stale                                            | `echo $RAILWAY_TOKEN` / re-`railway login --token …`                                                                     |
| Terraform `Error: invalid project_id`               | `RAILWAY_PROJECT_ID` repo var wasn't refreshed after re-provision | `terraform output railway_project_id` -> paste into env variable                                                         |
| Service crash-loops on PORT bind                    | `PORT` env var not propagated                                     | Check `railway_services.<svc>.env_vars.PORT`, must match `EXPOSE` in `infra/docker/Dockerfile.*` (api=4000, worker=5000) |
| Healthcheck 504s for 30+s                           | First boot of ai-worker takes ~20s on cold start                  | Raise `healthcheckTimeout` in `apps/ai-worker/railway.json`; redeploy                                                    |
| GHCR pull denied                                    | Railway can't reach the GHCR image                                | Ensure image is `public`, or add Railway's deploy key in the GHCR package settings                                       |
| `terraform plan` is empty after pushing a new image | Image tag (`:latest`) is unchanged                                | Push a SHA-pinned tag and update `railway_services.<svc>.image`; trigger re-deploy                                       |

## 9. Cost / quota notes

**Current plan: Railway Hobby** — $5/mo base + usage, with account ceilings of
**8 GB RAM, 8 vCPU, 100 GB shared disk** (confirmed 2026-06-07). The `memory` /
`cpu` values in `railway_services` are per-replica **limits** (ceilings), not
reservations — actual billed usage idles well below them.

### Production footprint vs. the Hobby ceiling

| Service                | Replicas | Mem limit | vCPU limit | RAM ceiling | vCPU ceiling | In TF? |
| ---------------------- | -------- | --------- | ---------- | ----------- | ------------ | ------ |
| `api`                  | 2        | 1 GB      | 1          | 2.0 GB      | 2.0          | yes    |
| `ai-worker`            | 2        | 1 GB      | 1          | 2.0 GB      | 2.0          | yes    |
| `events-worker`        | 1        | 512 MB    | 0.5        | 0.5 GB      | 0.5          | yes    |
| `ingestion-worker`     | 1        | 512 MB    | 0.5        | 0.5 GB      | 0.5          | yes    |
| `notifications-worker` | 1        | 512 MB    | 0.5        | 0.5 GB      | 0.5          | yes    |
| `Redis`                | 1        | ~0.5 GB   | ~0.5       | 0.5 GB      | 0.5          | no¹    |
| `ws`                   | 1        | ~0.5 GB   | ~0.5       | 0.5 GB      | 0.5          | no¹    |
| **Total (ceilings)**   |          |           |            | **~6.5 GB** | **~6.5**     |        |
| **Hobby cap**          |          |           |            | **8 GB**    | **8**        |        |

¹ `Redis` + `ws` exist live but are **not** Terraform-managed (left external on
purpose). Only `Redis` uses a persistent **volume** (~a few GB) — disk usage is
a rounding error against the 100 GB cap.

### Verdict — are we good on Hobby?

**Yes, comfortably for normal operation.** Even at _declared ceilings_ the fleet
sums to ~6.5/8 GB and ~6.5/8 vCPU (real idle usage is far lower), and disk is a
non-issue. Headroom notes:

- **The 2× replicas on `api`/`ai-worker` are the main consumers** (4 GB / 4 vCPU
  of the ceiling). Live currently runs them at **`replicas=1`**; a full
  `terraform apply` would scale them to 2 (the SSOT default) — a deliberate +2
  GB / +2 vCPU step. Keep them at `replicas=1` until traffic warrants HA, and
  the ceiling drops to ~4.5/8.
- The 3 workers + Redis + ws are tiny (≤0.5 GB each).
- Disk (100 GB) is effectively unlimited for this workload.

### Alerts

- Watch `cost_alert_threshold` in each `terraform.tfvars`
  (`cost_alert_threshold = 1` in prod); alerts fire via Railway billing
  settings, not Terraform itself.
- Pre-Hobby history: the old **Free** tier ($5 credit, no payment method) hit
  _"You have used all your available resources"_ on any var-write/redeploy once
  exhausted — which blocked the 2026-06-07 prod DB-rotation fix until the plan
  was upgraded. Hobby removes that wall.

## 10. Related runbooks

- `docs/operations/runbooks/easypanel-runbook.md` — internal monitoring side-car
  (OTEL/Prom/Loki).
- `docs/operations/runbooks/release-checklist.md` — gate this runbook into the
  broader release flow.
- `docs/operations/release-rollback.md` — cross-cutting rollback policy.
- `infra/terraform/modules/railway/README.md` — module-level reference.

## Appendix A — file inventory

| Path                                                                  | Tracked? | Purpose                                       |
| --------------------------------------------------------------------- | -------- | --------------------------------------------- |
| `infra/terraform/main.tf`                                             | yes      | Root module wires Supabase + Vercel + Railway |
| `infra/terraform/modules/railway/`                                    | yes      | Railway resources                             |
| `infra/terraform/environments/{dev,staging}/terraform.tfvars`         | no       | Real per-env values                           |
| `infra/terraform/environments/{dev,staging}/terraform.tfvars.example` | yes      | Template                                      |
| `infra/terraform/backend.tf`                                          | no       | S3 remote-state config (use .example)         |
| `infra/terraform/.env`                                                | no       | Shell-sourced `TF_VAR_*` exports              |
| `apps/api/railway.json`                                               | yes      | Railway CLI build/deploy config for API       |
| `apps/ai-worker/railway.json`                                         | yes      | Railway CLI build/deploy config for worker    |
| `.github/workflows/build-images.yml`                                  | yes      | Pushes images to GHCR                         |
| `.github/workflows/terraform.yml`                                     | yes      | Plan/apply across envs                        |
| `.github/workflows/railway-deploy.yml`                                | yes      | Direct `railway up` deploys                   |
