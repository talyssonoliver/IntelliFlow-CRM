/**
 * PG-203 DSAR adapters — unit tests with a mocked Prisma client.
 *
 * The real-database behaviour (locks, CHECKs, the partial unique index, the erasure
 * columns and rollback) is proven in tests/integration/dsar.test.ts. These tests pin the
 * branching each adapter owns and guard that every Prisma delegate the adapters call
 * exists in the schema (a renamed model would otherwise fail only at runtime).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@intelliflow/db';
import { PrismaDsarRepository } from '../PrismaDsarRepository';
import { PrismaProcessingRestrictionRepository } from '../PrismaProcessingRestrictionRepository';
import { PrismaSubjectDataRepository } from '../PrismaSubjectDataRepository';

const CAPS = {
  perTenantEmailPerDay: 3,
  perIpPerHour: 10,
  globalEmailPerDay: 3,
  perTenantPerDay: 50,
  resendCooldownMinutes: 60,
};
const NOW = new Date('2026-10-22T12:00:00.000Z');

/** A client whose interactive $transaction runs the callback against itself. */
function mockPrisma(models: Record<string, Record<string, unknown>> = {}): Record<string, any> {
  const client: Record<string, any> = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    ...models,
  };
  client.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));
  return client;
}

const asClient = (p: Record<string, any>) => p as unknown as PrismaClient;

function submission(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 't1',
    type: 'ACCESS' as const,
    subjectEmail: 'ada@example.invalid',
    capEmailHash: 'c'.repeat(64),
    details: null,
    objectionScope: null,
    ipHash: 'd'.repeat(64),
    verificationTokenHash: 'e'.repeat(64),
    verificationExpiresAt: NOW,
    ...overrides,
  };
}

