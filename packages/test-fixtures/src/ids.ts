/**
 * Canonical UUID constants for tests.
 *
 * Use these instead of literals like 'tenant-1' or 'owner-001' so tests stay
 * valid if any downstream validator (Zod `z.uuid()`, Prisma, tRPC) enforces
 * UUID format on tenantId / ownerId / userId / etc.
 *
 * All values are valid RFC 4122 v4 UUIDs and are stable for snapshot use.
 *
 * Naming convention:
 *   TEST_<DOMAIN>_ID       — the primary tenant/owner/user for a test
 *   TEST_<DOMAIN>_ID_ALT   — a distinct second value (e.g. cross-tenant isolation)
 *   TEST_<DOMAIN>_ID_ALT2  — a third distinct value when needed
 */

export const TEST_TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const TEST_TENANT_ID_ALT = '22222222-2222-4222-8222-222222222222';
export const TEST_TENANT_ID_ALT2 = '33333333-3333-4333-8333-333333333333';

export const TEST_OWNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const TEST_OWNER_ID_ALT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const TEST_OWNER_ID_ALT2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

export const TEST_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const TEST_USER_ID_ALT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
