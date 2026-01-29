# Environment Validation Guide

## Overview

Following **2025 best practices**, this package validates environment variables at application startup to prevent silent failures in production.

## Quick Start

### 1. Validate on Startup (Recommended)

Add to your application entry point (e.g., `apps/api/src/index.ts`):

```typescript
import { validateEnv } from '@intelliflow/validators';

// Validate environment BEFORE any other imports
const env = validateEnv(process.env);

// Now use strongly-typed env throughout your app
console.log(`Starting API on port ${env.PORT}`);
console.log(`Connected to database: ${env.DATABASE_URL}`);
console.log(`AI scoring enabled: ${env.ENABLE_AI_SCORING}`);
```

**Why this works**:
- Fails fast on startup (not at runtime)
- TypeScript provides autocomplete for all env vars
- Different validation for dev/test/production

### 2. Graceful Validation (Optional)

For cases where you want to handle validation errors manually:

```typescript
import { safeValidateEnv } from '@intelliflow/validators';

const result = safeValidateEnv(process.env);

if (!result.success) {
  console.error('Environment validation failed:');
  console.error(result.error.format());
  process.exit(1);
}

const env = result.data;
```

## Environment-Specific Validation

The validation automatically adjusts based on `NODE_ENV`:

### Development
```bash
# Minimal requirements
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/intelliflow_dev
# JWT_SECRET gets default value (NOT for production!)
```

### Test
```bash
# Even more minimal
NODE_ENV=test
# All secrets use test defaults
```

### Production
```bash
# Strict validation - NO defaults for secrets
NODE_ENV=production
DATABASE_URL=postgresql://prod-db:5432/intelliflow
JWT_SECRET=your-32-char-production-secret-here
SESSION_SECRET=your-32-char-session-secret-here
SENTRY_DSN=https://your-sentry-dsn.ingest.sentry.io/123456
CORS_ORIGIN=https://yourapp.com  # Cannot be '*' in production
```

## Full Environment Schema

### Required (All Environments)
- `DATABASE_URL` - PostgreSQL connection string

### API Configuration
- `PORT` (default: 3000) - API server port
- `API_URL` (optional) - Public API URL
- `CORS_ORIGIN` (default: '*') - CORS allowed origins
- `RATE_LIMIT_MAX` (default: 100) - Max requests per window
- `RATE_LIMIT_WINDOW_MS` (default: 900000) - Rate limit window (15min)

### Authentication
- `JWT_SECRET` - JWT signing secret (min 32 chars)
- `JWT_EXPIRES_IN` (default: '7d') - JWT expiration
- `SESSION_SECRET` - Session signing secret (min 32 chars)
- `BCRYPT_ROUNDS` (default: 12) - Password hashing rounds

### AI/LLM
- `OPENAI_API_KEY` (optional) - OpenAI API key
- `OPENAI_MODEL` (default: 'gpt-4') - Default model
- `OLLAMA_BASE_URL` (default: 'http://localhost:11434') - Ollama server
- `AI_TIMEOUT_MS` (default: 30000) - AI request timeout
- `AI_MAX_RETRIES` (default: 3) - Max retry attempts

### Email (Optional)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `EMAIL_FROM`

### Observability
- `SENTRY_DSN` (optional, required in production)
- `OTEL_ENABLED` (default: false) - OpenTelemetry enabled
- `OTEL_ENDPOINT` (optional) - OTEL collector endpoint
- `LOG_LEVEL` (default: 'info') - Log level

### Cache
- `REDIS_URL` (optional) - Redis connection string
- `CACHE_TTL_SECONDS` (default: 3600) - Default cache TTL

### Supabase
- `SUPABASE_URL` (optional)
- `SUPABASE_ANON_KEY` (optional)
- `SUPABASE_SERVICE_ROLE_KEY` (optional)

### Feature Flags
- `ENABLE_AI_SCORING` (default: true)
- `ENABLE_EMAIL_NOTIFICATIONS` (default: false)
- `ENABLE_WEBHOOKS` (default: false)
- `ENABLE_ANALYTICS` (default: true)

## TypeScript Support

The validated environment is fully typed:

```typescript
import { Env } from '@intelliflow/validators';

function startServer(env: Env) {
  // TypeScript knows all these fields exist and their types
  const port: number = env.PORT;
  const dbUrl: string = env.DATABASE_URL;
  const aiEnabled: boolean = env.ENABLE_AI_SCORING;

  // Autocomplete works for all env vars!
}
```

## Error Messages

When validation fails, you get detailed error messages:

```json
{
  "JWT_SECRET": {
    "_errors": [
      "JWT secret must be at least 32 characters"
    ]
  },
  "DATABASE_URL": {
    "_errors": [
      "Invalid url"
    ]
  }
}
```

## Best Practices

### ✅ DO
- Validate environment on startup (first line of `index.ts`)
- Use strict validation in production (`prodEnvSchema`)
- Keep secrets in `.env` files (never commit)
- Use different `.env` files per environment (`.env.development`, `.env.production`)

### ❌ DON'T
- Don't skip validation in production
- Don't use default secrets in production
- Don't commit `.env` files to git
- Don't use `*` for CORS in production

## Example `.env` Files

### `.env.development`
```bash
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/intelliflow_dev
JWT_SECRET=development-secret-change-in-production-min-32-chars
SESSION_SECRET=development-session-secret-change-in-production
OPENAI_API_KEY=sk-...
```

### `.env.production`
```bash
NODE_ENV=production
DATABASE_URL=postgresql://prod-db:5432/intelliflow
JWT_SECRET=<generate-strong-secret-with-openssl-rand-base64-32>
SESSION_SECRET=<generate-strong-secret-with-openssl-rand-base64-32>
SENTRY_DSN=https://your-sentry-dsn.ingest.sentry.io/123456
CORS_ORIGIN=https://intelliflow.com
OPENAI_API_KEY=sk-prod-...
```

## Migration from Unvalidated Env

If you're adding validation to an existing project:

1. **Start with graceful validation**:
   ```typescript
   const result = safeValidateEnv(process.env);
   if (!result.success) {
     console.warn('Environment validation warnings:', result.error.format());
     // Continue with defaults
   }
   ```

2. **Fix validation errors** by updating your `.env` files

3. **Switch to strict validation**:
   ```typescript
   const env = validateEnv(process.env); // Throws on error
   ```

## Common Errors

### "JWT secret must be at least 32 characters"
**Fix**: Generate a strong secret:
```bash
openssl rand -base64 32
```

### "Invalid url" for DATABASE_URL
**Fix**: Ensure format is `postgresql://user:pass@host:port/database`

### "CORS_ORIGIN must be specific in production (not *)"
**Fix**: Set specific origin like `https://yourapp.com`

## Testing

In tests, use the `testEnvSchema` which provides safe defaults:

```typescript
import { testEnvSchema } from '@intelliflow/validators';

const testEnv = testEnvSchema.parse({
  NODE_ENV: 'test',
  // All other fields get test defaults
});
```
