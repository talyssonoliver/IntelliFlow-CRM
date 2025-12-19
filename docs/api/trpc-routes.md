# tRPC API Routes

## Overview

IntelliFlow CRM uses **tRPC** (TypeScript Remote Procedure Call) to provide
end-to-end type-safe APIs. This document describes the available API routes,
their inputs, outputs, and usage examples.

## What is tRPC?

tRPC enables you to build fully typesafe APIs without code generation or runtime
bloat. Your API routes are defined using TypeScript, and the client
automatically gets full type safety and autocomplete.

**Key Benefits:**

- **End-to-end type safety**: Changes to the API automatically update the client
  types
- **No code generation**: Types are inferred directly from your router
- **Excellent DX**: Full autocomplete and type checking in your IDE
- **Lightweight**: Minimal runtime overhead

## Base URL

- **Development**: `http://localhost:4000/api/trpc`
- **Production**: `https://api.intelliflow.dev/api/trpc`

## Authentication

All protected routes require authentication via Supabase JWT token:

```typescript
// Authenticated request example
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@intelliflow/api';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:4000/api/trpc',
      headers: () => ({
        authorization: `Bearer ${getSupabaseToken()}`,
      }),
    }),
  ],
});
```

## Router Structure

The API is organized into feature-based routers:

```
api/
├── leads/          # Lead management
├── contacts/       # Contact management
├── accounts/       # Account management
├── opportunities/  # Opportunity tracking
├── tasks/          # Task management
├── ai/             # AI services (scoring, qualification)
├── analytics/      # Analytics and reporting
└── user/           # User profile and settings
```

## Leads Router

### `leads.list`

List all leads with pagination and filtering.

**Type:** Query **Auth:** Protected

**Input:**

```typescript
{
  page?: number;          // Default: 1
  limit?: number;         // Default: 20, Max: 100
  status?: LeadStatus;    // Filter by status
  sortBy?: 'createdAt' | 'score' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  search?: string;        // Search in name, email, company
}
```

**Output:**

```typescript
{
  leads: Lead[];
  total: number;
  page: number;
  pageCount: number;
}
```

**Example:**

```typescript
const result = await client.leads.list.query({
  page: 1,
  limit: 20,
  status: 'NEW',
  sortBy: 'score',
  sortOrder: 'desc',
});
```

### `leads.getById`

Get a single lead by ID.

**Type:** Query **Auth:** Protected

**Input:**

```typescript
{
  id: string; // Lead ID
}
```

**Output:**

```typescript
Lead | null;
```

**Example:**

```typescript
const lead = await client.leads.getById.query({
  id: 'lead_123',
});
```

### `leads.create`

Create a new lead.

**Type:** Mutation **Auth:** Protected

**Input:**

```typescript
{
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  title?: string;
  source?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
}
```

**Output:**

```typescript
{
  id: string;
  // ... all lead fields
  createdAt: Date;
  updatedAt: Date;
}
```

**Example:**

```typescript
const newLead = await client.leads.create.mutate({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  phone: '+1234567890',
  company: 'Acme Corp',
  title: 'CTO',
  source: 'Website Form',
});
```

### `leads.update`

Update an existing lead.

**Type:** Mutation **Auth:** Protected

**Input:**

```typescript
{
  id: string;
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    company?: string;
    title?: string;
    status?: LeadStatus;
    notes?: string;
    customFields?: Record<string, unknown>;
  };
}
```

**Output:**

```typescript
Lead;
```

**Example:**

```typescript
const updated = await client.leads.update.mutate({
  id: 'lead_123',
  data: {
    status: 'QUALIFIED',
    notes: 'Follow up scheduled',
  },
});
```

### `leads.delete`

Delete a lead.

**Type:** Mutation **Auth:** Protected

**Input:**

```typescript
{
  id: string;
}
```

**Output:**

```typescript
{
  success: boolean;
}
```

**Example:**

```typescript
await client.leads.delete.mutate({ id: 'lead_123' });
```

### `leads.score`

Trigger AI scoring for a lead.

**Type:** Mutation **Auth:** Protected

