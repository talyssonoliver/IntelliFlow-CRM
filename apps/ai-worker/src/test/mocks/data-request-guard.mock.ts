/**
 * Pass-through mock for apps/ai-worker/src/lib/data-request-guard.ts (PG-203 #1002).
 *
 * Insight and prediction job suites test job behaviour, not data requests: with this mock
 * every person is eligible and every locked write runs straight against the suite's own
 * prisma mock. The guard itself is tested in lib/__tests__/data-request-guard.test.ts, and
 * the blocked paths of each job in its own data-request tests.
 *
 * Usage:
 * ```typescript
 * vi.mock('../../lib/data-request-guard', async (importOriginal) =>
 *   (await import('../../test/mocks/data-request-guard.mock')).passThroughGuard(
 *     await importOriginal()
 *   )
 * );
 * ```
 */

import { vi } from 'vitest';

export const SUBJECT_EMAIL = 'subject@example.invalid';

export function passThroughGuard<T extends object>(actual: T) {
  return {
    ...actual,
    eligibleSubjectEmail: vi.fn(async () => SUBJECT_EMAIL),
    isRestrictedOrErased: vi.fn(async () => false),
    queuedAddressBlocked: vi.fn(async () => false),
    eligibleSubjects: vi.fn(
      async (
        _prisma: unknown,
        _tenantId: string,
        ids: { leadIds: string[]; contactIds: string[] }
      ) => ({
        leads: new Map(ids.leadIds.map((id) => [id, SUBJECT_EMAIL])),
        contacts: new Map(ids.contactIds.map((id) => [id, SUBJECT_EMAIL])),
      })
    ),
    // Every queued deal exists as queued and has no contact, so none is dropped or renamed.
    currentDeals: vi.fn(
      async (_prisma: unknown, _tenantId: string, queued: Array<{ id: string; name: string }>) =>
        queued.map((d) => ({ id: d.id, name: d.name, contactId: null }))
    ),
    // Every deal exists and has no contact, so none is dropped.
    dealContactIds: vi.fn(
      async (_prisma: unknown, _tenantId: string, dealIds: string[]) =>
        new Map<string, string | null>(dealIds.map((id) => [id, null]))
    ),
    writeSubjectIfStillEligible: vi.fn(
      async (prisma: unknown, _subject: unknown, write: (tx: unknown) => Promise<unknown>) => ({
        written: true as const,
        value: await write(prisma),
      })
    ),
  };
}
