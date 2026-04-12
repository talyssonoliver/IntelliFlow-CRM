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
  description = "Shared environment variables for all services"
  type        = map(string)
  default     = {}
  sensitive   = true
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
