# Supabase Module Variables

variable "project_name" {
  description = "Supabase project name"
  type        = string
}

variable "environment" {
  description = "Environment (dev, staging, production)"
  type        = string
}

variable "region" {
  description = "Supabase region (e.g. us-east-1, eu-west-1)"
  type        = string
  default     = "us-east-1"
}

variable "organization_id" {
  description = "Supabase organization ID (required by supabase_project resource)"
  type        = string
}

variable "access_token" {
  description = "Supabase Personal Access Token (used by the provider + HTTP data source)"
  type        = string
  sensitive   = true
}

variable "project_ref" {
  description = <<-EOT
    Existing Supabase project reference ID. When non-empty the project
    lifecycle is managed via import (run once: terraform import
    module.supabase.supabase_project.main <ref>). When empty a new project
    resource is declared but a real create would require apply — plan only
    shows a 'create' intent, which is expected in a fresh-state context.
  EOT
  type        = string
  default     = ""
}

variable "db_password" {
  description = "Database password for the Supabase project"
  type        = string
  sensitive   = true
}

variable "db_connection_string" {
  description = <<-EOT
    Override for the transaction-pooler DATABASE_URL. When non-empty this value
    is returned as connection_string and no URL is derived. Leave empty to let
    the module compute the standard Supabase transaction-pooler URL.
  EOT
  type        = string
  default     = ""
  sensitive   = true
}

variable "db_direct_connection_string" {
  description = <<-EOT
    Override for the direct (non-pooled) DIRECT_URL used by Prisma migrations.
    When non-empty this value is returned as direct_url. Leave empty to let the
    module compute the standard Supabase direct connection URL.
  EOT
  type        = string
  default     = ""
  sensitive   = true
}

variable "db_pooler_host" {
  description = <<-EOT
    Supabase transaction-pooler hostname. Defaults to the standard AWS pattern
    aws-0-<region>.pooler.supabase.com. Override with the exact host shown in
    your Supabase project → Settings → Database → Connection pooling.
  EOT
  type        = string
  default     = ""
}

variable "plan" {
  description = "Supabase plan (free, pro, team, enterprise) — informational only; plan changes require manual action via the dashboard"
  type        = string
  default     = "free"
}

# Features
variable "enable_pgvector" {
  description = "Enable pgvector extension"
  type        = bool
  default     = true
}

variable "enable_realtime" {
  description = "Enable Realtime subscriptions"
  type        = bool
  default     = true
}

# Authentication
variable "auth_site_url" {
  description = "Site URL for auth redirects"
  type        = string
}

variable "auth_jwt_expiry" {
  description = "JWT expiry in seconds"
  type        = number
  default     = 3600
}

# Storage
variable "storage_buckets" {
  description = "Storage buckets configuration"
  type = map(object({
    public             = bool
    file_size_limit    = string
    allowed_mime_types = list(string)
  }))
  default = {}
}

variable "tags" {
  description = "Resource tags (informational; Supabase does not support resource-level tags via Terraform)"
  type        = map(string)
  default     = {}
}
