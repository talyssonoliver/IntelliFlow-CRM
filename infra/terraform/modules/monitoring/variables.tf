# Monitoring / observability-as-code module — inputs.
# This module is provider-light (hashicorp/local only): it (1) computes the
# observability environment injected into the deployed services and (2) renders
# a tracked per-environment monitoring manifest. SENTRY_DSN is handled in the
# root main.tf (alongside the other secret service env values), NOT here, so the
# observability_env output stays non-sensitive and safe for service for_each.

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
}

variable "project_name" {
  description = "Project name prefix (used for service.namespace)"
  type        = string
}

variable "enable_monitoring" {
  description = "Master toggle — when false, the manifest is not rendered"
  type        = bool
  default     = true
}

variable "enable_drift_detection" {
  description = "Whether automated drift detection is active for this environment"
  type        = bool
  default     = true
}

variable "drift_check_schedule" {
  description = "Cron schedule for drift detection"
  type        = string
  default     = "0 8 * * *"
}

variable "enable_cost_alerts" {
  description = "Whether cost monitoring alerts are active"
  type        = bool
  default     = true
}

variable "cost_alert_threshold" {
  description = "Monthly cost alert threshold in USD"
  type        = number
  default     = 100
}

variable "otel_exporter_endpoint" {
  description = <<-EOT
    OTLP collector endpoint for OpenTelemetry export. Empty string (the default)
    means no collector is provisioned yet — the services fall back to their
    console/disabled exporter (see apps/*/src/tracing/otel.ts). Set this once a
    collector exists; no value is fabricated here.
  EOT
  type        = string
  default     = ""
}

variable "alert_rules_path" {
  description = "Repo-relative path to the Prometheus/alert rules tracked in infra/monitoring"
  type        = string
  default     = "infra/monitoring/alert-rules.yml"
}

variable "dashboard_path" {
  description = "Repo-relative path to the Grafana dashboard tracked in infra/monitoring"
  type        = string
  default     = "infra/monitoring/ai-grafana-dashboard.json"
}

variable "tags" {
  description = "Common tags"
  type        = map(string)
  default     = {}
}
