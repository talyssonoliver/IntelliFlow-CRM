# Railway Module Outputs

output "project_id" {
  description = "Railway project ID"
  value       = railway_project.main.id
}

output "environment_id" {
  description = "Railway environment ID"
  value       = railway_environment.main.id
}

output "service_ids" {
  description = "Railway service IDs"
  value       = { for k, v in railway_service.services : k => v.id }
}

output "api_url" {
  description = "API service URL (custom domain when set; otherwise unset — the provider exposes service domains via railway_service_domain, not a service `url` attribute)."
  value       = var.api_domain != "" ? "https://${var.api_domain}" : ""
}

# NOTE (provider >=0.3): railway_deployment was removed, so the deployment_ids
# output no longer exists. Service URLs are exposed via railway_service_domain
# (managed separately), not a `url` attribute on the service.
