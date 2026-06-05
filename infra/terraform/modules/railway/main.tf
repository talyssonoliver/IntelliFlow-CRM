# Railway Infrastructure Module
# Manages backend services (API, AI Worker)

locals {
  project_name_full = "${var.project_name}-${var.environment}"
}

# Railway Project
resource "railway_project" "main" {
  name        = local.project_name_full
  description = "IntelliFlow CRM ${var.environment} environment"

  # Default environment — provider >=0.3 expects an object, not a string.
  default_environment = {
    name = var.environment
  }
}

# Railway Environment
resource "railway_environment" "main" {
  project_id = railway_project.main.id
  name       = var.environment
}

# Railway Services
# NOTE (provider >=0.3): railway_service no longer takes environment_id, a
# `source {}` block, or a `config {}` block. The image is `source_image`;
# replicas/cpu/memory are set per-environment in Railway (not on the service
# resource) — var.services keeps those fields for documentation + future use.
resource "railway_service" "services" {
  for_each = var.services

  project_id   = railway_project.main.id
  name         = each.key
  source_image = each.value.image
}

# Shared Environment Variables (provider >=0.3: project-level shared vars use
# railway_shared_variable, not railway_variable which is service-scoped).
resource "railway_shared_variable" "shared" {
  for_each = var.shared_env_vars

  project_id     = railway_project.main.id
  environment_id = railway_environment.main.id
  name           = each.key
  value          = each.value
}

# Service-specific Environment Variables
resource "railway_variable" "service_specific" {
  for_each = merge([
    for service_name, service_config in var.services : {
      for var_name, var_value in service_config.env_vars :
      "${service_name}:${var_name}" => {
        service = service_name
        name    = var_name
        value   = var_value
      }
    }
  ]...)

  # project_id is read-only on railway_variable (derived from service+environment).
  environment_id = railway_environment.main.id
  service_id     = railway_service.services[each.value.service].id
  name           = each.value.name
  value          = each.value.value
}

# NOTE: railway_deployment was removed from the provider (>=0.3). Deployments are
# triggered by `railway up` / the service's source config, not a TF resource.

# Custom Domains (optional)
resource "railway_custom_domain" "api" {
  count = var.api_domain != "" ? 1 : 0

  # project_id is read-only on railway_custom_domain (derived from the service).
  environment_id = railway_environment.main.id
  service_id     = railway_service.services["api"].id
  domain         = var.api_domain
}
