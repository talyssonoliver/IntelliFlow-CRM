/**
 * IFC-317 — Art 20(2) direct transfer to another controller, real-Database integration test.
 *
 * Proves migration 20261128100000_dsar_transfers on a real Postgres (named CHECKs, the composite
 * tenant FKs, the unique token hash and the unique step per kind) and drives the real adapters
 * and service against it:
 *   - the link token is stored only as its keyed hash, in no column of any row;
 *   - the link is single-use, including five simultaneous downloads (exactly one wins);
 *   - expiry is enforced on the server at the stored time, and the EXPIRED step is written once;
 *   - another firm's admin can neither create, list nor revoke a transfer, and a download only
 *     ever exports the request's own firm, even when another firm holds the same address;
 *   - every step is a row on the request, with who and when.
 *
 * Skips cleanly (with a visible reason) when DATABASE_URL is not set or the migration is absent.
 */

import { randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaDsarRepository } from '../../packages/adapters/src/repositories/PrismaDsarRepository';
import { PrismaDsarTransferRepository } from '../../packages/adapters/src/repositories/PrismaDsarTransferRepository';
import { PrismaProcessingRestrictionRepository } from '../../packages/adapters/src/repositories/PrismaProcessingRestrictionRepository';
import { PrismaSubjectDataRepository } from '../../packages/adapters/src/repositories/PrismaSubjectDataRepository';
import { DataSubjectRequestService } from '../../packages/application/src/services/DataSubjectRequestService';
import { DsarTransferService } from '../../packages/application/src/services/DsarTransferService';
import type { DsarNotice } from '../../packages/application/src/ports/external/DsarNotificationPort';
import { createDsarTokenPort } from '../../apps/api/src/modules/privacy/dsar-token';
import { sqlState } from './schema-lock';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

if (!DB_URL) {
  console.log('Skipping DSAR transfer integration test: DATABASE_URL not set');
}

const RUN = `ifc317_${Date.now()}_${randomBytes(3).toString('hex')}`;
const TENANT_A = `${RUN}_a`;
const TENANT_B = `${RUN}_b`;
const ADMIN_A = `${RUN}_admin_a`;
const ADMIN_B = `${RUN}_admin_b`;
const SUBJECT = `${RUN}-ada@example.invalid`;
const HOUR = 3_600_000;
const LINK_HOURS = 168;
const hex = (ch: string) => ch.repeat(64);
const UNIQUE = ['23505', 'P2002'];
const CHECK = ['23514', 'P2004', 'P2010'];
const FK = ['23503', 'P2003'];

