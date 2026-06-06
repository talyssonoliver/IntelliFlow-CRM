# Terraform Import — adopt existing live infra before the first apply

**INFRA-TF-005 (import piece).** The Terraform config + a green `plan` describe
infrastructure, but Terraform's **state is empty** — it believes **zero**
resources exist. Meanwhile the live infra already exists:

- **Vercel** project `prj_AQ1IS7N9VOtxgF48oYCe4mZdVYgd` (`intelli-flow-crm-web`,
  serving `intelli-flow-crm-web.vercel.app`) under org
  `team_v4UlyPGDvXOtXK8yPx1w90Hf`.
- **Supabase** project — the **production** database
  (`.env.local DATABASE_URL`).
- **Railway** project `8c2b7828-d508-4fb4-9ea4-98f9c35f9edc`.

> ⛔ **Do NOT `terraform apply` before importing.** With empty state, apply
> reads "0 exist, plan says create 43" and tries to **create** a
> `vercel_project` and a Supabase project that already exist — best case it
> errors on a name conflict, worst case it **duplicates the Vercel project or
> destroys/recreates production Supabase**. Import first, then review the plan,
> then apply only a free subset.

---

## 1. What is importable now vs. blocked

| Resource (config address)                                          | Live ID                                | Status                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module.vercel.vercel_project.main`                                | `prj_AQ1IS7N9VOtxgF48oYCe4mZdVYgd`     | ✅ importable                                                                                                                                                                                                                                                                                                                |
| `module.railway.railway_project.main`                              | `8c2b7828-d508-4fb4-9ea4-98f9c35f9edc` | ✅ importable                                                                                                                                                                                                                                                                                                                |
| `module.railway.railway_environment.main`                          | `<env-uuid>` (discover, §3)            | ✅ importable                                                                                                                                                                                                                                                                                                                |
| `module.vercel.vercel_project_environment_variable.general["KEY"]` | per-var ID (discover)                  | ✅ if it already exists                                                                                                                                                                                                                                                                                                      |
| `module.railway.railway_service.services["api"]` etc.              | per-service ID (discover)              | ✅ only if already deployed                                                                                                                                                                                                                                                                                                  |
| **`module.supabase.*`**                                            | —                                      | ❌ **BLOCKED** — the module is `null_resource` + `data "http"`, not real Terraform resources, so there is nothing to import. Proper Supabase import needs the **official `supabase/supabase` provider → INFRA-TF-003.** Until then the Supabase module is a no-op against state and must NOT be applied against the prod DB. |

The **3 workers, monitoring manifest, and most env vars are genuinely new** —
they are the legitimate "to add" and do not need importing.

---

## 2. Prerequisites

```bash
terraform login                       # HCP Terraform (cloud{} backend) auth
cd infra/terraform
export TF_WORKSPACE=intelliflow-crm-dev      # the workspace whose state adopts these
# provider tokens (same as CI TF_VAR_* secrets):
export TF_VAR_vercel_api_token=...    # VERCEL_TOKEN
export TF_VAR_railway_token=...       # RAILWAY_TOKEN
export TF_VAR_supabase_access_token=...   # SUPABASE_PERSONAL_ACCESS_TOKEN
export TF_VAR_supabase_db_password=...     # DB_PASSWORD
terraform init
```

> Pick the workspace deliberately. The live Vercel/Supabase are **production**
> infra; importing them into `intelliflow-crm-dev` state is almost certainly the
> wrong model. Decide the env↔state mapping first (likely import prod resources
> into `intelliflow-crm-production`).

---

## 3. Discover the IDs you don't have yet

- **Railway environment UUID:** `railway environment` (CLI, in the project) or
  the project URL in the dashboard.
- **Railway services / Vercel env vars:** only import these if they ALREADY
  exist. List them: Railway dashboard → project → services; Vercel dashboard →
  project → Settings → Environment Variables (each var has an `id`). A fresh
  Railway project with no services means every `railway_service` is new (nothing
  to import).

---

## 4. Import (Terraform ≥1.5 `import {}` blocks)

`infra/terraform/imports.tf.example` holds ready-to-use blocks. To use them:
copy to `imports.tf`, fill any discovered IDs, then **plan** (§5). Example:

```hcl
import {
  to = module.vercel.vercel_project.main
  id = "prj_AQ1IS7N9VOtxgF48oYCe4mZdVYgd"
}
import {
  to = module.railway.railway_project.main
  id = "8c2b7828-d508-4fb4-9ea4-98f9c35f9edc"
}
```

(Alternatively the imperative form:
`terraform import module.railway.railway_project.main 8c2b7828-...`.)

---

## 5. ⚠️ MANDATORY plan review — the safety gate

```bash
terraform plan -var-file=environments/<env>/terraform.tfvars
```

Read it line by line. It will show, for each imported resource, **the diff
between the live reality and the config** — and this is where the danger lives:

- The live Vercel project is named **`intelli-flow-crm-web`**; the config names
  it **`intelliflow-crm-<env>`**. So the plan will want to **rename** it. Either
  update the config to match reality, or accept the rename — **decide
  consciously; an unreviewed apply would rename your live project.**
- **Any `destroy`/`replace`/`-/+` on an imported resource is a STOP.** Reconcile
  the config to match reality until the plan shows imported resources as
  **no-change** and only the genuinely-new resources (workers, etc.) as `+ add`.

Only when the plan reads **"imported resources: no changes; only new workers to
add"** is it safe to proceed.

---

## 6. Free-tier-safe apply (only after §5 is clean)

Railway cannot host 5 always-on services for free. Apply a subset:

- `dev`-only, and/or
- `replicas = 0` on idle workers (events/ingestion/notifications) until needed,
- leave Supabase to INFRA-TF-003 (do not apply the `null_resource` module
  against the prod DB).

Apply runs via the **gated CI dispatch** (`terraform.yml`, `action=apply`) or
locally after §5. After a successful import, **delete `imports.tf`** (import
blocks are one-time; leaving them risks re-importing into the wrong workspace).

---

## 7. Why this is gated, in one line

Import + a reviewed plan is the only way to let Terraform **adopt** the running
app instead of **recreating** it. Skipping it is the one action in this whole
initiative that can take production down.
