# Vercel Infrastructure Module
# Manages frontend (Next.js) deployments

locals {
  project_name_full = "${var.project_name}-${var.environment}"
}

# Vercel Project
resource "vercel_project" "main" {
  name      = var.project_name
  framework = var.framework

  # Git integration
  git_repository = var.git_repository != null ? {
    type = var.git_repository.type
    repo = var.git_repository.repo
  } : null

  # Build configuration
  build_command    = var.build_command
  output_directory = var.output_directory
  install_command  = var.install_command

  # Root directory (for monorepo)
  root_directory = var.root_directory

  # Serverless function region
  serverless_function_region = var.region

  # OIDC token generation (live project has enabled=true)
  oidc_token_config = {
    enabled = true
  }

  # ignore_changes (adopt-without-fighting on attributes Vercel auto-manages or
  # that the provider can't faithfully represent):
  #   - name: keep the imported live name ("intelli-flow-crm-web").
  #   - vercel_authentication: live "all_except_custom_domains" isn't a settable
  #     enum in provider v1.14, so never let an apply overwrite it.
  #   - protection_bypass_for_automation_secret: Vercel auto-generates this; if
  #     it isn't ignored, every apply ROTATES it (breaks the CI bypass secret).
  #     The provider may warn it's computed — that warning is harmless; the diff
  #     it suppresses is not.
  lifecycle {
    ignore_changes = [
      name,
      vercel_authentication,
      protection_bypass_for_automation,        # bool Vercel auto-manages; unset config would disable it
      protection_bypass_for_automation_secret, # the auto-generated secret behind it
      team_id,                                 # provider-computed from the token's team scope
    ]
  }
}

# General environment variables (provider >=1.0: env vars are a separate resource,
# not an inline `environment` block on vercel_project).
resource "vercel_project_environment_variable" "general" {
  for_each = var.environment_variables

  project_id = vercel_project.main.id
  key        = each.key
  value      = each.value
  target     = ["production", "preview", "development"]
}

# Custom domains
resource "vercel_project_domain" "domains" {
  for_each = toset(var.domains)

  project_id = vercel_project.main.id
  domain     = each.value

  # Redirect www to apex (or vice versa)
  redirect = var.redirect_www && each.value == "www.${var.apex_domain}" ? var.apex_domain : null
}

# Environment-specific variables
resource "vercel_project_environment_variable" "env_specific" {
  for_each = var.environment_specific_vars

  project_id = vercel_project.main.id
  key        = each.key
  value      = each.value
  target     = [var.environment == "production" ? "production" : "preview"]
}

# Edge Config (for feature flags)
resource "vercel_edge_config" "main" {
  count = var.enable_edge_config ? 1 : 0

  name = "${local.project_name_full}-edge-config"
}

# NOTE (provider >=1.0): vercel_edge_config_item was removed. Edge Config items
# are managed via the Vercel API/SDK or vercel_edge_config_schema, not a TF
# resource. var.edge_config_items is retained for the future schema/seed step.

# Deployment hooks (for triggering deploys)
resource "vercel_webhook" "deploy_hook" {
  count = var.enable_deploy_hook ? 1 : 0

  # provider >=1.0: project_ids (plural) + endpoint (was project_id + url).
  project_ids = [vercel_project.main.id]
  events      = ["deployment.created", "deployment.succeeded", "deployment.failed"]
  endpoint    = var.webhook_url
}