describe('PrismaDsarRepository', () => {
  function setup(counts: number[], recent: unknown = null) {
    const count = vi.fn();
    for (const n of counts) count.mockResolvedValueOnce(n);
    const prisma = mockPrisma({
      dsarRequest: {
        findFirst: vi.fn().mockResolvedValue(recent),
        count,
        create: vi.fn().mockResolvedValue({ id: 'r1' }),
      },
    });
    return { prisma, repo: new PrismaDsarRepository(asClient(prisma)) };
  }

  it('takes the tenant lock then the email-hash lock before counting', async () => {
    const { prisma, repo } = setup([0, 0, 0]);
    await expect(repo.reserveSubmission(submission(), CAPS, NOW)).resolves.toEqual({
      outcome: 'CREATED',
      record: { id: 'r1' },
    });
    const sql = prisma.$executeRaw.mock.calls.map((c: unknown[]) => [c[0], c.slice(1)]);
    expect(sql[1][1]).toEqual(['dsar:t:t1']);
    expect(sql[2][1]).toEqual(['dsar:e:' + 'c'.repeat(64)]);
    expect(prisma.dsarRequest.create.mock.calls[0][0].data).toMatchObject({
      status: 'PENDING_VERIFICATION',
      source: 'PUBLIC_FORM',
      receivedAt: NOW,
    });
  });

  it('answers COOLDOWN for a recent pending request of the same type', async () => {
    const { prisma, repo } = setup([], { id: 'older' });
    await expect(repo.reserveSubmission(submission(), CAPS, NOW)).resolves.toEqual({
      outcome: 'COOLDOWN',
    });
    expect(prisma.dsarRequest.create).not.toHaveBeenCalled();
  });

  it.each([
    ['per firm and email', [3]],
    ['per IP hash', [0, 10]],
    ['global folded email', [0, 0, 3]],
  ])('answers CAPPED on the %s cap', async (_name, counts) => {
    const { prisma, repo } = setup(counts);
    await expect(repo.reserveSubmission(submission(), CAPS, NOW)).resolves.toEqual({
      outcome: 'CAPPED',
    });
    expect(prisma.dsarRequest.create).not.toHaveBeenCalled();
  });

  it('counts only public submissions toward the caps, never requests staff logged (codex)', async () => {
    const { prisma, repo } = setup([0, 0, 0, 0]);
    await repo.reserveSubmission(submission(), CAPS, NOW);
    const wheres = prisma.dsarRequest.count.mock.calls.map((c: [{ where: object }]) => c[0].where);
    // Per person, per IP, folded email, and per firm (owner Q24).
    expect(wheres).toHaveLength(4);
    for (const where of wheres) expect(where).toMatchObject({ source: 'PUBLIC_FORM' });
  });

  it('skips the IP cap when the IP is unknown', async () => {
    const { prisma, repo } = setup([0, 0, 0]);
    await repo.reserveSubmission(submission({ ipHash: null }), CAPS, NOW);
    expect(prisma.dsarRequest.count).toHaveBeenCalledTimes(3);
    expect(prisma.dsarRequest.create).toHaveBeenCalled();
  });

  it('creates a staff RESTRICTION and its restriction in one transaction (codex)', async () => {
    const prisma = mockPrisma({ dsarRequest: { create: vi.fn().mockResolvedValue({ id: 's1' }) } });
    prisma.$queryRaw.mockResolvedValue([{ id: 'p1' }]);
    const repo = new PrismaDsarRepository(asClient(prisma));
    await repo.createStaff({
      tenantId: 't1',
      type: 'RESTRICTION',
      subjectEmail: 'ada@example.invalid',
      capEmailHash: 'c'.repeat(64),
      details: null,
      objectionScope: null,
      identityMethod: 'IN_PERSON_ID',
      identityNote: 'Passport checked at the desk',
      receivedAt: NOW,
      receivedOnReason: null,
      verifiedAt: NOW,
      slaDeadline: NOW,
      createdById: 'u1',
      initialRestriction: { blocksMarketing: false },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw.mock.calls[0].slice(1)).toEqual(
      expect.arrayContaining(['t1', 'ada@example.invalid', false, ['s1'], 'u1'])
    );
    // The data written for the request never carries the restriction option.
    expect(prisma.dsarRequest.create.mock.calls[0][0].data).not.toHaveProperty(
      'initialRestriction'
    );
  });

  it('creates staff requests as VERIFIED with their identity record', async () => {
    const prisma = mockPrisma({ dsarRequest: { create: vi.fn().mockResolvedValue({ id: 's1' }) } });
    const repo = new PrismaDsarRepository(asClient(prisma));
    await repo.createStaff({
      tenantId: 't1',
      type: 'ERASURE',
      subjectEmail: 'ada@example.invalid',
      capEmailHash: 'c'.repeat(64),
      details: null,
      objectionScope: null,
      identityMethod: 'IN_PERSON_ID',
      identityNote: 'Passport checked at the desk',
      receivedAt: NOW,
      receivedOnReason: null,
      verifiedAt: NOW,
      slaDeadline: NOW,
      createdById: 'u1',
    });
    expect(prisma.dsarRequest.create.mock.calls[0][0].data).toMatchObject({
      status: 'VERIFIED',
      source: 'STAFF',
      identityMethod: 'IN_PERSON_ID',
    });
  });

  it('scopes reads by tenant and maps missing rows to null', async () => {
    const prisma = mockPrisma({
      dsarRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'r1' }),
        findMany: vi.fn().mockResolvedValue([{ id: 'r1' }]),
      },
    });
    const repo = new PrismaDsarRepository(asClient(prisma));
    await expect(repo.findById('r1')).resolves.toBeNull();
    await expect(repo.findForTenant('t1', 'r1')).resolves.toBeNull();
    await expect(repo.findForTenant('t1', 'r1')).resolves.toEqual({ id: 'r1' });
    expect(prisma.dsarRequest.findFirst.mock.calls[0][0].where).toEqual({
      id: 'r1',
      tenantId: 't1',
    });
    await repo.list('t1', 'VERIFIED');
    await repo.list('t1', 'COMPLETED');
    await repo.list('t1');
    const calls = prisma.dsarRequest.findMany.mock.calls.map((c: any[]) => c[0]);
    // An open status is never cut off; closed history is bounded (codex).
    expect(calls[0]).toMatchObject({ where: { tenantId: 't1', status: { in: ['VERIFIED'] } } });
    expect(calls[0].take).toBeUndefined();
    expect(calls[1]).toMatchObject({ where: { status: { in: ['COMPLETED'] } }, take: 200 });
    expect(calls[2]).toMatchObject({
      where: { tenantId: 't1', status: { in: ['PENDING_VERIFICATION', 'VERIFIED'] } },
    });
    expect(calls[2].take).toBeUndefined();
    expect(calls[3]).toMatchObject({
      where: { status: { in: ['COMPLETED', 'REJECTED'] } },
      take: 200,
    });
  });

  it('applies a transition only from the expected status', async () => {
    const prisma = mockPrisma({
      dsarRequest: {
        updateMany: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue({ id: 'r1', status: 'VERIFIED' }),
      },
    });
    const repo = new PrismaDsarRepository(asClient(prisma));
    const patch = { status: 'VERIFIED' as const };
    await expect(repo.transition('t1', 'r1', 'PENDING_VERIFICATION', patch)).resolves.toBeNull();
    await expect(repo.transition('t1', 'r1', 'PENDING_VERIFICATION', patch)).resolves.toEqual({
      id: 'r1',
      status: 'VERIFIED',
    });
    expect(prisma.dsarRequest.updateMany.mock.calls[0][0].where).toEqual({
      id: 'r1',
      tenantId: 't1',
      status: 'PENDING_VERIFICATION',
    });
  });

  it('applies an extension only to a request never extended (one extension)', async () => {
    const prisma = mockPrisma({
      dsarRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn(),
      },
    });
    const repo = new PrismaDsarRepository(asClient(prisma));
    await expect(
      repo.transition('t1', 'r1', 'VERIFIED', { extendedUntil: NOW }, { onlyIfNotExtended: true })
    ).resolves.toBeNull();
    expect(prisma.dsarRequest.updateMany.mock.calls[0][0].where).toEqual({
      id: 'r1',
      tenantId: 't1',
      status: 'VERIFIED',
      extendedUntil: null,
    });
  });

  it('verifies and restricts in one transaction; a lost race writes nothing (codex)', async () => {
    const prisma = mockPrisma({
      dsarRequest: {
        updateMany: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue({ id: 'r1', status: 'VERIFIED' }),
      },
    });
    prisma.$queryRaw.mockResolvedValue([{ id: 'p1' }]);
    const repo = new PrismaDsarRepository(asClient(prisma));
    const condition = {
      restrict: { subjectEmail: 'ada@example.invalid', blocksMarketing: false, createdById: null },
    };
    const verify = () =>
      repo.transition('t1', 'r1', 'PENDING_VERIFICATION', { status: 'VERIFIED' }, condition);
    await expect(verify()).resolves.toBeNull();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    await expect(verify()).resolves.toEqual({ id: 'r1', status: 'VERIFIED' });
    expect(prisma.dsarRequest.updateMany.mock.calls[1][0].where).toEqual({
      id: 'r1',
      tenantId: 't1',
      status: 'PENDING_VERIFICATION',
    });
    expect(prisma.$queryRaw.mock.calls[0].slice(1)).toEqual(
      expect.arrayContaining(['t1', 'ada@example.invalid', false, ['r1']])
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('counts a download only under the cap, with the same token, before expiry', async () => {
    const prisma = mockPrisma({
      dsarRequest: {
        updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }),
      },
    });
    const repo = new PrismaDsarRepository(asClient(prisma));
    const input = { id: 'r1', tokenHash: 'h'.repeat(64), maxDownloads: 5, now: NOW };
    await expect(repo.recordDownload(input)).resolves.toBe(true);
    await expect(repo.recordDownload(input)).resolves.toBe(false);
    // One conditional write: a revocation after the token check refuses the count (codex).
    expect(prisma.dsarRequest.updateMany.mock.calls[0][0].where).toEqual({
      id: 'r1',
      exportTokenHash: 'h'.repeat(64),
      status: { not: 'REJECTED' },
      exportExpiresAt: { gt: NOW },
      exportDownloads: { lt: 5 },
    });
  });

  it('counts ADMIN users and maps the firm identity', async () => {
    const prisma = mockPrisma({
      user: {
        count: vi.fn().mockResolvedValue(2),
        findMany: vi.fn().mockResolvedValue([{ email: 'a@example.invalid' }]),
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
          id: 't1',
          name: 'Smith Law',
          bookingHandle: 'smith',
          bookingPrivacyUrl: null,
        }),
      },
    });
    const repo = new PrismaDsarRepository(asClient(prisma));
    await expect(repo.countAdmins('t1')).resolves.toBe(2);
    expect(prisma.user.count.mock.calls[0][0].where).toMatchObject({
      tenantId: 't1',
      role: 'ADMIN',
    });
    expect(prisma.user.count.mock.calls[0][0].where.NOT).toEqual({
      memberships: { some: { tenantId: 't1', revokedAt: { not: null } } },
    });
    await expect(repo.adminEmails('t1')).resolves.toEqual(['a@example.invalid']);
    await expect(repo.findFirm('t1')).resolves.toBeNull();
    await expect(repo.findFirm('t1')).resolves.toEqual({
      tenantId: 't1',
      name: 'Smith Law',
      handle: 'smith',
      privacyUrl: null,
    });
  });
});

