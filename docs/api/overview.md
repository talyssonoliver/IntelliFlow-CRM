# API Overview

## Introduction

The IntelliFlow CRM API provides programmatic access to all CRM features through
a type-safe tRPC interface. This document provides an overview of the API
architecture, authentication, and general usage patterns.

## API Architecture

### tRPC-Based API

IntelliFlow CRM uses **tRPC** (TypeScript Remote Procedure Call) to provide
end-to-end type safety between the client and server. Unlike traditional REST or
GraphQL APIs, tRPC doesn't require code generation or schema files - types are
automatically inferred from your TypeScript code.

**Key Benefits:**

- **Full Type Safety**: Changes to the API are immediately reflected in client
  types
- **Auto-completion**: Your IDE provides full autocomplete for all API calls
- **No Code Generation**: Types are inferred directly from the router definition
- **Lightweight**: Minimal runtime overhead compared to GraphQL

### API Base URL

- **Development**: `http://localhost:4000/api/trpc`
- **Production**: `https://api.intelliflow.dev/api/trpc`

### API Version

Current API Version: **v1.0.0**

## Quick Start

### Installation

```bash
npm install @intelliflow/api-client
# or
pnpm add @intelliflow/api-client
```

### Basic Usage

```typescript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@intelliflow/api';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:4000/api/trpc',
    }),
  ],
});

// Query example
const leads = await client.leads.list.query({
  page: 1,
  limit: 20,
});

// Mutation example
const newLead = await client.leads.create.mutate({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
});
```

### React Query Integration

For React applications, use the React Query hooks:

```typescript
'use client';

import { api } from '@/lib/trpc/client';

export function LeadList() {
  // Query hook
  const { data, isLoading } = api.leads.list.useQuery({
    page: 1,
    limit: 20,
  });

  // Mutation hook
  const createLead = api.leads.create.useMutation();

  const handleCreate = async () => {
    await createLead.mutateAsync({
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
    });
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {data?.leads.map((lead) => (
        <div key={lead.id}>{lead.email}</div>
      ))}
      <button onClick={handleCreate}>Create Lead</button>
    </div>
  );
}
```

## Authentication

### Supabase JWT Authentication

All protected API endpoints require authentication via Supabase JWT token:

```typescript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:4000/api/trpc',
      headers: async () => {
        const { data } = await supabase.auth.getSession();
        return {
          authorization: `Bearer ${data.session?.access_token}`,
        };
      },
    }),
  ],
});
```

### API Keys (for Server-to-Server)

For server-to-server communication, use API keys:

```typescript
const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:4000/api/trpc',
      headers: {
        'x-api-key': process.env.INTELLIFLOW_API_KEY,
      },
    }),
  ],
});
```

## Available Routers

The API is organized into feature-based routers:

| Router          | Description           | Routes                                                |
| --------------- | --------------------- | ----------------------------------------------------- |
| `leads`         | Lead management       | list, getById, create, update, delete, score, qualify |
| `contacts`      | Contact management    | list, getById, create, update, delete                 |
| `accounts`      | Account management    | list, getById, create, update, delete                 |
| `opportunities` | Opportunity tracking  | list, getById, create, update, delete, stage          |
| `tasks`         | Task management       | list, getById, create, update, delete, complete       |
| `ai`            | AI services           | scoreLead, qualify, generateEmail, predict            |
| `analytics`     | Analytics & reporting | leadMetrics, aiPerformance, conversionFunnel          |
| `user`          | User profile          | profile, updateProfile, preferences                   |

See [tRPC Routes](./trpc-routes.md) for detailed documentation of each router.

## Request & Response Format

### Query Requests

Queries are sent as GET requests with URL-encoded parameters:

```
GET /api/trpc/leads.list?input={"page":1,"limit":20}
```

### Mutation Requests

Mutations are sent as POST requests with JSON body:

```
POST /api/trpc/leads.create
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com"
}
```

### Response Format

All responses follow this structure:

```typescript
{
  result: {
    data: T | null;       // Your data
    error?: {             // Error if request failed
      code: string;
      message: string;
      data?: unknown;
    };
  };
}
```

## Error Handling

### Error Codes

| Code                    | Description              | HTTP Status |
| ----------------------- | ------------------------ | ----------- |
| `BAD_REQUEST`           | Invalid input            | 400         |
| `UNAUTHORIZED`          | Not authenticated        | 401         |
| `FORBIDDEN`             | Insufficient permissions | 403         |
| `NOT_FOUND`             | Resource not found       | 404         |
| `TIMEOUT`               | Request timeout          | 408         |
| `CONFLICT`              | Resource conflict        | 409         |
| `INTERNAL_SERVER_ERROR` | Server error             | 500         |

### Error Handling Example

```typescript
import { TRPCClientError } from '@trpc/client';

try {
  const lead = await client.leads.getById.query({ id: 'invalid_id' });
} catch (error) {
  if (error instanceof TRPCClientError) {
    switch (error.data?.code) {
      case 'NOT_FOUND':
        console.error('Lead not found');
        break;
      case 'UNAUTHORIZED':
        console.error('Please log in');
        break;
      default:
        console.error('Error:', error.message);
    }
  }
}
```

