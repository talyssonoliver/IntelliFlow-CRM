# Global Variables
variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "project_name" {
  description = "Project name prefix for all resources"
  type        = string
  default     = "intelliflow-crm"
}

variable "region" {
  description = "Primary deployment region"
  type        = string
  default     = "iad1"
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default = {
    Project    = "IntelliFlow-CRM"
    ManagedBy  = "Terraform"
    Repository = "talyssonoliver/IntelliFlow-CRM"
  }
}

# Supabase Variables
variable "supabase_access_token" {
  description = "Supabase Personal Access Token"
  type        = string
  sensitive   = true
}

variable "supabase_organization_id" {
  description = "Supabase organization ID (required by supabase_project resource; find it in app.supabase.com/org)"
  type        = string
  default     = ""
}

variable "supabase_project_ref" {
  description = "Existing Supabase project reference (e.g. abcdefghijklmnop). Used for import-based drift detection. Empty is safe for plan; import before first apply."
  type        = string
  default     = ""
}

variable "supabase_project_name" {
  description = "Supabase project name"
  type        = string
  default     = "intelliflow-crm"
}

variable "supabase_region" {
  description = "Supabase project region"
  type        = string
  default     = "eu-central-1"
}

variable "supabase_db_pooler_host" {
  description = "Supabase transaction-pooler host for DATABASE_URL (serverless). Empty derives aws-0-<region>.pooler.supabase.com; set to the project's exact pooler host (from the Supabase dashboard / the live DATABASE_URL) so apply matches it exactly and doesn't cause drift."
  type        = string
  default     = ""
}

variable "supabase_db_password" {
  description = "Supabase database password"
  type        = string
  sensitive   = true
}

variable "supabase_db_connection_string" {
  description = "Override for DATABASE_URL (transaction pooler). For dev/staging on local Docker Postgres, set the Docker URL here; for production leave empty so the module derives the pooler URL from the managed Supabase project."
  type        = string
  default     = ""
  sensitive   = true
}

variable "supabase_db_direct_connection_string" {
  description = "Override for DIRECT_URL (direct port 5432, Prisma migrations). For dev/staging on Docker set the Docker URL; production leaves empty to derive from the managed project."
  type        = string
  default     = ""
  sensitive   = true
}

variable "supabase_plan" {
  description = "Supabase plan (free, pro, team, enterprise)"
  type        = string
  default     = "free"

  validation {
    condition     = contains(["free", "pro", "team", "enterprise"], var.supabase_plan)
    error_message = "Supabase plan must be free, pro, team, or enterprise."
  }
}

# Vercel Variables
variable "vercel_api_token" {
  description = "Vercel API token"
  type        = string
  sensitive   = true
}

variable "vercel_project_name" {
  description = "Vercel project name"
  type        = string
  default     = "intelliflow-crm"
}

variable "vercel_framework" {
  description = "Framework preset for Vercel"
  type        = string
  default     = "nextjs"
}

variable "vercel_git_repo" {
  description = "Git repository for Vercel deployment"
  type = object({
    type = string
    repo = string
  })
  default = {
    type = "github"
    repo = "talyssonoliver/IntelliFlow-CRM"
  }
}

variable "vercel_domains" {
  description = "Custom domains for Vercel project"
  type        = list(string)
  default     = []
}

# Railway Variables
variable "railway_token" {
  description = "Railway API token"
  type        = string
  sensitive   = true
}

variable "railway_project_name" {
  description = "Railway project name"
  type        = string
  default     = "intelliflow-crm"
}

variable "railway_services" {
  description = "Railway services configuration"
  type = map(object({
    image    = string
    replicas = number
    memory   = string
    cpu      = string
    env_vars = map(string)
  }))
  default = {
    api = {
      image    = "ghcr.io/talyssonoliver/intelliflow-crm-api:latest"
      replicas = 1
      memory   = "512Mi"
      cpu      = "0.5"
      env_vars = {}
    }
    ai-worker = {
      image    = "ghcr.io/talyssonoliver/intelliflow-crm-ai-worker:latest"
      replicas = 1
      memory   = "1Gi"
      cpu      = "1"
      env_vars = {}
    }
  }
}

# Database Configuration
variable "enable_pgvector" {
  description = "Enable pgvector extension for vector similarity search"
  type        = bool
  default     = true
}

variable "enable_realtime" {
  description = "Enable Supabase Realtime subscriptions"
  type        = bool
  default     = true
}

# Authentication Configuration
variable "auth_site_url" {
  description = "Site URL for authentication redirects"
  type        = string
  default     = ""
}

variable "auth_jwt_expiry" {
  description = "JWT token expiry in seconds"
  type        = number
  default     = 3600
}

# Storage Configuration
variable "storage_buckets" {
  description = "Storage buckets configuration"
  type = map(object({
    public             = bool
    file_size_limit    = string
    allowed_mime_types = list(string)
  }))
  default = {
    documents = {
      public             = false
      file_size_limit    = "50MiB"
      allowed_mime_types = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    }
    images = {
      public             = true
      file_size_limit    = "10MiB"
      allowed_mime_types = ["image/png", "image/jpeg", "image/webp"]
    }
  }
}

