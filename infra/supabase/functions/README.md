# Supabase Edge Functions for IntelliFlow CRM

This directory contains Supabase Edge Functions that run on Deno Deploy's global
edge network.

## Overview

Edge Functions provide serverless compute for IntelliFlow CRM with:

- Low latency (runs close to users globally)
- TypeScript/JavaScript support via Deno runtime
- Direct Supabase integration
- Automatic scaling

## Directory Structure

```
functions/
├── deno.json                 # Deno configuration
├── README.md                 # This file
├── hello/                    # Example edge function
│   └── index.ts
├── ai-score-webhook/         # AI scoring webhook (future)
├── email-sender/             # Email sending function (future)
└── data-enrichment/          # Lead enrichment function (future)
```

## Development

### Prerequisites

1. Install Supabase CLI:

   ```bash
   npm install -g supabase
   ```

2. Install Deno (for local testing):

   ```bash
   # macOS/Linux
   curl -fsSL https://deno.land/x/install/install.sh | sh

   # Windows (PowerShell)
   irm https://deno.land/install.ps1 | iex
   ```

### Local Development

1. Start Supabase locally:

   ```bash
   cd C:\taly\intelliFlow-CRM
   supabase start
   ```

2. Serve a function locally:

   ```bash
   supabase functions serve hello --env-file ./infra/supabase/.env.local
   ```

3. Test the function:
   ```bash
   curl -X POST http://localhost:54321/functions/v1/hello \
     -H "Content-Type: application/json" \
     -d '{"name": "Developer"}'
   ```

### Creating New Functions

1. Create function directory:

   ```bash
   mkdir -p infra/supabase/functions/my-function
   ```

2. Create `index.ts`:

   ```typescript
   import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

   serve(async (req) => {
     return new Response(
       JSON.stringify({ message: 'Hello from my-function' }),
       { headers: { 'Content-Type': 'application/json' } }
     );
   });
   ```

3. Test locally:

   ```bash
   supabase functions serve my-function
   ```

4. Deploy to production:
   ```bash
   supabase functions deploy my-function --project-ref YOUR_PROJECT_REF
   ```

## Deployment

### Deploy Single Function

```bash
supabase functions deploy hello --project-ref YOUR_PROJECT_REF
```

### Deploy All Functions

```bash
supabase functions deploy --project-ref YOUR_PROJECT_REF
```

### Set Environment Variables

```bash
supabase secrets set MY_SECRET=value --project-ref YOUR_PROJECT_REF
```

### View Logs

```bash
supabase functions logs hello --project-ref YOUR_PROJECT_REF
```

## Common Use Cases

### 1. AI Scoring Webhook

Trigger AI scoring when a new lead is created:

```typescript
// Database webhook trigger
const { data, error } = await supabase.from('leads').on('INSERT', (payload) => {
  supabase.functions.invoke('ai-score-webhook', {
    body: { leadId: payload.new.id },
  });
});
```

### 2. Email Sending

Send transactional emails via SendGrid/Resend:

```typescript
const { data, error } = await supabase.functions.invoke('email-sender', {
  body: {
    to: 'user@example.com',
    template: 'welcome',
    variables: { name: 'John' },
  },
});
```

### 3. Data Enrichment

Enrich lead data with external APIs (Clearbit, ZoomInfo):

```typescript
const { data, error } = await supabase.functions.invoke('data-enrichment', {
  body: {
    email: 'lead@company.com',
    enrichmentSource: 'clearbit',
  },
});
```

## Best Practices

### 1. Error Handling

Always wrap your code in try-catch:

```typescript
try {
  // Your code
} catch (error) {
  console.error('Function error:', error);
  return new Response(JSON.stringify({ error: 'Internal server error' }), {
    status: 500,
  });
}
```

### 2. CORS Headers

Include CORS headers for browser requests:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// Handle OPTIONS
if (req.method === 'OPTIONS') {
  return new Response('ok', { headers: corsHeaders });
}
```

### 3. Authentication

Verify user authentication:

```typescript
const authHeader = req.headers.get('Authorization');
if (!authHeader) {
  return new Response('Unauthorized', { status: 401 });
}

