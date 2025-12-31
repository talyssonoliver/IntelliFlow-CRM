# Integration Testing with Real Seed Data

## Overview

This project uses **real seeded database data** for integration tests instead of mocks. This approach:

✅ **Prevents regressions** - Tests automatically catch schema changes (like adding `tenantId`)
✅ **No duplication** - Single source of truth in `seed.ts`
✅ **Tests real scenarios** - Uses actual database relationships and constraints
✅ **Less maintenance** - No need to update mocks when schema changes

## Test Types

### Unit Tests (use mocks)
- Test isolated business logic
- Mock external dependencies
- Fast, deterministic
- Location: `*.test.ts`

### Integration Tests (use real DB)
- Test against real seeded database
- Query actual records
- Test relationships and constraints
- Location: `*.integration.test.ts`

## Setup

### 1. Ensure Seed Data Exists

```bash
# Run seed to populate test database
pnpm --filter @intelliflow/db seed
```

### 2. Import Integration Setup

```typescript
import {
  createIntegrationTestContext,
  SEED_IDS,
  getSeedData,
  verifySeedData,
  testPrisma,
} from '../test/integration-setup';
```

### 3. Verify Seed Data Before Tests

```typescript
describe('My Integration Tests', () => {
  beforeAll(async () => {
    await verifySeedData(); // Throws if seed data missing
  });

  // ... tests
});
```

## Usage Patterns

### Pattern 1: Get Seeded Entity

```typescript
it('should return a seeded lead', async () => {
  const ctx = await createIntegrationTestContext();
  const caller = leadRouter.createCaller(ctx);

  // Use SEED_IDS to reference known test data
  const result = await caller.getById({ id: SEED_IDS.leads.sarahMiller });

  expect(result.email).toBe('sarah.miller@techcorp.example.com');
  expect(result.tenantId).toBeDefined(); // ✅ Auto-verified
});
```

### Pattern 2: Query with Helper

```typescript
it('should load lead with relations', async () => {
  // Helper automatically includes relations
  const lead = await getSeedData.lead(SEED_IDS.leads.davidChen);

  expect(lead.owner).toBeDefined();
  expect(lead.contact).toBeDefined();
  expect(lead.tenantId).toBe(lead.owner.tenantId); // Same tenant
});
```

### Pattern 3: Direct Prisma Query

```typescript
it('should filter by status', async () => {
  const qualifiedLeads = await testPrisma.lead.findMany({
    where: { status: 'QUALIFIED' },
  });

  expect(qualifiedLeads.length).toBeGreaterThan(0);
  qualifiedLeads.forEach((lead) => {
    expect(lead.status).toBe('QUALIFIED');
  });
});
```

### Pattern 4: Create and Cleanup

```typescript
it('should create a new lead', async () => {
  const ctx = await createIntegrationTestContext();
  const caller = leadRouter.createCaller(ctx);

  const result = await caller.create({
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    company: 'Test Co',
    source: 'WEBSITE',
  });

  expect(result.id).toBeDefined();
  expect(result.tenantId).toBeDefined();

  // Cleanup: delete test data
  await testPrisma.lead.delete({ where: { id: result.id } });
});
```

### Pattern 5: Update and Restore

```typescript
it('should update a seeded lead', async () => {
  const lead = await getSeedData.lead(SEED_IDS.leads.amandaSmith);
  const originalCompany = lead.company;

  // Update
  await testPrisma.lead.update({
    where: { id: lead.id },
    data: { company: 'Updated Company' },
  });

  const updated = await testPrisma.lead.findUnique({
    where: { id: lead.id },
  });
  expect(updated?.company).toBe('Updated Company');

  // Restore original value
  await testPrisma.lead.update({
    where: { id: lead.id },
    data: { company: originalCompany },
  });
});
```

## Available Seed IDs

All seed IDs are available via `SEED_IDS` object:

```typescript
// Users
SEED_IDS.users.admin
SEED_IDS.users.sarahJohnson
SEED_IDS.users.mikeDavis
// ... and more

// Leads
SEED_IDS.leads.sarahMiller
SEED_IDS.leads.davidChen
SEED_IDS.leads.amandaSmith
// ... and more

// Contacts
SEED_IDS.contacts.sarahMiller
SEED_IDS.contacts.davidChen
// ... and more

// Accounts
SEED_IDS.accounts.techCorp
SEED_IDS.accounts.designCo
// ... and more

// Opportunities
SEED_IDS.opportunities.enterpriseLicenseAcme
SEED_IDS.opportunities.annualSubscriptionTechStart
// ... and more

// Tasks
SEED_IDS.tasks.followUpSarah
SEED_IDS.tasks.callDavid
// ... and more
```

