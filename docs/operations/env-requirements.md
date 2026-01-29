# Environment Variable Requirements

This document lists all required environment variables for IntelliFlow CRM services.

> **Task**: IFC-169 - Require Supabase env vars
> **Last Updated**: 2026-01-28

## Overview

All services perform startup validation to ensure required environment variables are set.
Missing required variables will cause the service to fail fast with a clear error message.

---

## Core Services

### API Server (`apps/api`)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SUPABASE_URL` | **Yes** | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | **Yes** | Supabase anonymous key | `eyJhbGci...` |
| `SUPABASE_SERVICE_KEY` | Yes* | Service role key (for admin ops) | `eyJhbGci...` |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string | `postgresql://...` |
| `JWT_SECRET` | **Yes** | JWT signing secret | Random 64-char string |
| `REDIS_URL` | No | Redis connection for caching | `redis://localhost:6379` |
| `LOG_LEVEL` | No | Logging level | `info`, `debug`, `error` |

*Required for production deployments

### Web App (`apps/web`)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Public Supabase URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Public anon key | `eyJhbGci...` |
| `NEXT_PUBLIC_API_URL` | **Yes** | tRPC API endpoint | `http://localhost:3001` |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry error tracking | `https://xxx@sentry.io/xxx` |

### AI Worker (`apps/ai-worker`)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `OPENAI_API_KEY` | **Yes** | OpenAI API key | `sk-xxx` |
| `REDIS_URL` | **Yes** | Redis for job queue | `redis://localhost:6379` |
| `SUPABASE_URL` | **Yes** | For vector storage | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | **Yes** | Service key for embeddings | `eyJhbGci...` |
| `OLLAMA_BASE_URL` | No | Local Ollama endpoint | `http://localhost:11434` |
| `AI_MODEL` | No | Default model | `gpt-4`, `gpt-3.5-turbo` |

---

## Notification Services

### SMS (Twilio)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `TWILIO_ACCOUNT_SID` | Yes* | Twilio account SID | `ACxxx` |
| `TWILIO_AUTH_TOKEN` | Yes* | Twilio auth token | Secret |
| `TWILIO_FROM_NUMBER` | Yes* | Sender phone number | `+15551234567` |
| `SMS_PROVIDER` | No | Provider selection | `twilio`, `mock` |

*Required if SMS notifications are enabled

### Email

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SMTP_HOST` | Yes* | SMTP server host | `smtp.sendgrid.net` |
| `SMTP_PORT` | No | SMTP port | `587` |
| `SMTP_USER` | Yes* | SMTP username | `apikey` |
| `SMTP_PASS` | Yes* | SMTP password/API key | Secret |
| `EMAIL_FROM` | Yes* | Default sender email | `noreply@intelliflow.com` |

*Required if email notifications are enabled

### Webhooks

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `WEBHOOK_SIGNING_SECRET` | No | HMAC signing secret | Random 64-char string |
| `WEBHOOK_TIMEOUT_MS` | No | Request timeout | `30000` |
| `WEBHOOK_MAX_RETRIES` | No | Max retry attempts | `3` |

---

## Calendar Integrations

### Google Calendar

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GOOGLE_CLIENT_ID` | Yes* | OAuth client ID | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Yes* | OAuth client secret | Secret |
| `GOOGLE_REDIRECT_URI` | Yes* | OAuth callback URL | `http://localhost:3000/api/auth/callback/google` |

*Required if Google Calendar sync is enabled

### Microsoft Calendar

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `MICROSOFT_CLIENT_ID` | Yes* | Azure AD app ID | UUID |
| `MICROSOFT_CLIENT_SECRET` | Yes* | Azure AD secret | Secret |
| `MICROSOFT_TENANT_ID` | No | Azure AD tenant | `common` or specific tenant |
| `MICROSOFT_REDIRECT_URI` | Yes* | OAuth callback URL | `http://localhost:3000/api/auth/callback/microsoft` |

*Required if Microsoft Calendar sync is enabled

---

## Infrastructure

### HashiCorp Vault

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VAULT_ADDR` | No | Vault server address | `http://127.0.0.1:8200` |
| `VAULT_TOKEN` | No | Vault access token | `hvs.xxx` |

### Observability

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | OpenTelemetry endpoint | `http://localhost:4317` |
| `OTEL_SERVICE_NAME` | No | Service name for traces | `intelliflow-api` |
| `SENTRY_DSN` | No | Sentry DSN | `https://xxx@sentry.io/xxx` |

---

## Startup Validation

All services use strict startup validation:

```typescript
// Example: apps/api/src/lib/supabase.ts
if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL is required');
}

if (!process.env.SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_ANON_KEY is required');
}
```

**Key Points:**
- No mock keys or fallback values in production
- Services fail fast if required variables are missing
- Clear error messages indicate which variable is missing
- Validation happens at module load time, not runtime

---

## Local Development

For local development, copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Then fill in the required values. For Supabase, you can use:
- Local Supabase: `supabase start` provides local credentials
- Cloud Supabase: Use your project's API keys from the dashboard

---

## Security Notes

1. **Never commit** `.env` files or real credentials
2. **Rotate secrets** regularly (recommended: every 90 days)
3. **Use Vault** for production secret management
4. **Audit access** to environment variables
5. **Separate environments** - never share keys between dev/staging/prod
