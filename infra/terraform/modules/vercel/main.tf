# Vercel Infrastructure Module
# Manages frontend (Next.js) deployments

locals {
  project_name_full = "${var.project_name}-${var.environment}"
}

# Vercel Project
resource "vercel_project" "main" {
  name      = local.project_name_full
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

  # Environment variables
  dynamic "environment" {
    for_each = var.environment_variables

    content {
      key    = environment.key
      value  = environment.value
      target = ["production", "preview", "development"]
    }
  }

  # Serverless function region
  serverless_function_region = var.region
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

  name       = "${local.project_name_full}-edge-config"
  project_id = vercel_project.main.id
}

# Edge Config Items
resource "vercel_edge_config_item" "items" {
  for_each = var.enable_edge_config ? var.edge_config_items : {}

  edge_config_id = vercel_edge_config.main[0].id
  key            = each.key
  value          = jsonencode(each.value)
}

# Deployment hooks (for triggering deploys)
resource "vercel_webhook" "deploy_hook" {
  count = var.enable_deploy_hook ? 1 : 0

  project_id = vercel_project.main.id
  events     = ["deployment.created", "deployment.succeeded", "deployment.failed"]
  url        = var.webhook_url
}
