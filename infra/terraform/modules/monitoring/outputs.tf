# Monitoring module — outputs.

output "observability_env" {
  description = "Non-sensitive OTel/Sentry env to merge into service env maps"
  value       = local.observability_env
}

output "monitoring_enabled" {
  description = "Whether monitoring is enabled for this environment"
  value       = var.enable_monitoring
}

output "drift_detection" {
  description = "Drift-detection posture (enabled + schedule)"
  value = {
    enabled  = var.enable_drift_detection
    schedule = var.drift_check_schedule
  }
}

output "cost_alerts" {
  description = "Cost-alert posture (enabled + monthly threshold USD)"
  value = {
    enabled               = var.enable_cost_alerts
    monthly_threshold_usd = var.cost_alert_threshold
  }
}

output "manifest_file" {
  description = "Path of the rendered monitoring manifest (empty when disabled)"
  value       = var.enable_monitoring ? local_file.monitoring_manifest[0].filename : ""
}
