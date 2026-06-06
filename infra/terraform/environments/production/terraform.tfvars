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
region       = "us-east-1"

tags = {
  Project    = "IntelliFlow-CRM"
  ManagedBy  = "Terraform"
  Repository = "intelliflow/intelliflow-crm"
  Team       = "Engineering"
  CostCenter = "Engineering"
  Env        = "production"
}

# Stays on the free Supabase plan to keep the initiative cost-free; bump to
# "pro" here when production traffic warrants it.
supabase_project_name = "intelliflow-crm-production"
supabase_region       = "us-east-1"
supabase_plan         = "free"

vercel_project_name = "intelliflow-crm-production"
vercel_framework    = "nextjs"
vercel_git_repo = {
  type = "github"
  repo = "talyssonoliver/intelliFlow-CRM"
}
vercel_domains = []

railway_project_name = "intelliflow-crm-production"

railway_services = {
  api = {
    image    = "ghcr.io/talyssonoliver/intelliflow-crm-api:latest"
    replicas = 2
    memory   = "1Gi"
    cpu      = "1"
    env_vars = {
      PORT      = "4000"
      LOG_LEVEL = "info"
    }
  }
  ai-worker = {
    image    = "ghcr.io/talyssonoliver/intelliflow-crm-ai-worker:latest"
    replicas = 2
    memory   = "1Gi"
    cpu      = "1"
    env_vars = {
      WORKER_CONCURRENCY = "5"
      LOG_LEVEL          = "info"
    }
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

auth_site_url   = "https://app.intelliflow-crm.example"
auth_jwt_expiry = 3600

enable_monitoring      = true
enable_drift_detection = true
enable_cost_alerts     = true
cost_alert_threshold   = 1
