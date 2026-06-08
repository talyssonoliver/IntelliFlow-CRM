# =============================================================================
# IntelliFlow CRM — Production environment Terraform variables (COMMITTED)
# =============================================================================
# Non-sensitive configuration only. Sensitive values (Supabase access token, DB
# password, Vercel + Railway API tokens) are injected via TF_VAR_* from GitHub
# Actions secrets (the *_PROD secret set) — never committed. See INFRA-TF-004.
#
# NOTE: production plan/apply read the *_PROD secrets (SUPABASE_ACCESS_TOKEN_PROD,
# VERCEL_API_TOKEN_PROD, RAILWAY_TOKEN_PROD, DB_PASSWORD_PROD). Provision those
# in repo Settings → Secrets before the production workflow can authenticate.
# =============================================================================

environment  = "production"
project_name = "intelliflow-crm"
region       = "iad1"

tags = {
  Project    = "IntelliFlow-CRM"
  ManagedBy  = "Terraform"
  Repository = "talyssonoliver/IntelliFlow-CRM"
  Team       = "Engineering"
  CostCenter = "Engineering"
  Env        = "production"
}

# Stays on the free Supabase plan to keep the initiative cost-free; bump to
# "pro" here when production traffic warrants it.
supabase_project_name = "Intelliflow"
# Must match the LIVE project region — the prod project is in eu-central-1.
# Supabase region is immutable; a mismatch makes plan want to change it (apply
# errors / forces destroy-recreate). supabase_project also ignore_changes=[region].
supabase_region = "eu-central-1"
supabase_plan   = "free"
# Production is the ONLY environment that manages a Supabase project
# (manage_project = environment == "production"). Before the first apply, import
# the existing project so Terraform adopts it instead of creating a new one
# (the resource is count-gated, so the address carries [0]):
#   terraform import module.supabase.supabase_project.main[0] <project-ref>
# supabase_organization_id + supabase_project_ref injected via TF_VAR_* secrets
# (SUPABASE_ORG_ID, SUPABASE_PROJECT_REF_PROD). Both required before apply.

vercel_project_name = "intelli-flow-crm-web"
vercel_framework    = "nextjs"
vercel_git_repo = {
  type = "github"
  repo = "talyssonoliver/IntelliFlow-CRM"
}
vercel_domains = []

railway_project_name = "intelliflow-crm-dev"

railway_services = {
  api = {
    image    = "ghcr.io/talyssonoliver/intelliflow-crm-api:latest"
    replicas = 2
    memory   = "1Gi"
    cpu      = "1"
    # env_vars intentionally empty: the api service is ALREADY running live with
    # its variables set on Railway. Terraform did not import those railway_variable
    # resources, so it must not declare them here — setting PORT=4000 could clash
    # with Railway's auto-assigned port, and any drift would fight the live service.
    # Only the 3 NEW workers (below) get Terraform-managed env_vars.
    env_vars = {}
  }
  ai-worker = {
    image    = "ghcr.io/talyssonoliver/intelliflow-crm-ai-worker:latest"
    replicas = 2
    memory   = "1Gi"
    cpu      = "1"
    # env_vars intentionally empty — see api note above. ai-worker is live; leave
    # its variables untouched.
    env_vars = {}
  }
  # INFRA-TF-002: events/ingestion/notifications workers (#230/#259/#270).
  # Minimal free-tier footprint (512Mi / 0.5 cpu / 1 replica — even in prod,
  # per the strictly-free directive; scale up when there are paying customers).
  events-worker = {
    image    = "ghcr.io/talyssonoliver/intelliflow-crm-events-worker:latest"
    replicas = 1
    memory   = "512Mi"
    cpu      = "0.5"
    env_vars = {
      LOG_LEVEL = "info"
    }
  }
  ingestion-worker = {
    image    = "ghcr.io/talyssonoliver/intelliflow-crm-ingestion-worker:latest"
    replicas = 1
    memory   = "512Mi"
    cpu      = "0.5"
    env_vars = {
      LOG_LEVEL = "info"
    }
  }
  notifications-worker = {
    image    = "ghcr.io/talyssonoliver/intelliflow-crm-notifications-worker:latest"
    replicas = 1
    memory   = "512Mi"
    cpu      = "0.5"
    env_vars = {
      LOG_LEVEL = "info"
    }
  }
}

enable_pgvector = true
enable_realtime = true

auth_site_url   = "https://intelli-flow-crm-web.vercel.app"
auth_jwt_expiry = 3600

enable_monitoring      = true
enable_drift_detection = true
enable_cost_alerts     = true
cost_alert_threshold   = 1

# Storage buckets exist live + are managed outside Terraform (the supabase CLI
# isn't available to the runner); skip the local-exec creator.
storage_buckets = {}
