# Monitoring / observability-as-code module.
#
# Effect:
#   1. observability_env (output) — non-sensitive OTel/Sentry env injected into
#      the Railway + Vercel services by the root main.tf, so observability is
#      configured declaratively (terraform = SSOT) instead of by hand.
#   2. A per-environment monitoring manifest (local_file) recording the active
#      cost-alert / drift-detection settings and which infra/monitoring assets
#      are in play — a tracked, plan-visible record of the monitoring posture.
#
# No cloud provider, no credentials, no fabricated endpoints: when no OTLP
# collector is configured, OTEL_EXPORTER_OTLP_ENDPOINT is simply omitted and the
# services use their built-in console/disabled exporter.

locals {
  # OTEL_SERVICE_NAME is intentionally NOT set here — each service derives its
  # own (intelliflow-api / intelliflow-ai-worker) in apps/*/src/tracing/otel.ts.
  # We only set the shared, non-secret identity + the per-env Sentry environment.
  base_observability_env = {
    OTEL_ENABLED             = "true"
    OTEL_RESOURCE_ATTRIBUTES = "service.namespace=${var.project_name},deployment.environment=${var.environment}"
    SENTRY_ENVIRONMENT       = var.environment
  }

  # Only advertise an OTLP endpoint when one is actually configured.
  otel_endpoint_env = var.otel_exporter_endpoint != "" ? {
    OTEL_EXPORTER_OTLP_ENDPOINT = var.otel_exporter_endpoint
  } : {}

  observability_env = merge(local.base_observability_env, local.otel_endpoint_env)

  monitoring_manifest = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
    enabled     = var.enable_monitoring
    drift_detection = {
      enabled  = var.enable_drift_detection
      schedule = var.drift_check_schedule
    }
    cost_alerts = {
      enabled               = var.enable_cost_alerts
      monthly_threshold_usd = var.cost_alert_threshold
    }
    observability = {
      otel_endpoint_configured = var.otel_exporter_endpoint != ""
      alert_rules              = var.alert_rules_path
      grafana_dashboard        = var.dashboard_path
    }
    tags = var.tags
  }
}

# Tracked monitoring manifest. Written to infra/monitoring/ (which already
# exists, so no parent-dir creation is needed). Generated files there are
# gitignored. Rendered only when monitoring is enabled.
resource "local_file" "monitoring_manifest" {
  count = var.enable_monitoring ? 1 : 0

  filename        = "${path.root}/../monitoring/${var.environment}.monitoring.generated.json"
  content         = jsonencode(local.monitoring_manifest)
  file_permission = "0644"
}
