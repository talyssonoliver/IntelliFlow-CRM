# IntelliFlow CRM - Main Terraform Configuration
# This file orchestrates all infrastructure modules

locals {
  # Common tags applied to all resources
  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
  })

  # Full project name with environment suffix
  full_project_name = "${var.project_name}-${var.environment}"
}

# Supabase Module
# Note: Supabase doesn't have an official Terraform provider
# This module uses the Management API via HTTP requests
module "supabase" {
  source = "./modules/supabase"

  project_name   = var.supabase_project_name
  environment    = var.environment
  region         = var.supabase_region
  access_token   = var.supabase_access_token
  db_password    = var.supabase_db_password
  plan           = var.supabase_plan

  # Extensions
  enable_pgvector = var.enable_pgvector
  enable_realtime = var.enable_realtime

  # Authentication
  auth_site_url  = var.auth_site_url
  auth_jwt_expiry = var.auth_jwt_expiry

  # Storage
  storage_buckets = var.storage_buckets

  tags = local.common_tags
}

# Vercel Module
# Manages frontend (Next.js) deployment
module "vercel" {
  source = "./modules/vercel"

  project_name = var.vercel_project_name
  environment  = var.environment
  framework    = var.vercel_framework

  # Git integration
  git_repository = var.vercel_git_repo

  # Custom domains
  domains = var.vercel_domains

  # Environment variables from Supabase
  environment_variables = {
    # Supabase connection
    NEXT_PUBLIC_SUPABASE_URL      = module.supabase.api_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY = module.supabase.anon_key
    SUPABASE_SERVICE_ROLE_KEY     = module.supabase.service_role_key

    # Database
    DATABASE_URL = module.supabase.connection_string

    # Build configuration
    NODE_ENV = var.environment == "production" ? "production" : "development"
    NEXT_TELEMETRY_DISABLED = "1"
  }

  tags = local.common_tags
}

# Railway Module
# Manages backend services (API, AI Worker)
module "railway" {
  source = "./modules/railway"

  project_name = var.railway_project_name
  environment  = var.environment

  # Services configuration
  services = var.railway_services

  # Shared environment variables
  shared_env_vars = {
    # Supabase connection
    DATABASE_URL              = module.supabase.connection_string
    SUPABASE_URL              = module.supabase.api_url
    SUPABASE_ANON_KEY         = module.supabase.anon_key
    SUPABASE_SERVICE_ROLE_KEY = module.supabase.service_role_key

    # Application
    NODE_ENV    = var.environment == "production" ? "production" : "development"
    ENVIRONMENT = var.environment

    # Vercel (for API callbacks)
    FRONTEND_URL = module.vercel.url
  }

  tags = local.common_tags
}

# Random password for database (if not provided)
resource "random_password" "db_master_password" {
  count = var.supabase_db_password == "" ? 1 : 0

  length  = 32
  special = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Local file for environment variables (for local development)
resource "local_file" "env_template" {
  filename = "${path.root}/../../.env.example"
  content = templatefile("${path.module}/templates/env.tpl", {
    supabase_url           = module.supabase.api_url
    supabase_anon_key      = module.supabase.anon_key
    supabase_service_role  = module.supabase.service_role_key
    database_url           = module.supabase.connection_string
    vercel_url             = module.vercel.url
    railway_api_url        = module.railway.api_url
    environment            = var.environment
  })

  file_permission = "0644"
}
