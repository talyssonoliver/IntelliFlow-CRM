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
  default     = "us-east-1"
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default = {
    Project     = "IntelliFlow-CRM"
    ManagedBy   = "Terraform"
    Repository  = "intelliflow/intelliflow-crm"
  }
}

# Supabase Variables
variable "supabase_access_token" {
  description = "Supabase Personal Access Token"
  type        = string
  sensitive   = true
}

variable "supabase_project_name" {
  description = "Supabase project name"
  type        = string
  default     = "intelliflow-crm"
}

variable "supabase_region" {
  description = "Supabase project region"
  type        = string
  default     = "us-east-1"
}

variable "supabase_db_password" {
  description = "Supabase database password"
  type        = string
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
    repo = "intelliflow/intelliflow-crm"
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
      image    = "ghcr.io/intelliflow/api:latest"
      replicas = 1
      memory   = "512Mi"
      cpu      = "0.5"
      env_vars = {}
    }
    ai-worker = {
      image    = "ghcr.io/intelliflow/ai-worker:latest"
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
  default     = "http://localhost:3000"
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
    public          = bool
    file_size_limit = string
    allowed_mime_types = list(string)
  }))
  default = {
    documents = {
      public          = false
      file_size_limit = "50MiB"
      allowed_mime_types = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    }
    images = {
      public          = true
      file_size_limit = "10MiB"
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
