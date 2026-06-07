# API Container Observability Env Audit (2026-06-07)

**Symptom:** Production logs showed the **API** container with **Sentry
disabled** and **OpenTelemetry disabled**, while the **AI Worker** had
OpenTelemetry enabled — so end-to-end distributed traces were missing the API
half and API exceptions were not reaching Sentry.

## Root cause (env gap, not a code bug)

The code is ready in both services:

- **OTel** — `apps/api/src/tracing/otel.ts` + `apps/api/src/main.ts`: enabled
  unless `OTEL_ENABLED=false`, exporter defaults to `http://localhost:4318`. In
  prod it was effectively off because no reachable `OTEL_EXPORTER_OTLP_ENDPOINT`
  was set (and/or a dashboard override pinned it off).
- **Sentry** — `apps/api/src/tracing/sentry.ts`: enabled in prod **iff**
  `SENTRY_DSN` is present. The DSN was never set on the API service, so
  `Sentry.init` no-ops.

## Resolution

Observability is now declared as code on `main` via
**`infra/terraform/modules/monitoring`**, which emits a shared
`observability_env` (`OTEL_ENABLED`, `OTEL_RESOURCE_ATTRIBUTES`,
`SENTRY_ENVIRONMENT`, `OTEL_EXPORTER_OTLP_ENDPOINT`) merged into both the Vercel
and Railway services, plus `SENTRY_DSN = var.sentry_dsn`. No per-service
`env_vars` are used (avoids the PORT-clash footgun).

## Remaining one-pass apply (tracked)

- **#314** — deferred terraform apply: set `TF_VAR_sentry_dsn` +
  `TF_VAR_otel_exporter_endpoint`, **stand up a reachable OTLP collector first**
  (else the endpoint is cosmetic), then apply. Sentry works the moment the DSN
  is set.
- **#312** — serverless `DATABASE_URL` `connection_limit=1` (already on `main`).

**Verify after apply:** API logs `Initialized tracing for intelliflow-api`; one
trace spans both `intelliflow-api` and `intelliflow-ai-worker`; a deliberate
test error lands in Sentry.
