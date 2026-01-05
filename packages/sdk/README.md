# @intelliflow/sdk

> Official TypeScript SDK for IntelliFlow CRM - Full end-to-end type safety with tRPC

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![tRPC](https://img.shields.io/badge/tRPC-11.8.0-purple.svg)](https://trpc.io/)
[![React Query](https://img.shields.io/badge/React%20Query-5.x-red.svg)](https://tanstack.com/query)
[![License](https://img.shields.io/badge/License-Private-gray.svg)]()

## Overview

The IntelliFlow SDK provides fully-typed API clients for the IntelliFlow CRM platform. Built on top of [tRPC](https://trpc.io/), it offers **zero code generation** type safety - types flow automatically from the backend to your frontend code.

### Key Features

- **End-to-End Type Safety**: Full TypeScript inference from API to client without code generation
- **React Query Integration**: Automatic caching, refetching, optimistic updates, and suspense support
- **Vanilla Client**: For server-side rendering, API routes, testing, or non-React applications
- **Complete CRM APIs**: Leads, Contacts, Accounts, Opportunities, Tasks, Tickets, and more
- **AI Integration**: Built-in support for AI-powered lead scoring and agent tools
- **Real-time Updates**: WebSocket subscriptions for live data synchronization

## Installation

```bash
# Using pnpm (recommended for monorepo)
pnpm add @intelliflow/api-client

# Using npm
npm install @intelliflow/api-client

# Using yarn
yarn add @intelliflow/api-client
```

### Peer Dependencies

Ensure you have the following peer dependencies installed:

```bash
pnpm add react @tanstack/react-query
```

## Quick Start

### 1. React Application Setup

Wrap your application with the `TRPCProvider`:

```tsx
// app/providers.tsx or _app.tsx
import { TRPCProvider } from '@intelliflow/api-client';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TRPCProvider
      url="/api/trpc"
      headers={async () => {
        const token = getAuthToken(); // Your auth logic
        return { authorization: `Bearer ${token}` };
      }}
    >
      {children}
    </TRPCProvider>
  );
}

// In your root layout or app
export default function App() {
  return (
    <Providers>
      <YourApp />
    </Providers>
  );
}
```

### 2. Using the API

```tsx
import { trpc } from '@intelliflow/api-client';

function LeadsPage() {
  // Queries - automatic caching and refetching
  const { data, isLoading, error } = trpc.lead.list.useQuery({
    page: 1,
    limit: 20,
    status: ['NEW', 'CONTACTED'],
  });

  // Mutations - with cache invalidation
  const utils = trpc.useContext();
  const createLead = trpc.lead.create.useMutation({
    onSuccess: () => {
      utils.lead.list.invalidate(); // Refresh the list
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      <LeadList leads={data.leads} total={data.total} />
      <CreateLeadButton onCreate={createLead.mutate} />
    </div>
  );
}
```

## API Reference

### Core CRM Modules

#### Lead Management (`trpc.lead.*`)

```typescript
// List leads with filtering and pagination
const leads = trpc.lead.list.useQuery({
  page: 1,
  limit: 20,
  status: ['NEW', 'CONTACTED', 'QUALIFIED'],
  source: ['WEBSITE', 'REFERRAL'],
  minScore: 50,
  maxScore: 100,
  search: 'john',
  sortBy: 'createdAt',
  sortOrder: 'desc',
});

// Get single lead by ID
const lead = trpc.lead.getById.useQuery({ id: 'lead_123' });

// Create a new lead
const createLead = trpc.lead.create.useMutation();
await createLead.mutateAsync({
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Doe',
  company: 'Acme Corp',
  source: 'WEBSITE',
  phone: '+1234567890', // Optional
  title: 'CTO',         // Optional
  notes: 'Met at conference', // Optional
});

// Update lead
const updateLead = trpc.lead.update.useMutation();
await updateLead.mutateAsync({
  id: 'lead_123',
  firstName: 'Johnny',
  status: 'CONTACTED',
});

// Delete lead
const deleteLead = trpc.lead.delete.useMutation();
await deleteLead.mutateAsync({ id: 'lead_123' });

// Qualify a lead (marks as sales-ready)
const qualifyLead = trpc.lead.qualify.useMutation();
await qualifyLead.mutateAsync({
  leadId: 'lead_123',
  reason: 'Budget confirmed, decision maker engaged',
});

// Convert lead to contact/account
const convertLead = trpc.lead.convert.useMutation();
await convertLead.mutateAsync({
  leadId: 'lead_123',
  createAccount: true,
  accountName: 'Acme Corporation',
});

// AI-powered lead scoring
const scoreLead = trpc.lead.scoreWithAI.useMutation();
const result = await scoreLead.mutateAsync({ leadId: 'lead_123' });
// Returns: { score: 85, confidence: 0.92, tier: 'HOT', autoQualified: true }

// Get lead statistics
const stats = trpc.lead.stats.useQuery();
// Returns: { total, byStatus, averageScore, hotLeads, warmLeads, coldLeads }

// Get hot leads (score >= 70)
const hotLeads = trpc.lead.getHotLeads.useQuery();

// Get leads ready for qualification
const readyLeads = trpc.lead.getReadyForQualification.useQuery();

// Bulk score multiple leads
const bulkScore = trpc.lead.bulkScore.useMutation();
await bulkScore.mutateAsync({ leadIds: ['lead_1', 'lead_2', 'lead_3'] });
```

#### Contact Management (`trpc.contact.*`)

```typescript
// List contacts with filtering
const contacts = trpc.contact.list.useQuery({
  page: 1,
  limit: 20,
  accountId: 'account_123', // Filter by account
  search: 'smith',
  sortBy: 'lastName',
  sortOrder: 'asc',
});

// Get contact by ID
const contact = trpc.contact.getById.useQuery({ id: 'contact_123' });

// Get contact by email
const contact = trpc.contact.getByEmail.useQuery({ email: 'jane@example.com' });

// Create contact
const createContact = trpc.contact.create.useMutation();
await createContact.mutateAsync({
  email: 'jane@example.com',
  firstName: 'Jane',
  lastName: 'Smith',
  phone: '+1987654321',
  title: 'VP Sales',
  accountId: 'account_123', // Optional - link to account
});

// Update contact
const updateContact = trpc.contact.update.useMutation();
await updateContact.mutateAsync({
  id: 'contact_123',
  title: 'SVP Sales',
  phone: '+1555555555',
});

// Delete contact
const deleteContact = trpc.contact.delete.useMutation();
await deleteContact.mutateAsync({ id: 'contact_123' });

// Link contact to account
const linkToAccount = trpc.contact.linkToAccount.useMutation();
await linkToAccount.mutateAsync({
  contactId: 'contact_123',
  accountId: 'account_456',
});

// Unlink contact from account
const unlinkFromAccount = trpc.contact.unlinkFromAccount.useMutation();
await unlinkFromAccount.mutateAsync({ contactId: 'contact_123' });

// Get contact statistics
const stats = trpc.contact.stats.useQuery();
```

#### Account Management (`trpc.account.*`)

```typescript
// List accounts
const accounts = trpc.account.list.useQuery({
  page: 1,
  limit: 20,
  industry: 'TECHNOLOGY',
  search: 'acme',
  sortBy: 'name',
});

// Get account by ID
const account = trpc.account.getById.useQuery({ id: 'account_123' });

// Create account
const createAccount = trpc.account.create.useMutation();
await createAccount.mutateAsync({
  name: 'Acme Corporation',
  industry: 'TECHNOLOGY',
  website: 'https://acme.com',
  phone: '+1800ACME',
  billingAddress: '123 Main St, San Francisco, CA 94105',
});

// Update account
const updateAccount = trpc.account.update.useMutation();
await updateAccount.mutateAsync({
  id: 'account_123',
  industry: 'ENTERPRISE',
  annualRevenue: 50000000,
});

// Delete account
const deleteAccount = trpc.account.delete.useMutation();
await deleteAccount.mutateAsync({ id: 'account_123' });

// Get account statistics
const stats = trpc.account.stats.useQuery();
```

#### Opportunity Management (`trpc.opportunity.*`)

```typescript
// List opportunities (deals)
const opportunities = trpc.opportunity.list.useQuery({
  page: 1,
  limit: 20,
  stage: ['QUALIFICATION', 'PROPOSAL', 'NEGOTIATION'],
  minAmount: 10000,
  maxAmount: 100000,
  closeDateFrom: new Date('2024-01-01'),
  closeDateTo: new Date('2024-12-31'),
});

// Get opportunity by ID
const opportunity = trpc.opportunity.getById.useQuery({ id: 'opp_123' });

// Create opportunity
const createOpportunity = trpc.opportunity.create.useMutation();
await createOpportunity.mutateAsync({
  name: 'Enterprise Deal - Acme',
  stage: 'QUALIFICATION',
  amount: 75000,
  currency: 'USD',
  probability: 25,
  closeDate: new Date('2024-06-30'),
  accountId: 'account_123',
  contactId: 'contact_123',
  description: 'Enterprise license for 500 users',
});

// Update opportunity stage (moves through pipeline)
const updateOpportunity = trpc.opportunity.update.useMutation();
await updateOpportunity.mutateAsync({
  id: 'opp_123',
  stage: 'PROPOSAL',
  probability: 50,
  amount: 85000, // Updated deal size
});

// Close won
await updateOpportunity.mutateAsync({
  id: 'opp_123',
  stage: 'CLOSED_WON',
  probability: 100,
});

// Close lost
await updateOpportunity.mutateAsync({
  id: 'opp_123',
  stage: 'CLOSED_LOST',
  probability: 0,
  lostReason: 'Competitor won on price',
});

// Delete opportunity
const deleteOpportunity = trpc.opportunity.delete.useMutation();
await deleteOpportunity.mutateAsync({ id: 'opp_123' });

// Get pipeline statistics
const stats = trpc.opportunity.stats.useQuery();
// Returns: { total, byStage, totalValue, weightedValue, avgDealSize }

// Get forecast data
const forecast = trpc.opportunity.forecast.useQuery();
```

#### Task Management (`trpc.task.*`)

```typescript
// List tasks
const tasks = trpc.task.list.useQuery({
  page: 1,
  limit: 20,
  status: ['PENDING', 'IN_PROGRESS'],
  priority: ['HIGH', 'URGENT'],
  dueFrom: new Date(),
  dueTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next 7 days
  assigneeId: 'user_123',
});

// Get task by ID
const task = trpc.task.getById.useQuery({ id: 'task_123' });

// Create task
const createTask = trpc.task.create.useMutation();
await createTask.mutateAsync({
  title: 'Follow up with prospect',
  description: 'Send proposal and schedule demo call',
  priority: 'HIGH',
  dueDate: new Date('2024-02-15'),
  assigneeId: 'user_123',
  leadId: 'lead_123',       // Optional - link to lead
  contactId: 'contact_123', // Optional - link to contact
  opportunityId: 'opp_123', // Optional - link to opportunity
});

// Update task
const updateTask = trpc.task.update.useMutation();
await updateTask.mutateAsync({
  id: 'task_123',
  status: 'IN_PROGRESS',
  notes: 'Called, waiting for callback',
});

// Complete task
const completeTask = trpc.task.complete.useMutation();
await completeTask.mutateAsync({
  id: 'task_123',
  completedAt: new Date(),
  outcome: 'Sent proposal, demo scheduled for next week',
});

// Delete task
const deleteTask = trpc.task.delete.useMutation();
await deleteTask.mutateAsync({ id: 'task_123' });

// Get overdue tasks
const overdueTasks = trpc.task.getOverdue.useQuery();

// Get task statistics
const stats = trpc.task.stats.useQuery();
```

#### Ticket Management (`trpc.ticket.*`)

```typescript
// List support tickets
const tickets = trpc.ticket.list.useQuery({
  page: 1,
  limit: 20,
  status: ['OPEN', 'IN_PROGRESS'],
  priority: ['HIGH', 'CRITICAL'],
  accountId: 'account_123',
});

// Get ticket by ID
const ticket = trpc.ticket.getById.useQuery({ id: 'ticket_123' });

// Create ticket
const createTicket = trpc.ticket.create.useMutation();
await createTicket.mutateAsync({
  subject: 'Unable to access dashboard',
  description: 'Getting 403 error when accessing analytics',
  priority: 'HIGH',
  accountId: 'account_123',
  contactId: 'contact_123',
  category: 'BUG',
});

// Update ticket status
const updateTicket = trpc.ticket.update.useMutation();
await updateTicket.mutateAsync({
  id: 'ticket_123',
  status: 'IN_PROGRESS',
  assigneeId: 'support_user_123',
});

// Add comment to ticket
const addComment = trpc.ticket.addComment.useMutation();
await addComment.mutateAsync({
  ticketId: 'ticket_123',
  content: 'Investigating the permission issue',
  internal: true, // Internal note, not visible to customer
});

// Resolve ticket
const resolveTicket = trpc.ticket.resolve.useMutation();
await resolveTicket.mutateAsync({
  id: 'ticket_123',
  resolution: 'Fixed permission configuration',
});

// Get ticket statistics
const stats = trpc.ticket.stats.useQuery();
```

### Analytics & Reporting (`trpc.analytics.*`)

```typescript
// Get dashboard metrics
const dashboard = trpc.analytics.dashboard.useQuery({
  dateFrom: new Date('2024-01-01'),
  dateTo: new Date('2024-12-31'),
});

// Get pipeline analytics
const pipeline = trpc.analytics.pipeline.useQuery();

// Get lead conversion metrics
const conversion = trpc.analytics.leadConversion.useQuery({
  period: 'MONTHLY',
});

// Get activity metrics
const activity = trpc.analytics.activity.useQuery({
  userId: 'user_123',
  dateFrom: new Date('2024-01-01'),
  dateTo: new Date('2024-01-31'),
});
```

### AI & Automation (`trpc.agent.*`)

```typescript
// Get pending AI agent approvals
const pendingApprovals = trpc.agent.getPendingApprovals.useQuery();

// Approve agent action
const approveAction = trpc.agent.approve.useMutation();
await approveAction.mutateAsync({
  actionId: 'action_123',
  approved: true,
  feedback: 'Looks good, proceed',
});

// Reject agent action
await approveAction.mutateAsync({
  actionId: 'action_123',
  approved: false,
  feedback: 'Modify the email tone before sending',
});

// Get agent execution history
const history = trpc.agent.getHistory.useQuery({
  page: 1,
  limit: 20,
  status: 'COMPLETED',
});
```

### Security & Audit (`trpc.audit.*`)

```typescript
// Get audit logs
const auditLogs = trpc.audit.list.useQuery({
  page: 1,
  limit: 50,
  entityType: 'LEAD',
  action: 'UPDATE',
  dateFrom: new Date('2024-01-01'),
  userId: 'user_123',
});

// Get specific audit entry
const entry = trpc.audit.getById.useQuery({ id: 'audit_123' });
```

### System & Health (`trpc.health.*`, `trpc.system.*`)

```typescript
// Health check
const health = trpc.health.check.useQuery();
// Returns: { status: 'healthy', uptime: 123456, version: '1.0.0' }

// Get system info
const system = trpc.system.info.useQuery();
```

### Real-time Subscriptions (`trpc.subscriptions.*`)

```typescript
// Subscribe to lead updates
trpc.subscriptions.onLeadUpdate.useSubscription(undefined, {
  onData: (lead) => {
    console.log('Lead updated:', lead);
  },
});

// Subscribe to new tasks
trpc.subscriptions.onNewTask.useSubscription(undefined, {
  onData: (task) => {
    console.log('New task created:', task);
  },
});
```

## Advanced Usage

### Optimistic Updates

Provide instant UI feedback while waiting for server response:

```typescript
const utils = trpc.useContext();

const updateLead = trpc.lead.update.useMutation({
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await utils.lead.getById.cancel({ id: newData.id });

    // Snapshot previous value
    const previousLead = utils.lead.getById.getData({ id: newData.id });

    // Optimistically update
    utils.lead.getById.setData({ id: newData.id }, (old) => ({
      ...old!,
      ...newData,
    }));

    return { previousLead };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    utils.lead.getById.setData({ id: newData.id }, context?.previousLead);
  },
  onSettled: (data) => {
    // Refetch after error or success
    if (data) {
      utils.lead.getById.invalidate({ id: data.id });
    }
  },
});
```

### Infinite Queries (Pagination)

```typescript
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
  trpc.lead.list.useInfiniteQuery(
    { limit: 20, status: ['NEW'] },
    {
      getNextPageParam: (lastPage) => {
        if (!lastPage.hasMore) return undefined;
        return lastPage.page + 1;
      },
    }
  );

// Flatten all pages
const allLeads = data?.pages.flatMap((page) => page.leads) ?? [];
```

### Prefetching Data

```typescript
const utils = trpc.useContext();

// Prefetch on hover
function LeadRow({ lead }: { lead: Lead }) {
  return (
    <Link
      href={`/leads/${lead.id}`}
      onMouseEnter={() => {
        utils.lead.getById.prefetch({ id: lead.id });
      }}
    >
      {lead.email}
    </Link>
  );
}
```

### Custom Query Client

```typescript
import { QueryClient } from '@tanstack/react-query';
import { TRPCProvider } from '@intelliflow/api-client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000,   // 10 minutes (formerly cacheTime)
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1,
    },
  },
});

function App() {
  return (
    <TRPCProvider url="/api/trpc" queryClient={queryClient}>
      <YourApp />
    </TRPCProvider>
  );
}
```

### Server-Side Rendering (Next.js)

```typescript
// app/leads/page.tsx (App Router)
import { createTRPCClient } from '@intelliflow/api-client';
import { headers } from 'next/headers';

export default async function LeadsPage() {
  const client = createTRPCClient({
    url: `${process.env.NEXT_PUBLIC_API_URL}/api/trpc`,
    headers: async () => {
      const headersList = await headers();
      return {
        cookie: headersList.get('cookie') ?? '',
      };
    },
  });

  const { leads } = await client.lead.list.query({ page: 1, limit: 20 });

  return <LeadsList leads={leads} />;
}
```

### Vanilla Client (Non-React)

For server-side scripts, API routes, or testing:

```typescript
import { createTRPCClient } from '@intelliflow/api-client';

const client = createTRPCClient({
  url: 'http://localhost:3000/api/trpc',
  headers: async () => ({
    authorization: `Bearer ${process.env.API_TOKEN}`,
  }),
});

// Use like a regular async function
async function syncLeads() {
  const { leads } = await client.lead.list.query({
    page: 1,
    limit: 100,
    status: ['NEW'],
  });

  for (const lead of leads) {
    // Process each lead
    const scored = await client.lead.scoreWithAI.mutate({ leadId: lead.id });
    console.log(`Lead ${lead.id} scored: ${scored.score}`);
  }
}
```

## Type Exports

All input and output types are exported for use in your application:

```typescript
import type {
  // Router type
  AppRouter,

  // Lead types
  CreateLeadInput,
  UpdateLeadInput,
  LeadQueryInput,
  LeadResponse,
  LeadListResponse,
  LeadStatus,
  LeadSource,

  // Contact types
  CreateContactInput,
  UpdateContactInput,
  ContactQueryInput,
  ContactResponse,
  ContactListResponse,

  // Account types
  CreateAccountInput,
  UpdateAccountInput,
  AccountQueryInput,
  AccountResponse,
  AccountListResponse,

  // Opportunity types
  CreateOpportunityInput,
  UpdateOpportunityInput,
  OpportunityQueryInput,
  OpportunityResponse,
  OpportunityListResponse,
  OpportunityStage,

  // Task types
  CreateTaskInput,
  UpdateTaskInput,
  TaskQueryInput,
  TaskResponse,
  TaskListResponse,
  TaskStatus,
  TaskPriority,
  CompleteTaskInput,

  // Common types
  PaginationInput,
  DateRangeInput,
  SearchInput,
  ApiError,
  Metadata,
} from '@intelliflow/api-client';
```

## Autocomplete Experience

The SDK provides full IntelliSense support in VS Code and other TypeScript-enabled editors:

```
trpc.lead.     →  Shows: create, getById, list, update, delete, qualify, convert...
trpc.lead.list.useQuery({
  status:      →  Autocomplete shows: ['NEW', 'CONTACTED', 'QUALIFIED', ...]
  source:      →  Autocomplete shows: ['WEBSITE', 'REFERRAL', 'PARTNER', ...]
  sortBy:      →  Autocomplete shows: 'createdAt' | 'email' | 'score' | ...
})
```

This works because:
1. tRPC infers types from the backend router definitions
2. Zod schemas provide runtime validation AND TypeScript types
3. No code generation needed - types are always in sync

## Error Handling

```typescript
import { TRPCClientError } from '@trpc/client';

const createLead = trpc.lead.create.useMutation({
  onError: (error) => {
    if (error instanceof TRPCClientError) {
      switch (error.data?.code) {
        case 'BAD_REQUEST':
          toast.error('Invalid lead data');
          break;
        case 'UNAUTHORIZED':
          router.push('/login');
          break;
        case 'FORBIDDEN':
          toast.error('You do not have permission');
          break;
        case 'NOT_FOUND':
          toast.error('Resource not found');
          break;
        case 'CONFLICT':
          toast.error('Lead with this email already exists');
          break;
        default:
          toast.error('An error occurred');
      }
    }
  },
});
```

## Configuration

### Environment Variables

```bash
# API URL (required)
NEXT_PUBLIC_API_URL=http://localhost:3000

# Or for production
NEXT_PUBLIC_API_URL=https://api.intelliflow.com
```

## Development

```bash
# Install dependencies
pnpm install

# Type checking
pnpm typecheck

# Build
pnpm build

# Development (watch mode)
pnpm dev

# Run tests
pnpm test
```

## Migration Guide

### From REST API

If migrating from a REST-based client:

```typescript
// Before (REST)
const response = await fetch('/api/leads?page=1&limit=20');
const data: LeadListResponse = await response.json();

// After (tRPC)
const { data } = trpc.lead.list.useQuery({ page: 1, limit: 20 });
// TypeScript knows the exact shape of `data` - no manual typing!
```

### From GraphQL

```typescript
// Before (GraphQL)
const { data } = useQuery(GET_LEADS, { variables: { page: 1, limit: 20 } });
// Type must be manually defined or generated

// After (tRPC)
const { data } = trpc.lead.list.useQuery({ page: 1, limit: 20 });
// Types are automatic - no code generation needed
```

## Best Practices

1. **Use Query Keys Correctly**: Let tRPC manage query keys automatically
2. **Leverage Optimistic Updates**: Improve UX with instant feedback
3. **Prefetch Data**: Use `utils.*.prefetch()` on hover/navigation intent
4. **Handle Loading States**: Always handle `isLoading` and `error` states
5. **Invalidate Related Queries**: After mutations, invalidate affected queries
6. **Use Type Exports**: Import types from the SDK instead of redefining

## Troubleshooting

### Types Not Updating

If types seem stale after backend changes:

```bash
# Rebuild the API package
pnpm --filter @intelliflow/api build

# Restart TypeScript server in VS Code
Cmd/Ctrl + Shift + P → "TypeScript: Restart TS Server"
```

### Network Errors

```typescript
// Add error boundary or retry logic
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});
```

## Related Documentation

- [ADR-001: Modern AI-First Stack](../docs/planning/adr/ADR-001-modern-stack.md)
- [tRPC Official Documentation](https://trpc.io/docs)
- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [IntelliFlow API Documentation](../apps/api/README.md)

## Support

For issues or feature requests, please open an issue in the repository.

---

Built with TypeScript, tRPC, and TanStack Query for IntelliFlow CRM.
