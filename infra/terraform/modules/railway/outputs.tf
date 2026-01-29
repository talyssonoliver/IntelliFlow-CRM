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
  description = "API service URL"
  value       = var.api_domain != "" ? "https://${var.api_domain}" : railway_service.services["api"].url
}

output "worker_url" {
  description = "AI Worker service URL"
  value       = railway_service.services["ai-worker"].url
}

output "deployment_ids" {
  description = "Deployment IDs"
  value       = { for k, v in railway_deployment.services : k => v.id }
}
