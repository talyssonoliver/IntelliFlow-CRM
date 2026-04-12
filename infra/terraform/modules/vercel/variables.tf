# Vercel Module Variables

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment (dev, staging, production)"
  type        = string
}

variable "framework" {
  description = "Framework preset"
  type        = string
  default     = "nextjs"
}

variable "git_repository" {
  description = "Git repository configuration"
  type = object({
    type = string
    repo = string
  })
  default = null
}

# Build Configuration
variable "build_command" {
  description = "Build command override"
  type        = string
  default     = null
}

variable "output_directory" {
  description = "Output directory override"
  type        = string
  default     = null
}

variable "install_command" {
  description = "Install command override"
  type        = string
  default     = null
}

variable "root_directory" {
  description = "Root directory for monorepo"
  type        = string
  default     = null
}

# Domains
variable "domains" {
  description = "Custom domains"
  type        = list(string)
  default     = []
}

variable "apex_domain" {
  description = "Apex domain for redirects"
  type        = string
  default     = ""
}

variable "redirect_www" {
  description = "Redirect www to apex domain"
  type        = bool
  default     = true
}

# Environment Variables
variable "environment_variables" {
  description = "Environment variables for all targets"
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "environment_specific_vars" {
  description = "Environment-specific variables"
  type        = map(string)
  default     = {}
  sensitive   = true
}

# Region
variable "region" {
  description = "Serverless function region"
  type        = string
  default     = "iad1"
}

# Edge Config
variable "enable_edge_config" {
  description = "Enable Edge Config for feature flags"
  type        = bool
  default     = false
}

variable "edge_config_items" {
  description = "Edge Config items"
  type        = map(any)
  default     = {}
}

# Webhooks
variable "enable_deploy_hook" {
  description = "Enable deployment webhook"
  type        = bool
  default     = false
}

variable "webhook_url" {
  description = "Webhook URL for deployment notifications"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
