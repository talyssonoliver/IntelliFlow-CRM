/**
 * PG-203 — event types and public booking, real-Database integration test (ADR-083).
 *
 * Proves the Class A migrations 20261021120000..120500 on a real Postgres: named CHECKs,
 * uniques (including the SQL-only lower(name) index), the composite tenant-safe FKs with
 * their column-list ON DELETE SET NULL, NO ACTION on the host FK during a tenant delete,
 * and RLS on the two new tables. It then drives `publicBooking.book` against the real DB:
 * the booking lands in the handle's tenant only, a new booker becomes a Lead in the same
 * transaction, and the per-tenant advisory lock serialises two bookings of one slot
 * (with a lock-free control proving the test can see a race) and bounds the wait (NF-004).
 *
 * Skips cleanly (with a visible reason) when DATABASE_URL is not set.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { LeadService } from '../../packages/application/src/services/LeadService';
import { PrismaLeadRepository } from '../../packages/adapters/src/repositories/PrismaLeadRepository';
import { InMemoryEventBus } from '../../packages/adapters/src/external/InMemoryEventBus';
import { applySchemaSql, createIndexConcurrently } from './schema-lock';

// Post-commit side effects talk to Redis/BullMQ; they are covered by the unit suite.
vi.mock('../../apps/api/src/modules/legal/appointment-side-effects', () => ({
  onAppointmentCreated: vi.fn(async () => undefined),
}));
vi.mock('../../apps/api/src/modules/lead/lead-scoring-enqueue', () => ({
  enqueueLeadScoring: vi.fn(async () => undefined),
}));

import {
  publicBookingRouter,
  isSlotTakenError,
} from '../../apps/api/src/modules/calendar/public-booking.router';

const MIGRATIONS = join(__dirname, '../../packages/db/prisma/migrations');
const migrationFile = (name: string) =>
  readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf-8')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

/** Split migration SQL into statements, keeping `DO $$ ... $$` blocks whole. */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollar = false;
  for (let i = 0; i < sql.length; i++) {
    if (sql.startsWith('$$', i)) {
      inDollar = !inDollar;
      current += '$$';
      i++;
      continue;
    }
    const ch = sql[i];
    if (ch === ';' && !inDollar) {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping event-types integration test: DATABASE_URL not set');
}

/** Already exists (type, constraint, policy), duplicate column, duplicate relation. */
const ALREADY_THERE = ['42710', '42701', '42P07'];
const CONCURRENT_INDEXES = [
  ['tenants_bookingHandle_key', '20261021120200_tenants_booking_handle_idx'],
  ['leads_tenantId_id_key', '20261021120300_leads_tenant_id_key'],
] as const;

/**
 * CI builds its test database with `prisma db push`: tables and columns exist, but the
 * named CHECKs, the lower(name) index, the column-list SET NULL FKs and the RLS policies
 * do not. When the probe CHECK is missing, rebuild the two PG-203 tables (they hold only
 * this suite's rows) from the migrations' own SQL and add the shared-table constraints,
 * tolerating what db push already created. `ALTER TYPE ... ADD VALUE` is never replayed:
 * db push creates the enum value, and the gate below refuses to run without it.
 */
async function ensureMigrationSql(client: any): Promise<string | null> {
  const booking: unknown[] = await client.$queryRawUnsafe(
    `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'LeadSource' AND e.enumlabel = 'BOOKING'`
  );
  if (booking.length === 0) return 'LeadSource has no BOOKING value (migrations not applied)';

  for (const [index, migration] of CONCURRENT_INDEXES) {
    const valid: unknown[] = await client.$queryRawUnsafe(
      `SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.relname = $1 AND i.indisvalid AND i.indisready`,
      index
    );
    if (valid.length > 0) continue;
    await applySchemaSql(DB_URL!, [`DROP INDEX IF EXISTS "${index}"`]);
    const [statement] = splitStatements(migrationFile(migration));
    await createIndexConcurrently(DB_URL!, statement);
  }

  const present: unknown[] = await client.$queryRawUnsafe(
    `SELECT 1 FROM pg_constraint WHERE conname = 'event_types_colorToken_check'`
  );
  if (present.length > 0) return null;
  const statements = [
    'DROP TABLE IF EXISTS "booking_attempts", "event_types" CASCADE',
    // db push named these FKs differently (or not at all); the migrations re-add them.
    'ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_tenantId_leadId_fkey"',
    ...[
      '20261021120100_event_types',
      '20261021120400_appointments_lead_fk',
      '20261021120500_validate_booking_constraints',
    ].flatMap((m) => splitStatements(migrationFile(m))),
  ];
  await applySchemaSql(DB_URL!, statements, { tolerate: ALREADY_THERE });
  return null;
}

const RUN = `pg203_${Date.now()}_${randomBytes(3).toString('hex')}`;
const TENANT_A = `${RUN}_a`;
const TENANT_B = `${RUN}_b`;
const TENANT_GONE = `${RUN}_gone`;
const TENANTS = [TENANT_A, TENANT_B, TENANT_GONE];
const tag = randomBytes(3).toString('hex');
const HANDLE_A = `pg203-${tag}-a`;
const HANDLE_B = `pg203-${tag}-b`;
const HOST_A = `${RUN}_host_a`;
const HOST_B = `${RUN}_host_b`;
const HOST_GONE = `${RUN}_host_gone`;
const HOST_A2 = `${RUN}_host_a2`;

/** Postgres error code raised by a failed statement, whatever layer wrapped it. */
function pgCode(error: unknown): string | undefined {
  const meta = (error as { meta?: { code?: string } })?.meta;
  if (meta?.code && /^\d{5}$/.test(meta.code)) return meta.code;
  const rawCode = /Code: `?(\d{5})`?/.exec(String((error as { message?: string })?.message ?? ''));
  if (rawCode) return rawCode[1];
  const text = JSON.stringify(error, Object.getOwnPropertyNames(error as object)) ?? '';
  const match = /"(?:code|originalCode)":"(\d{5}|P\d{4})"/.exec(text);
  if (match) return match[1];
  const code = (error as { code?: string })?.code;
  if (code) return code;
  const message = String((error as { message?: string })?.message ?? '');
  if (/check constraint|CheckConstraint/i.test(message + text)) return '23514';
  if (/unique constraint|duplicate key|UniqueConstraint/i.test(message + text)) return '23505';
  if (/foreign key|ForeignKeyConstraint/i.test(message + text)) return '23503';
  return undefined;
}

async function expectRejected(promise: Promise<unknown>, codes: string[]): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, 'statement should have been rejected').toBeDefined();
  const code = pgCode(caught);
  if (!code || !codes.includes(code)) {
    console.log('Unexpected rejection shape:', String((caught as Error)?.message).slice(0, 400));
  }
  expect(codes).toContain(code);
}

