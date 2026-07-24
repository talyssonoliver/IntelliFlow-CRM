/**
 * SEC-004: Inbound Email Webhook HMAC Signature Tests
 *
 * The inbound-email webhook (`inboundEmailRouter.webhook`) is an unauthenticated
 * publicProcedure — its input schema (`InboundEmailWebhookSchema`) validates
 * shape only. Before this fix, any unauthenticated caller who knew a tenant's
 * email domain could POST a forged "received" email that would be persisted
 * as `status: 'DELIVERED'` into that tenant's inbox (internal-phishing /
 * inbox-flooding — see `resolveTenantForInboundEmail` / `storeEmail` in
 * `apps/api/src/modules/email/inbound.router.ts`).
 *
 * This suite verifies the new fail-closed HMAC-SHA256 signature check:
 *   - unsigned request                        -> UNAUTHORIZED, not persisted
 *   - wrong signature                         -> UNAUTHORIZED, not persisted
 *   - INBOUND_EMAIL_WEBHOOK_SECRET unset       -> UNAUTHORIZED, not persisted
 *   - correctly signed request                -> success path, persisted
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPublicContext, prismaMock } from '../../../test/setup';

// Mock the InboundEmailParser from adapters - preserve other exports via importOriginal.
// Mirrors the pattern used in inbound.router.test.ts / inbound.router.b11.test.ts.
vi.mock('@intelliflow/adapters', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    InboundEmailParser: class MockInboundEmailParser {
      parse(_rawEmail: string) {
        return {
          id: 'sec-004-parsed-email',
          headers: {
            messageId: '<sec-004@example.com>',
            from: { address: 'sender@example.com', name: 'Sender Name' },
            to: [{ address: 'inbox@intelliflow.com', name: '' }],
            subject: 'SEC-004 HMAC Test',
            date: new Date().toISOString(),
          },
          body: { text: 'Hello World', html: undefined },
          textBody: 'Hello World',
          htmlBody: undefined,
          attachments: [],
          threadId: null,
          isReply: false,
          isForward: false,
          spamScore: 5, // below the 70 spam-reject threshold
        };
      }
    },
  };
});

// Import after mock is set up
import { inboundEmailRouter, computeInboundEmailWebhookSignature } from '../inbound.router';

const TEST_SECRET = 'sec-004-test-secret-do-not-use-in-prod';

/**
 * Sign a payload with the router's OWN signer (single source of truth), so a
 * test-computed signature can never drift from what the router recomputes over
 * `input`.
 */
function signPayload(payload: Record<string, unknown>, secret: string = TEST_SECRET): string {
  return computeInboundEmailWebhookSignature(payload as never, secret);
}

const basePayload = {
  from: 'sender@example.com',
  to: 'inbox@intelliflow.com',
  subject: 'SEC-004 HMAC Test',
  text: 'Hello World',
  headers: 'From: sender@example.com\r\nTo: inbox@intelliflow.com\r\nSubject: SEC-004 HMAC Test',
  provider: 'sendgrid' as const,
};

/** Build a public (unauthenticated) caller with the given request headers. */
function callerWithHeaders(headers?: Record<string, string>) {
  const ctx = createPublicContext(headers ? { req: { headers } as unknown as Request } : {});
  return inboundEmailRouter.createCaller(ctx);
}

describe('Inbound Email Webhook — SEC-004 HMAC signature verification', () => {
  const originalSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INBOUND_EMAIL_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    } else {
      process.env.INBOUND_EMAIL_WEBHOOK_SECRET = originalSecret;
    }
  });

  it('rejects a request with no signature header (UNAUTHORIZED) and does not persist', async () => {
    const caller = callerWithHeaders(); // no headers at all -> ctx.req undefined

    await expect(caller.webhook(basePayload)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(prismaMock.emailRecord.create).not.toHaveBeenCalled();
  });

  it('rejects a request with an empty headers object (no signature) and does not persist', async () => {
    const caller = callerWithHeaders({});

    await expect(caller.webhook(basePayload)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(prismaMock.emailRecord.create).not.toHaveBeenCalled();
  });

  it('rejects a wrong signature (UNAUTHORIZED) and does not persist', async () => {
    const caller = callerWithHeaders({
      'x-inbound-email-signature': 'a'.repeat(64), // well-formed hex, wrong value
    });

    await expect(caller.webhook(basePayload)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(prismaMock.emailRecord.create).not.toHaveBeenCalled();
  });

  it('rejects a signature computed with the wrong secret and does not persist', async () => {
    const signature = signPayload(basePayload, 'not-the-configured-secret');
    const caller = callerWithHeaders({ 'x-inbound-email-signature': signature });

    await expect(caller.webhook(basePayload)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(prismaMock.emailRecord.create).not.toHaveBeenCalled();
  });

  it('fails closed when INBOUND_EMAIL_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;

    // Even a signature that WOULD be valid under the test secret must be
    // rejected once the env secret is absent — fail-closed, not fail-open.
    const signature = signPayload(basePayload, TEST_SECRET);
    const caller = callerWithHeaders({ 'x-inbound-email-signature': signature });

    await expect(caller.webhook(basePayload)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(prismaMock.emailRecord.create).not.toHaveBeenCalled();
  });

  it('accepts a correctly signed request and reaches the persistence path', async () => {
    (prismaMock.user.findMany as any).mockResolvedValue([]);
    (prismaMock.emailRecord.create as any).mockResolvedValue({
      id: 'sec-004-persisted-email',
    });

    const signature = signPayload(basePayload);
    const caller = callerWithHeaders({ 'x-inbound-email-signature': signature });

    const result = await caller.webhook(basePayload);

    expect(result.success).toBe(true);
    expect(prismaMock.emailRecord.create).toHaveBeenCalledTimes(1);
    expect(result.emailId).toBe('sec-004-persisted-email');
  });

  it('signature is order-independent (canonical serialization), not raw-JSON-string dependent', async () => {
    (prismaMock.user.findMany as any).mockResolvedValue([]);
    (prismaMock.emailRecord.create as any).mockResolvedValue({
      id: 'sec-004-persisted-email-2',
    });

    // Same fields, different insertion order — canonical serialization sorts
    // keys, so the signature computed over either object form is identical.
    const reordered = {
      provider: basePayload.provider,
      subject: basePayload.subject,
      to: basePayload.to,
      from: basePayload.from,
      headers: basePayload.headers,
      text: basePayload.text,
    };
    const signature = signPayload(reordered);
    const caller = callerWithHeaders({ 'x-inbound-email-signature': signature });

    const result = await caller.webhook(basePayload);

    expect(result.success).toBe(true);
    expect(prismaMock.emailRecord.create).toHaveBeenCalledTimes(1);
  });
});
