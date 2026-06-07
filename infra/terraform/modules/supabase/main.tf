# Supabase Infrastructure Module
#
# Hybrid approach: uses the official supabase/supabase Terraform provider for
# the project lifecycle and settings (drift-detectable), plus a targeted
# data.http call for jwt_secret only — because the provider's supabase_project
# resource and data.supabase_apikeys do not expose the JWT signing secret.
#
# Resource/data-source map:
#   supabase_project          — project lifecycle (create / import / drift)
#   supabase_settings         — auth + database settings (replaces null_resource.auth_config)
#   data.supabase_apikeys     — anon_key + service_role_key (provider-native)
#   data.http (jwt only)      — jwt_secret via Management API (no provider equivalent)
#   null_resource             — storage buckets + pgvector (no provider resource yet)
#
# Import workflow (run once after PR merges, before first apply):
#   terraform import module.supabase.supabase_project.main <project-ref>
# Until imported the plan shows "create supabase_project" — EXPECTED and safe.

locals {
  project_name_full = "${var.project_name}-${var.environment}"

  # When manage_project is true, Terraform owns the supabase_project resource and
  # its id is the source of truth; otherwise (dev/staging on Docker) there is no
  # managed project and the project ref is whatever was supplied (usually empty).
  project_id = var.manage_project ? supabase_project.main[0].id : var.project_ref

  # Supabase REST API URL (used for client SDK config). Empty when unmanaged.
  api_url = var.manage_project ? "https://${supabase_project.main[0].id}.supabase.co" : ""

  # ---------------------------------------------------------------------------
  # Transaction-pooler URL (connection_string / DATABASE_URL)
  # ---------------------------------------------------------------------------
  # Supabase uses PgBouncer in transaction mode at port 6543. Serverless runtimes
  # (Vercel Edge/Node functions, Railway containers that scale to zero) MUST use
  # this URL — direct connections exhaust the Postgres connection limit quickly.
  #
  # Pooler hostname pattern: aws-0-<region>.pooler.supabase.com
  # Username is tenant-qualified: postgres.<project_ref> (dot, not colon)
  # The ?pgbouncer=true hint tells Prisma to skip prepared-statement caching.
  #
  # Resolution order: explicit override (db_connection_string, e.g. a Docker URL
  # for dev/staging) → derived Supabase pooler URL (only when a project is
  # managed) → empty.
  pooler_host = (
    var.db_pooler_host != ""
    ? var.db_pooler_host
    : "aws-0-${var.region}.pooler.supabase.com"
  )
  db_url = (
    var.db_connection_string != "" ? var.db_connection_string :
    var.manage_project ? "postgresql://postgres.${supabase_project.main[0].id}:${var.db_password}@${local.pooler_host}:6543/postgres?pgbouncer=true" :
    ""
  )

  # ---------------------------------------------------------------------------
  # Direct (non-pooled) URL (direct_url / DIRECT_URL)
  # ---------------------------------------------------------------------------
  # Prisma migrations and introspection require a direct connection (no PgBouncer)
  # because they use advisory locks and session-mode features. Always direct,
  # never via the pooler.
  db_direct_url = (
    var.db_direct_connection_string != "" ? var.db_direct_connection_string :
    var.manage_project ? "postgresql://postgres:${var.db_password}@db.${supabase_project.main[0].id}.supabase.co:5432/postgres" :
    ""
  )
}

# ---------------------------------------------------------------------------
# Project lifecycle (official provider)
# ---------------------------------------------------------------------------
resource "supabase_project" "main" {
  # Only production owns a Supabase project. dev/staging run on local Docker
  # Postgres (manage_project = false) and declare no project here.
  count = var.manage_project ? 1 : 0

  name              = local.project_name_full
  organization_id   = var.organization_id
  database_password = var.db_password
  region            = var.region

  # lifecycle.prevent_destroy guards against accidental teardown of production data.
  # ignore_changes:
  #   - database_password: Supabase hashes it internally → perpetual diff otherwise.
  #   - name + region: an IMPORTED project keeps its live name/region. region is
  #     IMMUTABLE on Supabase, so a config/live mismatch (e.g. tfvars default
  #     us-east-1 vs a live eu-central-1 project) must NOT generate a change — an
  #     applied region change errors or forces destroy/recreate (data loss). name
  #     is cosmetic and the derived value can double-suffix; leave the live name.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [database_password, name, region]
  }
}

