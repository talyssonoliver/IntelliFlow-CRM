/**
 * Webhook operations are platform-operator only.
 *
 * Everything except `handleWebhook` acts on the platform-wide webhook source registry, retry
 * queue and dead-letter queue, which hold every tenant's deliveries. A tenant ADMIN is not a
 * platform operator (every sign-up is ADMIN of its own tenant), so these routes use
 * `platformAdminProcedure`: a verified email listed in PLATFORM_ADMIN_EMAILS (ADR-070).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { webhooksRouter } from '../webhooks.router';
import { createAdminContext, createTestContext } from '../../../test/setup';

const OPERATOR = 'ops@example.invalid';

type Caller = ReturnType<typeof webhooksRouter.createCaller>;

const OPERATIONS: Record<string, (c: Caller) => Promise<unknown>> = {
  registerSource: (c) => c.registerSource({ name: 'ci-source', secret: 'x'.repeat(12) }),
  unregisterSource: (c) => c.unregisterSource({ name: 'ci-source' }),
  getSources: (c) => c.getSources(),
  getMetrics: (c) => c.getMetrics(),
  processRetries: (c) => c.processRetries(),
  getDeadLetterEntries: (c) => c.getDeadLetterEntries(),
  reprocessDeadLetter: (c) => c.reprocessDeadLetter({ eventId: 'evt-1' }),
  cleanup: (c) => c.cleanup(),
};

function withEmail<T extends { user?: unknown }>(ctx: T, email: string): T {
  const user = ctx.user as { email?: string; emailVerified?: boolean };
  user.email = email;
  user.emailVerified = true;
  return ctx;
}

describe('webhooks router: platform webhook operations are platform-operator only', () => {
  beforeEach(() => {
    vi.stubEnv('PLATFORM_ADMIN_EMAILS', OPERATOR);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(Object.keys(OPERATIONS))('%s is FORBIDDEN for a plain user', async (name) => {
    const caller = webhooksRouter.createCaller(
      withEmail(createTestContext(), 'user@example.invalid')
    );
    await expect(OPERATIONS[name](caller)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it.each(Object.keys(OPERATIONS))('%s is FORBIDDEN for a tenant admin', async (name) => {
    const caller = webhooksRouter.createCaller(
      withEmail(createAdminContext(), 'admin@example.invalid')
    );
    await expect(OPERATIONS[name](caller)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it.each(Object.keys(OPERATIONS))('%s passes the guard for a platform operator', async (name) => {
    const caller = webhooksRouter.createCaller(withEmail(createAdminContext(), OPERATOR));
    // Any downstream error (unknown source, empty queue) must not be the auth guard.
    const outcome = await OPERATIONS[name](caller).then(
      () => 'OK',
      (err: unknown) => (err instanceof TRPCError ? err.code : 'NON_TRPC_ERROR')
    );
    expect(['FORBIDDEN', 'UNAUTHORIZED', 'NON_TRPC_ERROR']).not.toContain(outcome);
  });
});
