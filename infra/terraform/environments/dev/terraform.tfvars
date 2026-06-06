# =============================================================================
# IntelliFlow CRM — Dev environment Terraform variables (COMMITTED)
# =============================================================================
# This file holds ONLY non-sensitive configuration and is committed so CI
# (terraform plan/apply) can read it. Sensitive values — Supabase access token,
# DB password, Vercel + Railway API tokens — are NEVER stored here; they are
# injected at runtime via TF_VAR_* from GitHub Actions secrets. See the
# .gitignore negation (!environments/*/terraform.tfvars) and INFRA-TF-004.
# =============================================================================

environment  = "dev"
project_name = "intelliflow-crm"
region       = "us-east-1"

tags = {
  Project    = "IntelliFlow-CRM"
  ManagedBy  = "Terraform"
  Repository = "intelliflow/intelliflow-crm"
  Team       = "Engineering"
  CostCenter = "Engineering"
  Env        = "dev"
}

# Supabase — sensitive values via TF_VAR_supabase_access_token / TF_VAR_supabase_db_password
supabase_project_name = "intelliflow-crm-dev"
supabase_region       = "us-east-1"
supabase_plan         = "free"
# supabase_organization_id: find at app.supabase.com/org → Settings → General.
# Injected via TF_VAR_supabase_organization_id (GitHub secret SUPABASE_ORG_ID).
# supabase_project_ref: the short ref shown in the project URL (e.g. abcdefgh).
# Injected via TF_VAR_supabase_project_ref (GitHub secret SUPABASE_PROJECT_REF_DEV).
# Both default to "" which is safe for plan; required before first apply.

# Vercel
vercel_project_name = "intelliflow-crm-dev"
vercel_framework    = "nextjs"
vercel_git_repo = {
  type = "github"
  repo = "talyssonoliver/intelliFlow-CRM"
}
vercel_domains = []

# Railway — services pull GHCR images published by build-images.yml
railway_project_name = "intelliflow-crm-dev"

railway_services = {
  api = {
    image    = "ghcr.io/talyssonoliver/intelliflow-crm-api:latest"
    replicas = 1
    memory   = "512Mi"
    cpu      = "0.5"
    env_vars = {
      PORT      = "4000"
      LOG_LEVEL = "debug"
    }
  }
  ai-worker = {
    image    = "ghcr.io/talyssonoliver/intelliflow-crm-ai-worker:latest"
    replicas = 1
    memory   = "1Gi"
    cpu      = "1"
    env_vars = {
      WORKER_CONCURRENCY = "3"
      LOG_LEVEL          = "debug"
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
      LOG_LEVEL = "debug"
    }
  }
  ingestion-worker = {
    image    = "ghcr.io/talyssonoliver/intelliflow-crm-ingestion-worker:latest"
    replicas = 1
    memory   = "512Mi"
    cpu      = "0.5"
    env_vars = {
      LOG_LEVEL = "debug"
    }
  }
  notifications-worker = {
    image    = "ghcr.io/talyssonoliver/intelliflow-crm-notifications-worker:latest"
    replicas = 1
    memory   = "512Mi"
    cpu      = "0.5"
    env_vars = {
      LOG_LEVEL = "debug"
    }
  }
}

# Extensions / auth
enable_pgvector = true
enable_realtime = true

auth_site_url   = "https://dev.intelliflow-crm.example"
auth_jwt_expiry = 3600

# Observability + cost guardrails (kept low for dev)
enable_monitoring      = true
enable_drift_detection = true
enable_cost_alerts     = true
cost_alert_threshold   = 1