**Input:**

```typescript
{
  leadId: string;
  forceRescore?: boolean; // Default: false
}
```

**Output:**

```typescript
{
  score: number; // 0-100
  confidence: number; // 0-1
  factors: {
    engagement: number;
    firmographic: number;
    behavioral: number;
    demographic: number;
  }
  reasoning: string;
  scoredAt: Date;
}
```

**Example:**

```typescript
const scoring = await client.leads.score.mutate({
  leadId: 'lead_123',
  forceRescore: true,
});
```

### `leads.qualify`

Run AI qualification on a lead.

**Type:** Mutation **Auth:** Protected

**Input:**

```typescript
{
  leadId: string;
}
```

**Output:**

```typescript
{
  isQualified: boolean;
  qualificationScore: number;
  reasons: string[];
  suggestedNextSteps: string[];
  confidence: number;
}
```

**Example:**

```typescript
const qualification = await client.leads.qualify.mutate({
  leadId: 'lead_123',
});
```

## Contacts Router

### `contacts.list`

List all contacts with pagination and filtering.

**Type:** Query **Auth:** Protected

**Input:**

```typescript
{
  page?: number;
  limit?: number;
  accountId?: string;     // Filter by account
  search?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}
```

**Output:**

```typescript
{
  contacts: Contact[];
  total: number;
  page: number;
  pageCount: number;
}
```

### `contacts.getById`

Get a single contact by ID.

**Type:** Query **Auth:** Protected

**Input:**

```typescript
{
  id: string;
}
```

**Output:**

```typescript
Contact | null;
```

### `contacts.create`

Create a new contact.

**Type:** Mutation **Auth:** Protected

**Input:**

```typescript
{
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  accountId?: string;
  title?: string;
  department?: string;
  notes?: string;
}
```

**Output:**

```typescript
Contact;
```

### `contacts.update`

Update an existing contact.

**Type:** Mutation **Auth:** Protected

### `contacts.delete`

Delete a contact.

**Type:** Mutation **Auth:** Protected

## AI Router

### `ai.scoreLead`

Score a lead using AI (alternative endpoint to `leads.score`).

**Type:** Mutation **Auth:** Protected

**Input:**

```typescript
{
  leadId: string;
  model?: 'gpt-4' | 'gpt-3.5-turbo' | 'ollama';
  includeExplanation?: boolean;
}
```

**Output:**

```typescript
{
  score: number;
  confidence: number;
  explanation?: string;
  factors: Record<string, number>;
  model: string;
  processingTime: number;
}
```

### `ai.generateEmailResponse`

Generate an AI-powered email response.

**Type:** Mutation **Auth:** Protected

**Input:**

```typescript
{
  leadId: string;
  context: string;
  tone?: 'professional' | 'friendly' | 'casual';
  maxLength?: number;
}
```

**Output:**

```typescript
{
  subject: string;
  body: string;
  confidence: number;
  alternatives?: string[];
}
```

### `ai.predictConversion`

Predict lead conversion probability.

**Type:** Query **Auth:** Protected

**Input:**

```typescript
{
  leadId: string;
}
```

**Output:**

```typescript
{
  probability: number;    // 0-1
  confidence: number;     // 0-1
  factors: {
    engagement: number;
    score: number;
    timeline: number;
    budget: number;
  };
  expectedCloseDate?: Date;
}
```

## Analytics Router

### `analytics.leadMetrics`

Get lead metrics and statistics.

**Type:** Query **Auth:** Protected

**Input:**

```typescript
{
  startDate: Date;
  endDate: Date;
  groupBy?: 'day' | 'week' | 'month';
}
```

**Output:**

```typescript
{
  totalLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  averageScore: number;
  conversionRate: number;
  timeline: {
    date: Date;
    count: number;
    qualified: number;
    converted: number;
  }
  [];
}
```

### `analytics.aiPerformance`

Get AI model performance metrics.

**Type:** Query **Auth:** Protected

**Input:**

```typescript
{
  startDate: Date;
  endDate: Date;
  model?: string;
}
```

**Output:**

