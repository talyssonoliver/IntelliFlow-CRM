# Railway Infrastructure Module
# Manages backend services (API, AI Worker)

locals {
  project_name_full = "${var.project_name}-${var.environment}"
}

# Railway Project
resource "railway_project" "main" {
  name        = var.project_name
  description = ""

  # Default environment — provider >=0.3 expects an object, not a string.
  default_environment = {
    name = var.environment
  }

  lifecycle {
    ignore_changes = [name, description]
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

# Service-specific Environment Variables.
#
# Railway `shared` variables are NOT auto-injected into services — a service only
# gets them if it references ${{shared.X}}. So for every service the module FULLY
# manages (i.e. has non-empty env_vars — the new events/ingestion/notifications
# workers), we set the shared_env_vars at the SERVICE level here too, alongside its
# own env_vars. Services with empty env_vars (api/ai-worker, which keep their live
# service-level vars and must NOT be disturbed) get nothing.
resource "railway_variable" "service_specific" {
  for_each = merge([
    for service_name, service_config in var.services : {
      for var_name, var_value in(
        length(service_config.env_vars) > 0
        ? merge(var.shared_env_vars, service_config.env_vars)
        : {}
      ) :
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

# Service-level OBSERVABILITY variables for otherwise-unmanaged live services
# (api, ai-worker — issue #314). These services keep env_vars = {} so the
# service_specific resource above does NOT touch them (we must not push the full
# shared_env_vars onto their live, hand-managed config). But Railway shared vars
# are not auto-injected, so observability never reaches them. This resource sets
# ONLY the observability keys (SENTRY_DSN/SENTRY_ENVIRONMENT/OTEL_*) at the
# service level. railway_variable is per-(service, key), so adding these keys
# leaves every OTHER live var on the service untouched.
#
# IMPORT-FIRST: SENTRY_DSN + SENTRY_ENVIRONMENT were hand-set on api/ai-worker
# (manual drift). Import those 4 (2 keys x 2 services) before the first apply so
# they reconcile in place instead of erroring ENV_ALREADY_EXISTS. OTEL_* are new.
resource "railway_variable" "observability" {
  for_each = merge([
    for service_name, obs_vars in var.service_observability_vars : {
      for var_name, var_value in obs_vars :
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