# ---------------------------------------------------------------------------
# API keys data source (provider-native)
# Replaces the http data source for anon_key and service_role_key.
# This data source reads from the Management API using the provider's auth;
# it requires the project to exist (imported or applied) before refresh runs.
# ---------------------------------------------------------------------------
data "supabase_apikeys" "main" {
  count = var.manage_project ? 1 : 0

  project_ref = supabase_project.main[0].id

  depends_on = [supabase_project.main]
}

# ---------------------------------------------------------------------------
# Auth + database settings (official provider)
# Replaces null_resource.auth_config + curl local-exec.
# ---------------------------------------------------------------------------
resource "supabase_settings" "main" {
  count = var.manage_project ? 1 : 0

  project_ref = supabase_project.main[0].id

  auth = jsonencode({
    site_url   = var.auth_site_url
    jwt_expiry = var.auth_jwt_expiry
  })

  depends_on = [supabase_project.main]
}

# ---------------------------------------------------------------------------
# JWT secret — Management API HTTP data source (provider gap).
# The supabase/supabase provider v1.9.x does NOT expose the JWT signing secret
# on supabase_project or any data source. The http data source is the only
# Terraform-native path. It is gated on project_ref being set (i.e. known) so
# that plan does not make a live HTTP call against a placeholder id.
# ---------------------------------------------------------------------------
data "http" "jwt_secret" {
  # Only fetch once the project ref is a real, non-empty id.
  # During a first-time plan (no state, project not yet imported) the
  # project_ref var will be empty and count=0 — jwt_secret output will be "".
  count = var.project_ref != "" ? 1 : 0

  url = "https://api.supabase.com/v1/projects/${var.project_ref}/config/secrets"

  request_headers = {
    Authorization = "Bearer ${var.access_token}"
  }
}

locals {
  # JWT secret via the Management API — best-effort. The official provider does
  # not expose it and there is no stable secrets endpoint (the call may 404), so
  # decode defensively: if the data source is gated off (count = 0), returns a
  # non-2xx/error body, or is otherwise not a JSON array of {name, value} objects,
  # jwt_secret resolves to "". The previous `length(...) > 0 ? jsondecode(body) :
  # []` crashed with "Inconsistent conditional result types" the moment `body` was
  # the 404 error object (object) instead of an array (tuple) — which only
  # surfaces at plan time against a real ref, so validate + CI never caught it.
  jwt_secret = try(
    [for s in jsondecode(data.http.jwt_secret[0].response_body) : s.value if s.name == "JWT_SECRET"][0],
    ""
  )
}

# ---------------------------------------------------------------------------
# Storage buckets — no supabase_storage_bucket provider resource yet.
# Kept as null_resource until the provider adds storage support.
# ---------------------------------------------------------------------------
resource "null_resource" "storage_buckets" {
  # Only when a Supabase project is managed (production). dev/staging buckets,
  # if any, are created against the local stack outside Terraform.
  for_each = var.manage_project ? var.storage_buckets : {}

  triggers = {
    bucket_name = each.key
    public      = tostring(each.value.public)
    project_ref = supabase_project.main[0].id
  }

  provisioner "local-exec" {
    when    = create
    command = <<-EOT
      supabase storage create ${each.key} \
        --public=${each.value.public} \
        --file-size-limit=${each.value.file_size_limit} \
        --project-ref=${supabase_project.main[0].id}
    EOT
  }

  depends_on = [supabase_project.main]
}

# ---------------------------------------------------------------------------
# pgvector extension — no provider resource; kept as null_resource.
# ---------------------------------------------------------------------------
resource "null_resource" "pgvector" {
  # Production only. On dev/staging Docker Postgres pgvector is provisioned by the
  # compose init.sql (pgvector/pgvector:pg16 image), not Terraform.
  count = var.manage_project && var.enable_pgvector ? 1 : 0

  triggers = {
    project_ref = supabase_project.main[0].id
  }

  provisioner "local-exec" {
    when = create
    command = (
      var.db_connection_string != ""
      ? "echo 'Run: CREATE EXTENSION IF NOT EXISTS vector;' | psql ${var.db_connection_string}"
      : "echo 'pgvector: db_connection_string not set; run extension creation manually'"
    )
  }

  depends_on = [supabase_project.main]
}