const UNIQUE = ['23505', 'P2002'];
const CHECK = ['23514', 'P2004', 'P2010'];
const FOREIGN_KEY = ['23503', 'P2003'];
/** An invalid enum literal fails before the CHECK can (22P02); either rejects the row. */
const CHECK_OR_ENUM = [...CHECK, '22P02'];

const MS_PER_MINUTE = 60_000;

/** A Monday 10:00 UTC at least a week ahead (inside notice and horizon, on the step). */
function futureMonday(hour: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 + ((8 - d.getUTCDay()) % 7));
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

describeDb('PG-203 event types and public booking (real DB)', () => {
  let prisma: any;
  let dbReady = false;
  let eventBus: InMemoryEventBus;
  let ipCounter = 0;

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    const skipReason = await ensureMigrationSql(prisma);
    if (skipReason) {
      console.log(`Skipping PG-203 integration test: ${skipReason}`);
      return;
    }
    // Sweep rows left by crashed runs of this suite (older than one day).
    const stale = `pg203_${Date.now() - 86_400_000}`;
    await prisma.$executeRawUnsafe(
      `DELETE FROM appointments WHERE "tenantId" LIKE 'pg203\\_%' AND "tenantId" < $1`,
      stale
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id LIKE 'pg203\\_%' AND id < $1`,
      stale
    );
    await prisma.tenant.create({
      data: { id: TENANT_A, name: 'Smith Law', slug: TENANT_A, bookingHandle: HANDLE_A },
    });
    await prisma.tenant.create({
      data: { id: TENANT_B, name: 'Jones Law', slug: TENANT_B, bookingHandle: HANDLE_B },
    });
    await prisma.tenant.create({ data: { id: TENANT_GONE, name: 'Gone', slug: TENANT_GONE } });
    for (const [id, tenantId] of [
      [HOST_A, TENANT_A],
      [HOST_B, TENANT_B],
      [HOST_GONE, TENANT_GONE],
      [HOST_A2, TENANT_A],
    ]) {
      await prisma.user.create({ data: { id, tenantId, email: `${id}@example.invalid` } });
    }
    for (const tenantId of [TENANT_A, TENANT_B]) {
      await prisma.appointmentSettings.create({
        data: {
          tenantId,
          defaultTimezone: 'UTC',
          availabilityConfiguredAt: new Date(),
          defaultBufferBeforeMinutes: 0,
          defaultBufferAfterMinutes: 0,
        },
      });
      for (let weekday = 0; weekday < 7; weekday++) {
        await prisma.availabilityHour.create({
          data: { tenantId, weekday, startMinute: 9 * 60, endMinute: 17 * 60 },
        });
      }
    }
    eventBus = new InMemoryEventBus({ record: true });
    dbReady = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (dbReady) {
      const tenants = { in: TENANTS };
      await prisma.appointment.deleteMany({ where: { tenantId: tenants } });
      await prisma.leadActivity.deleteMany({ where: { tenantId: tenants } });
      await prisma.lead.deleteMany({ where: { tenantId: tenants } });
      await prisma.bookingAttempt.deleteMany({ where: { tenantId: tenants } });
      await prisma.eventType.deleteMany({ where: { tenantId: tenants } });
      await prisma.availabilityHour.deleteMany({ where: { tenantId: tenants } });
      await prisma.appointmentSettings.deleteMany({ where: { tenantId: tenants } });
      await prisma.user.deleteMany({ where: { tenantId: tenants } });
      await prisma.tenant.deleteMany({ where: { id: tenants } });
    }
    await prisma.$disconnect();
  });

  const eventType = (tenantId: string, hostUserId: string, data: Record<string, unknown> = {}) =>
    prisma.eventType.create({
      data: {
        tenantId,
        hostUserId,
        name: `Call ${randomBytes(3).toString('hex')}`,
        slug: `call-${randomBytes(3).toString('hex')}`,
        ...data,
      },
    });

  /** Insert one event type row by SQL, with `column` overriding its default value. */
  const rawEventType = (column: string, value: unknown) => {
    const row: Record<string, unknown> = {
      id: randomBytes(8).toString('hex'),
      tenantId: TENANT_A,
      name: `Raw ${randomBytes(3).toString('hex')}`,
      slug: `raw-${randomBytes(3).toString('hex')}`,
      hostUserId: HOST_A,
      [column]: value,
    };
    const columns = Object.keys(row);
    const names = columns.map((c) => '"' + c + '"').join(', ');
    const params = columns.map((_, i) => '$' + String(i + 1)).join(', ');
    return prisma.$executeRawUnsafe(
      `INSERT INTO event_types (${names}, "updatedAt") VALUES (${params}, now())`,
      ...Object.values(row)
    );
  };

  /**
   * A seed appointment. Each gets its own hour a month out: appointments carry the
   * per-organizer no-overlap exclusion constraint (20260530000000), so seeds must not overlap.
   */
  let seedHour = 0;
  const appointment = (
    tenantId: string,
    organizerId: string,
    data: Record<string, unknown> = {}
  ) => {
    seedHour += 1;
    const startTime = new Date(
      futureMonday(0).getTime() + (30 * 24 + seedHour) * 60 * MS_PER_MINUTE
    );
    return prisma.appointment.create({
      data: {
        tenantId,
        organizerId,
        title: 'Seed',
        startTime,
        endTime: new Date(startTime.getTime() + 30 * MS_PER_MINUTE),
        ...data,
      },
    });
  };

  function context() {
    ipCounter += 1;
    const leadService = new LeadService(
      new PrismaLeadRepository(prisma) as never,
      null as never,
      null as never,
      null as never,
      eventBus,
      null as never
    );
    return {
      prisma,
      req: new Request('http://booking.example.invalid/', {
        headers: { 'x-forwarded-for': `198.51.100.${ipCounter}` },
      }),
      services: { lead: leadService },
      adapters: { notificationService: { sendEmail: vi.fn(async () => ({ success: true })) } },
      user: undefined,
    } as never;
  }

  const book = (handle: string, slug: string, start: Date, email: string) =>
    publicBookingRouter.createCaller(context()).book({
      handle,
      slug,
      start: start.toISOString(),
      name: 'Ada Lovelace',
      email,
      answers: {},
      consent: true,
    });

  describe('constraints', () => {
    it('has every named CHECK', async () => {
      const rows: Array<{ conname: string }> = await prisma.$queryRawUnsafe(
        `SELECT conname FROM pg_constraint
          WHERE conname LIKE 'event_types\\_%\\_check' OR conname LIKE 'booking_attempts\\_%\\_check'
             OR conname IN ('tenants_bookingHandle_check', 'tenants_bookingPrivacyUrl_check',
                            'appointments_bookedVia_check', 'appointments_bookingAnswers_check')`
      );
      expect(rows.map((r) => r.conname).sort()).toEqual(
        [
          'appointments_bookedVia_check',
          'appointments_bookingAnswers_check',
          'booking_attempts_emailHash_check',
          'booking_attempts_ipHash_check',
          'event_types_colorToken_check',
          'event_types_description_check',
          'event_types_durationMinutes_check',
          'event_types_leadSource_check',
          'event_types_locationDetails_check',
          'event_types_name_check',
          'event_types_requiredFields_check',
          'event_types_slug_check',
          'tenants_bookingHandle_check',
          'tenants_bookingPrivacyUrl_check',
        ].sort()
      );
    });

    it.each([
      ['colorToken gold', 'colorToken', 'gold'],
      ['slug with a space', 'slug', 'bad slug'],
      ['duration 4', 'durationMinutes', 4],
      ['duration 481', 'durationMinutes', 481],
    ])('rejects an event type with %s', async (_label, column, value) => {
      await expectRejected(rawEventType(column, value), CHECK);
    });

    it('rejects an unknown required field and lead source EVENT', async () => {
      await expectRejected(
        prisma.$executeRawUnsafe(
          `INSERT INTO event_types (id, "tenantId", name, slug, "hostUserId", "updatedAt", "requiredFields")
           VALUES ($1, $2, 'Req', 'req', $3, now(), ARRAY['ssn']::text[])`,
          randomBytes(8).toString('hex'),
          TENANT_A,
          HOST_A
        ),
        CHECK
      );
      await expectRejected(
        prisma.$executeRawUnsafe(
          `INSERT INTO event_types (id, "tenantId", name, slug, "hostUserId", "updatedAt", "leadSource")
           VALUES ($1, $2, 'Src', 'src', $3, now(), 'EVENT')`,
          randomBytes(8).toString('hex'),
          TENANT_A,
          HOST_A
        ),
        CHECK_OR_ENUM
      );
    });

    it('rejects a bad handle, an http privacy URL and oversized booking answers', async () => {
      for (const data of [{ bookingHandle: 'Bad_Handle' }, { bookingHandle: 'ab' }]) {
        await expectRejected(prisma.tenant.update({ where: { id: TENANT_GONE }, data }), CHECK);
      }
      await expectRejected(
        prisma.tenant.update({
          where: { id: TENANT_GONE },
          data: { bookingPrivacyUrl: 'http://firm.example.invalid/privacy' },
        }),
        CHECK
      );
      await expectRejected(
        appointment(TENANT_A, HOST_A, { bookingAnswers: { notes: 'x'.repeat(5000) } }),
        CHECK
      );
    });

    it('keeps slugs and names unique per tenant (case-insensitive names) and handles global', async () => {
      await eventType(TENANT_A, HOST_A, { name: 'Intro', slug: 'intro' });
      await expectRejected(eventType(TENANT_A, HOST_A, { slug: 'intro' }), UNIQUE);
      await expectRejected(eventType(TENANT_A, HOST_A, { name: 'INTRO' }), UNIQUE);
      await expect(
        eventType(TENANT_B, HOST_B, { name: 'Intro', slug: 'intro' })
      ).resolves.toBeDefined();
      await expectRejected(
        prisma.tenant.update({ where: { id: TENANT_GONE }, data: { bookingHandle: HANDLE_A } }),
        UNIQUE
      );
    });
  });

  describe('foreign keys', () => {
    it('deleting an event type clears only the link; the appointment survives', async () => {
      const type = await eventType(TENANT_A, HOST_A);
      const appt = await appointment(TENANT_A, HOST_A, { eventTypeId: type.id });
      await prisma.eventType.delete({ where: { id: type.id } });
      const after = await prisma.appointment.findUnique({ where: { id: appt.id } });
      expect(after).not.toBeNull();
      expect(after.eventTypeId).toBeNull();
      expect(after.tenantId).toBe(TENANT_A);
    });

    it('deleting a lead clears only the link', async () => {
      const lead = await prisma.lead.create({
        data: { tenantId: TENANT_A, ownerId: HOST_A, email: `${RUN}-l@example.invalid` },
      });
      const appt = await appointment(TENANT_A, HOST_A, { leadId: lead.id });
      await prisma.lead.delete({ where: { id: lead.id } });
      const after = await prisma.appointment.findUnique({ where: { id: appt.id } });
      expect(after.leadId).toBeNull();
      expect(after.tenantId).toBe(TENANT_A);
    });

    it("rejects another tenant's event type or lead", async () => {
      const foreignType = await eventType(TENANT_B, HOST_B);
      const foreignLead = await prisma.lead.create({
        data: { tenantId: TENANT_B, ownerId: HOST_B, email: `${RUN}-fl@example.invalid` },
      });
      await expectRejected(
        appointment(TENANT_A, HOST_A, { eventTypeId: foreignType.id }),
        FOREIGN_KEY
      );
      await expectRejected(appointment(TENANT_A, HOST_A, { leadId: foreignLead.id }), FOREIGN_KEY);
    });

    it('a tenant delete with event types and their host present succeeds (NO ACTION)', async () => {
      await eventType(TENANT_GONE, HOST_GONE);
      await prisma.tenant.delete({ where: { id: TENANT_GONE } });
      const left: Array<{ n: number }> = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM event_types WHERE "tenantId" = $1`,
        TENANT_GONE
      );
      expect(left[0].n).toBe(0);
    });
  });

  describe('row-level security', () => {
    it('enables RLS with USING and WITH CHECK on both new tables', async () => {
      const policies: Array<{ qual: string; with_check: string }> = await prisma.$queryRawUnsafe(
        `SELECT qual, with_check FROM pg_policies WHERE tablename IN ('event_types','booking_attempts')`
      );
      expect(policies).toHaveLength(2);
      for (const p of policies) {
        expect(p.qual).toContain('app.current_tenant_id');
        expect(p.with_check).toContain('app.current_tenant_id');
      }
    });

    it("hides B's event types and booking attempts from a tenant-A session", async (ctx) => {
      const roles: Array<{ exists: boolean }> = await prisma.$queryRawUnsafe(
        `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AS exists`
      );
      if (!roles[0]?.exists) {
        console.log('RLS session check NOT proven: no "authenticated" role (disclosed skip)');
        ctx.skip();
      }
      await eventType(TENANT_B, HOST_B);
      await prisma.bookingAttempt.create({
        data: { tenantId: TENANT_B, emailHash: 'a'.repeat(64), ipHash: 'b'.repeat(64) },
      });
      let seen: { types: Array<{ tenantId: string }>; attempts: Array<{ tenantId: string }> };
      try {
        seen = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
          await tx.$executeRawUnsafe(
            `SELECT set_config('app.current_tenant_id', $1, true)`,
            TENANT_A
          );
          return {
            types: await tx.$queryRawUnsafe(`SELECT "tenantId" FROM event_types`),
            attempts: await tx.$queryRawUnsafe(`SELECT "tenantId" FROM booking_attempts`),
          };
        });
      } catch (error) {
        console.log(
          'RLS session check NOT proven: role lacks grants (disclosed skip)',
          pgCode(error)
        );
        ctx.skip();
        return;
      }
      expect(seen.types.every((r) => r.tenantId === TENANT_A)).toBe(true);
      expect(seen.attempts.every((r) => r.tenantId === TENANT_A)).toBe(true);
    });
  });

  describe('publicBooking.book against the real DB', () => {
    it("books into the handle's tenant only and creates the Lead in the same transaction", async () => {
      const typeA = await eventType(TENANT_A, HOST_A, { slug: 'book-a' });
      const typeB = await eventType(TENANT_B, HOST_B, { slug: 'book-a' });
      const start = futureMonday(9);
      const email = `${RUN}-booker@example.invalid`;
      eventBus.clearPublishedEvents();

      await expect(book(HANDLE_B, 'book-a', start, email)).resolves.toMatchObject({
        startsAt: start.toISOString(),
        timezone: 'UTC',
      });

      const rows = await prisma.appointment.findMany({
        where: { bookerEmail: email },
        select: { tenantId: true, eventTypeId: true, leadId: true, bookedVia: true },
      });
      expect(rows).toEqual([
        expect.objectContaining({
          tenantId: TENANT_B,
          eventTypeId: typeB.id,
          bookedVia: 'PUBLIC_LINK',
        }),
      ]);
      expect(rows[0].eventTypeId).not.toBe(typeA.id);
      // Owner Q20: the lead is created and linked after the reply, under the same lock.
      const leadId = await vi.waitFor(
        async () => {
          const linked = await prisma.appointment.findFirst({
            where: { bookerEmail: email },
            select: { leadId: true },
          });
          expect(linked?.leadId).toBeTruthy();
          return linked!.leadId as string;
        },
        { timeout: 5_000, interval: 50 }
      );
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      expect(lead).toMatchObject({ tenantId: TENANT_B, email, source: 'BOOKING', ownerId: HOST_B });
      expect(await prisma.lead.count({ where: { tenantId: TENANT_A, email } })).toBe(0);
      // The container wires an InMemoryEventBus (no outbox table is written): the
      // LeadCreated event is published through the bus with the lead's transaction.
      expect(eventBus.getPublishedEvents().map((e) => e.eventType)).toContain('lead.created');
    });

    it('the lock serialises two bookings of one slot: one appointment, the second gets CONFLICT', async () => {
      await eventType(TENANT_A, HOST_A, { slug: 'locked' });
      const start = futureMonday(10);
      const lockKey = `booking:${TENANT_A}`;
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      let locked!: () => void;
      const isLocked = new Promise<void>((resolve) => (locked = resolve));

      const holder = prisma.$transaction(
        async (tx: any) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
          locked();
          await released;
          await tx.appointment.create({
            data: {
              tenantId: TENANT_A,
              organizerId: HOST_A,
              title: 'Taken first',
              startTime: start,
              endTime: new Date(start.getTime() + 30 * MS_PER_MINUTE),
            },
          });
        },
        { timeout: 30_000 }
      );
      await isLocked;
      const second = book(HANDLE_A, 'locked', start, `${RUN}-second@example.invalid`).then(
        () => 'booked',
        (error: { code?: string; message?: string }) => `${error.code}: ${error.message}`
      );

      // Deterministic: wait until the booking is visibly queued on THIS advisory lock.
      await vi.waitFor(
        async () => {
          const waiting: Array<{ n: number }> = await prisma.$queryRawUnsafe(
            `SELECT count(*)::int AS n FROM pg_locks l
              WHERE l.locktype = 'advisory' AND NOT l.granted AND l.objsubid = 1
                AND ((l.classid::bigint << 32) | l.objid::bigint) = hashtextextended($1, 0)`,
            lockKey
          );
          expect(waiting[0].n).toBe(1);
        },
        { timeout: 1_500, interval: 25 }
      );
      release();
      await holder;

      await expect(second).resolves.toBe(
        'CONFLICT: That time is no longer available. Please pick another.'
      );
      expect(
        await prisma.appointment.count({ where: { tenantId: TENANT_A, startTime: start } })
      ).toBe(1);
    });

    it("recognises the real organizer-overlap rejection as 'slot taken'", async () => {
      // A staff appointment does not take the booking lock; if one lands between the locked
      // re-check and the insert, the exclusion constraint rejects the booking's insert.
      const first = await appointment(TENANT_A, HOST_A);
      let caught: unknown;
      try {
        await appointment(TENANT_A, HOST_A, { startTime: first.startTime, endTime: first.endTime });
      } catch (error) {
        caught = error;
      }
      expect(caught, 'the overlapping insert should be rejected').toBeDefined();
      expect(isSlotTakenError(caught)).toBe(true);
      expect(isSlotTakenError(new Error('unrelated failure'))).toBe(false);
    });

    it('control: without the lock, two check-then-insert writers both pass a one-per-day check', async () => {
      // The no-overlap constraint already stops one host being double-booked; the lock is what
      // keeps tenant-wide checks (the daily cap, ADR-081) honest across hosts. Two writers for
      // two hosts each read "none booked that day", then both insert: the race the lock prevents.
      const start = futureMonday(11);
      const dayStart = new Date(start.getTime() - 11 * 60 * MS_PER_MINUTE);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * MS_PER_MINUTE);
      const insert = (organizerId: string) =>
        prisma.$transaction(async (tx: any) => {
          const booked = await tx.appointment.count({
            where: { tenantId: TENANT_A, title: 'Race', startTime: { gte: dayStart, lt: dayEnd } },
          });
          await new Promise((resolve) => setTimeout(resolve, 200));
          if (booked === 0) {
            await tx.appointment.create({
              data: {
                tenantId: TENANT_A,
                organizerId,
                title: 'Race',
                startTime: start,
                endTime: new Date(start.getTime() + 30 * MS_PER_MINUTE),
              },
            });
          }
        });
      await Promise.all([insert(HOST_A), insert(HOST_A2)]);
      expect(await prisma.appointment.count({ where: { tenantId: TENANT_A, title: 'Race' } })).toBe(
        2
      );
    });

    it('NF-004: a lock held past lock_timeout fails fast with "Please try again." and writes nothing', async () => {
      await eventType(TENANT_A, HOST_A, { slug: 'busy' });
      const start = futureMonday(12);
      const email = `${RUN}-timeout@example.invalid`;
      const lockKey = `booking:${TENANT_A}`;
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      let locked!: () => void;
      const isLocked = new Promise<void>((resolve) => (locked = resolve));
      const holder = prisma.$transaction(
        async (tx: any) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
          locked();
          await released;
        },
        { timeout: 30_000 }
      );
      await isLocked;
      const startedAt = Date.now();
      let outcome = 'booked';
      try {
        await book(HANDLE_A, 'busy', start, email);
      } catch (error) {
        const e = error as { code?: string; message?: string };
        outcome = `${e.code}: ${e.message}`;
      } finally {
        release();
        await holder;
      }
      const waitedMs = Date.now() - startedAt;
      console.log(`NF-004: booking gave up after ${waitedMs} ms (lock_timeout 2s)`);
      expect(outcome).toBe('CONFLICT: Please try again.');
      expect(waitedMs).toBeLessThan(10_000);
      expect(await prisma.appointment.count({ where: { bookerEmail: email } })).toBe(0);
    });
  });
});
