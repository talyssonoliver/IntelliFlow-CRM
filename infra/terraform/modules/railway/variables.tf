# Railway Module Variables

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment (dev, staging, production)"
  type        = string
}

variable "services" {
  description = "Service configurations"
  type = map(object({
    image    = string
    replicas = number
    memory   = string
    cpu      = string
    env_vars = map(string)
  }))
}

variable "shared_env_vars" {
  description = "Shared environment variables for all services. Not sensitive at the map level (keys needed for for_each); secret values are stored as Railway shared variables."
  type        = map(string)
  default     = {}
}

variable "service_observability_vars" {
  description = "Per-service observability env (SENTRY_DSN/SENTRY_ENVIRONMENT/OTEL_*) set at the SERVICE level on otherwise-unmanaged live services (api, ai-worker — #314). Map of service_name -> { key -> value }. Per-key railway_variable, so it never clobbers a service's other live vars. Keys must be non-sensitive at the map level (needed for for_each); secret values land as Railway variables."
  type        = map(map(string))
  default     = {}
}

variable "api_domain" {
  description = "Custom domain for API service"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
