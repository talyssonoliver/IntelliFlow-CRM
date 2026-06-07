# =============================================================================
# IntelliFlow CRM — Staging environment Terraform variables (COMMITTED)
# =============================================================================
# Non-sensitive configuration only. Sensitive values (Supabase access token, DB
# password, Vercel + Railway API tokens) are injected via TF_VAR_* from GitHub
# Actions secrets — never committed. See INFRA-TF-004.
# =============================================================================

environment  = "staging"
project_name = "intelliflow-crm"
region       = "us-east-1"

tags = {
  Project    = "IntelliFlow-CRM"
  ManagedBy  = "Terraform"
  Repository = "talyssonoliver/IntelliFlow-CRM"
  Team       = "Engineering"
  CostCenter = "Engineering"
  Env        = "staging"
}

# Supabase — staging does NOT manage a Supabase project (manage_project is
# derived as environment == "production", so false here). Like dev, staging is
# backed by local Docker Postgres rather than a dedicated Supabase project, since
# the free tier caps at 2 projects/org and database branching is paid. No
# supabase_project is created by a staging plan/apply. org_id/project_ref are
# production-only; set supabase_db_connection_string to target a real DB instead.
supabase_project_name = "intelliflow-crm-staging"
supabase_region       = "us-east-1"
supabase_plan         = "free"

vercel_project_name = "intelliflow-crm-staging"
vercel_framework    = "nextjs"
vercel_git_repo = {
  type = "github"
  repo = "talyssonoliver/intelliFlow-CRM"
}
vercel_domains = []

railway_project_name = "intelliflow-crm-staging"

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
    replicas = 1
    memory   = "1Gi"
    cpu      = "1"
    env_vars = {
      WORKER_CONCURRENCY = "5"
      LOG_LEVEL          = "info"
    }
  }
  # INFRA-TF-002: events/ingestion/notifications workers (#230/#259/#270).
  # Minimal free-tier footprint (512Mi / 0.5 cpu / 1 replica). DATABASE_URL,
  # NODE_ENV, OTEL/Sentry come from shared_env_vars; the rest use code defaults.
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

auth_site_url   = "http://localhost:3000"
auth_jwt_expiry = 3600

enable_monitoring      = true
enable_drift_detection = true
enable_cost_alerts     = true
cost_alert_threshold   = 1