## Rate Limiting

To ensure fair usage and system stability, the API implements rate limiting:

### Rate Limits

| Endpoint Type   | Limit         | Window |
| --------------- | ------------- | ------ |
| Authenticated   | 1000 requests | 1 hour |
| AI Endpoints    | 100 requests  | 1 hour |
| Unauthenticated | 100 requests  | 1 hour |

### Rate Limit Headers

Responses include rate limit information:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1640000000
```

### Handling Rate Limits

```typescript
try {
  const result = await client.leads.list.query({ page: 1 });
} catch (error) {
  if (error.data?.code === 'TOO_MANY_REQUESTS') {
    const resetTime = error.data.resetTime;
    console.log(`Rate limited. Try again at ${new Date(resetTime)}`);
  }
}
```

## Pagination

List endpoints support cursor-based and offset-based pagination:

### Offset Pagination

```typescript
const result = await client.leads.list.query({
  page: 1, // Page number (1-indexed)
  limit: 20, // Items per page (max 100)
});

console.log(result.total); // Total items
console.log(result.pageCount); // Total pages
console.log(result.leads); // Current page items
```

### Cursor Pagination

```typescript
let cursor: string | undefined;
const allLeads = [];

while (true) {
  const result = await client.leads.listCursor.query({
    cursor,
    limit: 100,
  });

  allLeads.push(...result.leads);

  if (!result.nextCursor) break;
  cursor = result.nextCursor;
}
```

## Filtering & Sorting

Most list endpoints support filtering and sorting:

```typescript
const filtered = await client.leads.list.query({
  page: 1,
  limit: 20,
  // Filtering
  status: 'QUALIFIED',
  minScore: 70,
  search: 'acme',
  // Sorting
  sortBy: 'score',
  sortOrder: 'desc',
});
```

## Batch Requests

tRPC automatically batches requests made in the same tick:

```typescript
// These three requests are sent as a single HTTP request
const [lead1, lead2, analytics] = await Promise.all([
  client.leads.getById.query({ id: 'lead_1' }),
  client.leads.getById.query({ id: 'lead_2' }),
  client.analytics.leadMetrics.query({
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
  }),
]);
```

## WebSocket Subscriptions

Subscribe to real-time updates using WebSockets:

```typescript
import { createWSClient, wsLink } from '@trpc/client';

const wsClient = createWSClient({
  url: 'ws://localhost:4000/api/trpc',
});

const client = createTRPCProxyClient<AppRouter>({
  links: [wsLink({ client: wsClient })],
});

// Subscribe to lead updates
const subscription = client.leads.onUpdate.subscribe(
  { leadId: 'lead_123' },
  {
    onData: (lead) => {
      console.log('Lead updated:', lead);
    },
    onError: (err) => {
      console.error('Subscription error:', err);
    },
  }
);

// Unsubscribe
subscription.unsubscribe();
```

## Testing

### Mock Client for Testing

```typescript
import { createCallerFactory } from '@trpc/server';
import { appRouter } from '@intelliflow/api';

const createCaller = createCallerFactory(appRouter);

describe('API Tests', () => {
  it('should create a lead', async () => {
    const caller = createCaller({
      user: { id: 'user_123' },
      db: mockPrismaClient,
    });

    const lead = await caller.leads.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    });

    expect(lead.email).toBe('john@example.com');
  });
});
```

## API Versioning

### Current Approach

Currently, the API is at version 1.0.0. Breaking changes will be introduced
through:

- New router versions (e.g., `v2.leads`)
- Deprecation warnings
- Migration guides

### Future Versioning

When breaking changes are needed:

1. New version introduced alongside existing version
2. Deprecation notices added to old version
3. 6-month migration period
4. Old version removed

## Performance

### Response Times

| Endpoint Type | p50   | p95    | p99    |
| ------------- | ----- | ------ | ------ |
| Simple Query  | 10ms  | 50ms   | 100ms  |
| Complex Query | 50ms  | 150ms  | 300ms  |
| AI Endpoint   | 500ms | 2000ms | 5000ms |

### Optimization Tips

1. **Use Batch Requests**: Combine multiple queries
2. **Enable Caching**: Use React Query cache
3. **Pagination**: Don't load all data at once
4. **Field Selection**: Only request needed fields (future feature)
5. **CDN**: Cache static responses

## Security

### Best Practices

1. **Never expose API keys** in client-side code
2. **Use HTTPS** in production
3. **Validate all inputs** on the server
4. **Implement rate limiting** for public endpoints
5. **Use Row Level Security** in database

### Security Headers

All API responses include security headers:

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
```

## Further Reading

- [tRPC Routes Documentation](./trpc-routes.md) - Detailed API reference
- [Authentication Guide](../guides/authentication.md) - Auth setup
- [Error Handling](../guides/error-handling.md) - Error handling patterns
- [Testing Guide](../guides/testing.md) - Testing your API integration

## Support

- **API Issues**:
  [GitHub Issues](https://github.com/intelliflow/intelliflow-crm/issues)
- **Questions**:
  [GitHub Discussions](https://github.com/intelliflow/intelliflow-crm/discussions)
- **Documentation**: [Full Docs](../index.md)
