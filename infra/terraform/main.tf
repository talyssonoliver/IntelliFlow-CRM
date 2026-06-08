# IntelliFlow CRM - Main Terraform Configuration
# This file orchestrates all infrastructure modules

locals {
  # Common tags applied to all resources
  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
  })

  # Full project name with environment suffix
  full_project_name = "${var.project_name}-${var.environment}"
}

# Supabase Module
# Uses the official supabase/supabase provider for project lifecycle, settings,
# and API key retrieval. jwt_secret is still fetched via HTTP (provider gap).
module "supabase" {
  source = "./modules/supabase"

  project_name    = var.supabase_project_name
  environment     = var.environment
  region          = var.supabase_region
  access_token    = var.supabase_access_token
  organization_id = var.supabase_organization_id
  project_ref     = var.supabase_project_ref
  db_password     = var.supabase_db_password
  db_pooler_host  = var.supabase_db_pooler_host
  plan            = var.supabase_plan

  # Only production owns a Supabase project; dev/staging run on local Docker
  # Postgres (see docker-compose.yml, pgvector/pgvector:pg16). This keeps a
  # dev/staging plan/apply from ever creating a Supabase project (free tier is
  # capped at 2 projects/org and Supabase branching is a paid feature).
  manage_project              = var.environment == "production"
  db_connection_string        = var.supabase_db_connection_string
  db_direct_connection_string = var.supabase_db_direct_connection_string

  # Extensions
  enable_pgvector = var.enable_pgvector
  enable_realtime = var.enable_realtime

  # Authentication
  auth_site_url   = var.auth_site_url
  auth_jwt_expiry = var.auth_jwt_expiry

  # Storage
  storage_buckets = var.storage_buckets

  tags = local.common_tags
}

# Vercel Module
# Manages frontend (Next.js) deployment
module "vercel" {
  source = "./modules/vercel"

  project_name = var.vercel_project_name
  environment  = var.environment
  framework    = var.vercel_framework

  # Monorepo build configuration (matches live Vercel project settings)
  root_directory  = "apps/web"
  build_command   = "cd ../.. && pnpm exec turbo run build --filter=@intelliflow/web"
  install_command = "cd ../.. && pnpm install --frozen-lockfile"

  # Git integration
  git_repository = var.vercel_git_repo

  # Custom domains
  domains = var.vercel_domains

  # Environment variables from Supabase + observability (monitoring module)
  environment_variables = merge({
    # Supabase connection
    NEXT_PUBLIC_SUPABASE_URL      = module.supabase.api_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY = module.supabase.anon_key
    SUPABASE_SERVICE_ROLE_KEY     = module.supabase.service_role_key

    # Database — SERVERLESS pooler URL (connection_limit=1, issue #312) for
    # Vercel functions; direct URL for Prisma migrations.
    DATABASE_URL = module.supabase.connection_string_serverless
    DIRECT_URL   = module.supabase.direct_url

    # Build configuration
    NODE_ENV                = var.environment == "production" ? "production" : "development"
    NEXT_TELEMETRY_DISABLED = "1"

    # Sentry DSN (sensitive value; injected like the Supabase keys above)
    SENTRY_DSN = var.sentry_dsn

    # NOTE: PRISMA_FIELD_ENCRYPTION_KEY and AI_AUDIT_SIGNING_KEY already exist on
    # the live Vercel project (the web has always had them), so they are NOT
    # declared here — Terraform-creating them errors ENV_ALREADY_EXISTS. They stay
    # web-managed; vault_* unused (EnvironmentKeyProvider). issue #315.
  }, module.monitoring.observability_env)

  tags = local.common_tags
}

# Railway Module
# Manages backend services (API, AI Worker)
module "railway" {
  source = "./modules/railway"

  project_name = var.railway_project_name
  environment  = var.environment

  # Services configuration
  services = var.railway_services

