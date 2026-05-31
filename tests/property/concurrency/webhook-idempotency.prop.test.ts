/**
 * Race-condition test: webhook idempotency under concurrent duplicate delivery.
 *
 * Finding RACE-WEBHO (in-memory IdempotencyStore check-then-act).
 * Invariant: "Idempotency keys must produce at-most-once side effects" and
 * "Duplicate webhook/event IDs must not duplicate business effects."
 *
 * The race is pure in-process: WebhookFramework.handle() checks `idempotency.has()`
 * but only `idempotency.set()`s AFTER awaiting the handler chain — so N concurrent
 * deliveries of the same event id all pass the gate before any marks it processed,
 * and every one executes the handlers.
 *
 * This needs no database — it reproduces deterministically with concurrent
 * in-process calls (a single shared framework instance, one Node event loop).
 *
 * @see docs/operations/property-testing/invariant-ledger.md
 */

import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { createWebhookFramework, hmacSha256Verify } from '@intelliflow/webhooks';
import { runConcurrently, propertyParams } from '../support';

describe('WebhookFramework idempotency — concurrent duplicate delivery (RACE-WEBHO)', () => {
  it('applies handler side effects at most once across N concurrent duplicate deliveries', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 8 }), async (n) => {
        let sideEffects = 0;

        const framework = createWebhookFramework({ retryEnabled: false, loggingEnabled: false });
        framework.registerSource({
          name: 'test',
          secret: '', // empty secret => no signature required, focuses the test on idempotency
          signatureHeader: 'x-signature',
          signatureVerifier: hmacSha256Verify,
        });
        framework.on('test.event', async () => {
          // The business side effect that must fire at most once per event id.
          await Promise.resolve();
          sideEffects += 1;
        });

        // Same event id across every concurrent delivery => one idempotency key.
        const rawBody = JSON.stringify({ id: 'evt_fixed_1', type: 'test.event', data: { v: 1 } });

        const tally = await runConcurrently(n, () => framework.handle('test', rawBody, {}));

        // INVARIANT: a duplicated webhook delivery applies its side effect exactly once.
        expect(
          sideEffects,
          `handler fired ${sideEffects}× for ${n} concurrent duplicate deliveries (expected 1)`
        ).toBe(1);

        // Every delivery is acknowledged (none rejected) — duplicates return 200/"Duplicate event".
        expect(tally.fulfilledCount).toBe(n);
      }),
      propertyParams()
    );
  });
});
