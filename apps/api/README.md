# @intelliflow/api

Type-safe tRPC API server for IntelliFlow CRM.

## Overview

This package provides the backend API for IntelliFlow CRM using tRPC for
end-to-end type safety. All API endpoints are automatically typed and validated
using Zod schemas from `@intelliflow/validators`.

## Features

- **Type-Safe APIs**: Full TypeScript type inference from server to client
- **Input Validation**: All inputs validated using Zod schemas
- **Authentication**: Protected procedures with user context
- **Error Handling**: Standardized error formatting with Zod validation errors
- **Modular Architecture**: Organized by domain (leads, contacts, etc.)

## API Structure

```
apps/api/src/
├── context.ts              # tRPC context with Prisma and auth
├── server.ts               # tRPC initialization and middleware
├── router.ts               # Main app router combining all modules
├── index.ts                # Public exports
└── modules/
    ├── lead/
    │   └── lead.router.ts  # Lead management endpoints
    └── contact/
        └── contact.router.ts # Contact management endpoints
```

## Available Endpoints

### Lead Router (`lead.*`)

- `create` - Create a new lead
- `getById` - Get a single lead by ID
- `list` - List leads with filtering and pagination
- `update` - Update a lead
- `delete` - Delete a lead
- `qualify` - Mark a lead as qualified
- `convert` - Convert a lead to a contact
- `scoreWithAI` - Trigger AI scoring (placeholder)
- `stats` - Get lead statistics

### Contact Router (`contact.*`)

- `create` - Create a new contact
- `getById` - Get a single contact by ID
- `getByEmail` - Get a contact by email
- `list` - List contacts with filtering and pagination
- `update` - Update a contact
- `delete` - Delete a contact
- `linkToAccount` - Link a contact to an account
- `unlinkFromAccount` - Unlink a contact from an account
- `stats` - Get contact statistics

## Usage

### In Next.js API Routes

```typescript
import { appRouter, createContext } from '@intelliflow/api';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

export async function POST(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext,
  });
}
```

### Direct Router Usage

```typescript
import { appRouter, createContext } from '@intelliflow/api';

const ctx = await createContext();
const caller = appRouter.createCaller(ctx);

// Call endpoints directly
const leads = await caller.lead.list({ page: 1, limit: 20 });
const newLead = await caller.lead.create({
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Doe',
});
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
```

## Type Exports

The API package exports its router type for use in the client:

```typescript
export type { AppRouter } from '@intelliflow/api';
```

This type is used by `@intelliflow/api-client` to provide full type safety in
the frontend.

## Authentication (TODO)

Currently uses a mock user for development. Production implementation will
include:

- JWT token validation
- Session management
- Role-based access control (RBAC)
- API key authentication for external integrations

## Next Steps

- [ ] Add account router
- [ ] Add opportunity router
- [ ] Add task router
- [ ] Add AI/intelligence router
- [ ] Add analytics router
- [ ] Implement real authentication
- [ ] Add rate limiting
- [ ] Add request logging and monitoring
- [ ] Add OpenTelemetry instrumentation
