# Terraform State Backend — HCP Terraform (free tier)

One-time setup to give the IaC initiative (ADR-064) remote state + locking +
drift detection, **for free, with no AWS account**. Replaces the old S3 backend.

## Why HCP

- **Free** tier (small teams), purpose-built for Terraform state.
- Remote state + **state locking** + **drift detection** + run history/UI — the
  observability the IaC initiative wants.
- No AWS to bootstrap; CI authenticates with a single token secret.

## Your one-time manual steps (~10 min)

1. **Create a free HCP Terraform account** → https://app.terraform.io (Sign up).
2. **Use the organization `Leangency`** (the existing HCP org this project lives
   in). This is the value in `organization` in `infra/terraform/providers.tf` —
   if you use a different org, change it there to match. (A _project_ named
   `intelliflow-crm` inside the org is optional grouping; the `cloud {}` block
   selects workspaces by **tag**, not by project.)
3. **Create three workspaces** (New → Workspace → **CLI-Driven workflow**). The
   names must be **exactly** these — the CI selects each via `TF_WORKSPACE`, so
   a missing prefix (e.g. `-staging` instead of `intelliflow-crm-staging`) will
   not match:
   - `intelliflow-crm-dev`
   - `intelliflow-crm-staging`
   - `intelliflow-crm-production`

   For each: Settings → General → **Execution Mode = Local**. (Local mode = HCP
   only _stores the state_; the GitHub runner executes Terraform. This avoids
   uploading provider credentials into HCP.) Then **add the tag
   `intelliflow-crm`** to each workspace (Overview → Tags → Manage Tags, or
   Settings → Tags). This tag is **required** — the
   `workspaces { tags = ["intelliflow-crm"] }` block in `providers.tf` finds the
   workspaces _by this tag_; without it `terraform init` reports no matching
   workspaces.

4. **Create an API token** → User Settings → Tokens → **Create an API token** (a
   _user_ token is fine; a _team_ token is better for CI). Copy it.
5. **Add it as a GitHub Actions secret** named **`TF_API_TOKEN`** (repo →
   Settings → Secrets and variables → Actions → New repository secret).

## Local development

```bash
terraform login                 # paste the same token (or a personal one)
cd infra/terraform
export TF_WORKSPACE=intelliflow-crm-dev
terraform init                  # connects to HCP, pulls/creates state
terraform plan
```

## What this PR wires (the code side)

- `infra/terraform/providers.tf`: `cloud {}` block (org `Leangency`, workspaces
  tagged `intelliflow-crm`).
- `.github/workflows/terraform.yml`: authenticates with `TF_API_TOKEN`, selects
  the workspace per environment via `TF_WORKSPACE`, and drops the AWS credential
  steps.
- The old `backend.tf.example` (S3) is replaced by this HCP guidance.

## Still required for a _green_ `terraform plan` (next: INFRA-TF-004)

The HCP backend fixes the _state/credentials-for-state_ failure. A full green
`plan` also needs the **provider credentials** (Vercel / Railway / Supabase API
tokens) and the **variable values** (`environments/{env}/terraform.tfvars`),
which are the remainder of INFRA-TF-004. Add those as `TF_VAR_*` secrets +
tfvars in that task; then `plan` runs end-to-end.