function pgCode(error: unknown): string | undefined {
  const state = sqlState(error);
  if (state) return state;
  const code = (error as { code?: string })?.code;
  if (code) return code;
  const text = String((error as { message?: string })?.message ?? '');
  if (/check constraint/i.test(text)) return '23514';
  if (/unique constraint|duplicate key/i.test(text)) return '23505';
  if (/foreign key/i.test(text)) return '23503';
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

describeDb('IFC-317 DSAR transfers (real DB)', () => {
  let prisma: any;
  let dbReady = false;
  let tokens: ReturnType<typeof createDsarTokenPort>;
  let service: DsarTransferService;
  let sent: DsarNotice[];
  let emailAccepted: boolean;
  let requestA: string;
  let requestB: string;

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    const probe: unknown[] = await prisma.$queryRawUnsafe(
      `SELECT 1 FROM pg_constraint WHERE conname = 'dsar_transfers_tokenHash_check'`
    );
    if (probe.length === 0) {
      console.log(
        'Skipping DSAR transfer integration test: migration 20261128100000_dsar_transfers not applied'
      );
      return;
    }
    // Sweep tenants left by crashed runs of this suite (older than one day); FKs cascade.
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id LIKE 'ifc317\\_%' AND id < $1`,
      `ifc317_${Date.now() - 86_400_000}`
    );
    await prisma.tenant.create({ data: { id: TENANT_A, name: 'Smith Law', slug: TENANT_A } });
    await prisma.tenant.create({ data: { id: TENANT_B, name: 'Jones Law', slug: TENANT_B } });
    for (const [id, tenantId] of [
      [ADMIN_A, TENANT_A],
      [ADMIN_B, TENANT_B],
    ]) {
      await prisma.user.create({
        data: {
          id,
          tenantId,
          email: `${id}@example.invalid`,
          role: 'ADMIN',
          name: `Admin ${id.slice(-1)}`,
        },
      });
    }
    // The same address is a lead in BOTH firms, with different data: a transfer must carry only
    // the request's own firm's.
    await prisma.lead.create({
      data: { tenantId: TENANT_A, ownerId: ADMIN_A, email: SUBJECT, firstName: 'Ada-of-Smith' },
    });
    await prisma.lead.create({
      data: { tenantId: TENANT_B, ownerId: ADMIN_B, email: SUBJECT, firstName: 'Ada-of-Jones' },
    });

    const dsars = new PrismaDsarRepository(prisma);
    const transfers = new PrismaDsarTransferRepository(prisma);
    tokens = createDsarTokenPort(() => 'test-salt-for-ifc317');
    sent = [];
    emailAccepted = true;
    const notifications = {
      send: async (notice: DsarNotice) => {
        sent.push(notice);
        return emailAccepted;
      },
    };
    const requestService = new DataSubjectRequestService({
      repo: dsars,
      subjectData: new PrismaSubjectDataRepository(prisma),
      restrictions: new PrismaProcessingRestrictionRepository(prisma),
      notifications,
      tokens,
      appUrl: () => 'https://app.example.invalid',
    });
    service = new DsarTransferService({
      requests: dsars,
      transfers,
      exports: requestService,
      notifications,
      tokens,
      appUrl: () => 'https://app.example.invalid',
    });

    const verified = (tenantId: string, createdById: string) =>
      dsars.createStaff({
        tenantId,
        type: 'PORTABILITY',
        subjectEmail: SUBJECT,
        capEmailHash: randomBytes(32).toString('hex'),
        details: null,
        objectionScope: null,
        identityMethod: 'IN_PERSON_ID',
        identityNote: 'Photo ID seen at the office on 3 November',
        receivedAt: new Date(),
        receivedOnReason: null,
        verifiedAt: new Date(),
        slaDeadline: new Date(Date.now() + 30 * 24 * HOUR),
        createdById,
      });
    requestA = (await verified(TENANT_A, ADMIN_A)).id;
    requestB = (await verified(TENANT_B, ADMIN_B)).id;
    dbReady = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    // Tenant FKs cascade to requests, transfers and events.
    if (dbReady) {
      await prisma.lead.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
      await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
    }
    await prisma.$disconnect();
  });

  beforeEach(() => {
    sent = [];
    emailAccepted = true;
  });

  const input = (now: Date, overrides: Record<string, unknown> = {}) => ({
    tenantId: TENANT_A,
    requestId: requestA,
    actorId: ADMIN_A,
    recipientName: 'Jones & Co',
    recipientEmail: 'privacy@jones.example.invalid',
    basis: 'Asked by email on 3 November',
    now,
    ...overrides,
  });

  /** Create a transfer and return it with the raw token taken from the emailed link. */
  async function createTransfer(now: Date, overrides: Record<string, unknown> = {}) {
    const result = await service.create(input(now, overrides));
    if (result.outcome !== 'OK') throw new Error(`create refused: ${result.outcome}`);
    const notice = sent.at(-1) as Extract<DsarNotice, { kind: 'TRANSFER_LINK' }>;
    return { transfer: result.transfer, token: notice.link.split('#t=')[1]! };
  }

  const eventsOf = (transferId: string) =>
    prisma.dsarTransferEvent.findMany({ where: { transferId }, orderBy: { occurredAt: 'asc' } });

  describe('migration constraints', () => {
    const rawTransfer = (columns: Record<string, unknown>) => {
      const row: Record<string, unknown> = {
        id: randomBytes(8).toString('hex'),
        tenantId: TENANT_A,
        requestId: requestA,
        recipientName: 'Jones',
        recipientEmail: 'privacy@jones.example.invalid',
        basis: 'Asked by email on 3 November',
        tokenHash: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + HOUR),
        ...columns,
      };
      const names = Object.keys(row)
        .map((c) => '"' + c + '"')
        .join(', ');
      const params = Object.keys(row)
        .map((_, i) => '$' + String(i + 1))
        .join(', ');
      return prisma.$executeRawUnsafe(
        `INSERT INTO dsar_transfers (${names}, "updatedAt") VALUES (${params}, now())`,
        ...Object.values(row)
      );
    };

    it('rejects a bad hash, an unnormalised address, a short basis and a used-and-revoked row', async () => {
      await expectRejected(rawTransfer({ tokenHash: 'z'.repeat(64) }), CHECK);
      await expectRejected(rawTransfer({ tokenHash: 'abc' }), CHECK);
      await expectRejected(rawTransfer({ recipientEmail: 'Privacy@Jones.example.invalid' }), CHECK);
      await expectRejected(rawTransfer({ basis: 'short' }), CHECK);
      await expectRejected(rawTransfer({ recipientName: '   ' }), CHECK);
      await expectRejected(rawTransfer({ usedAt: new Date(), revokedAt: new Date() }), CHECK);
    });

    it('keeps a transfer in its request’s firm (composite FK) and a hash unique', async () => {
      await expectRejected(rawTransfer({ tenantId: TENANT_B }), FK);
      const hash = randomBytes(32).toString('hex');
      await expect(rawTransfer({ tokenHash: hash })).resolves.toBe(1);
      await expectRejected(rawTransfer({ tokenHash: hash }), UNIQUE);
    });

    it('allows one step of each kind per transfer, SENT only with a method, and no foreign firm', async () => {
      emailAccepted = false; // so no SENT step exists yet
      const { transfer } = await createTransfer(new Date());
      const event = (columns: Record<string, unknown>) =>
        prisma.dsarTransferEvent.create({
          data: {
            tenantId: TENANT_A,
            requestId: requestA,
            transferId: transfer.id,
            actorType: 'ADMIN',
            occurredAt: new Date(),
            ...columns,
          },
        });
      await expectRejected(event({ kind: 'CREATED' }), UNIQUE); // CREATED exists already
      await event({ kind: 'SENT', via: 'EMAIL' });
      await expectRejected(event({ kind: 'SENT', via: 'MANUAL' }), UNIQUE);
      await expectRejected(event({ kind: 'REVOKED', via: 'MANUAL' }), CHECK);
      await expectRejected(event({ kind: 'DOWNLOADED', via: 'EMAIL' }), CHECK);
      await expectRejected(event({ kind: 'EXPIRED', actorType: 'GHOST' }), CHECK);
      await expectRejected(event({ kind: 'COPIED' }), CHECK);
      await expectRejected(event({ kind: 'REVOKED', tenantId: TENANT_B }), FK);
    });
  });

  describe('the token is stored hashed, never raw', () => {
    it('keeps only the keyed hash: the token is in no column of any transfer or event row', async () => {
      const { transfer, token } = await createTransfer(new Date());
      const rows = await prisma.$queryRawUnsafe(
        `SELECT t.*, (SELECT json_agg(e) FROM dsar_transfer_events e WHERE e."transferId" = t.id) AS events
           FROM dsar_transfers t WHERE t.id = $1`,
        transfer.id
      );
      const text = JSON.stringify(rows);
      expect(text).not.toContain(token);
      expect(rows[0].tokenHash).toBe(tokens.hash(token));
      expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
      // A keyed hash: the plain SHA-256 of the token (what an attacker with the table could
      // precompute) is not what is stored.
      const { createHash } = await import('node:crypto');
      expect(rows[0].tokenHash).not.toBe(createHash('sha256').update(token).digest('hex'));
    });

    it('a different salt (a rotated booking salt) kills every outstanding link', async () => {
      const { token } = await createTransfer(new Date());
      const rotated = createDsarTokenPort(() => 'rotated-salt');
      expect(rotated.hash(token)).not.toBe(tokens.hash(token));
    });

    it('emails a link that carries only the token: no request, firm or address in the URL', async () => {
      const { token } = await createTransfer(new Date());
      const notice = sent.at(-1) as Extract<DsarNotice, { kind: 'TRANSFER_LINK' }>;
      expect(notice.link).toBe(`https://app.example.invalid/dsar/transfer#t=${token}`);
      for (const leak of [requestA, TENANT_A, SUBJECT, 'smith']) {
        expect(notice.link.toLowerCase()).not.toContain(leak.toLowerCase());
      }
    });
  });

  describe('single use', () => {
    it('gives the export once; the second download is NOT_FOUND, and the use is recorded once', async () => {
      const now = new Date();
      const { transfer, token } = await createTransfer(now);
      const first = await service.download({ token, now });
      expect(first.outcome).toBe('OK');
      const second = await service.download({ token, now: new Date(now.getTime() + 1000) });
      expect(second).toEqual({ outcome: 'NOT_FOUND' });

      const row = await prisma.dsarTransfer.findUnique({ where: { id: transfer.id } });
      expect(row.usedAt).toEqual(now);
      const downloads = (await eventsOf(transfer.id)).filter((e: any) => e.kind === 'DOWNLOADED');
      expect(downloads).toHaveLength(1);
      expect(downloads[0]).toMatchObject({ actorType: 'RECIPIENT', actorId: null });
    });

    it('lets exactly one of five simultaneous downloads win', async () => {
      const now = new Date();
      const { transfer, token } = await createTransfer(now);
      const results = await Promise.all(
        Array.from({ length: 5 }, () => service.download({ token, now }))
      );
      expect(results.filter((r) => r.outcome === 'OK')).toHaveLength(1);
      expect(results.filter((r) => r.outcome === 'NOT_FOUND')).toHaveLength(4);
      const downloads = (await eventsOf(transfer.id)).filter((e: any) => e.kind === 'DOWNLOADED');
      expect(downloads).toHaveLength(1);
    });

    it('answers a revoked link, an unknown token and a used link identically', async () => {
      const now = new Date();
      const used = await createTransfer(now);
      const revoked = await createTransfer(now);
      await service.download({ token: used.token, now });
      await service.revoke({
        tenantId: TENANT_A,
        id: revoked.transfer.id,
        actorId: ADMIN_A,
        now,
      });
      const answers = await Promise.all([
        service.download({ token: used.token, now }),
        service.download({ token: revoked.token, now }),
        service.download({ token: randomBytes(32).toString('base64url'), now }),
        service.download({ token: '', now }),
      ]);
      for (const answer of answers) expect(answer).toStrictEqual({ outcome: 'NOT_FOUND' });
    });
  });

  describe('expiry is enforced on the server', () => {
    it('works until the stored expiry and not from that instant on', async () => {
      const t0 = new Date(Date.now() - 30 * 24 * HOUR);
      const fresh = await createTransfer(t0);
      const late = await createTransfer(t0);
      const expiry = new Date(t0.getTime() + LINK_HOURS * HOUR);

      const stored = await prisma.dsarTransfer.findUnique({ where: { id: fresh.transfer.id } });
      expect(stored.expiresAt).toEqual(expiry);

      const justBefore = await service.download({
        token: fresh.token,
        now: new Date(expiry.getTime() - 1),
      });
      expect(justBefore.outcome).toBe('OK');
      expect(await service.download({ token: late.token, now: expiry })).toEqual({
        outcome: 'NOT_FOUND',
      });
      expect(
        await service.download({ token: late.token, now: new Date(expiry.getTime() + 3 * HOUR) })
      ).toEqual({ outcome: 'NOT_FOUND' });
    });

    it('records EXPIRED once, stamped with the expiry time, and never for a used or revoked link', async () => {
      const t0 = new Date(Date.now() - 30 * 24 * HOUR);
      const expired = await createTransfer(t0);
      const used = await createTransfer(t0);
      const revoked = await createTransfer(t0);
      await service.download({ token: used.token, now: new Date(t0.getTime() + HOUR) });
      await service.revoke({
        tenantId: TENANT_A,
        id: revoked.transfer.id,
        actorId: ADMIN_A,
        now: new Date(t0.getTime() + HOUR),
      });

      const now = new Date();
      const listed = await service.list({ tenantId: TENANT_A, requestId: requestA, now });
      await service.list({ tenantId: TENANT_A, requestId: requestA, now });
      if (listed.outcome !== 'OK') throw new Error('list failed');

      const states = Object.fromEntries(listed.transfers.map((t) => [t.id, t.state]));
      expect(states[expired.transfer.id]).toBe('EXPIRED');
      expect(states[used.transfer.id]).toBe('DOWNLOADED');
      expect(states[revoked.transfer.id]).toBe('REVOKED');

      const expiredEvents = (await eventsOf(expired.transfer.id)).filter(
        (e: any) => e.kind === 'EXPIRED'
      );
      expect(expiredEvents).toHaveLength(1);
      expect(expiredEvents[0]).toMatchObject({ actorType: 'SYSTEM', actorId: null });
      expect(expiredEvents[0].occurredAt).toEqual(new Date(t0.getTime() + LINK_HOURS * HOUR));
      for (const other of [used, revoked]) {
        expect((await eventsOf(other.transfer.id)).map((e: any) => e.kind)).not.toContain(
          'EXPIRED'
        );
      }
    });

    it('a download after expiry also writes the EXPIRED step, once', async () => {
      const t0 = new Date(Date.now() - 30 * 24 * HOUR);
      const { transfer, token } = await createTransfer(t0);
      await service.download({ token, now: new Date() });
      await service.download({ token, now: new Date() });
      const kinds = (await eventsOf(transfer.id)).map((e: any) => e.kind);
      expect(kinds.filter((k: string) => k === 'EXPIRED')).toHaveLength(1);
    });
  });

  describe('another firm', () => {
    it('cannot create, list, revoke or mark sent a transfer on a request it does not own', async () => {
      const { transfer, token } = await createTransfer(new Date());
      const otherAdmin = { tenantId: TENANT_B, actorId: ADMIN_B, now: new Date() };

      expect(
        await service.create({ ...input(new Date()), ...otherAdmin, requestId: requestA })
      ).toEqual({
        outcome: 'NOT_FOUND',
      });
      expect(
        await service.list({ tenantId: TENANT_B, requestId: requestA, now: new Date() })
      ).toEqual({
        outcome: 'NOT_FOUND',
      });
      expect(await service.revoke({ ...otherAdmin, id: transfer.id })).toEqual({
        outcome: 'NOT_FOUND',
      });
      expect(await service.markSent({ ...otherAdmin, id: transfer.id })).toEqual({
        outcome: 'NOT_FOUND',
      });

      const row = await prisma.dsarTransfer.findUnique({ where: { id: transfer.id } });
      expect(row.revokedAt).toBeNull();
      expect(await prisma.dsarTransfer.count({ where: { tenantId: TENANT_B } })).toBe(0);
      // And the link still works for its own recipient.
      expect((await service.download({ token, now: new Date() })).outcome).toBe('OK');
    });

    it('exports only the request’s own firm, though another firm holds the same address', async () => {
      const { token } = await createTransfer(new Date());
      const result = await service.download({ token, now: new Date() });
      if (result.outcome !== 'OK') throw new Error('download failed');
      const text = JSON.stringify(result.export);
      expect(text).toContain('Ada-of-Smith');
      expect(text).not.toContain('Ada-of-Jones');
      expect(result.tenantId).toBe(TENANT_A);
      expect(result.export.processingInformation.controller.name).toBe('Smith Law');
    });

    it('a transfer made by the other firm on its own request exports that firm’s data only', async () => {
      const result = await service.create({
        ...input(new Date()),
        tenantId: TENANT_B,
        requestId: requestB,
        actorId: ADMIN_B,
      });
      if (result.outcome !== 'OK') throw new Error('create failed');
      const token = (sent.at(-1) as Extract<DsarNotice, { kind: 'TRANSFER_LINK' }>).link.split(
        '#t='
      )[1]!;
      const downloaded = await service.download({ token, now: new Date() });
      if (downloaded.outcome !== 'OK') throw new Error('download failed');
      const text = JSON.stringify(downloaded.export);
      expect(text).toContain('Ada-of-Jones');
      expect(text).not.toContain('Ada-of-Smith');
    });
  });

  describe('what may be transferred', () => {
    it('refuses an unverified, rejected or non-portability request and stores nothing', async () => {
      const dsars = new PrismaDsarRepository(prisma);
      const before = await prisma.dsarTransfer.count({ where: { tenantId: TENANT_A } });
      const pending = await dsars.reserveSubmission(
        {
          tenantId: TENANT_A,
          type: 'PORTABILITY',
          subjectEmail: `${RUN}-pending@example.invalid`,
          capEmailHash: randomBytes(32).toString('hex'),
          details: null,
          objectionScope: null,
          ipHash: null,
          verificationTokenHash: hex('1'),
          verificationExpiresAt: new Date(Date.now() + 24 * HOUR),
        },
        {
          perTenantEmailPerDay: 3,
          perIpPerHour: 10,
          globalEmailPerDay: 3,
          perTenantPerDay: 50,
          resendCooldownMinutes: 60,
        },
        new Date()
      );
      if (pending.outcome !== 'CREATED') throw new Error('seed failed');
      expect(await service.create(input(new Date(), { requestId: pending.record.id }))).toEqual({
        outcome: 'INVALID',
        field: 'transferNotAllowed',
      });

      await prisma.dsarRequest.update({
        where: { id: pending.record.id },
        data: { status: 'REJECTED' },
      });
      expect(await service.create(input(new Date(), { requestId: pending.record.id }))).toEqual({
        outcome: 'INVALID',
        field: 'transferNotAllowed',
      });
      expect(await prisma.dsarTransfer.count({ where: { tenantId: TENANT_A } })).toBe(before);
    });

    it('stops working when the request is refused after the link was made', async () => {
      const dsars = new PrismaDsarRepository(prisma);
      const own = await dsars.createStaff({
        tenantId: TENANT_A,
        type: 'PORTABILITY',
        subjectEmail: `${RUN}-later@example.invalid`,
        capEmailHash: randomBytes(32).toString('hex'),
        details: null,
        objectionScope: null,
        identityMethod: 'IN_PERSON_ID',
        identityNote: 'Photo ID seen at the office on 3 November',
        receivedAt: new Date(),
        receivedOnReason: null,
        verifiedAt: new Date(),
        slaDeadline: new Date(Date.now() + 30 * 24 * HOUR),
        createdById: ADMIN_A,
      });
      const { transfer, token } = await createTransfer(new Date(), { requestId: own.id });
      await prisma.dsarRequest.update({ where: { id: own.id }, data: { status: 'REJECTED' } });
      expect(await service.download({ token, now: new Date() })).toEqual({ outcome: 'NOT_FOUND' });
      const row = await prisma.dsarTransfer.findUnique({ where: { id: transfer.id } });
      expect(row.usedAt).toBeNull();
    });
  });

  describe('the audit trail on the request', () => {
    it('records created, sent, downloaded with who and when, and shows it in order', async () => {
      const t0 = new Date(Date.now() - 2 * HOUR);
      const { transfer, token } = await createTransfer(t0);
      const downloadedAt = new Date(t0.getTime() + HOUR);
      await service.download({ token, now: downloadedAt });

      const listed = await service.list({
        tenantId: TENANT_A,
        requestId: requestA,
        now: new Date(),
      });
      if (listed.outcome !== 'OK') throw new Error('list failed');
      const view = listed.transfers.find((t) => t.id === transfer.id)!;
      expect(view.state).toBe('DOWNLOADED');
      expect(
        view.events.map((e) => [e.kind, e.actorType, e.actorId, e.actorLabel, e.via, e.occurredAt])
      ).toEqual([
        ['CREATED', 'ADMIN', ADMIN_A, 'Admin a', null, t0],
        ['SENT', 'ADMIN', ADMIN_A, 'Admin a', 'EMAIL', t0],
        ['DOWNLOADED', 'RECIPIENT', null, null, null, downloadedAt],
      ]);
    });

    it('records a manual send and a revocation, with the admin who did each', async () => {
      emailAccepted = false;
      const t0 = new Date();
      const { transfer } = await createTransfer(t0);
      expect((await eventsOf(transfer.id)).map((e: any) => e.kind)).toEqual(['CREATED']);

      expect(
        await service.markSent({ tenantId: TENANT_A, id: transfer.id, actorId: ADMIN_A, now: t0 })
      ).toEqual({ outcome: 'OK' });
      expect(
        await service.markSent({ tenantId: TENANT_A, id: transfer.id, actorId: ADMIN_A, now: t0 })
      ).toEqual({ outcome: 'CONFLICT' });
      expect(
        await service.revoke({ tenantId: TENANT_A, id: transfer.id, actorId: ADMIN_A, now: t0 })
      ).toEqual({ outcome: 'OK' });
      expect(
        await service.revoke({ tenantId: TENANT_A, id: transfer.id, actorId: ADMIN_A, now: t0 })
      ).toEqual({ outcome: 'CONFLICT' });

      const events = await eventsOf(transfer.id);
      expect(events.map((e: any) => [e.kind, e.via, e.actorId]).sort()).toEqual(
        [
          ['CREATED', null, ADMIN_A],
          ['REVOKED', null, ADMIN_A],
          ['SENT', 'MANUAL', ADMIN_A],
        ].sort()
      );
    });

    it('holds no address, name or token in the events table', async () => {
      const { transfer, token } = await createTransfer(new Date());
      await service.download({ token, now: new Date() });
      const text = JSON.stringify(await eventsOf(transfer.id));
      for (const secret of [token, 'jones', 'Jones', SUBJECT, 'example.invalid']) {
        expect(text).not.toContain(secret);
      }
    });

    it('is removed with its request, never left behind', async () => {
      const dsars = new PrismaDsarRepository(prisma);
      const own = await dsars.createStaff({
        tenantId: TENANT_A,
        type: 'PORTABILITY',
        subjectEmail: `${RUN}-gone@example.invalid`,
        capEmailHash: randomBytes(32).toString('hex'),
        details: null,
        objectionScope: null,
        identityMethod: 'IN_PERSON_ID',
        identityNote: 'Photo ID seen at the office on 3 November',
        receivedAt: new Date(),
        receivedOnReason: null,
        verifiedAt: new Date(),
        slaDeadline: new Date(Date.now() + 30 * 24 * HOUR),
        createdById: ADMIN_A,
      });
      const { transfer } = await createTransfer(new Date(), { requestId: own.id });
      await prisma.dsarRequest.delete({ where: { id: own.id } });
      expect(await prisma.dsarTransfer.count({ where: { id: transfer.id } })).toBe(0);
      expect(await prisma.dsarTransferEvent.count({ where: { transferId: transfer.id } })).toBe(0);
    });
  });
});