```typescript
{
  totalRequests: number;
  averageLatency: number;
  successRate: number;
  totalCost: number;
  accuracyMetrics: {
    scoringAccuracy: number;
    qualificationAccuracy: number;
  }
  modelBreakdown: {
    model: string;
    requests: number;
    avgLatency: number;
    cost: number;
  }
  [];
}
```

## User Router

### `user.profile`

Get current user profile.

**Type:** Query **Auth:** Protected

**Output:**

```typescript
{
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  preferences: Record<string, unknown>;
  createdAt: Date;
}
```

### `user.updateProfile`

Update user profile.

**Type:** Mutation **Auth:** Protected

**Input:**

```typescript
{
  firstName?: string;
  lastName?: string;
  preferences?: Record<string, unknown>;
}
```

**Output:**

```typescript
User;
```

## Error Handling

tRPC uses typed errors for better error handling:

```typescript
try {
  const lead = await client.leads.getById.query({ id: 'invalid_id' });
} catch (error) {
  if (error instanceof TRPCClientError) {
    switch (error.data?.code) {
      case 'NOT_FOUND':
        console.error('Lead not found');
        break;
      case 'UNAUTHORIZED':
        console.error('Not authenticated');
        break;
      case 'FORBIDDEN':
        console.error('Insufficient permissions');
        break;
      default:
        console.error('Unknown error:', error.message);
    }
  }
}
```

**Common Error Codes:**

- `UNAUTHORIZED`: Not authenticated
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `BAD_REQUEST`: Invalid input
- `INTERNAL_SERVER_ERROR`: Server error
- `TIMEOUT`: Request timeout

## Rate Limiting

API requests are rate-limited to prevent abuse:

- **Authenticated users**: 1000 requests per hour
- **AI endpoints**: 100 requests per hour
- **Unauthenticated**: 100 requests per hour

Rate limit headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640000000
```

## Subscriptions

tRPC supports WebSocket subscriptions for real-time updates:

```typescript
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

// Unsubscribe when done
subscription.unsubscribe();
```

## Batch Requests

tRPC automatically batches requests made in the same tick:

```typescript
// These will be sent as a single HTTP request
const [lead1, lead2, analytics] = await Promise.all([
  client.leads.getById.query({ id: 'lead_1' }),
  client.leads.getById.query({ id: 'lead_2' }),
  client.analytics.leadMetrics.query({
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
  }),
]);
```

## TypeScript Types

All types are automatically inferred from the router definition. You can also
import them explicitly:

```typescript
import type { AppRouter } from '@intelliflow/api';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

// Use specific input/output types
type LeadListInput = RouterInput['leads']['list'];
type LeadListOutput = RouterOutput['leads']['list'];
```

## Next.js Integration

In Next.js App Router, use tRPC React Query hooks:

```typescript
'use client';

import { api } from '@/lib/trpc/client';

export function LeadList() {
  const { data, isLoading, error } = api.leads.list.useQuery({
    page: 1,
    limit: 20,
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {data.leads.map((lead) => (
        <div key={lead.id}>{lead.email}</div>
      ))}
    </div>
  );
}
```

## Testing

Test tRPC routes using the test client:

```typescript
import { createCallerFactory } from '@trpc/server';
import { appRouter } from '../src/router';

const createCaller = createCallerFactory(appRouter);

describe('Leads Router', () => {
  it('should list leads', async () => {
    const caller = createCaller({
      user: mockUser,
      db: mockDb,
    });

    const result = await caller.leads.list({ page: 1, limit: 20 });

    expect(result.leads).toHaveLength(20);
    expect(result.total).toBeGreaterThan(0);
  });
});
```

## Further Reading

- [tRPC Documentation](https://trpc.io/docs)
- [API Development Guide](../guides/api-development.md)
- [Authentication Guide](../guides/authentication.md)
- [Error Handling Best Practices](../guides/error-handling.md)

## Changelog

| Date       | Version | Changes                   |
| ---------- | ------- | ------------------------- |
| 2025-12-15 | 1.0.0   | Initial API documentation |