  # Shared environment variables + observability (monitoring module)
  shared_env_vars = merge({
    # Supabase connection — SESSION pooler (5432) for these long-running services
    # (real pool + session features), matching the live api/ai-worker/ws. The new
    # workers inherit this rather than the transaction pooler (6543).
    DATABASE_URL              = module.supabase.connection_string_session
    DIRECT_URL                = module.supabase.connection_string_session
    SUPABASE_URL              = module.supabase.api_url
    SUPABASE_ANON_KEY         = module.supabase.anon_key
    SUPABASE_SERVICE_ROLE_KEY = module.supabase.service_role_key

    # Application
    NODE_ENV    = var.environment == "production" ? "production" : "development"
    ENVIRONMENT = var.environment

    # Vercel (for API callbacks)
    FRONTEND_URL = module.vercel.url

    # Sentry DSN (sensitive value; injected like the Supabase keys above)
    SENTRY_DSN = var.sentry_dsn

    # --- Tier-0 application secrets (issue #315) ---
    # Boot/decrypt-required in prod; an empty value crash-boots the service.
    # Shared across api + ai-worker + the 3 workers (a service that doesn't read
    # a given key simply ignores it — harmless, and avoids per-service env_vars).
    # litellm_* and vault_* are intentionally NOT wired: they are conditional
    # (AI_PROVIDER=litellm / VAULT_ENABLED=true), unused in the current config, and
    # would otherwise be injected EMPTY across the fleet. Wire them only if those
    # paths are enabled (see the conditional note in checks.tf).
    PRISMA_FIELD_ENCRYPTION_KEY = var.prisma_field_encryption_key
    AI_AUDIT_SIGNING_KEY        = var.ai_audit_signing_key
    REDIS_HOST                  = var.redis_host
    REDIS_PORT                  = var.redis_port
    REDIS_PASSWORD              = var.redis_password
    REDIS_TLS                   = var.redis_tls
    GEMINI_API_KEY              = var.gemini_api_key
    OPENROUTER_API_KEY          = var.openrouter_api_key
  }, module.monitoring.observability_env)

  # Service-level observability for the otherwise-unmanaged live services
  # (api, ai-worker — #314). They keep env_vars = {} (so the full shared_env_vars
  # are NOT pushed onto them), but Railway shared vars aren't auto-injected — so
  # observability never reaches them. Set ONLY the observability keys at the
  # service level (per-key, leaves their other live vars untouched). SENTRY_DSN is
  # sensitive (from var.sentry_dsn); OTEL_*/SENTRY_ENVIRONMENT come from the
  # monitoring module. SENTRY_DSN + SENTRY_ENVIRONMENT are hand-set today → import
  # them before the first apply (see modules/railway/main.tf observability note).
  service_observability_vars = {
    for svc in var.observability_managed_services : svc => merge(
      module.monitoring.observability_env,
      { SENTRY_DSN = var.sentry_dsn },
    )
  }

  tags = local.common_tags
}

# Monitoring / Observability-as-code Module
# Computes the observability env injected into the Vercel + Railway services
# above and renders a tracked monitoring manifest. Provider-light (local only),
# so it never needs credentials and is always safe to plan.
module "monitoring" {
  source = "./modules/monitoring"

  environment  = var.environment
  project_name = var.project_name

  enable_monitoring      = var.enable_monitoring
  enable_drift_detection = var.enable_drift_detection
  drift_check_schedule   = var.drift_check_schedule
  enable_cost_alerts     = var.enable_cost_alerts
  cost_alert_threshold   = var.cost_alert_threshold

  otel_exporter_endpoint = var.otel_exporter_endpoint

  tags = local.common_tags
}

# Random password for database (if not provided)
resource "random_password" "db_master_password" {
  count = var.supabase_db_password == "" ? 1 : 0

  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Local file for environment variables (for local development)
resource "local_file" "env_template" {
  filename = "${path.root}/../../.env.example"
  content = templatefile("${path.module}/templates/env.tpl", {
    supabase_url          = module.supabase.api_url
    supabase_anon_key     = module.supabase.anon_key
    supabase_service_role = module.supabase.service_role_key
    database_url          = module.supabase.connection_string
    direct_url            = module.supabase.direct_url
    vercel_url            = module.vercel.url
    railway_api_url       = module.railway.api_url
    environment           = var.environment
  })

  file_permission = "0644"
}
