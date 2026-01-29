# tRPC API Quick Start Guide

This guide will help you get started with the newly created tRPC API
infrastructure for IntelliFlow CRM.

## Prerequisites

- Node.js 20+ installed
- pnpm 8+ installed
- PostgreSQL database running (or Supabase connection)
- Environment variables configured

## Step 1: Install Dependencies

```bash
# Install all dependencies in the monorepo
pnpm install
```

## Step 2: Generate Prisma Client

```bash
# Generate the Prisma client from schema
pnpm --filter @intelliflow/db run db:generate

# Optional: Push schema to database if not done already
pnpm --filter @intelliflow/db run db:push
```

## Step 3: Build Packages

```bash
# Build all packages in the correct order
pnpm run build

# Or build specific packages
pnpm --filter @intelliflow/validators run build
pnpm --filter @intelliflow/db run build
pnpm --filter @intelliflow/api run build
pnpm --filter @intelliflow/api-client run build
```

## Step 4: Set Up Next.js API Route (if using Next.js)

Create `apps/web/app/api/trpc/[trpc]/route.ts`:

```typescript
import { appRouter, createContext } from '@intelliflow/api';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext,
  });

export { handler as GET, handler as POST };
```

## Step 5: Set Up tRPC Provider in Next.js App

Create `apps/web/app/providers.tsx`:

```typescript
'use client';

import { TRPCProvider } from '@intelliflow/api-client';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TRPCProvider url="/api/trpc">
      {children}
    </TRPCProvider>
  );
}
```

Update `apps/web/app/layout.tsx`:

```typescript
import { Providers } from './providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

## Step 6: Use tRPC Hooks in Components

Create a component that uses tRPC:

```typescript
'use client';

import { trpc } from '@intelliflow/api-client';

export function LeadsList() {
  const { data, isLoading, error } = trpc.lead.list.useQuery({
    page: 1,
    limit: 20,
  });

  if (isLoading) return <div>Loading leads...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Leads ({data.total})</h2>
      <ul>
        {data.leads.map((lead) => (
          <li key={lead.id}>
            {lead.firstName} {lead.lastName} - {lead.email}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Create a mutation example:

```typescript
'use client';

import { trpc } from '@intelliflow/api-client';
import { useState } from 'react';

export function CreateLeadForm() {
  const utils = trpc.useContext();
  const [email, setEmail] = useState('');

  const createLead = trpc.lead.create.useMutation({
    onSuccess: () => {
      // Refresh the leads list
      utils.lead.list.invalidate();
      setEmail('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createLead.mutate({
      email,
      source: 'WEBSITE',
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <button type="submit" disabled={createLead.isLoading}>
        {createLead.isLoading ? 'Creating...' : 'Create Lead'}
      </button>
      {createLead.error && <div>Error: {createLead.error.message}</div>}
    </form>
  );
}
```

## Step 7: Development Mode

```bash
# Run the API in development mode (watch mode)
pnpm --filter @intelliflow/api run dev

# Run the Next.js app
pnpm --filter web run dev

# Or run everything
pnpm run dev
```

## Testing the API

### Option 1: Using the Vanilla Client (Node.js/Testing)

```typescript
import { createTRPCClient } from '@intelliflow/api-client';

const client = createTRPCClient({
  url: 'http://localhost:3000/api/trpc',
});

// Test queries
const leads = await client.lead.list.query({ page: 1, limit: 10 });
console.log('Leads:', leads);

// Test mutations
const newLead = await client.lead.create.mutate({
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  source: 'WEBSITE',
});
console.log('Created lead:', newLead);
```

### Option 2: Direct Router Caller (Server-Side)

```typescript
import { appRouter, createContext } from '@intelliflow/api';

const ctx = await createContext();
const caller = appRouter.createCaller(ctx);

const leads = await caller.lead.list({ page: 1, limit: 10 });
console.log('Leads:', leads);
```

## Available Endpoints

### Leads

- `trpc.lead.create.useMutation()` - Create a lead
- `trpc.lead.getById.useQuery({ id })` - Get lead by ID
- `trpc.lead.list.useQuery({ page, limit, ... })` - List leads
- `trpc.lead.update.useMutation()` - Update a lead
- `trpc.lead.delete.useMutation()` - Delete a lead
- `trpc.lead.qualify.useMutation()` - Qualify a lead
- `trpc.lead.convert.useMutation()` - Convert lead to contact
- `trpc.lead.scoreWithAI.useMutation()` - AI scoring (placeholder)
- `trpc.lead.stats.useQuery()` - Get lead statistics

### Contacts

- `trpc.contact.create.useMutation()` - Create a contact
- `trpc.contact.getById.useQuery({ id })` - Get contact by ID
- `trpc.contact.getByEmail.useQuery({ email })` - Get contact by email
- `trpc.contact.list.useQuery({ page, limit, ... })` - List contacts
- `trpc.contact.update.useMutation()` - Update a contact
- `trpc.contact.delete.useMutation()` - Delete a contact
- `trpc.contact.linkToAccount.useMutation()` - Link to account
- `trpc.contact.unlinkFromAccount.useMutation()` - Unlink from account
- `trpc.contact.stats.useQuery()` - Get contact statistics

## Type Safety

All endpoints are fully typed! TypeScript will autocomplete:

- Input parameters
- Return types
- Error types

Example:

```typescript
const { data } = trpc.lead.list.useQuery({
  page: 1,
  limit: 20,
  status: ['NEW', 'CONTACTED'], // Autocompleted!
  minScore: 50,
});

// data.leads is fully typed!
data.leads.forEach((lead) => {
  console.log(lead.email); // TypeScript knows all properties
});
```

## Troubleshooting

### Build Errors

If you get build errors:

```bash
# Clean all build artifacts
pnpm run clean

# Rebuild in order
pnpm --filter @intelliflow/validators run build
pnpm --filter @intelliflow/db run build
pnpm --filter @intelliflow/api run build
pnpm --filter @intelliflow/api-client run build
```

### Type Errors

If you get type errors:

```bash
# Make sure Prisma client is generated
pnpm --filter @intelliflow/db run db:generate

# Run type checking
pnpm run typecheck
```

### Database Errors

If you get database errors:

```bash
# Make sure database is running
# Check your DATABASE_URL and DIRECT_URL in .env

# Push schema to database
pnpm --filter @intelliflow/db run db:push

# Or run migrations
pnpm --filter @intelliflow/db run db:migrate
```

## Next Steps

1. **Add Authentication**: Replace mock user with real auth (NextAuth.js, Clerk,
   etc.)
2. **Add More Routers**: Account, Opportunity, Task, Analytics
3. **Add Tests**: Write unit and integration tests
4. **Add Monitoring**: OpenTelemetry, Sentry
5. **Add Rate Limiting**: Upstash Redis
6. **Add Caching**: Redis for response caching
7. **AI Integration**: Replace AI scoring placeholder with LangChain/CrewAI

## Documentation

- **API Docs**: `apps/api/README.md`
- **Client Docs**: `packages/api-client/README.md`
- **Implementation Summary**: `docs/implementation/ENV-007-AI-tRPC-API-Setup.md`
- **tRPC Docs**: https://trpc.io/
- **React Query Docs**: https://tanstack.com/query/latest

## Support

For issues or questions:

1. Check the README files in each package
2. Review the implementation summary
3. Check tRPC and React Query documentation
4. Look at the example usage in the code comments
