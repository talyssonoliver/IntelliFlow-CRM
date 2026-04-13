# packages/test-fixtures — Shared Test Fixtures

## Purpose

Canonical constants for unit and integration tests. Prevents drift from ad-hoc
literals like `'tenant-1'`, `'tenant-001'`, `'tenant_abc'` and ensures tests
stay robust against downstream `z.uuid()` validators.

## Usage

```typescript
import { TEST_TENANT_ID, TEST_OWNER_ID } from '@intelliflow/test-fixtures';

const account = Account.create({
  name: 'Test',
  ownerId: TEST_OWNER_ID,
  tenantId: TEST_TENANT_ID,
}).value;
```

For cross-tenant isolation tests:

```typescript
import { TEST_TENANT_ID, TEST_TENANT_ID_ALT } from '@intelliflow/test-fixtures';
```

## Rules

1. **Any new test that uses a tenant/owner/user ID MUST import from this
   package.** No new `'tenant-1'` / `'owner-001'` / `'user_123'` literals.
2. **Touched tests**: When editing an existing test for any reason, migrate its
   hardcoded IDs to this module.
3. All IDs must be valid RFC 4122 v4 UUIDs so validators pass.
4. Naming convention: `TEST_<DOMAIN>_ID`, `_ALT`, `_ALT2`.
5. **No build step** — consumers import from `./src` directly. Works under
   Vitest, Next.js, and Turborepo without a compile pass.

## When to add a new constant

- New orthogonal domain (e.g. `TEST_ORG_ID`, `TEST_ACCOUNT_ID`)
- Need a 4th distinct tenant in isolation tests — add `TEST_TENANT_ID_ALT3`

## Do NOT

- Don't add random utility helpers here — keep it constants-only
- Don't put domain-specific builders here (they belong in the consuming
  package's `__tests__/fixtures/`)