describe('PrismaProcessingRestrictionRepository', () => {
  const row = {
    id: 'p1',
    tenantId: 't1',
    subjectEmail: 'ada@example.invalid',
    blocksMarketing: true,
    dsarRequestIds: ['r1'],
    createdAt: NOW,
  };

  it('reports the active row, normalising the email, or nothing', async () => {
    const prisma = mockPrisma({
      processingRestriction: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(row),
      },
    });
    const repo = new PrismaProcessingRestrictionRepository(asClient(prisma));
    await expect(repo.status('t1', ' Ada@Example.invalid ')).resolves.toEqual({
      restricted: false,
      blocksMarketing: false,
      since: null,
    });
    await expect(repo.status('t1', 'ada@example.invalid')).resolves.toEqual({
      restricted: true,
      blocksMarketing: true,
      since: NOW,
    });
    expect(prisma.processingRestriction.findFirst.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      subjectEmail: 'ada@example.invalid',
      liftedAt: null,
    });
  });

  it("in the caller's transaction, takes the address lock before reading there (codex)", async () => {
    const prisma = mockPrisma({ processingRestriction: { findFirst: vi.fn() } });
    const tx = mockPrisma({ processingRestriction: { findFirst: vi.fn().mockResolvedValue(row) } });
    const repo = new PrismaProcessingRestrictionRepository(asClient(prisma));
    await expect(repo.status('t1', ' Ada@Example.invalid ', tx as never)).resolves.toMatchObject({
      restricted: true,
    });
    expect(tx.$executeRaw.mock.calls[0][0].join('?')).toContain('dsar_subject_lock(');
    expect(tx.$executeRaw.mock.calls[0].slice(1)).toEqual(['t1', 'ada@example.invalid']);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.processingRestriction.findFirst.mock.invocationCallOrder[0]
    );
    expect(prisma.processingRestriction.findFirst).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('treats an erased placeholder address as restricted without a lookup (codex)', async () => {
    const prisma = mockPrisma({ processingRestriction: { findFirst: vi.fn() } });
    const repo = new PrismaProcessingRestrictionRepository(asClient(prisma));
    await expect(repo.status('t1', 'erased-l1@erased.invalid')).resolves.toEqual({
      restricted: true,
      blocksMarketing: true,
      since: null,
    });
    expect(prisma.processingRestriction.findFirst).not.toHaveBeenCalled();
  });

  it('upserts into the active row with the normalised email and the request id', async () => {
    const prisma = mockPrisma();
    prisma.$queryRaw.mockResolvedValue([row]);
    const repo = new PrismaProcessingRestrictionRepository(asClient(prisma));
    await expect(
      repo.restrict({
        tenantId: 't1',
        subjectEmail: 'ADA@example.invalid',
        blocksMarketing: true,
        dsarRequestId: 'r1',
        createdById: null,
      })
    ).resolves.toEqual(row);
    const values = prisma.$queryRaw.mock.calls[0].slice(1);
    expect(values).toEqual(
      expect.arrayContaining(['t1', 'ada@example.invalid', true, ['r1'], null])
    );
  });

  it('finds an active row within the firm', async () => {
    const prisma = mockPrisma({
      processingRestriction: { findFirst: vi.fn().mockResolvedValue(row) },
    });
    const repo = new PrismaProcessingRestrictionRepository(asClient(prisma));
    await expect(repo.findActive('t1', 'p1')).resolves.toEqual(row);
    expect(prisma.processingRestriction.findFirst.mock.calls[0][0].where).toEqual({
      id: 'p1',
      tenantId: 't1',
      liftedAt: null,
    });
  });

  it('lists every active row of the firm, newest first', async () => {
    const prisma = mockPrisma({
      processingRestriction: { findMany: vi.fn().mockResolvedValue([row]) },
    });
    const repo = new PrismaProcessingRestrictionRepository(asClient(prisma));
    await expect(repo.listActive('t1')).resolves.toEqual([row]);
    expect(prisma.processingRestriction.findMany.mock.calls[0][0]).toMatchObject({
      where: { tenantId: 't1', liftedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.processingRestriction.findMany.mock.calls[0][0].take).toBeUndefined();
  });

  describe('liftForRequest', () => {
    const input = { tenantId: 't1', dsarRequestId: 'r1', liftedById: 'u1', note: 'Rejected' };

    it('does nothing when no active row carries the request', async () => {
      const prisma = mockPrisma({ processingRestriction: { update: vi.fn() } });
      const repo = new PrismaProcessingRestrictionRepository(asClient(prisma));
      await expect(repo.liftForRequest(input)).resolves.toBeNull();
      expect(prisma.processingRestriction.update).not.toHaveBeenCalled();
    });

    it('only detaches the request while another one keeps the row', async () => {
      const prisma = mockPrisma({ processingRestriction: { update: vi.fn() } });
      prisma.$queryRaw.mockResolvedValue([{ id: 'p1', dsarRequestIds: ['r1', 'r2'] }]);
      const repo = new PrismaProcessingRestrictionRepository(asClient(prisma));
      await expect(repo.liftForRequest(input)).resolves.toBeNull();
      expect(prisma.processingRestriction.update.mock.calls[0][0]).toEqual({
        where: { id: 'p1' },
        data: { dsarRequestIds: ['r2'] },
      });
    });

    it('releases every row the request holds, not just the first (codex)', async () => {
      const prisma = mockPrisma({
        processingRestriction: { update: vi.fn().mockResolvedValue(row) },
      });
      prisma.$queryRaw.mockResolvedValue([
        { id: 'p1', dsarRequestIds: ['r1'] },
        { id: 'p2', dsarRequestIds: ['r1', 'r2'] },
        { id: 'p3', dsarRequestIds: ['r1'] },
      ]);
      const repo = new PrismaProcessingRestrictionRepository(asClient(prisma));
      await expect(repo.liftForRequest(input)).resolves.toEqual(row);
      const calls = prisma.processingRestriction.update.mock.calls.map((c: any[]) => c[0]);
      expect(calls.map((c: any) => c.where.id)).toEqual(['p1', 'p2', 'p3']);
      expect(calls[1].data).toEqual({ dsarRequestIds: ['r2'] });
      expect(calls[0].data.liftedById).toBe('u1');
      expect(calls[2].data.liftedById).toBe('u1');
    });

    it('lifts the row when the request was its last reason', async () => {
      const prisma = mockPrisma({
        processingRestriction: { update: vi.fn().mockResolvedValue(row) },
      });
      prisma.$queryRaw.mockResolvedValue([{ id: 'p1', dsarRequestIds: ['r1'] }]);
      const repo = new PrismaProcessingRestrictionRepository(asClient(prisma));
      await expect(repo.liftForRequest(input)).resolves.toEqual(row);
      expect(prisma.processingRestriction.update.mock.calls[0][0].data).toMatchObject({
        liftedById: 'u1',
        liftNote: 'Rejected',
      });
    });
  });

  it('lifts by id only while active and inside the firm', async () => {
    const prisma = mockPrisma({
      processingRestriction: {
        updateMany: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue(row),
      },
    });
    const repo = new PrismaProcessingRestrictionRepository(asClient(prisma));
    const input = {
      tenantId: 't1',
      restrictionId: 'p1',
      expectedRequestIds: ['r1'],
      liftedById: 'u1',
      note: 'Done',
    };
    await expect(repo.lift(input)).resolves.toBeNull();
    await expect(repo.lift(input)).resolves.toEqual(row);
    expect(prisma.processingRestriction.updateMany.mock.calls[0][0].where).toEqual({
      id: 'p1',
      tenantId: 't1',
      liftedAt: null,
      // Only the requests the admin reviewed (codex).
      dsarRequestIds: { equals: ['r1'] },
    });
  });

  describe('followEmail', () => {
    it('ignores a change that normalises to the same address', async () => {
      const prisma = mockPrisma({});
      const repo = new PrismaProcessingRestrictionRepository(asClient(prisma));
      await repo.followEmail('t1', 'Ada@example.invalid', ' ada@example.invalid');
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('carries the restriction in one locked database call, normalised (codex race)', async () => {
      const prisma = mockPrisma({});
      prisma.$executeRaw.mockResolvedValueOnce(1);
      const repo = new PrismaProcessingRestrictionRepository(asClient(prisma));
      await repo.followEmail('t1', 'OLD@example.invalid', 'NEW@example.invalid');
      const [strings, ...values] = prisma.$executeRaw.mock.calls[0];
      expect((strings as string[]).join('?')).toContain('dsar_carry_restriction(');
      expect(values).toEqual(['t1', 'old@example.invalid', 'new@example.invalid']);
    });
  });
});

describe('PrismaSubjectDataRepository', () => {
  /** Every delegate method used by the adapter, answering empty. */
  function subjectPrisma() {
    const empty = () => ({
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    });
    const names = [
      'lead',
      'contact',
      'aIScore',
      'leadActivity',
      'contactActivity',
      'appointment',
      'emailRecord',
      'ticket',
      'chatConversation',
      'feedbackSurvey',
      'dsarRequest',
      'leadNote',
      'contactNote',
      'leadFile',
      'notification',
      'autoResponseDraft',
      'contactReplyDraft',
      'calendarEvent',
      'experimentAssignment',
      'leadAIInsight',
      'contactAIInsight',
      'aIInsight',
      'opportunity',
      'task',
    ];
    return mockPrisma(Object.fromEntries(names.map((n) => [n, empty()])));
  }

  it('reads the whole export from one repeatable-read snapshot (codex: no mixed reads)', async () => {
    const prisma = subjectPrisma();
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    await repo.buildExport('t1', 'ada@example.invalid');
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'RepeatableRead' })
    );
  });

  it('builds the export from the matched ids and counts what it withholds', async () => {
    const prisma = subjectPrisma();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'l1' }])
      .mockResolvedValueOnce([{ id: 'c1' }])
      .mockResolvedValueOnce([{ id: 'a1' }]);
    prisma.leadActivity.findMany.mockResolvedValue([{ type: 'EMAIL' }]);
    prisma.emailRecord.findMany.mockResolvedValue([{}, {}]);
    prisma.chatConversation.findMany.mockResolvedValue([{}]);
    prisma.ticket.findMany.mockResolvedValue([{ ticketNumber: 'T-1' }]);
    prisma.leadNote.count.mockResolvedValue(2);
    prisma.contactNote.count.mockResolvedValue(1);
    // One contact with an inline staff note (codex: it is withheld and counted too).
    prisma.contact.count.mockResolvedValue(1);
    prisma.leadFile.count.mockResolvedValue(4);
    // Reply drafts written to the person are message bodies too: withheld and counted (codex).
    prisma.contactReplyDraft.count.mockResolvedValue(2);
    prisma.autoResponseDraft.count.mockResolvedValue(1);
    prisma.leadAIInsight.findMany.mockResolvedValue([{ engagementScore: 40 }]);
    // A deal of the person's contact: its insights are the person's too (Q22, codex).
    prisma.opportunity.findMany.mockResolvedValue([{ id: 'o1' }]);
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    const exported = await repo.buildExport('t1', 'ada@example.invalid');
    // AI-derived data about the person is part of the export (Art 15).
    expect(exported.data.leadInsights).toEqual([{ engagementScore: 40 }]);
    expect(prisma.aIInsight.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      OR: [
        { entityId: { in: ['l1', 'c1'] } },
        { entityType: 'opportunity', entityId: { in: ['o1'] } },
      ],
    });
    expect(exported.withheld).toEqual({
      NOTES: 4,
      ACTIVITY_TEXT: 1,
      TICKET_SUBJECTS: 1,
      MESSAGE_BODIES: 6,
      DOCUMENTS: 4,
      DESCRIPTIONS: 0,
      AI_TEXT: 0,
      STAFF_TEXT: 0,
      OTHER_RECORDS: 0,
      EXCESS_ROWS: 0,
    });
    expect(prisma.contactReplyDraft.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', contactId: { in: ['c1'] } },
    });
    expect(prisma.autoResponseDraft.count.mock.calls[0][0].where).toMatchObject({
      tenantId: 't1',
      OR: [{ leadId: { in: ['l1'] } }, { id: { in: expect.any(Array) } }],
    });
    // Attribution the erasure clears is exported too, the click id included (codex).
    expect(prisma.lead.findMany.mock.calls[0][0].select).toMatchObject({ clickId: true });
    expect(prisma.lead.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      id: { in: ['l1'] },
    });
    expect(prisma.appointment.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      id: { in: ['a1'] },
    });
    // Free text never leaves through the allowlists.
    expect(prisma.leadActivity.findMany.mock.calls[0][0].select).toEqual({
      type: true,
      timestamp: true,
    });
  });

  it('exports deals and tasks but withholds and counts their descriptions (Q23)', async () => {
    const prisma = subjectPrisma();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'l1' }])
      .mockResolvedValueOnce([{ id: 'c1' }])
      .mockResolvedValueOnce([]);
    const deal = {
      id: 'o1',
      name: 'Ada Lovelace retainer',
      value: '1200',
      stage: 'PROPOSAL',
      expectedCloseDate: null,
      createdAt: NOW,
      closedAt: null,
    };
    prisma.opportunity.findMany.mockResolvedValue([
      { ...deal, description: 'Ada wants a fixed fee' },
      { ...deal, id: 'o2', description: null },
    ]);
    prisma.task.findMany.mockResolvedValue([
      { title: 'Call Ada', status: 'PENDING', dueDate: NOW, description: 'Ask about her sister' },
      { title: 'Send terms', status: 'PENDING', dueDate: null, description: '' },
    ]);
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    const exported = await repo.buildExport('t1', 'ada@example.invalid');
    expect(exported.data.deals).toHaveLength(2);
    expect(exported.data.deals![0]).toMatchObject({
      name: 'Ada Lovelace retainer',
      stage: 'PROPOSAL',
    });
    expect(JSON.stringify(exported.data)).not.toContain('fixed fee');
    expect(JSON.stringify(exported.data)).not.toContain('her sister');
    expect(exported.data.tasks!.map((t) => t.title)).toEqual(['Call Ada', 'Send terms']);
    // One deal and one task have a description; empty and missing ones are not counted.
    expect(exported.withheld.DESCRIPTIONS).toBe(2);
    expect(prisma.task.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      OR: [
        { leadId: { in: ['l1'] } },
        { contactId: { in: ['c1'] } },
        { opportunityId: { in: ['o1', 'o2'] } },
      ],
    });
    expect(
      prisma.opportunity.findMany.mock.calls.some(
        ([arg]) => arg.where.contactId?.in?.[0] === 'c1' && 'name' in (arg.select ?? {})
      )
    ).toBe(true);
  });

  it('withholds AI and staff free text but keeps structured scores (Q26)', async () => {
    const prisma = subjectPrisma();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'l1' }])
      .mockResolvedValueOnce([{ id: 'c1' }])
      .mockResolvedValueOnce([{ id: 'a1' }]);
    prisma.aIScore.findMany.mockResolvedValue([
      { score: 70, confidence: 0.8, factors: [{ reasoning: 'Mentions her employer' }] },
    ]);
    prisma.leadAIInsight.findMany.mockResolvedValue([
      { churnRisk: 12, nextBestAction: 'Call her mother', recommendations: ['Offer a discount'] },
    ]);
    prisma.contactAIInsight.findMany.mockResolvedValue([
      { churnRisk: 3, nextBestAction: null, recommendations: [] },
    ]);
    prisma.aIInsight.findMany.mockResolvedValue([
      { type: 'risk', category: 'sales', title: 'Ada may leave', description: 'Her boss said so' },
    ]);
    prisma.lead.findMany.mockResolvedValue([
      { firstName: 'Ada', score: 70, tags: ['difficult'], need: 'Divorce', authority: null },
      { firstName: 'Bo', score: 5, tags: [], need: null, authority: '', budget: null },
    ]);
    prisma.contact.findMany.mockResolvedValue([{ firstName: 'Ada', tags: [] }]);
    prisma.appointment.findMany.mockResolvedValue([
      { status: 'SCHEDULED', bookerName: 'Ada', bookingAnswers: { reason: 'Private matter' } },
      { status: 'SCHEDULED', bookerName: 'Ada', bookingAnswers: null },
    ]);
    // A person's own words stay: feedback.comment is theirs (see the adapter's comment).
    prisma.feedbackSurvey.findMany.mockResolvedValue([{ score: 9, comment: 'Lovely service' }]);
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    const exported = await repo.buildExport('t1', 'ada@example.invalid');
    const json = JSON.stringify(exported.data);
    for (const text of [
      'Mentions her employer',
      'Call her mother',
      'Offer a discount',
      'Ada may leave',
      'Her boss said so',
      'difficult',
      'Divorce',
      'Private matter',
    ]) {
      expect(json).not.toContain(text);
    }
    // Structured values and the person's own comment still export.
    expect(exported.data.leadScores).toEqual([{ score: 70, confidence: 0.8 }]);
    expect(exported.data.leadInsights).toEqual([{ churnRisk: 12 }]);
    expect(exported.data.aiInsights).toEqual([{ type: 'risk', category: 'sales' }]);
    expect(exported.data.feedback).toEqual([{ score: 9, comment: 'Lovely service' }]);
    // Rows that carried text: score 1 + lead insight 1 + ai insight 1; lead tags/need 1 + booking answers 1.
    expect(exported.withheld.AI_TEXT).toBe(3);
    expect(exported.withheld.STAFF_TEXT).toBe(2);
  });

  it('withholds and counts booking notes, description, title and cancellation reason (codex)', async () => {
    const prisma = subjectPrisma();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'l1' }])
      .mockResolvedValueOnce([{ id: 'c1' }])
      .mockResolvedValueOnce([{ id: 'a1' }]);
    prisma.appointment.findMany.mockResolvedValue([
      {
        status: 'CANCELLED',
        title: 'Intro call with Ada',
        notes: 'Asked about her divorce',
        description: null,
        cancellationReason: 'Ill',
        bookingAnswers: null,
      },
    ]);
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    const exported = await repo.buildExport('t1', 'ada@example.invalid');
    expect(exported.data.bookings).toEqual([{ status: 'CANCELLED' }]);
    expect(exported.withheld.STAFF_TEXT).toBe(1);
    expect(prisma.appointment.findMany.mock.calls[0][0].select).toMatchObject({
      title: true,
      notes: true,
      description: true,
      cancellationReason: true,
    });
  });

  it("exports the person's own request text; withholds and counts staff notes on requests (codex)", async () => {
    const prisma = subjectPrisma();
    prisma.dsarRequest.findMany.mockResolvedValue([
      {
        type: 'ACCESS',
        status: 'COMPLETED',
        details: 'Everything you hold about me',
        identityNote: 'Checked her passport',
        resolutionNote: null,
      },
      { type: 'ERASURE', status: 'REJECTED', details: null, resolutionNote: 'Legal hold' },
      { type: 'OBJECTION', status: 'VERIFIED', details: null },
    ]);
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    const exported = await repo.buildExport('t1', 'ada@example.invalid');
    expect(exported.data.dataRequests).toEqual([
      { type: 'ACCESS', status: 'COMPLETED', details: 'Everything you hold about me' },
      { type: 'ERASURE', status: 'REJECTED', details: null },
      { type: 'OBJECTION', status: 'VERIFIED', details: null },
    ]);
    expect(exported.withheld.STAFF_TEXT).toBe(2);
    expect(prisma.dsarRequest.findMany.mock.calls[0][0].select).toMatchObject({
      details: true,
      identityNote: true,
      receivedOnReason: true,
      extensionReason: true,
      resolutionNote: true,
      marketingStopMethod: true,
    });
  });

  it('counts calendar events, notifications and experiment records as withheld (compliance)', async () => {
    const prisma = subjectPrisma();
    prisma.calendarEvent.count.mockResolvedValue(2);
    prisma.notification.count.mockResolvedValue(3);
    prisma.experimentAssignment.count.mockResolvedValue(1);
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    const exported = await repo.buildExport('t1', 'ada@example.invalid');
    expect(exported.withheld.OTHER_RECORDS).toBe(6);
  });

  it('counts rows past the cap as EXCESS_ROWS instead of dropping them (codex)', async () => {
    const prisma = subjectPrisma();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'l1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.feedbackSurvey.findMany.mockResolvedValue(
      Array.from({ length: 501 }, (_, i) => ({ score: i }))
    );
    prisma.feedbackSurvey.count.mockResolvedValue(730);
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    const exported = await repo.buildExport('t1', 'ada@example.invalid');
    expect(exported.data.feedback).toHaveLength(500);
    expect(exported.withheld.EXCESS_ROWS).toBe(230);
    expect(prisma.feedbackSurvey.findMany.mock.calls[0][0].take).toBe(501);
    // Categories under the cap are never counted twice.
    expect(prisma.lead.count).not.toHaveBeenCalled();
  });

  it('previews counts and the manual checklist', async () => {
    const prisma = subjectPrisma();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'l1' }, { id: 'l2' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'a1' }]);
    prisma.ticket.count.mockResolvedValue(2);
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    const preview = await repo.previewErasure('t1', 'ada@example.invalid');
    expect(preview.counts).toEqual({ leads: 2, contacts: 0, bookings: 1 });
    expect(preview.checklist).toMatchObject({ tickets: 2, emailRecords: 0 });
  });

  it('puts deals and tasks on the manual checklist, not in the erasure (Q23)', async () => {
    const prisma = subjectPrisma();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'l1' }])
      .mockResolvedValueOnce([{ id: 'c1' }])
      .mockResolvedValueOnce([]);
    prisma.opportunity.count.mockResolvedValue(3);
    prisma.opportunity.findMany.mockResolvedValue([{ id: 'o1' }]);
    prisma.task.count.mockResolvedValue(2);
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    const preview = await repo.previewErasure('t1', 'ada@example.invalid');
    expect(preview.checklist).toMatchObject({ deals: 3, tasks: 2 });
    expect(prisma.opportunity.count.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      contactId: { in: ['c1'] },
    });
    expect(prisma.task.count.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      OR: [
        { leadId: { in: ['l1'] } },
        { contactId: { in: ['c1'] } },
        { opportunityId: { in: ['o1'] } },
      ],
    });
  });

  it('leaves deals and tasks untouched when erasing', async () => {
    const prisma = subjectPrisma();
    prisma.$queryRaw.mockResolvedValueOnce([{ status: 'VERIFIED' }]);
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    const result = await repo.erase(eraseInput);
    expect(result.outcome).toBe('ERASED');
    for (const model of [prisma.opportunity, prisma.task] as Array<Record<string, unknown>>) {
      expect(model.updateMany).not.toHaveBeenCalled();
      expect(model.deleteMany).not.toHaveBeenCalled();
    }
  });

  it("takes the person's address lock after the row locks, before erasing (codex)", async () => {
    const prisma = subjectPrisma();
    prisma.$queryRaw.mockResolvedValueOnce([{ status: 'VERIFIED' }]);
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    await repo.erase({ ...eraseInput, subjectEmail: ' Ada@Example.invalid ' });
    const calls = prisma.$executeRaw.mock.calls.map(([strings, ...values]) => ({
      sql: (strings as string[]).join('?'),
      values,
    }));
    const lock = calls.findIndex((c) => c.sql.includes('dsar_subject_lock'));
    const firstUpdate = calls.findIndex((c) => c.sql.includes('UPDATE leads'));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(calls[lock]!.values).toEqual(['t1', 'ada@example.invalid']);
    expect(lock).toBeLessThan(firstUpdate);
  });

  it("keeps the appointment location: it is the firm's meeting place, not the booker's text (L5)", async () => {
    const prisma = subjectPrisma();
    prisma.$queryRaw.mockResolvedValueOnce([{ status: 'VERIFIED' }]);
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    await repo.erase(eraseInput);
    const sql = prisma.$executeRaw.mock.calls
      .map(([strings]) => (strings as string[]).join('?'))
      .find((text) => text.includes('UPDATE appointments'));
    expect(sql).toBeDefined();
    expect(sql).toContain('"bookerName" = NULL');
    expect(sql).not.toContain('location');
  });

  const eraseInput = {
    tenantId: 't1',
    requestId: 'r1',
    subjectEmail: 'ada@example.invalid',
    resolvedById: 'u1',
    note: 'No hold applies',
    now: NOW,
    clockBreached: true,
  };

  it('refuses when the locked request is no longer VERIFIED', async () => {
    const prisma = subjectPrisma();
    prisma.$queryRaw.mockResolvedValueOnce([{ status: 'COMPLETED' }]);
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    await expect(repo.erase(eraseInput)).resolves.toEqual({ outcome: 'NOT_PENDING' });
    expect(prisma.dsarRequest.updateMany).not.toHaveBeenCalled();
  });

  it('refuses when the request is missing', async () => {
    const prisma = subjectPrisma();
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    await expect(repo.erase(eraseInput)).resolves.toEqual({ outcome: 'NOT_PENDING' });
  });

  it('erases and completes the request in one transaction', async () => {
    const prisma = subjectPrisma();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ status: 'VERIFIED' }])
      .mockResolvedValueOnce([{ id: 'l1' }])
      .mockResolvedValueOnce([{ id: 'c1' }])
      .mockResolvedValueOnce([]);
    prisma.leadFile.updateMany.mockResolvedValue({ count: 1 });
    prisma.aIScore.deleteMany.mockResolvedValue({ count: 2 });
    prisma.aIInsight.deleteMany.mockResolvedValue({ count: 1 });
    prisma.opportunity.findMany.mockResolvedValue([{ id: 'o1' }]);
    const repo = new PrismaSubjectDataRepository(asClient(prisma));
    const result = await repo.erase(eraseInput);
    expect(result.outcome).toBe('ERASED');
    if (result.outcome !== 'ERASED') return;
    expect(result.result.counts).toMatchObject({ leadFiles: 1, aiScores: 2, aiInsights: 1 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.aIInsight.deleteMany.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      OR: [
        { entityId: { in: ['l1', 'c1'] } },
        { entityType: 'opportunity', entityId: { in: ['o1'] } },
      ],
    });
    expect(prisma.dsarRequest.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'r1', tenantId: 't1', status: 'VERIFIED' },
      // A late answer stays visible as such (codex).
      data: {
        status: 'COMPLETED',
        resolvedById: 'u1',
        noHoldConfirmedAt: NOW,
        clockBreached: true,
      },
    });
  });
});

describe('Prisma delegates used by the DSAR adapters exist in the schema', () => {
  const schema = readFileSync(join(__dirname, '../../../../db/prisma/schema.prisma'), 'utf-8');
  const models = new Set(
    [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]![0]!.toLowerCase() + m[1]!.slice(1))
  );
  const sources = [
    'PrismaDsarRepository',
    'PrismaProcessingRestrictionRepository',
    'PrismaSubjectDataRepository',
  ];

  it.each(sources)('%s', (name) => {
    const source = readFileSync(join(__dirname, '..', `${name}.ts`), 'utf-8');
    const used = new Set(
      [...source.matchAll(/\b(?:prisma|tx|db)\.(\w+)\.(?:find|count|create|update|delete)/g)].map(
        (m) => m[1]!
      )
    );
    expect(used.size).toBeGreaterThan(0);
    for (const delegate of used) expect(models, delegate).toContain(delegate);
  });
});
