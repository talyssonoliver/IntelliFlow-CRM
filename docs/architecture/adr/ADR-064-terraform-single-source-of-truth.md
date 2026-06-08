# ADR-064: Terraform as the Single Source of Truth for Infrastructure

**Status:** Accepted

**Date:** 2026-06-05

**Deciders:** Platform (owner), Infrastructure

**Technical Story:** Infrastructure drift remediation + not-yet-deployed worker
services. Supersedes ADR-034; amends ADR-021 and ADR-030.

## Context and Problem Statement

ADR-034 (retroactive, 2026-02-22) recorded that infrastructure-as-code via
Terraform was "already in production." An audit on 2026-06-05 found that the
record is **overstated and the foundation has drifted/broken**:

- **`terraform validate` has failed for ~2 weeks** — the Railway and Vercel
  modules were written against older provider schemas. Concrete breakages:
  `railway_deployment` no longer exists (now `railway_service`);
  `railway_project.default_environment` is now an object, not a string; Vercel
  env vars moved to `vercel_project_environment_variable`;
  `vercel_edge_config_item` was removed; `vercel_webhook` reshaped (`endpoint`
  required, `project_ids`).
- **The environment `terraform.tfvars` files do not exist** (only `.example`
  templates), so the drift-detection CI workflow cannot actually run.
- **The Supabase module is `null_resource` + `curl` scaffolding**, which tracks
  no drift at all — despite the official `supabase/supabase` provider now
  existing.
- **The three `apps/workers` services** (`events-worker`, `ingestion-worker`,
  `notifications-worker`) — the "not-yet-deployed packages" — have Dockerfiles
  but **no Railway provisioning**: absent from `variables.tf`,
  `build-images.yml`, and the `railway-deploy.yml` matrix (see issues #230 /
  #259 / #270).
- **Observability claims are overstated**: EP-001-AI claims "100% services emit
  traces/metrics," but `ai-worker` ships **zero OpenTelemetry SDK** (IFC-032,
  still Backlog).

Meanwhile, real deploys happen through **CLIs and dashboards** —
`vercel deploy --prebuilt` (`cd.yml`), `railway up` (`railway-deploy.yml`),
`vercel.json`, and manual console edits (e.g. the broken Vercel install command
in #277). This is a **multi-headed control plane** with no drift detection: the
source of truth is "whatever someone last clicked."

We want to consolidate provisioning + configuration into **one place**, give the
undeployed packages a real deploy path, and gain the full IaC benefits —
reproducibility, drift detection, reviewable infra, environment parity, and
**observability/metrics as code**.

## Decision Drivers

- Eliminate configuration drift and the multi-headed control plane.
- Give the three undeployed worker services a first-class deploy path.
- Make every infra change a reviewable, auditable PR (not a dashboard click).
- Reproducibility + environment parity (dev/staging/prod from the same code).
- Bring observability/metrics under IaC so the monitoring stack is itself
  reproducible and drift-detected.
- Stop overstating completion: the record must match reality.

## Decision

**1. Terraform is the exclusive source of truth for infrastructure provisioning
and configuration** across **Vercel, Railway, Supabase, and the monitoring
stack**. Changes to these platforms MUST go through a Terraform PR; no
console/dashboard changes without a corresponding Terraform change first.

**2. The three workers become first-class Railway services.** `events-worker`,
`ingestion-worker`, and `notifications-worker` are added to the Railway module +
`variables.tf`, to `build-images.yml`, and to the `railway-deploy.yml` matrix.
This closes #230 / #259 / #270.

**3. The monitoring stack is brought under Terraform** (a new
`infra/terraform/modules/monitoring` module) so Grafana/Prometheus/Loki/Tempo
are provisioned + drift-detected as code, not run ad-hoc via Docker Compose. The
OTel endpoint becomes a Terraform output that Railway services reference.

**4. Clear provisioning-vs-deploy boundary.** Terraform owns _provisioning +
project configuration_ (projects, services, env vars, domains, edge config,
webhooks, monitoring). The CLIs continue to **deploy application code** onto
Terraform-managed projects (`vercel deploy --prebuilt`, `railway up`).
Build-time config (install/framework) stays in `vercel.json` (per #277);
project-level config (env vars, domains) is owned by Terraform. This split is
deliberate and documented.

**5. `terraform plan` approval is a mandatory merge gate** for any
`infra/terraform/**` change (amends ADR-021's promotion gates).

**6. Remote state with locking** (S3+DynamoDB or HCP Terraform) — chosen in
Phase 2. CI `validate` runs `-backend=false`; `plan`/`apply` use the remote
backend.

**7. Supabase moves to the official `supabase/supabase` provider**, replacing
the `null_resource` scaffolding, so Supabase config is genuinely drift-detected.

### Phasing

- **Phase 1 (this PR — direction + record):** ADR-064, amend ADR-034/ADR-021,
  correct the overstated IFC-075 / EP-001-AI attestations, and add the
  `INFRA-TF-*` sprint tasks.
- **Phase 2 (make it real):** fix the provider-schema errors → green `validate`;
  add the three workers; replace the Supabase module; create
  `environments/{dev,staging,production}/terraform.tfvars`; choose + bootstrap
  the state backend.
- **Phase 3 (wire + deploy + observe):** update `build-images.yml` /
  `railway-deploy.yml`; `terraform import` existing live infra into state; the
  monitoring module; `ai-worker` OTel (IFC-032); docs.

## Consequences

**Positive:**

- One auditable, reviewable source of truth; drift becomes visible via `plan`.
- The three workers finally get a real, reproducible deploy path.
- Reproducible environments (dev/staging/prod parity) and disaster recovery.
- Observability/metrics provisioned as code (reproducible, drift-detected).
- The record stops lying: completion claims match reality.

**Negative / trade-offs:**

- Adopting Terraform on _existing_ infra requires `terraform import` of every
  live resource into state — the fiddly, risky part of the migration.
- Requires remote-state bootstrap + ongoing provider-upgrade maintenance (the
  drift that broke this in the first place).
- Requires discipline: the moment someone edits a dashboard out-of-band, drift
  returns. The `plan` gate (decision 5) is the guardrail.

**Reversal:** if Terraform ownership proves unmaintainable, scope it back to a
single platform (or retire it) via a superseding ADR; the CLIs/`vercel.json`
remain functional throughout, so a reversal is non-destructive.

## Relationship to other ADRs

- **Supersedes ADR-034** (per ADR-034's own guidance) — extends its scope to the
  three workers + the monitoring stack and corrects its stale "in production"
  claim.
- **Amends ADR-021** — adds `terraform plan` review as a required promotion gate
  for infra changes.
- **Amends ADR-030** — clarifies Docker Compose is **dev-only**; Terraform owns
  production provisioning/config.

## Record correction

Two attestations are corrected as part of this ADR (honesty per the repo's "no
fake-green" rule):

- **IFC-075** ("IaC with Terraform"): drift detection is **not** active (empty
  tfvars, broken `validate`, `null_resource` Supabase). Reopened/extended via
  the `INFRA-TF-*` tasks.
- **EP-001-AI** ("100% services emit traces"): `ai-worker` has no OTel SDK;
  tracked by IFC-032 + `INFRA-TF-004`.
