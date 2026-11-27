/**
 * canReadEmailRecord is the shared register #64 predicate (packages/db/src/email-visibility.ts),
 * applied to one record: it asks the database for that record under `visibleMail`, so it can never
 * disagree with the email view. The predicate's own cases are tested with it, in #1579.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ visibleMail: vi.fn() }));
vi.mock('../email-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../email-access')>()),
  visibleMail: access.visibleMail,
}));

import { canReadEmailRecord } from '../email-read-access';

const findFirst = vi.fn();
const ctx = {
  prisma: { emailRecord: { findFirst } },
  tenant: { tenantId: 'tenant-1', userId: 'user-me' },
} as never;
const FRAGMENT = { AND: [{ marker: 'shared-predicate' }] };

beforeEach(() => {
  vi.clearAllMocks();
  access.visibleMail.mockResolvedValue(FRAGMENT);
});

describe('canReadEmailRecord', () => {
  it('reads the record under the shared predicate, inside the tenant', async () => {
    findFirst.mockResolvedValue({ id: 'e1' });
    await expect(canReadEmailRecord(ctx, { id: 'e1' })).resolves.toBe(true);
    expect(access.visibleMail).toHaveBeenCalledWith(ctx, ['e1']);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'e1', tenantId: 'tenant-1', AND: [FRAGMENT] },
      select: { id: true },
    });
  });

  it('is false when the predicate hides the record (personal mail of someone else)', async () => {
    findFirst.mockResolvedValue(null);
    await expect(canReadEmailRecord(ctx, { id: 'e2' })).resolves.toBe(false);
  });
});
