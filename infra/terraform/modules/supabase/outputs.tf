# Supabase Module Outputs
# All outputs consumed by root main.tf are preserved exactly.

output "project_ref" {
  description = "Supabase project reference ID (empty when unmanaged, e.g. dev/staging on Docker)"
  value       = local.project_id
}

output "api_url" {
  description = "Supabase API URL"
  value       = local.api_url
}

output "connection_string" {
  description = "PostgreSQL transaction-pooler URL (DATABASE_URL). Uses PgBouncer port 6543; safe for serverless/Vercel/Railway."
  value       = local.db_url
  sensitive   = true
}

output "direct_url" {
  description = "PostgreSQL direct connection URL (DIRECT_URL). Non-pooled port 5432; required for Prisma migrations and schema introspection."
  value       = local.db_direct_url
  sensitive   = true
}

output "anon_key" {
  description = "Supabase anonymous (public) key — sourced from data.supabase_apikeys (empty when unmanaged)"
  value       = var.manage_project ? data.supabase_apikeys.main[0].anon_key : ""
  sensitive   = true
}

output "service_role_key" {
  description = "Supabase service role key — sourced from data.supabase_apikeys (empty when unmanaged)"
  value       = var.manage_project ? data.supabase_apikeys.main[0].service_role_key : ""
  sensitive   = true
}

output "jwt_secret" {
  description = "JWT signing secret — sourced via Management API (provider does not expose this)"
  value       = local.jwt_secret
  sensitive   = true
}

output "storage_buckets" {
  description = "Created storage buckets (empty when unmanaged)"
  value       = var.manage_project ? keys(var.storage_buckets) : []
}
