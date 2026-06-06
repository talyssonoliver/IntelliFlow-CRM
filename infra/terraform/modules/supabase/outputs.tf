# Supabase Module Outputs

output "project_ref" {
  description = "Supabase project reference ID"
  value       = var.project_ref
}

output "api_url" {
  description = "Supabase API URL"
  value       = local.api_url
}

output "connection_string" {
  description = "Runtime DATABASE_URL — transaction pooler (6543), serverless-safe"
  value       = local.db_url
  sensitive   = true
}

output "direct_url" {
  description = "DIRECT_URL — direct connection (5432) for Prisma migrations"
  value       = local.direct_db_url
  sensitive   = true
}

output "anon_key" {
  description = "Supabase anonymous (public) key"
  value       = var.project_ref != "" ? local.project_data.anon_key : ""
  sensitive   = true
}

output "service_role_key" {
  description = "Supabase service role key"
  value       = var.project_ref != "" ? local.project_data.service_role_key : ""
  sensitive   = true
}

output "jwt_secret" {
  description = "JWT signing secret"
  value       = var.project_ref != "" ? local.project_data.jwt_secret : ""
  sensitive   = true
}

output "storage_buckets" {
  description = "Created storage buckets"
  value       = keys(var.storage_buckets)
}
