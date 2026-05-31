/**
 * Race-condition test: appointment double-booking under true DB concurrency.
 *
 * Finding RACE-BOOKI-02 (ScheduleAppointment check-then-act) / RACE-BOOKI-01.
 * Invariant: "A booking slot cannot be confirmed twice for the same
 * resource/time window" — overlapping non-cancelled appointments for the same
 * (tenant, organizer) must never both persist.
 *
 * This is a REAL-DATABASE race: each concurrent writer uses its own isolated
 * PrismaClient (own connection pool) so row-level contention actually happens —
 * a single shared client would serialise and hide the race. Skips when no
 * TEST_DATABASE_URL/DATABASE_URL is configured (describeDb/itDb).
 *
 * @see docs/operations/property-testing/invariant-ledger.md
 */

import fc from 'fast-check';
import { expect } from 'vitest';
import {
  describeDb,
  itDb,
  withIsolatedClients,
  truncate,
  runAllConcurrently,
  expectExactlyOneFulfilled,
  propertyParams,
} from '../support';

const TENANT_ID = 'tnt_proptest_booking';
const ORGANIZER_ID = 'org_proptest_1';

describeDb('Appointment double-booking under concurrency (RACE-BOOKI-02)', () => {
  itDb(
    'at most one of N concurrent overlapping bookings persists for the same organizer',
    async () => {
      await withIsolatedClients(6, async (clients) => {
        const admin = clients[0] as any;

        // Tenant is the FK target for appointments — ensure it exists once.
        await admin.tenant.upsert({
          where: { id: TENANT_ID },
          create: { id: TENANT_ID, name: 'PropTest Tenant', slug: 'proptest-booking' },
          update: {},
        });

        await fc.assert(
          fc.asyncProperty(fc.integer({ min: 2, max: 6 }), async (n) => {
            // Fresh slate each generated case.
            await truncate(admin, ['appointments']);

            // All writers target the SAME organizer + overlapping window.
            const startTime = new Date('2030-01-01T10:00:00.000Z');
            const endTime = new Date('2030-01-01T11:00:00.000Z');

            const writers = clients.slice(0, n).map(
              (client) => () =>
                (client as any).appointment.create({
                  data: {
                    title: 'Concurrent booking',
                    startTime,
                    endTime,
                    appointmentType: 'MEETING',
                    status: 'SCHEDULED',
                    tenantId: TENANT_ID,
                    organizerId: ORGANIZER_ID,
                  },
                })
            );

            const tally = await runAllConcurrently(writers);

            // Authoritative invariant: exactly one overlapping booking persisted.
            const persisted = await admin.appointment.count({
              where: {
                tenantId: TENANT_ID,
                organizerId: ORGANIZER_ID,
                status: { notIn: ['CANCELLED', 'NO_SHOW'] },
              },
            });

            expect(
              persisted,
              `${persisted} overlapping bookings persisted for ${n} concurrent writers (expected 1)`
            ).toBe(1);
            expectExactlyOneFulfilled(tally, 'appointment booking');
          }),
          propertyParams({ numRuns: 12 })
        );
      });
    },
    120_000
  );

  itDb(
    'repository save() surfaces a domain ConflictDetectionError (not a raw DB error) on overlap',
    async () => {
      const ORG2 = 'org_proptest_mapping';
      const [adaptersMod, dbMod, domainMod] = await Promise.all([
        import('@intelliflow/adapters/repositories/PrismaAppointmentRepository'),
        import('@intelliflow/db'),
        import('@intelliflow/domain'),
      ]);
      const PrismaAppointmentRepository = (adaptersMod as any).PrismaAppointmentRepository;
      const prisma = (dbMod as any).prisma;
      const Appointment = (domainMod as any).Appointment;

      await prisma.tenant.upsert({
        where: { id: TENANT_ID },
        create: { id: TENANT_ID, name: 'PropTest Tenant', slug: 'proptest-booking' },
        update: {},
      });
      await prisma.appointment.deleteMany({ where: { organizerId: ORG2 } });

      const repo = new PrismaAppointmentRepository(prisma);
      const make = () => {
        const result = Appointment.create({
          title: 'Mapping check',
          startTime: new Date('2031-02-01T10:00:00.000Z'),
          endTime: new Date('2031-02-01T11:00:00.000Z'),
          appointmentType: 'MEETING',
          organizerId: ORG2,
          tenantId: TENANT_ID,
        });
        expect(result.isSuccess).toBe(true);
        return result.value;
      };

      await repo.save(make()); // first booking succeeds
      // Second overlapping booking must be rejected as a domain conflict, not a raw PG error.
      await expect(repo.save(make())).rejects.toThrowError(/double-booking|overlap/i);
    },
    120_000
  );
});
