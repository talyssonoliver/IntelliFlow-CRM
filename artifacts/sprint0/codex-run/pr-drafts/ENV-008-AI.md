# ENV-008-AI — Automated Observability with Predictive Monitoring

Branch: `sprint0/ENV-008-AI-codex`  
Patch: `artifacts/sprint0/codex-run/patches/ENV-008-AI.patch`

## Summary

- Adds baseline OpenTelemetry collector config artifact for tracking (`artifacts/misc/otel-config.yaml`).
- Adds Sprint 0 alert rules scaffold (`infra/monitoring/alerts/intelliflow-alerts.yaml`).
- Adds anomaly detection + self-healing rule placeholders (`artifacts/misc/anomaly-detection.json`, `artifacts/misc/self-healing-rules.yaml`).

## Validation

- `pnpm run validate:sprint0`

## Notes

- Predictive alerting/self-healing automation is intentionally stubbed for Sprint 0; follow-ups are tracked in `artifacts/debt-ledger.*`.

