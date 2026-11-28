/**
 * IFC-317 DSAR transfer adapter — unit tests with a mocked Prisma client.
 *
 * What the real database proves (the single-use UPDATE under concurrency, the CHECKs, the
 * composite tenant FKs, the unique step per kind) is in tests/integration/dsar-transfer.test.ts.
 * These tests pin the branching the adapter owns: every conditional write names every condition
 * of a live link, an event is written only when its write won, every admin read is scoped by
 * tenant, and expiries are stamped with the expiry time.
 */
import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@intelliflow/db';
import { PrismaDsarTransferRepository } from '../PrismaDsarTransferRepository';

const NOW = new Date('2026-11-28T10:00:00.000Z');
const LATER = new Date('2026-12-05T10:00:00.000Z');

/** A client whose interactive $transaction runs the callback against itself. */
function mockPrisma() {
  const client: Record<string, any> = {
    dsarTransfer: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ tenantId: 't1', requestId: 'r1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    dsarTransferEvent: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  client.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));
  return client;
}

function setup() {
  const prisma = mockPrisma();
  return { prisma, repo: new PrismaDsarTransferRepository(prisma as unknown as PrismaClient) };
}

describe('create', () => {
  it('writes the transfer and its CREATED event in one transaction, by the admin', async () => {
    const { prisma, repo } = setup();
    prisma.dsarTransfer.create.mockResolvedValue({ id: 'tr1', tenantId: 't1', requestId: 'r1' });
    await expect(
      repo.create({
        tenantId: 't1',
        requestId: 'r1',
        recipientName: 'Jones & Co',
        recipientEmail: 'privacy@jones.example.invalid',
        basis: 'Asked by email',
        tokenHash: 'a'.repeat(64),
        expiresAt: LATER,
        createdById: 'admin-1',
        now: NOW,
      })
    ).resolves.toMatchObject({ id: 'tr1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.dsarTransfer.create.mock.calls[0]![0].data).toMatchObject({
      tenantId: 't1',
      requestId: 'r1',
      tokenHash: 'a'.repeat(64),
      expiresAt: LATER,
      createdById: 'admin-1',
    });
    expect(prisma.dsarTransferEvent.create).toHaveBeenCalledWith({
      data: {
        tenantId: 't1',
        requestId: 'r1',
        transferId: 'tr1',
        kind: 'CREATED',
        actorType: 'ADMIN',
        actorId: 'admin-1',
        occurredAt: NOW,
      },
    });
  });
});

describe('claim (using the link once)', () => {
  it('sets usedAt only while unused, unrevoked and unexpired, then records DOWNLOADED', async () => {
    const { prisma, repo } = setup();
    await expect(repo.claim('tr1', NOW)).resolves.toBe(true);
    expect(prisma.dsarTransfer.updateMany).toHaveBeenCalledWith({
      where: { id: 'tr1', usedAt: null, revokedAt: null, expiresAt: { gt: NOW } },
      data: { usedAt: NOW },
    });
    expect(prisma.dsarTransferEvent.create.mock.calls[0]![0].data).toMatchObject({
      tenantId: 't1',
      requestId: 'r1',
      transferId: 'tr1',
      kind: 'DOWNLOADED',
      actorType: 'RECIPIENT',
      occurredAt: NOW,
    });
  });

  it('records nothing when another caller got there first', async () => {
    const { prisma, repo } = setup();
    prisma.dsarTransfer.updateMany.mockResolvedValue({ count: 0 });
    await expect(repo.claim('tr1', NOW)).resolves.toBe(false);
    expect(prisma.dsarTransferEvent.create).not.toHaveBeenCalled();
  });
});

describe('revoke', () => {
  it('is scoped by tenant, needs a live link, and records REVOKED by the admin', async () => {
    const { prisma, repo } = setup();
    prisma.dsarTransfer.findUniqueOrThrow.mockResolvedValue({ requestId: 'r1' });
    await expect(repo.revoke('t1', 'tr1', 'admin-1', NOW)).resolves.toBe(true);
    expect(prisma.dsarTransfer.updateMany).toHaveBeenCalledWith({
      where: { id: 'tr1', tenantId: 't1', usedAt: null, revokedAt: null, expiresAt: { gt: NOW } },
      data: { revokedAt: NOW },
    });
    expect(prisma.dsarTransferEvent.create.mock.calls[0]![0].data).toMatchObject({
      tenantId: 't1',
      kind: 'REVOKED',
      actorType: 'ADMIN',
      actorId: 'admin-1',
    });
  });

  it('writes no event when the link was not live (or belongs to another firm)', async () => {
    const { prisma, repo } = setup();
    prisma.dsarTransfer.updateMany.mockResolvedValue({ count: 0 });
    await expect(repo.revoke('t2', 'tr1', 'admin-2', NOW)).resolves.toBe(false);
    expect(prisma.dsarTransferEvent.create).not.toHaveBeenCalled();
  });
});

describe('reads', () => {
  it('scopes the admin lookups by tenant and finds the public one by token hash only', async () => {
    const { prisma, repo } = setup();
    await repo.findForTenant('t1', 'tr1');
    expect(prisma.dsarTransfer.findFirst.mock.calls[0]![0].where).toEqual({
      id: 'tr1',
      tenantId: 't1',
    });
    await repo.findByTokenHash('h'.repeat(64));
    expect(prisma.dsarTransfer.findUnique.mock.calls[0]![0].where).toEqual({
      tokenHash: 'h'.repeat(64),
    });
  });

  it('never selects the token hash into a record', async () => {
    const { prisma, repo } = setup();
    await repo.findByTokenHash('h'.repeat(64));
    await repo.findForTenant('t1', 'tr1');
    await repo.listForRequest('t1', 'r1');
    for (const call of [
      prisma.dsarTransfer.findUnique.mock.calls[0]![0],
      prisma.dsarTransfer.findFirst.mock.calls[0]![0],
      prisma.dsarTransfer.findMany.mock.calls[0]![0],
    ]) {
      expect(call.select).not.toHaveProperty('tokenHash');
    }
  });

  it('lists a request’s transfers with events oldest first, created before sent at one instant, naming the admin', async () => {
    const { prisma, repo } = setup();
    const at = (iso: string) => new Date(iso);
    prisma.dsarTransfer.findMany.mockResolvedValue([
      {
        id: 'tr1',
        tenantId: 't1',
        requestId: 'r1',
        events: [
          {
            id: 'e3',
            transferId: 'tr1',
            kind: 'DOWNLOADED',
            actorType: 'RECIPIENT',
            actorId: null,
            via: null,
            occurredAt: at('2026-11-29T10:00:00Z'),
            actor: null,
          },
          {
            id: 'e2',
            transferId: 'tr1',
            kind: 'SENT',
            actorType: 'ADMIN',
            actorId: 'a1',
            via: 'EMAIL',
            occurredAt: NOW,
            actor: { name: null, email: 'ada@example.invalid' },
          },
          {
            id: 'e1',
            transferId: 'tr1',
            kind: 'CREATED',
            actorType: 'ADMIN',
            actorId: 'a1',
            via: null,
            occurredAt: NOW,
            actor: { name: 'Ada Admin', email: 'ada@example.invalid' },
          },
        ],
      },
    ]);
    const [transfer] = await repo.listForRequest('t1', 'r1');
    expect(prisma.dsarTransfer.findMany.mock.calls[0]![0].where).toEqual({
      tenantId: 't1',
      requestId: 'r1',
    });
    expect(transfer!.events.map((e) => [e.kind, e.actorLabel])).toEqual([
      ['CREATED', 'Ada Admin'],
      ['SENT', 'ada@example.invalid'],
      ['DOWNLOADED', null],
    ]);
  });
});

describe('recordEvent', () => {
  it('does nothing for a transfer outside the tenant', async () => {
    const { prisma, repo } = setup();
    await expect(
      repo.recordEvent('t2', 'tr1', {
        kind: 'SENT',
        actorType: 'ADMIN',
        via: 'MANUAL',
        occurredAt: NOW,
      })
    ).resolves.toBe(false);
    expect(prisma.dsarTransfer.findFirst.mock.calls[0]![0].where).toEqual({
      id: 'tr1',
      tenantId: 't2',
    });
    expect(prisma.dsarTransferEvent.createMany).not.toHaveBeenCalled();
  });

  it('writes the event once, skipping a duplicate step, and reports whether it wrote', async () => {
    const { prisma, repo } = setup();
    prisma.dsarTransfer.findFirst.mockResolvedValue({ requestId: 'r1' });
    await expect(
      repo.recordEvent('t1', 'tr1', {
        kind: 'SENT',
        actorType: 'ADMIN',
        actorId: 'a1',
        via: 'MANUAL',
        occurredAt: NOW,
      })
    ).resolves.toBe(true);
    const call = prisma.dsarTransferEvent.createMany.mock.calls[0]![0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0]).toMatchObject({
      kind: 'SENT',
      via: 'MANUAL',
      actorId: 'a1',
      tenantId: 't1',
    });

    prisma.dsarTransferEvent.createMany.mockResolvedValue({ count: 0 });
    await expect(
      repo.recordEvent('t1', 'tr1', {
        kind: 'SENT',
        actorType: 'ADMIN',
        via: 'EMAIL',
        occurredAt: NOW,
      })
    ).resolves.toBe(false);
  });
});