See `packages/db/prisma/seed.ts` for the complete list.

## Helper Functions

### `verifySeedData()`
Throws error if seed data is missing. Call in `beforeAll()`.

### `getSeedData.lead(id)`
Returns lead with owner and contact relations.

### `getSeedData.contact(id)`
Returns contact with owner and account relations.

### `getSeedData.account(id)`
Returns account with owner and counts.

### `getSeedData.opportunity(id)`
Returns opportunity with all relations.

### `getSeedData.task(id)`
Returns task with all relations.

### `getSeedData.user(id)`
Returns user by seed ID.

### `createIntegrationTestContext()`
Creates test context with real Prisma client and services.

### `createIntegrationAdminContext()`
Creates admin context for testing admin procedures.

## Migration Guide

### Old Approach (Mocks)

```typescript
// ❌ OLD: Using mocks
import { prismaMock, mockLead } from '../test/setup';

it('should return lead', async () => {
  prismaMock.lead.findUnique.mockResolvedValue({
    ...mockLead,
    // Missing tenantId! Causes TypeScript error
  });

  const result = await caller.getById({ id: mockLead.id });
  expect(result.email).toBe(mockLead.email);
});
```

### New Approach (Real DB)

```typescript
// ✅ NEW: Using seed data
import { SEED_IDS, getSeedData } from '../test/integration-setup';

it('should return lead', async () => {
  const ctx = await createIntegrationTestContext();
  const caller = leadRouter.createCaller(ctx);

  const result = await caller.getById({ id: SEED_IDS.leads.sarahMiller });

  // tenantId automatically present from seed data
  expect(result.email).toBe('sarah.miller@techcorp.example.com');
  expect(result.tenantId).toBeDefined(); // ✅ Always passes
});
```

## Benefits

### 1. Auto-Catches Schema Changes
When `tenantId` was added to the schema:
- **Mocks**: All tests broke with TypeScript errors (needed manual updates)
- **Seed Data**: Tests passed automatically (seed data already had tenantId)

### 2. Tests Real Constraints
```typescript
it('should enforce unique email', async () => {
  // This actually tests the database constraint
  await expect(
    testPrisma.lead.create({
      data: {
        email: 'sarah.miller@techcorp.example.com', // Exists in seed
        // ... other fields
      },
    })
  ).rejects.toThrow(/unique/i);
});
```

### 3. Tests Tenant Isolation
```typescript
it('should only return leads for tenant', async () => {
  const ctx = await createIntegrationTestContext();
  const caller = leadRouter.createCaller(ctx);

  const leads = await caller.list({});

  // All leads belong to same tenant
  const tenantIds = new Set(leads.leads.map((l) => l.tenantId));
  expect(tenantIds.size).toBe(1);
});
```

### 4. Single Source of Truth
- Schema changes → Update `schema.prisma` → Run migration → Re-seed
- Tests automatically use new schema
- No manual mock updates needed

## Running Integration Tests

```bash
# Run all integration tests
pnpm test integration

# Run specific integration test
pnpm test lead.router.integration

# Re-seed database if tests fail
pnpm --filter @intelliflow/db seed
```

## Best Practices

1. **Always verify seed data** in `beforeAll()`
2. **Clean up created data** to keep database pristine
3. **Restore modified data** to original values
4. **Use SEED_IDS** for known test data
5. **Create temporary data** for destructive tests
6. **Test real constraints** (unique, foreign keys, etc.)
7. **Verify tenant isolation** in multi-tenant tests

## Examples

See these files for complete examples:
- `modules/lead/__tests__/lead.router.integration.test.ts`
- `__tests__/contract/lead.contract.integration.test.ts`

## Troubleshooting

### "No seed data found" Error
Run: `pnpm --filter @intelliflow/db seed`

### "Lead not found in seed data" Error
Check that SEED_ID matches actual seed data in `packages/db/prisma/seed.ts`

### Tests Failing After Schema Change
1. Update `schema.prisma`
2. Run migration: `pnpm run db:migrate`
3. Re-seed: `pnpm --filter @intelliflow/db seed`
4. Tests should pass (no code changes needed)
