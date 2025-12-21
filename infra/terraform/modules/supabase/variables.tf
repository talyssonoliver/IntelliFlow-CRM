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
  description = "Supabase region"
  type        = string
  default     = "us-east-1"
}

variable "access_token" {
  description = "Supabase Management API access token"
  type        = string
  sensitive   = true
}

variable "project_ref" {
  description = "Existing Supabase project reference (for import)"
  type        = string
  default     = ""
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "db_connection_string" {
  description = "Full database connection string"
  type        = string
  default     = ""
  sensitive   = true
}

variable "plan" {
  description = "Supabase plan (free, pro, team, enterprise)"
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
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
