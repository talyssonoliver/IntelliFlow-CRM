/**
 * Webhook operations are platform-operator only.
 *
 * Everything except `handleWebhook` acts on the platform-wide webhook source registry, retry
 * queue and dead-letter queue, which hold every tenant's deliveries. A tenant ADMIN is not a
 * platform operator (every sign-up is ADMIN of its own tenant), so these routes use
 * `platformAdminProcedure`: a verified email listed in PLATFORM_ADMIN_EMAILS (ADR-070).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webhooksRouter } from '../webhooks.router';
import { createAdminContext, createTestContext } from '../../../test/setup';

// The router loads WebhookService from @intelliflow/adapters at call time; a fake one lets the
// operator cases run each route to its result.
vi.mock('@intelliflow/adapters', () => ({
  WebhookService: class {
    registerSource() {}
    unregisterSource(name: string) {
      return name === 'ci-source';
    }
    getSources() {
      return [{ name: 'ci-source' }];
    }
    getMetrics() {
      return { received: 3 };
    }
    async processRetries() {
      return { processed: 2, succeeded: 1, failed: 1 };
    }
    getDeadLetterEntries() {
      return [{ eventId: 'evt-1' }];
    }
    async reprocessDeadLetter(eventId: string) {
      return eventId === 'evt-1';
    }
    cleanup() {
      return { idempotencyRemoved: 4 };
    }
  },
}));

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

  describe('a platform operator', () => {
    const operator = () => webhooksRouter.createCaller(withEmail(createAdminContext(), OPERATOR));

    it('registers and unregisters a source', async () => {
      await expect(OPERATIONS.registerSource(operator())).resolves.toMatchObject({
        success: true,
        sourceName: 'ci-source',
      });
      await expect(OPERATIONS.unregisterSource(operator())).resolves.toMatchObject({
        success: true,
      });
      await expect(operator().unregisterSource({ name: 'missing' })).rejects.toThrow(/not found/);
    });

    it('reads sources and metrics', async () => {
      await expect(operator().getSources()).resolves.toEqual({
        sources: [{ name: 'ci-source' }],
        count: 1,
      });
      await expect(operator().getMetrics()).resolves.toEqual({ received: 3 });
    });

    it('processes retries and dead letters, and cleans up', async () => {
      await expect(operator().processRetries()).resolves.toEqual({
        success: true,
        processed: 2,
        succeeded: 1,
        failed: 1,
      });
      await expect(operator().getDeadLetterEntries()).resolves.toEqual({
        entries: [{ eventId: 'evt-1' }],
        count: 1,
      });
      await expect(OPERATIONS.reprocessDeadLetter(operator())).resolves.toMatchObject({
        success: true,
      });
      await expect(operator().reprocessDeadLetter({ eventId: 'gone' })).rejects.toThrow(
        /not found/
      );
      await expect(operator().cleanup()).resolves.toEqual({
        success: true,
        idempotencyRemoved: 4,
      });
    });
  });
});
