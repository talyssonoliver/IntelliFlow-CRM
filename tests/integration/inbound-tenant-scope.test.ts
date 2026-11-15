/**
 * Inbound portal routes on the tenant-scoped client — Real-Database Integration Test (#1302)
 *
 * The inbound routes are server-to-server calls with no user session. Each call is bound to one
 * tenant and runs on a client scoped to it (createTenantScopedPrisma with a service tenant
 * context). This suite drives the real router against Postgres with two tenants that share an
 * email and a booking id, and asserts that a call bound to tenant A never reads, returns or
 * changes tenant B's rows, and that the call sets the RLS tenant on its connection.
 *
 * The client runs on a one-connection pool, so the session setting a call leaves behind can be
 * read back. It connects as the test database owner, which RLS does not apply to, so the
 * isolation asserted here comes from the tenant filter alone.
 *
 * Skips (like the other DB suites) when there is no DATABASE_URL.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { createIsolatedTestPrismaClient } from './setup';
import { inboundRouter } from '../../apps/api/src/modules/inbound/inbound.router';
import {
  createTenantScopedPrisma,
  serviceTenantContext,
} from '../../apps/api/src/security/tenant-context';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TAG = `inbscope_${Date.now()}`;
const SECRET = 's'.repeat(24);
const EMAIL = `${TAG}@example.invalid`;
const SUBMISSION = '00000000-0000-4000-8000-000000001302';
const BOOKING_ID = `booking:${SUBMISSION}`;

describeDb('inbound routes on the tenant-scoped client (real database)', () => {
  let prisma: any;
  let pinned: any;
  let tA = '';
  let tB = '';
  let ownerA = '';
  let ownerB = '';
  let leadB = '';
  let appointmentB = '';

  beforeEach((ctx) => {
    if (!prisma) ctx.skip();
  });

  beforeAll(async () => {
    prisma = createIsolatedTestPrismaClient();
    if (!prisma) return;
    const { PrismaClient } = await import('../../packages/db/src');
    pinned = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL!, max: 1 }) });

    const [a, b] = await Promise.all(
      ['a', 'b'].map((n) =>
        prisma.tenant.create({ data: { name: `${TAG}-${n}`, slug: `${TAG}-${n}` } })
      )
    );
    tA = a.id;
    tB = b.id;
    const [ua, ub] = await Promise.all([
      prisma.user.create({ data: { email: `${TAG}-a-owner@example.invalid`, tenantId: tA } }),
      prisma.user.create({ data: { email: `${TAG}-b-owner@example.invalid`, tenantId: tB } }),
    ]);
    ownerA = ua.id;
    ownerB = ub.id;

    // Tenant B already has a lead with the same email and a booking with the same id.
    const lead = await prisma.lead.create({
      data: { email: EMAIL, firstName: 'B', tenantId: tB, ownerId: ownerB, source: 'WEBSITE' },
    });
    leadB = lead.id;
    const start = new Date('2030-01-01T10:00:00Z');
    const appt = await prisma.appointment.create({
      data: {
        title: `${TAG} B call`,
        startTime: start,
        endTime: new Date(start.getTime() + 30 * 60_000),
        appointmentType: 'CALL',
        status: 'SCHEDULED',
        tenantId: tB,
        organizerId: ownerB,
        externalCalendarId: BOOKING_ID,
      },
    });
    appointmentB = appt.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      const tenantId = { in: [tA, tB] };
      await prisma.leadActivity.deleteMany({ where: { tenantId } });
      await prisma.task.deleteMany({ where: { tenantId } });
      await prisma.appointment.deleteMany({ where: { tenantId } });
      await prisma.lead.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: { in: [tA, tB] } } });
    } finally {
      await pinned?.$executeRawUnsafe('RESET app.current_tenant_id').catch(() => undefined);
      await pinned?.$disconnect();
      await prisma.$disconnect();
    }
  });

  /** A lead service that creates the lead in the tenant it is given, as LeadService does. */
  const leadService = {
    createLead: async (p: { email: string; tenantId: string; ownerId: string; tags: string[] }) => {
      const lead = await prisma.lead.create({
        data: {
          email: p.email,
          tenantId: p.tenantId,
          ownerId: p.ownerId,
          tags: p.tags,
          source: 'WEBSITE',
        },
      });
      return { isFailure: false, value: { id: { value: lead.id } } };
    },
  };

  /** Call the router bound to tenant A, with the real scoped client (not the VITEST bypass). */
  async function bookAsTenantA() {
    vi.stubEnv('VITEST', 'false');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PORTAL_INTERNAL_SECRET', SECRET);
    vi.stubEnv('LEANGENCY_TENANT_ID', tA);
    vi.stubEnv('LEANGENCY_SYSTEM_USER_ID', ownerA);
    try {
      const ctx = {
        prisma: pinned,
        req: { headers: new Headers({ authorization: `Bearer ${SECRET}` }) },
        services: { lead: leadService },
      };
      return await inboundRouter.createCaller(ctx as never).logCallBooking({
        submissionId: SUBMISSION,
        email: EMAIL,
        firstName: 'A',
        callDate: '2030-01-02',
        callTime: '09:00',
      } as never);
    } finally {
      vi.unstubAllEnvs();
    }
  }

  it("books into tenant A without matching tenant B's lead or booking", async () => {
    const result = await bookAsTenantA();

    expect(result.tenantId).toBe(tA);
    expect(result.leadCreated).toBe(true);
    expect(result.leadId).not.toBe(leadB);
    expect(result.appointmentId).not.toBe(appointmentB);

    const lead = await prisma.lead.findUnique({ where: { id: result.leadId } });
    expect(lead.tenantId).toBe(tA);
    const appt = await prisma.appointment.findUnique({ where: { id: result.appointmentId } });
    expect(appt.tenantId).toBe(tA);
    const task = await prisma.task.findUnique({ where: { id: result.taskId } });
    expect(task.tenantId).toBe(tA);
  });

  it("leaves tenant B's rows as they were", async () => {
    const lead = await prisma.lead.findUnique({ where: { id: leadB } });
    expect(lead).toMatchObject({ tenantId: tB, firstName: 'B' });
    expect(await prisma.task.count({ where: { tenantId: tB } })).toBe(0);
    expect(await prisma.leadActivity.count({ where: { tenantId: tB } })).toBe(0);
    expect(await prisma.appointment.count({ where: { tenantId: tB } })).toBe(1);
  });

  it("a retry returns tenant A's own booking, never tenant B's", async () => {
    const first = await prisma.appointment.findFirst({
      where: { tenantId: tA, externalCalendarId: BOOKING_ID },
    });
    const retry = await bookAsTenantA();
    expect(retry.leadCreated).toBe(false);
    expect(retry.appointmentId).toBe(first.id);
    expect(await prisma.appointment.count({ where: { tenantId: tA } })).toBe(1);
  });

  it("sets the RLS tenant of the call's connection to the bound tenant", async () => {
    await bookAsTenantA();
    const [row] = await pinned.$queryRawUnsafe(
      `SELECT current_setting('app.current_tenant_id', true) AS tenant`
    );
    expect(row.tenant).toBe(tA);
  });

  it("the call's client cannot read or change tenant B's rows without a filter of its own", async () => {
    vi.stubEnv('VITEST', 'false');
    vi.stubEnv('NODE_ENV', 'development');
    let scoped: any;
    try {
      scoped = createTenantScopedPrisma(pinned, serviceTenantContext(tA));
    } finally {
      vi.unstubAllEnvs();
    }

    const byEmail = await scoped.lead.findMany({ where: { email: EMAIL } });
    expect(byEmail.map((l: { tenantId: string }) => l.tenantId)).toEqual([tA]);
    expect(await scoped.lead.findUnique({ where: { id: leadB } })).toBeNull();

    const changed = await scoped.lead.updateMany({
      where: { id: leadB },
      data: { firstName: 'changed' },
    });
    expect(changed.count).toBe(0);
    await expect(
      scoped.task.create({
        data: { title: `${TAG} cross`, tenantId: tB, ownerId: ownerB, leadId: leadB },
      })
    ).rejects.toThrow();
    expect((await prisma.lead.findUnique({ where: { id: leadB } })).firstName).toBe('B');
  });
});
