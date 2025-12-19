# Create Router Command

Generate a tRPC router for a domain entity with full type safety.

## Usage

```
/create-router <entity> [--crud] [--subscriptions]
```

## Arguments

- `entity`: Entity name to create router for
- `--crud`: Include all CRUD operations
- `--subscriptions`: Include real-time subscriptions

## Generated Files

```
apps/api/src/modules/<entity>/
├── index.ts              # Barrel export
├── <entity>.router.ts    # tRPC router
├── <entity>.schema.ts    # Zod validation schemas
├── <entity>.service.ts   # Business logic service
└── __tests__/
    └── <entity>.router.test.ts
```

## Router Template

```typescript
// lead.router.ts
import { router, publicProcedure, protectedProcedure } from '@/trpc';
import {
  createLeadSchema,
  updateLeadSchema,
  leadIdSchema,
} from './lead.schema';
import { LeadService } from './lead.service';

export const leadRouter = router({
  create: protectedProcedure
    .input(createLeadSchema)
    .mutation(async ({ input, ctx }) => {
      return LeadService.create(input, ctx.userId);
    }),

  getById: protectedProcedure.input(leadIdSchema).query(async ({ input }) => {
    return LeadService.findById(input.id);
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return LeadService.findAll(ctx.userId);
  }),

  update: protectedProcedure
    .input(updateLeadSchema)
    .mutation(async ({ input }) => {
      return LeadService.update(input);
    }),

  delete: protectedProcedure.input(leadIdSchema).mutation(async ({ input }) => {
    return LeadService.delete(input.id);
  }),

  // Real-time subscription (if --subscriptions)
  onUpdate: protectedProcedure.subscription(() => {
    return LeadService.subscribeToUpdates();
  }),
});
```

## Example

```bash
# Create full CRUD router for Lead
/create-router Lead --crud

# Create router with subscriptions
/create-router Lead --crud --subscriptions
```
