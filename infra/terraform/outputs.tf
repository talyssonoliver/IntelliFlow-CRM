# Terraform Outputs
# These values are used by other systems and displayed after apply

# Project Information
output "project_name" {
  description = "Full project name with environment"
  value       = local.full_project_name
}

output "environment" {
  description = "Current environment"
  value       = var.environment
}

# Supabase Outputs
output "supabase_project_ref" {
  description = "Supabase project reference ID"
  value       = module.supabase.project_ref
  sensitive   = false
}

output "supabase_api_url" {
  description = "Supabase API URL"
  value       = module.supabase.api_url
  sensitive   = false
}

output "supabase_anon_key" {
  description = "Supabase anonymous (public) key"
  value       = module.supabase.anon_key
  sensitive   = true
}

output "supabase_service_role_key" {
  description = "Supabase service role key (admin access)"
  value       = module.supabase.service_role_key
  sensitive   = true
}

output "supabase_db_url" {
  description = "PostgreSQL connection string"
  value       = module.supabase.connection_string
  sensitive   = true
}

output "supabase_jwt_secret" {
  description = "JWT signing secret"
  value       = module.supabase.jwt_secret
  sensitive   = true
}

# Vercel Outputs
output "vercel_project_id" {
  description = "Vercel project ID"
  value       = module.vercel.project_id
  sensitive   = false
}

output "vercel_url" {
  description = "Vercel deployment URL"
  value       = module.vercel.url
  sensitive   = false
}

output "vercel_production_url" {
  description = "Vercel production URL (with custom domain if configured)"
  value       = module.vercel.production_url
  sensitive   = false
}

# Railway Outputs
output "railway_project_id" {
  description = "Railway project ID"
  value       = module.railway.project_id
  sensitive   = false
}

output "railway_api_url" {
  description = "Railway API service URL"
  value       = module.railway.api_url
  sensitive   = false
}

output "railway_worker_url" {
  description = "Railway AI Worker service URL"
  value       = module.railway.worker_url
  sensitive   = false
}

# Connection Strings (for CI/CD and local development)
output "connection_strings" {
  description = "All connection strings in one object"
  value = {
    database_url         = module.supabase.connection_string
    supabase_url         = module.supabase.api_url
    frontend_url         = module.vercel.url
    api_url              = module.railway.api_url
    worker_url           = module.railway.worker_url
  }
  sensitive = true
}

# API Keys and Secrets (for CI/CD)
output "api_keys" {
  description = "All API keys and secrets"
  value = {
    supabase_anon_key         = module.supabase.anon_key
    supabase_service_role_key = module.supabase.service_role_key
    jwt_secret                = module.supabase.jwt_secret
  }
  sensitive = true
}

# Infrastructure URLs (for status page)
output "infrastructure_urls" {
  description = "Public URLs for all infrastructure components"
  value = {
    frontend    = module.vercel.url
    api         = module.railway.api_url
    database    = module.supabase.api_url
    studio      = "${module.supabase.api_url}/studio"
  }
  sensitive = false
}

# Health Check Endpoints
output "health_check_endpoints" {
  description = "Health check URLs for monitoring"
  value = {
    api         = "${module.railway.api_url}/health"
    worker      = "${module.railway.worker_url}/health"
    frontend    = "${module.vercel.url}/api/health"
    database    = "${module.supabase.api_url}/rest/v1/"
  }
  sensitive = false
}

# Resource Summary
output "resource_summary" {
  description = "Summary of provisioned resources"
  value = {
    environment     = var.environment
    project_name    = local.full_project_name
    region          = var.region
    supabase_plan   = var.supabase_plan
    vercel_domains  = var.vercel_domains
    railway_services = keys(var.railway_services)
    created_at      = timestamp()
  }
}