describe('recordExpiries', () => {
  it('stamps EXPIRED with the expiry time, only for unused, unrevoked links with no EXPIRED yet', async () => {
    const { prisma, repo } = setup();
    prisma.dsarTransfer.findMany.mockResolvedValue([
      { id: 'tr1', requestId: 'r1', expiresAt: LATER },
    ]);
    await repo.recordExpiries(
      { tenantId: 't1', requestId: 'r1' },
      new Date('2027-01-01T00:00:00Z')
    );
    expect(prisma.dsarTransfer.findMany.mock.calls[0]![0].where).toEqual({
      tenantId: 't1',
      requestId: 'r1',
      usedAt: null,
      revokedAt: null,
      expiresAt: { lte: new Date('2027-01-01T00:00:00Z') },
      events: { none: { kind: 'EXPIRED' } },
    });
    expect(prisma.dsarTransferEvent.createMany.mock.calls[0]![0]).toMatchObject({
      skipDuplicates: true,
      data: [
        {
          tenantId: 't1',
          requestId: 'r1',
          transferId: 'tr1',
          kind: 'EXPIRED',
          actorType: 'SYSTEM',
          occurredAt: LATER,
        },
      ],
    });
  });

  it('can be scoped to one transfer, and writes nothing when none expired', async () => {
    const { prisma, repo } = setup();
    await repo.recordExpiries({ tenantId: 't1', transferId: 'tr1' }, NOW);
    expect(prisma.dsarTransfer.findMany.mock.calls[0]![0].where).toMatchObject({
      tenantId: 't1',
      id: 'tr1',
    });
    expect(prisma.dsarTransfer.findMany.mock.calls[0]![0].where).not.toHaveProperty('requestId');
    expect(prisma.dsarTransferEvent.createMany).not.toHaveBeenCalled();
  });
});
