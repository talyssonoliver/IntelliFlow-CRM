# Vercel Module Outputs

output "project_id" {
  description = "Vercel project ID"
  value       = vercel_project.main.id
}

output "project_name" {
  description = "Vercel project name"
  value       = vercel_project.main.name
}

output "url" {
  description = "Vercel deployment URL"
  value       = "https://${vercel_project.main.name}.vercel.app"
}

output "production_url" {
  description = "Production URL (custom domain or Vercel URL)"
  value       = length(var.domains) > 0 ? "https://${var.domains[0]}" : "https://${vercel_project.main.name}.vercel.app"
}

output "domains" {
  description = "Configured domains"
  value       = [for d in vercel_project_domain.domains : d.domain]
}

output "edge_config_id" {
  description = "Edge Config ID"
  value       = var.enable_edge_config ? vercel_edge_config.main[0].id : null
}
