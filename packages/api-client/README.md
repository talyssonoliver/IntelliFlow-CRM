# @intelliflow/api-client

Type-safe tRPC API client for IntelliFlow CRM.

## Overview

This package provides fully typed API clients for consuming the IntelliFlow CRM
API. It includes both vanilla JavaScript/TypeScript clients and React Query
hooks for seamless integration with React applications.

## Features

- **End-to-End Type Safety**: Full TypeScript inference from API to client
- **React Query Integration**: Automatic caching, refetching, and state
  management
- **Optimistic Updates**: Built-in support for optimistic UI updates
- **Vanilla Client**: For server-side, testing, or non-React usage
- **Type Exports**: All input/output types exported for easy reuse

## Installation

This package is part of the IntelliFlow CRM monorepo and uses workspace
dependencies.

## Usage

### React Client (Recommended for Frontend)

```tsx
import { TRPCProvider, trpc } from '@intelliflow/api-client';

// 1. Wrap your app with TRPCProvider
function App() {
  return (
    <TRPCProvider url="/api/trpc">
      <YourApp />
    </TRPCProvider>
  );
}

// 2. Use tRPC hooks in your components
function LeadsList() {
  const { data, isLoading, error } = trpc.lead.list.useQuery({
    page: 1,
    limit: 20,
    status: ['NEW', 'CONTACTED'],
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data.leads.map((lead) => (
        <li key={lead.id}>{lead.email}</li>
      ))}
    </ul>
  );
}

// 3. Use mutations for creating/updating data
function CreateLeadForm() {
  const utils = trpc.useContext();
  const createLead = trpc.lead.create.useMutation({
    onSuccess: () => {
      // Invalidate and refetch leads list
      utils.lead.list.invalidate();
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createLead.mutate({
      email: formData.get('email') as string,
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" required />
      <input name="firstName" />
      <input name="lastName" />
      <button type="submit" disabled={createLead.isLoading}>
        {createLead.isLoading ? 'Creating...' : 'Create Lead'}
      </button>
    </form>
  );
}
```

### Vanilla Client (Server-Side or Non-React)

```typescript
import { createTRPCClient } from '@intelliflow/api-client';

// Create a client
const client = createTRPCClient({
  url: 'http://localhost:3000/api/trpc',
  headers: async () => ({
    authorization: `Bearer ${await getToken()}`,
  }),
});

// Use the client
const leads = await client.lead.list.query({ page: 1, limit: 20 });
const newLead = await client.lead.create.mutate({
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Doe',
});
```

## Advanced Usage

### Optimistic Updates

```tsx
const utils = trpc.useContext();
const updateLead = trpc.lead.update.useMutation({
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await utils.lead.getById.cancel({ id: newData.id });

    // Snapshot the previous value
    const previousLead = utils.lead.getById.getData({ id: newData.id });

    // Optimistically update to the new value
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

### Custom Query Client Configuration

```tsx
import { QueryClient } from '@tanstack/react-query';
import { TRPCProvider } from '@intelliflow/api-client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 3,
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

### Authentication Headers

```tsx
import { TRPCProvider } from '@intelliflow/api-client';

function App() {
  return (
    <TRPCProvider
      url="/api/trpc"
      headers={async () => {
        const token = await getAuthToken();
        return {
          authorization: `Bearer ${token}`,
        };
      }}
    >
      <YourApp />
    </TRPCProvider>
  );
}
```

## Type Exports

All input and output types are exported for use in your application:

```typescript
import type {
  AppRouter,
  CreateLeadInput,
  UpdateLeadInput,
  LeadResponse,
  LeadListResponse,
  CreateContactInput,
  ContactResponse,
} from '@intelliflow/api-client';
```

## Available APIs

### Leads

- `trpc.lead.create.useMutation()`
- `trpc.lead.getById.useQuery({ id })`
- `trpc.lead.list.useQuery({ page, limit, ... })`
- `trpc.lead.update.useMutation()`
- `trpc.lead.delete.useMutation()`
- `trpc.lead.qualify.useMutation()`
- `trpc.lead.convert.useMutation()`
- `trpc.lead.scoreWithAI.useMutation()`
- `trpc.lead.stats.useQuery()`

### Contacts

- `trpc.contact.create.useMutation()`
- `trpc.contact.getById.useQuery({ id })`
- `trpc.contact.getByEmail.useQuery({ email })`
- `trpc.contact.list.useQuery({ page, limit, ... })`
- `trpc.contact.update.useMutation()`
- `trpc.contact.delete.useMutation()`
- `trpc.contact.linkToAccount.useMutation()`
- `trpc.contact.unlinkFromAccount.useMutation()`
- `trpc.contact.stats.useQuery()`

## Development

```bash
# Type checking
pnpm typecheck

# Build
pnpm build

# Development (watch mode)
pnpm dev
```

## Next Steps

- [ ] Add SSR helpers for Next.js
- [ ] Add WebSocket/subscription support
- [ ] Add request interceptors
- [ ] Add response transformers
- [ ] Add offline support with persistence
