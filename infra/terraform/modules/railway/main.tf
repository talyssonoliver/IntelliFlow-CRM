# Railway Infrastructure Module
# Manages backend services (API, AI Worker)

locals {
  project_name_full = "${var.project_name}-${var.environment}"
}

# Railway Project
resource "railway_project" "main" {
  name        = local.project_name_full
  description = "IntelliFlow CRM ${var.environment} environment"

  # Default environment
  default_environment = var.environment
}

# Railway Environment
resource "railway_environment" "main" {
  project_id = railway_project.main.id
  name       = var.environment
}

# Railway Services
resource "railway_service" "services" {
  for_each = var.services

  project_id     = railway_project.main.id
  environment_id = railway_environment.main.id
  name           = each.key

  # Source configuration (Docker image)
  source = {
    image = each.value.image
  }

  # Resource allocation
  config = {
    replicas = each.value.replicas
    resources = {
      memory = each.value.memory
      cpu    = each.value.cpu
    }
  }
}

# Shared Environment Variables
resource "railway_variable" "shared" {
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

  project_id     = railway_project.main.id
  environment_id = railway_environment.main.id
  service_id     = railway_service.services[each.value.service].id
  name           = each.value.name
  value          = each.value.value
}

# Railway Deployment
resource "railway_deployment" "services" {
  for_each = var.services

  project_id     = railway_project.main.id
  environment_id = railway_environment.main.id
  service_id     = railway_service.services[each.key].id

  # Trigger deployment on config change
  triggers = {
    image    = each.value.image
    replicas = each.value.replicas
  }
}

# Custom Domains (optional)
resource "railway_custom_domain" "api" {
  count = var.api_domain != "" ? 1 : 0

  project_id     = railway_project.main.id
  environment_id = railway_environment.main.id
  service_id     = railway_service.services["api"].id
  domain         = var.api_domain
}
