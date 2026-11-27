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
import { Prisma } from '../../packages/db/generated/prisma/client';
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

    // Private mail (owner decision 26/11/2026): a personal mailbox, a draft, and the mail of a
    // personal mailbox that is logged to a contact or a lead (which is team mail).
    await prisma.emailMailbox.createMany({
      data: [
        { id: `${TAG}_mb_me`, tenantId: tA, scope: 'USER', userId: ownerA.id },
        { id: `${TAG}_mb_co`, tenantId: tA, scope: 'TENANT', userId: null },
      ].map((m) => ({
        ...m,
        kind: 'SMTP',
        status: 'DISCONNECTED',
        fromAddress: `${m.id}@example.invalid`,
      })),
    });
    const contactA = await prisma.contact.findFirst({ where: { tenantId: tA } });
    const mk = (key: string, over: Record<string, unknown>) =>
      prisma.emailRecord.create({
        data: {
          tenantId: tA,
          subject: `${TAG}-${key}`,
          body: `BODY-${key}`,
          fromEmail: 'x@example.invalid',
          toEmail: 'y@example.invalid',
          ...over,
        },
      });
    await mk('company', { mailboxId: `${TAG}_mb_co` });
    await mk('personal', { mailboxId: `${TAG}_mb_me`, userId: ownerA.id });
    await mk('personalLoggedContact', {
      mailboxId: `${TAG}_mb_me`,
      userId: ownerA.id,
      contactId: contactA.id,
    });
    const leadA = await prisma.lead.findFirst({ where: { tenantId: tA } });
    await mk('personalLoggedLead', {
      mailboxId: `${TAG}_mb_me`,
      userId: ownerA.id,
      metadata: { leadId: leadA.id },
    });
    // Logged to a lead and a contact that no longer exist: private again.
    await mk('personalDanglingLead', {
      mailboxId: `${TAG}_mb_me`,
      userId: ownerA.id,
      metadata: { leadId: 'deleted-lead-id' },
    });
    await mk('personalDanglingContact', {
      mailboxId: `${TAG}_mb_me`,
      userId: ownerA.id,
      contactId: 'deleted-contact-id',
    });
    await mk('draft', { mailboxId: `${TAG}_mb_co`, metadata: { isDraft: true } });
    await mk('nullMetadata', { metadata: Prisma.DbNull });
    const personal = await prisma.emailRecord.findFirst({
      where: { tenantId: tA, subject: `${TAG}-personal` },
    });
    const company = await prisma.emailRecord.findFirst({
      where: { tenantId: tA, subject: `${TAG}-company` },
    });
    await prisma.emailAttachment.createMany({
      data: [
        { emailId: personal.id, fileName: 'p.pdf', fileUrl: `${tA}/p.pdf` },
        { emailId: company.id, fileName: 'c.pdf', fileUrl: `${tA}/c.pdf` },
      ].map((a) => ({ ...a, tenantId: tA, fileSize: 1, fileType: 'application/pdf' })),
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      if (dir) rmSync(dir, { recursive: true, force: true });
      await prisma.emailAttachment.deleteMany({ where: { tenantId: { in: [tA, tB] } } });
      await prisma.emailRecord.deleteMany({ where: { tenantId: { in: [tA, tB] } } });
      await prisma.emailMailbox.deleteMany({ where: { tenantId: { in: [tA, tB] } } });
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
    expect(JSON.parse(zip['data/emails.json']!).map((r: any) => r.body)).toContain('body a');

    const everything = Object.values(zip).join('\n');
    expect(everything).not.toContain('SECRET-B');
    expect(everything).not.toContain(`${TAG}-owner-b@`);
    expect(everything).not.toContain(tB);

    expect(result.rowCounts.leads).toBe(1);
    expect(result.rowCounts.deals).toBe(1);
    expect(JSON.parse(zip['manifest.json']!).workspace.id).toBe(tA);
  });

  it('exports only team-visible mail: no personal-mailbox mail, no drafts', async () => {
    const out = join(dir, 'mail.zip');
    await runWorkspaceExport({
      db: createTenantReadGuard(prisma, tA),
      tenantId: tA,
      outputPath: out,
    });
    const zip = readZip(out);
    const bodies = (JSON.parse(zip['data/emails.json']!) as Array<{ body: string }>)
      .map((r) => r.body)
      .sort();
    expect(bodies).toEqual(
      [
        'BODY-company',
        'BODY-nullMetadata',
        'BODY-personalLoggedContact',
        'BODY-personalLoggedLead',
        'body a',
      ].sort()
    );
    expect(Object.values(zip).join(' ')).not.toMatch(
      /BODY-personal\b|BODY-personalDangling|BODY-draft/
    );
    const attachments = JSON.parse(zip['data/email_attachments.json']!) as Array<{
      fileName: string;
    }>;
    expect(attachments.map((a) => a.fileName)).toEqual(['c.pdf']);
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
    // Unique reads work, and still cannot reach another tenant's row.
    const [own] = await guard.lead.findMany({});
    expect((await guard.lead.findUnique({ where: { id: own.id } }))?.id).toBe(own.id);
    const foreign = await prisma.lead.findFirst({ where: { tenantId: tB } });
    expect(await guard.lead.findUnique({ where: { id: foreign.id } })).toBeNull();
    expect(await guard.tenant.findUnique({ where: { id: tB } })).toBeNull();
    // Raw SQL would bypass the pin, so it is refused.
    await expect(guard.$queryRaw`SELECT 1`).rejects.toThrow(/refused/);
  });
});
