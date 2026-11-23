/**
 * Whole-workspace export — Real-Database Integration Test (agreement clause 5).
 *
 * Runs the real export against Postgres with two tenants and asserts, through the same
 * read-only tenant guard the ai-worker uses:
 *   - every exported model's columns exist in the database (a schema drift fails here, not for a
 *     leaving customer),
 *   - tenant A's archive holds tenant A's rows and none of tenant B's, in any file,
 *   - a member of A who lives in tenant B is exported as a user of A, a revoked one is not,
 *   - the guard refuses writes.
 *
 * Skips (like the other DB suites) when there is no DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIsolatedTestPrismaClient } from './setup';
import { runWorkspaceExport } from '../../packages/adapters/src/workspace-export/export-workspace';
import { createTenantReadGuard } from '../../packages/adapters/src/workspace-export/tenant-read-guard';
import { readZip } from '../../packages/adapters/src/workspace-export/__tests__/helpers';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping workspace-export integration test: DATABASE_URL not set');
}

const TAG = `wsx_${Date.now()}`;

describeDb('workspace export (real database)', () => {
  let prisma: any;
  let tA = '';
  let tB = '';
  let dir = '';

  beforeAll(async () => {
    prisma = createIsolatedTestPrismaClient();
    if (!prisma) return;
    dir = mkdtempSync(join(tmpdir(), 'wsx-int-'));

    const [a, b] = await Promise.all(
      ['a', 'b'].map((n) =>
        prisma.tenant.create({ data: { name: `${TAG}-${n}`, slug: `${TAG}-${n}` } })
      )
    );
    tA = a.id;
    tB = b.id;
    const [ownerA, ownerB, memberOfA, revokedFromA] = await Promise.all([
      prisma.user.create({
        data: { email: `${TAG}-owner-a@example.invalid`, tenantId: tA, role: 'ADMIN' },
      }),
      prisma.user.create({
        data: { email: `${TAG}-owner-b@example.invalid`, tenantId: tB, role: 'ADMIN' },
      }),
      prisma.user.create({ data: { email: `${TAG}-member@example.invalid`, tenantId: tB } }),
      prisma.user.create({ data: { email: `${TAG}-revoked@example.invalid`, tenantId: tB } }),
    ]);
    await prisma.tenantMembership.createMany({
      data: [
        { userId: memberOfA.id, tenantId: tA, role: 'USER', source: 'OWNER_INVITE' },
        {
          userId: revokedFromA.id,
          tenantId: tA,
          role: 'USER',
          source: 'OWNER_INVITE',
          revokedAt: new Date('2026-01-01'),
        },
      ],
    });
    const [accA, accB] = await Promise.all([
      prisma.account.create({ data: { name: `${TAG}-acc-a`, tenantId: tA, ownerId: ownerA.id } }),
      prisma.account.create({ data: { name: `${TAG}-acc-b`, tenantId: tB, ownerId: ownerB.id } }),
    ]);
    await prisma.lead.createMany({
      data: [
        { email: `${TAG}-lead-a@example.invalid`, tenantId: tA, ownerId: ownerA.id },
        { email: `${TAG}-SECRET-B-lead@example.invalid`, tenantId: tB, ownerId: ownerB.id },
      ],
    });
    await prisma.contact.createMany({
      data: [
        {
          email: `${TAG}-c-a@example.invalid`,
          firstName: 'Ann',
          lastName: 'A',
          tenantId: tA,
          ownerId: ownerA.id,
        },
        {
          email: `${TAG}-SECRET-B-c@example.invalid`,
          firstName: 'Bo',
          lastName: 'B',
          tenantId: tB,
          ownerId: ownerB.id,
        },
      ],
    });
    await prisma.opportunity.createMany({
      data: [
        {
          name: `${TAG}-deal-a`,
          value: 100.5,
          tenantId: tA,
          ownerId: ownerA.id,
          accountId: accA.id,
        },
        {
          name: `${TAG}-SECRET-B-deal`,
          value: 9,
          tenantId: tB,
          ownerId: ownerB.id,
          accountId: accB.id,
        },
      ],
    });
    await prisma.emailRecord.createMany({
      data: [
        {
          subject: `${TAG}-mail-a`,
          body: 'body a',
          fromEmail: 'x@example.invalid',
          toEmail: 'y@example.invalid',
          tenantId: tA,
        },
        {
          subject: `${TAG}-SECRET-B-mail`,
          body: 'SECRET-B-BODY',
          fromEmail: 'x@example.invalid',
          toEmail: 'y@example.invalid',
          tenantId: tB,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      if (dir) rmSync(dir, { recursive: true, force: true });
      await prisma.emailRecord.deleteMany({ where: { tenantId: { in: [tA, tB] } } });
      await prisma.opportunity.deleteMany({ where: { tenantId: { in: [tA, tB] } } });
      await prisma.contact.deleteMany({ where: { tenantId: { in: [tA, tB] } } });
      await prisma.lead.deleteMany({ where: { tenantId: { in: [tA, tB] } } });
      await prisma.account.deleteMany({ where: { tenantId: { in: [tA, tB] } } });
      await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: [tA, tB] } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
      await prisma.tenant.deleteMany({ where: { name: { startsWith: TAG } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("exports tenant A's rows and none of tenant B's, through the read guard", async () => {
    const out = join(dir, 'a.zip');
    const result = await runWorkspaceExport({
      db: createTenantReadGuard(prisma, tA),
      tenantId: tA,
      outputPath: out,
    });
    const zip = readZip(out);

    expect(JSON.parse(zip['data/leads.json']!).map((r: any) => r.email)).toEqual([
      `${TAG}-lead-a@example.invalid`,
    ]);
    expect(JSON.parse(zip['data/contacts.json']!)).toHaveLength(1);
    expect(JSON.parse(zip['data/accounts.json']!)).toHaveLength(1);
    const deals = JSON.parse(zip['data/deals.json']!);
    expect(deals).toHaveLength(1);
    expect(deals[0].value).toBe('100.5');
    expect(JSON.parse(zip['data/emails.json']!)[0].body).toBe('body a');

    const everything = Object.values(zip).join('\n');
    expect(everything).not.toContain('SECRET-B');
    expect(everything).not.toContain(`${TAG}-owner-b@`);
    expect(everything).not.toContain(tB);

    expect(result.rowCounts.leads).toBe(1);
    expect(result.rowCounts.deals).toBe(1);
    expect(JSON.parse(zip['manifest.json']!).workspace.id).toBe(tA);
  });

  it('exports home users and live members of A, not a revoked member and not B users', async () => {
    const out = join(dir, 'users.zip');
    await runWorkspaceExport({
      db: createTenantReadGuard(prisma, tA),
      tenantId: tA,
      outputPath: out,
    });
    const users = JSON.parse(readZip(out)['data/users.json']!);
    expect(users.map((u: any) => u.email).sort()).toEqual([
      `${TAG}-member@example.invalid`,
      `${TAG}-owner-a@example.invalid`,
    ]);
    for (const u of users) {
      expect(Object.keys(u)).not.toContain('stripeCustomerId');
      expect(Object.keys(u)).not.toContain('preferences');
    }
  });

  it('exports an empty workspace without error (every model column exists in the database)', async () => {
    const empty = await prisma.tenant.create({
      data: { name: `${TAG}-empty`, slug: `${TAG}-empty` },
    });
    try {
      const out = join(dir, 'empty.zip');
      const result = await runWorkspaceExport({
        db: createTenantReadGuard(prisma, empty.id),
        tenantId: empty.id,
        outputPath: out,
      });
      expect(Object.values(result.rowCounts).every((n) => n === 0)).toBe(true);
    } finally {
      await prisma.tenant.delete({ where: { id: empty.id } });
    }
  });

  it('the guard refuses writes and pins reads to its tenant even when asked for another', async () => {
    const guard = createTenantReadGuard(prisma, tA) as any;
    await expect(guard.lead.deleteMany({})).rejects.toThrow(/read-only/);
    await expect(guard.lead.create({ data: {} })).rejects.toThrow(/read-only/);
    const leads = await guard.lead.findMany({ where: { tenantId: tB } });
    expect(leads).toEqual([]);
    expect(await guard.tenant.findFirst({ where: { id: tB } })).toBeNull();
  });
});
