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

  # Supabase REST API URL (used for client SDK config)
  api_url = "https://${supabase_project.main.id}.supabase.co"

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
  pooler_host = (
    var.db_pooler_host != ""
    ? var.db_pooler_host
    : "aws-0-${var.region}.pooler.supabase.com"
  )
  db_url = (
    var.db_connection_string != ""
    ? var.db_connection_string
    : "postgresql://postgres.${supabase_project.main.id}:${var.db_password}@${local.pooler_host}:6543/postgres?pgbouncer=true"
  )

  # ---------------------------------------------------------------------------
  # Direct (non-pooled) URL (direct_url / DIRECT_URL)
  # ---------------------------------------------------------------------------
  # Prisma migrations and introspection require a direct connection (no PgBouncer)
  # because they use advisory locks and session-mode features. Always direct,
  # never via the pooler.
  db_direct_url = (
    var.db_direct_connection_string != ""
    ? var.db_direct_connection_string
    : "postgresql://postgres:${var.db_password}@db.${supabase_project.main.id}.supabase.co:5432/postgres"
  )
}

# ---------------------------------------------------------------------------
# Project lifecycle (official provider)
# ---------------------------------------------------------------------------
resource "supabase_project" "main" {
  name              = local.project_name_full
  organization_id   = var.organization_id
  database_password = var.db_password
  region            = var.region

  # lifecycle.prevent_destroy guards against accidental teardown of production data.
  # ignore_changes on database_password: Supabase hashes the password internally;
  # the provider would otherwise show a perpetual diff after first apply.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [database_password]
  }
}

# ---------------------------------------------------------------------------
# API keys data source (provider-native)
# Replaces the http data source for anon_key and service_role_key.
# This data source reads from the Management API using the provider's auth;
# it requires the project to exist (imported or applied) before refresh runs.
# ---------------------------------------------------------------------------
data "supabase_apikeys" "main" {
  project_ref = supabase_project.main.id

  depends_on = [supabase_project.main]
}

# ---------------------------------------------------------------------------
# Auth + database settings (official provider)
# Replaces null_resource.auth_config + curl local-exec.
# ---------------------------------------------------------------------------
resource "supabase_settings" "main" {
  project_ref = supabase_project.main.id

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
  # Parse the jwt_secret from the Management API secrets endpoint.
  # Endpoint returns an array of {name, value} objects.
  secrets_list = (
    length(data.http.jwt_secret) > 0
    ? jsondecode(data.http.jwt_secret[0].response_body)
    : []
  )
  jwt_secret = try(
    [for s in local.secrets_list : s.value if s.name == "JWT_SECRET"][0],
    ""
  )
}

# ---------------------------------------------------------------------------
# Storage buckets — no supabase_storage_bucket provider resource yet.
# Kept as null_resource until the provider adds storage support.
# ---------------------------------------------------------------------------
resource "null_resource" "storage_buckets" {
  for_each = var.storage_buckets

  triggers = {
    bucket_name = each.key
    public      = tostring(each.value.public)
    project_ref = supabase_project.main.id
  }

  provisioner "local-exec" {
    when    = create
    command = <<-EOT
      supabase storage create ${each.key} \
        --public=${each.value.public} \
        --file-size-limit=${each.value.file_size_limit} \
        --project-ref=${supabase_project.main.id}
    EOT
  }

  depends_on = [supabase_project.main]
}

# ---------------------------------------------------------------------------
# pgvector extension — no provider resource; kept as null_resource.
# ---------------------------------------------------------------------------
resource "null_resource" "pgvector" {
  count = var.enable_pgvector ? 1 : 0

  triggers = {
    project_ref = supabase_project.main.id
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