# Feature Flags
variable "enable_monitoring" {
  description = "Enable monitoring and observability stack"
  type        = bool
  default     = true
}

variable "enable_drift_detection" {
  description = "Enable automated drift detection"
  type        = bool
  default     = true
}

variable "drift_check_schedule" {
  description = "Cron schedule for drift detection (default: daily at 8 AM UTC)"
  type        = string
  default     = "0 8 * * *"
}

# Cost Management
variable "enable_cost_alerts" {
  description = "Enable cost monitoring alerts"
  type        = bool
  default     = true
}

variable "cost_alert_threshold" {
  description = "Monthly cost alert threshold in USD"
  type        = number
  default     = 100
}

# Observability (consumed by the monitoring module + injected into services)
variable "sentry_dsn" {
  description = "Sentry DSN injected into deployed services (via TF_VAR_sentry_dsn from the SENTRY_DSN secret). Empty disables Sentry at the service."
  type        = string
  default     = ""
  sensitive   = true
}

variable "otel_exporter_endpoint" {
  description = "OTLP collector endpoint for OpenTelemetry export. Empty (default) = no collector yet; services use their console/disabled exporter. No value is fabricated."
  type        = string
  default     = ""
}

variable "observability_managed_services" {
  description = "Live Railway services to bring under TF management for OBSERVABILITY only (#314) — sets SENTRY_DSN/SENTRY_ENVIRONMENT/OTEL_* at the service level without touching their other live vars. Empty (default) = none (current behaviour: only the 3 new workers get observability via shared_env_vars). Set to [\"api\", \"ai-worker\"] in prod once the hand-set SENTRY_DSN/SENTRY_ENVIRONMENT are imported."
  type        = list(string)
  default     = []
}

# ---------------------------------------------------------------------------
# Tier-0 production application secrets (issue #315)
# ---------------------------------------------------------------------------
# Every variable below is boot- or decrypt-required in PRODUCTION — an empty
# value crashes the consuming service exactly like an absent one (e.g.
# PRISMA_FIELD_ENCRYPTION_KEY hard-throws at module load). They default to ""
# so dev/staging plans and `terraform validate` don't break; the `check
# "tier0_secrets_present"` block (checks.tf) fails the PRODUCTION plan loudly if
# any is empty. Set the REAL values as sensitive HCP workspace variables (or
# TF_VAR_*) before any prod apply — never commit them.

variable "prisma_field_encryption_key" {
  description = "32-byte base64 field-encryption key. packages/db client.ts hard-throws in prod without it. Consumed by api, ai-worker, workers, web."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ai_audit_signing_key" {
  description = "HMAC signing key for the AI audit trail. apps/api container.ts throws at module load in prod without it. Consumed by api, web."
  type        = string
  default     = ""
  sensitive   = true
}

variable "litellm_master_key" {
  description = "LiteLLM proxy master key. ai-worker llm-factory _assertProdKey() throws if missing or the dev placeholder in prod. Consumed by ai-worker."
  type        = string
  default     = ""
  sensitive   = true
}

variable "litellm_base_url" {
  description = "LiteLLM proxy base URL (e.g. https://litellm.railway.internal). ai-worker requiredProdEnv() throws when AI_PROVIDER=litellm and it's unset. Non-secret URL."
  type        = string
  default     = ""
}

variable "redis_host" {
  description = "Managed Redis host for BullMQ/cache. Falls back to localhost (=connection failure) in Railway if unset. Consumed by api, ai-worker, workers. Non-secret."
  type        = string
  default     = ""
}

variable "redis_port" {
  description = "Managed Redis port (often 6380 for TLS). Pairs with redis_host. Non-secret."
  type        = string
  default     = ""
}

variable "redis_password" {
  description = "Managed Redis password — required by Railway Redis/Upstash. Absent = unauthenticated connection rejected. Consumed by api, ai-worker, workers."
  type        = string
  default     = ""
  sensitive   = true
}

variable "redis_tls" {
  description = "Whether queue connections use TLS (managed Redis requires it). Set 'true' in prod. Non-secret. (Tier-1 in the audit but settable here.)"
  type        = string
  default     = "false"
}

variable "vault_token" {
  description = "DEK-seed for field encryption (security/encryption.ts). Field-decrypt throws if BOTH this and vault_local_dek_secret are absent. Consumed by api, web."
  type        = string
  default     = ""
  sensitive   = true
}

variable "vault_local_dek_secret" {
  description = "Preferred DEK seed (code comment prefers this over vault_token). Same field-decrypt guard. Consumed by api, web."
  type        = string
  default     = ""
  sensitive   = true
}

variable "gemini_api_key" {
  description = "Gemini API key. ai-worker GeminiEmbeddings throws at first embed when EMBEDDING_PROVIDER=gemini. Must be in HCP before the Ai-worker-fix PR merges. Consumed by ai-worker."
  type        = string
  default     = ""
  sensitive   = true
}

variable "openrouter_api_key" {
  description = "OpenRouter API key. ai-worker returns 401 on every LLM request when AI_PROVIDER=openrouter and it's unset. Consumed by ai-worker."
  type        = string
  default     = ""
  sensitive   = true
}
