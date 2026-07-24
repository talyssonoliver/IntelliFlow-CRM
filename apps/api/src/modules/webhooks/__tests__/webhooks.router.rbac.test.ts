/**
 * SEC-003 regression: webhook-source registry mutations are ADMIN-only.
 *
 * `registerSource` / `unregisterSource` configure how the platform trusts
 * inbound webhook callers (secrets, signature verifiers). They must be gated by
 * `adminProcedure` (isAuthed + isAdmin), NOT `protectedProcedure` (any authed
 * user). Before this fix any authenticated non-admin could register/unregister
 * a webhook source. This test locks the guard in.
 */
import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { webhooksRouter } from '../webhooks.router';
import { createTestContext, createAdminContext } from '../../../test/setup';

describe('SEC-003 webhooks router — source registry is admin-only', () => {
  const validSource = { name: 'ci-source', secret: 's3cret-value' };

  it('rejects registerSource for a non-admin (USER) caller with FORBIDDEN', async () => {
    const caller = webhooksRouter.createCaller(createTestContext()); // default role USER
    await expect(caller.registerSource(validSource)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects unregisterSource for a non-admin (USER) caller with FORBIDDEN', async () => {
    const caller = webhooksRouter.createCaller(createTestContext());
    await expect(caller.unregisterSource({ name: 'ci-source' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('does NOT reject an ADMIN caller on the admin guard (registerSource)', async () => {
    const caller = webhooksRouter.createCaller(createAdminContext());
    // The admin passes isAdmin; any downstream error must NOT be the auth guard.
    try {
      await caller.registerSource(validSource);
    } catch (err) {
      if (err instanceof TRPCError) {
        expect(err.code).not.toBe('FORBIDDEN');
        expect(err.code).not.toBe('UNAUTHORIZED');
      }
    }
  });
});
