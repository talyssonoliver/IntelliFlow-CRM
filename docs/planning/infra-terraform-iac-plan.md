# Infrastructure-as-Code Consolidation Plan (Terraform = Single Source of Truth)

**Owner:** Platform · **ADR:** [ADR-064](../architecture/adr/ADR-064-terraform-single-source-of-truth.md) · **Date:** 2026-06-05

This is the execution plan for ADR-064 — making Terraform the single source of
truth for Vercel, Railway, Supabase, **and** the monitoring stack. It records the
audit findings, the phased plan, the new tasks, and the attestation corrections.

## Audit findings (2026-06-05) — the drift the record hid

| Area | Claimed | Actual |
| --- | --- | --- |
| Terraform `validate` | green / IaC "in production" (ADR-034) | **broken ~2 weeks** — provider-schema drift (8 errors) |
| Env config | reproducible, drift-detected (IFC-075) | `environments/{dev,staging,prod}/terraform.tfvars` **do not exist** (only `.example`) → drift CI can't run |
| Supabase | provisioned via Terraform | `null_resource` + `curl` scaffolding — **tracks no drift** |
| Workers | "in production" (ADR-034) | `events/ingestion/notifications-worker` have Dockerfiles but **no Railway provisioning** (absent from `variables.tf`, `build-images.yml`, `railway-deploy.yml`) — see #230/#259/#270 |
| Observability | "100% services emit traces" (EP-001-AI) | `ai-worker` ships **zero OTel SDK** — IFC-032 still Backlog |

## Decisions (recorded)

1. Monitoring stack (Grafana/Prometheus/Loki/Tempo) **is brought under Terraform**
   (new `infra/terraform/modules/monitoring`).
2. State backend (S3+DynamoDB vs HCP Terraform) **decided in Phase 2**; CI
   `validate` runs `-backend=false` until then.
3. Supabase moves to the official `supabase/supabase` provider.
4. `terraform plan` is a **mandatory merge gate** for `infra/terraform/**`
   (ADR-021 §5).

## Phases

- **Phase 1 — direction + record (this PR):** ADR-064; amend ADR-034/ADR-021;
  README index; this plan; the `INFRA-TF-*` tasks; attestation corrections.
- **Phase 2 — make it real:** fix provider schemas → green `validate`; add the
  three workers; replace the Supabase module; create the `tfvars`; choose +
  bootstrap the state backend.
- **Phase 3 — wire + deploy + observe:** `build-images.yml` /
  `railway-deploy.yml` for workers; `terraform import` existing live infra into
  state; the monitoring module; `ai-worker` OTel (IFC-032); runbook docs.

## New sprint tasks (to create via `/create-task`)

> Section: **Infrastructure**. Governance: ADR-064. Slot in the active infra
> sprint. STOA: Foundation/Automation.

| ID | Title | Phase | Depends on | Definition of Done |
| --- | --- | --- | --- | --- |
| **INFRA-TF-001** | Fix Terraform provider-schema drift (Railway + Vercel) → green `validate` | 2 | — | `terraform validate` exits 0 in `terraform.yml`; `railway_deployment`→`railway_service`, `default_environment` object, `vercel_project_environment_variable`, `vercel_webhook`/edge-config migrated |
| **INFRA-TF-002** | Provision the three workers as Railway services | 2 | INFRA-TF-001 | `events/ingestion/notifications-worker` in `variables.tf` `railway_services`; module `for_each` covers them; closes #230/#259/#270 |
| **INFRA-TF-003** | Replace Supabase `null_resource` with the official `supabase/supabase` provider | 2 | INFRA-TF-001 | Real Supabase resources (auth, storage, extensions) with drift detection; `null_resource`/curl removed |
| **INFRA-TF-004** | Environments + remote state + observability-as-code | 2/3 | INFRA-TF-001 | `tfvars` for dev/staging/prod; remote backend (S3/HCP) bootstrapped; `monitoring` module provisions Grafana/Prometheus/Loki/Tempo; OTel endpoint as a TF output; wires IFC-032 (ai-worker NodeSDK + Prometheus port fix) |
| **INFRA-TF-005** | CI + import + runbooks | 3 | INFRA-TF-002, -004 | `build-images.yml` + `railway-deploy.yml` include the three workers; `terraform import` of existing live infra into state; `railway-deploy.md` / `workers-runbook.md` / `observability/README.md` updated |

## Attestation corrections (honesty per the "no fake-green" rule)

- **IFC-075** ("IaC with Terraform"): mark drift-detection **not active**
  (broken `validate`, empty `tfvars`, `null_resource` Supabase). Remaining work
  tracked by INFRA-TF-001..004. Update
  `.specify/sprints/sprint-1/attestations/IFC-075/`.
- **EP-001-AI** ("100% services emit traces"): correct — `ai-worker` has no OTel
  SDK; tracked by IFC-032 + INFRA-TF-004.

## Out of scope (this initiative)

- Application **code** deploys remain CLI-driven (`vercel deploy --prebuilt`,
  `railway up`) onto Terraform-managed projects (ADR-064 §4).
- `vercel.json` keeps build-time config (install/framework, per #277); Terraform
  owns project-level config (env vars, domains, edge config).