const {
  data: { user },
  error,
} = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
```

### 4. Input Validation

Validate all inputs:

```typescript
const body = await req.json();

if (!body.email || !body.email.includes('@')) {
  return new Response(JSON.stringify({ error: 'Invalid email' }), {
    status: 400,
  });
}
```

### 5. Idempotency

Use idempotency keys for critical operations:

```typescript
const idempotencyKey = req.headers.get('Idempotency-Key');
if (!idempotencyKey) {
  return new Response('Idempotency-Key header required', { status: 400 });
}

// Check if operation already completed
const { data: existing } = await supabase
  .from('operations')
  .select()
  .eq('idempotency_key', idempotencyKey)
  .single();

if (existing) {
  return new Response(JSON.stringify(existing.result), { status: 200 });
}
```

## Performance Optimization

### 1. Cold Starts

- Keep functions small (< 1MB)
- Minimize dependencies
- Use caching where possible

### 2. Timeouts

Default timeout is 60 seconds. For long-running tasks:

```typescript
// Use background jobs or message queues instead
// Edge functions are best for quick operations (< 10s)
```

### 3. Caching

Cache frequently accessed data:

```typescript
// Use Supabase Realtime or external cache (Redis)
const cached = await redis.get(`lead:${leadId}`);
if (cached) {
  return new Response(cached);
}
```

## Security

### 1. Service Role Key

Never expose service role key to frontend:

```typescript
// ✅ Good: Use in edge function (server-side)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ❌ Bad: Never send to frontend
```

### 2. Rate Limiting

Implement rate limiting for public endpoints:

```typescript
const rateLimitKey = `ratelimit:${userId}:${functionName}`;
const count = await redis.incr(rateLimitKey);
if (count === 1) {
  await redis.expire(rateLimitKey, 60); // 1 minute window
}
if (count > 100) {
  return new Response('Rate limit exceeded', { status: 429 });
}
```

### 3. Input Sanitization

Sanitize all user inputs:

```typescript
import DOMPurify from 'https://esm.sh/dompurify';

const sanitized = DOMPurify.sanitize(userInput);
```

## Monitoring

### View Logs

```bash
# Real-time logs
supabase functions logs hello --tail

# Filter by time
supabase functions logs hello --since 1h
```

### Error Tracking

Integrate with Sentry:

```typescript
import * as Sentry from 'https://deno.land/x/sentry/mod.ts';

Sentry.init({ dsn: Deno.env.get('SENTRY_DSN') });

try {
  // Your code
} catch (error) {
  Sentry.captureException(error);
  throw error;
}
```

## Testing

### Unit Tests

Create `hello_test.ts`:

```typescript
import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';

Deno.test('hello function returns greeting', async () => {
  const req = new Request('http://localhost/', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test' }),
  });

  // Test your function logic
  const response = await handler(req);
  const data = await response.json();

  assertEquals(data.message.includes('Test'), true);
});
```

Run tests:

```bash
deno test hello_test.ts
```

## Troubleshooting

### Function Not Deploying

1. Check syntax: `deno check index.ts`
2. Verify imports are accessible
3. Check logs: `supabase functions logs`

### Timeout Errors

- Reduce function complexity
- Use async operations
- Consider background jobs for long tasks

### CORS Issues

- Ensure CORS headers are included
- Handle OPTIONS requests
- Check allowed origins

## Resources

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Deno Runtime](https://deno.land/)
- [Deno Deploy](https://deno.com/deploy)
- [Edge Function Examples](https://github.com/supabase/supabase/tree/master/examples/edge-functions)

## Future Functions (Roadmap)

- `ai-score-webhook`: Trigger AI lead scoring
- `email-sender`: Transactional email delivery
- `data-enrichment`: Lead/company data enrichment
- `slack-notifications`: Send Slack alerts
- `webhook-handler`: Generic webhook receiver
- `report-generator`: Generate PDF reports
- `vector-search`: Semantic search endpoint
- `analytics-aggregator`: Real-time analytics
