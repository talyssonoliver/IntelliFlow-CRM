/**
 * Race-condition test: MFA backup-code consumption under concurrency.
 *
 * Finding RACE-RBAC-M1. Invariant: a backup code may be redeemed AT MOST ONCE
 * (and durably) — the prior code consumed it only in an in-memory cache, so it
 * was reusable after eviction/restart and two concurrent attempts could both win.
 *
 * `MfaService.consumeBackupCode` now performs an atomic guarded UPDATE; this test
 * drives N concurrent attempts via N MfaService instances each on its OWN isolated
 * Prisma client (own pool) so the row-lock contention is real. Skips without the
 * opt-in (RUN_DB_PROPERTY_TESTS=1 + TEST_DATABASE_URL).
 *
 * @see docs/operations/property-testing/invariant-ledger.md
 */

import fc from 'fast-check';
import { expect } from 'vitest';
import {
  describeDb,
  itDb,
  withIsolatedClients,
  runAllConcurrently,
  propertyParams,
} from '../support';

const TENANT_ID = 'tnt_mfa_proptest';
const USER_ID = 'usr_mfa_proptest';
const KNOWN_CODE = 'ABCDEF0123';

describeDb('MFA backup-code consume under concurrency (RACE-RBAC-M1)', () => {
  itDb(
    'redeems a backup code at most once across N concurrent attempts and removes it durably',
    async () => {
      const { MfaService } = await import('../../../apps/api/src/services/mfa.service');

      await withIsolatedClients(6, async (clients) => {
        const admin = clients[0] as any;
        const seedService = new MfaService(admin);
        const knownHash = seedService.hashBackupCodes([KNOWN_CODE])[0];

        // Seed tenant -> user (FK) -> mfa settings once.
        await admin.tenant.upsert({
          where: { id: TENANT_ID },
          create: { id: TENANT_ID, name: 'MFA PropTest', slug: 'mfa-proptest' },
          update: {},
        });
        await admin.user.upsert({
          where: { id: USER_ID },
          create: { id: USER_ID, email: 'mfa-proptest@local.test', tenantId: TENANT_ID },
          update: {},
        });

        await fc.assert(
          fc.asyncProperty(fc.integer({ min: 2, max: 6 }), async (n) => {
            // Reset to a known set of codes (the same KNOWN_CODE present) each run.
            const hashed = seedService.hashBackupCodes([KNOWN_CODE, 'OTHER11111', 'OTHER22222']);
            await admin.userMfaSettings.upsert({
              where: { userId: USER_ID },
              create: { userId: USER_ID, tenantId: TENANT_ID, backupCodes: hashed },
              update: { backupCodes: hashed },
            });

            const services = clients.slice(0, n).map((c) => new MfaService(c as any));
            const tally = await runAllConcurrently(
              services.map((s) => () => s.consumeBackupCode(USER_ID, KNOWN_CODE))
            );

            const accepted = tally.fulfilled.filter(Boolean).length;
            expect(
              accepted,
              `${accepted} of ${n} concurrent consumers accepted the same backup code (expected 1)`
            ).toBe(1);

            // Durable single removal: the code's hash is gone from the persisted row.
            const row = await admin.userMfaSettings.findUnique({ where: { userId: USER_ID } });
            expect(
              (row?.backupCodes ?? []).includes(knownHash),
              'consumed backup code must be durably removed from the database'
            ).toBe(false);
          }),
          propertyParams({ numRuns: 10 })
        );
      });
    },
    120_000
  );
});
