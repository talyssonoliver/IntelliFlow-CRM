/**
 * Findings of the security review, pinned: a disk error must not end the worker process, a
 * superseded run must not overwrite the run that replaced it, exhausted requests are failed
 * loudly, a failed commitment is retried, operator staff stay out of the archive, and spreadsheet
 * formulas in customer data do not run.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchiveWriter } from '../archive-writer';
import { csvCell } from '../serialize';
import { createTenantReadGuard, pinReadArgsToTenant } from '../tenant-read-guard';
import { runWorkspaceExport } from '../export-workspace';
import {
  MAX_EXPORT_ATTEMPTS,
  STALE_QUEUED_MS,
  processWorkspaceExport,
  requestExportForEndedSubscription,
  sweepWorkspaceExports,
  type ExportJobDeps,
} from '../workspace-export-service';
import { makeDb, readZip } from './helpers';

const T = 'tenant_a_aaaaaaaaaaaaaaaaaaaa';
const t0 = new Date('2026-11-23T12:00:00.000Z');

let dir = '';
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('archive writer disk failure', () => {
  it('rejects the export without an unhandled rejection (which would end the worker)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-h-'));
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const writer = new ArchiveWriter(join(dir, 'missing-folder', 'a.zip'));
      let failure: unknown;
      try {
        await writer.addGenerated('a.txt', async (w) => {
          for (let i = 0; i < 50; i += 1) await w('x'.repeat(10_000));
        });
        await writer.finalize();
      } catch (err) {
        failure = err;
      }
      await new Promise((r) => setTimeout(r, 50));
      expect(failure).toBeInstanceOf(Error);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('CSV formula injection', () => {
  it.each([
    ['=HYPERLINK("http://x")', `'=HYPERLINK(""http://x"")`],
    ['+441234', "'+441234"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1)', "'@SUM(A1)"],
  ])('neutralises text %s', (input, expected) => {
    const cell = csvCell(input);
    expect(cell.replace(/^"|"$/g, '')).toBe(expected);
  });

  it('leaves numbers, booleans, dates and normal text alone', () => {
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(true)).toBe('true');
    expect(csvCell('2026-11-01T10:00:00.000Z')).toBe('2026-11-01T10:00:00.000Z');
    expect(csvCell('Ann')).toBe('Ann');
    expect(csvCell(['=x'])).toBe('"[""=x""]"');
  });
});

describe('operator staff stay out of the users file', () => {
  it('excludes a PORTAL_STAFF member, keeps an invited one', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-h-'));
    const db = makeDb({
      tenant: [
        {
          id: T,
          name: 'Alpha',
          slug: 'alpha',
          status: 'ACTIVE',
          plan: 'STARTER',
          createdAt: t0,
          updatedAt: t0,
        },
      ],
      user: [
        { id: 'u1', tenantId: T, email: 'owner@example.invalid', role: 'ADMIN' },
        { id: 'u2', tenantId: 'other', email: 'invited@example.invalid', role: 'USER' },
        { id: 'u3', tenantId: 'other', email: 'staff@example.invalid', role: 'ADMIN' },
      ],
      tenantMembership: [
        {
          id: 'm1',
          tenantId: T,
          userId: 'u2',
          source: 'OWNER_INVITE',
          revokedAt: null,
          expiresAt: null,
        },
        {
          id: 'm2',
          tenantId: T,
          userId: 'u3',
          source: 'PORTAL_STAFF',
          revokedAt: null,
          expiresAt: null,
        },
      ],
    });
    const out = join(dir, 'a.zip');
    await runWorkspaceExport({ db, tenantId: T, outputPath: out });
    const emails = JSON.parse(readZip(out)['data/users.json']!)
      .map((u: any) => u.email)
      .sort();
    expect(emails).toEqual(['invited@example.invalid', 'owner@example.invalid']);
  });
});

function world(rows: any[]) {
  const tables: Record<string, any[]> = {
    tenant: [
      {
        id: T,
        name: 'Alpha',
        slug: 'alpha',
        status: 'ACTIVE',
        plan: 'STARTER',
        createdAt: t0,
        updatedAt: t0,
      },
    ],
    workspaceExportRequest: rows,
    stripeSubscription: [],
    user: [
      { id: 'owner', tenantId: T, email: 'owner@example.invalid', role: 'ADMIN', createdAt: t0 },
    ],
  };
  const db = makeDb(tables) as any;
  db.$extends = () => db;
  return { tables, db };
}

function deps(db: any, over: Partial<ExportJobDeps> = {}) {
  const removed: string[] = [];
  const logged: unknown[] = [];
  const tmp = mkdtempSync(join(tmpdir(), 'wsx-h-'));
  const d: ExportJobDeps = {
    prisma: db,
    archiveStorage: {
      ensureBucket: async () => {},
      uploadArchive: async () => {},
      signedDownloadUrl: async () => 'https://storage.example.invalid/sign',
      removeArchive: async (p) => void removed.push(p),
    },
    fileStorage: null,
    sendEmail: async () => {},
    now: () => t0,
    tmpDir: tmp,
    log: { info() {}, warn() {}, error: (o) => void logged.push(o) },
    runExport: (async (o: any) => ({
      archivePath: o.outputPath,
      archiveBytes: 1,
      archiveSha256: 'c'.repeat(64),
      rowCounts: {},
      storedFileCount: 0,
      manifest: { workspace: { id: T, name: 'Alpha', slug: 'alpha' }, skippedFiles: [] },
    })) as never,
    ...over,
  };
  return { d, removed, logged, tmp };
}

describe('a run that was taken over', () => {
  it('does not overwrite the newer run, and removes the archive it uploaded', async () => {
    const { tables, db } = world([
      {
        id: 'r1',
        tenantId: T,
        status: 'QUEUED',
        attempts: 0,
        trigger: 'ADMIN',
        requestedAt: t0,
        updatedAt: t0,
      },
    ]);
    const { d, removed, tmp } = deps(db, {
      // While this run works, the sweep reclaims the request and a second run finishes first.
      runExport: (async (o: any) => {
        Object.assign(tables.workspaceExportRequest[0], {
          attempts: 2,
          status: 'READY',
          archiveSha256: 'd'.repeat(64),
          storagePath: `${T}/r1-2.zip`,
        });
        return {
          archivePath: o.outputPath,
          archiveBytes: 1,
          archiveSha256: 'c'.repeat(64),
          rowCounts: {},
          storedFileCount: 0,
          manifest: { workspace: { id: T, name: 'Alpha', slug: 'alpha' }, skippedFiles: [] },
        };
      }) as never,
    });
    const out = await processWorkspaceExport(d, { requestId: 'r1' });
    expect(out).toEqual({ status: 'skipped', requestId: 'r1', reason: 'superseded' });
    expect(tables.workspaceExportRequest[0]).toMatchObject({
      archiveSha256: 'd'.repeat(64),
      storagePath: `${T}/r1-2.zip`,
    });
    expect(removed).toEqual([`${T}/r1-1.zip`]);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('a failure after upload removes the orphaned archive and leaves another run row alone', async () => {
    const { tables, db } = world([
      {
        id: 'r1',
        tenantId: T,
        status: 'QUEUED',
        attempts: 0,
        trigger: 'ADMIN',
        requestedAt: t0,
        updatedAt: t0,
      },
    ]);
    const { d, removed, tmp } = deps(db);
    const original = db.workspaceExportRequest.updateMany;
    db.workspaceExportRequest.updateMany = vi.fn(async (args: any) => {
      if (args.data.status === 'READY') throw new Error('db down');
      return original(args);
    });
    await expect(processWorkspaceExport(d, { requestId: 'r1' })).rejects.toThrow('db down');
    expect(removed).toEqual([`${T}/r1-1.zip`]);
    expect(tables.workspaceExportRequest[0].status).toBe('QUEUED');
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe('sweep: requests that cannot run again', () => {
  it('fails a request that used every attempt and says it needs a person', async () => {
    const stale = new Date(t0.getTime() - 2 * STALE_QUEUED_MS);
    const { tables, db } = world([
      {
        id: 'dead',
        tenantId: T,
        status: 'QUEUED',
        attempts: MAX_EXPORT_ATTEMPTS,
        trigger: 'SUBSCRIPTION_ENDED',
        requestedAt: t0,
        updatedAt: stale,
      },
      {
        id: 'ok',
        tenantId: T,
        status: 'QUEUED',
        attempts: 1,
        trigger: 'ADMIN',
        requestedAt: t0,
        updatedAt: stale,
      },
    ]);
    const { d, logged, tmp } = deps(db);
    const enqueue = vi.fn(async () => {});
    await sweepWorkspaceExports(d, enqueue);
    expect(tables.workspaceExportRequest[0]).toMatchObject({ status: 'FAILED' });
    expect(tables.workspaceExportRequest[1].status).toBe('QUEUED');
    expect(logged).toEqual([{ requestId: 'dead', tenantId: T, trigger: 'SUBSCRIPTION_ENDED' }]);
    expect(enqueue).toHaveBeenCalledTimes(1);
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe('a failed commitment is retried', () => {
  it('re-queues a FAILED subscription export when the event comes again', async () => {
    const { tables, db } = world([
      {
        id: 'f1',
        tenantId: T,
        status: 'FAILED',
        attempts: MAX_EXPORT_ATTEMPTS,
        trigger: 'SUBSCRIPTION_ENDED',
        subscriptionId: 'sub_1',
        requestedAt: t0,
        updatedAt: t0,
        error: 'x',
      },
    ]);
    db.stripeSubscription = { count: async () => 0 };
    const enqueue = vi.fn(async () => {});
    const out = await requestExportForEndedSubscription(
      db,
      { tenantId: T, subscriptionId: 'sub_1' },
      enqueue
    );
    expect(out).toEqual({ kind: 'created', requestId: 'f1' });
    expect(tables.workspaceExportRequest[0]).toMatchObject({
      status: 'QUEUED',
      attempts: 0,
      error: null,
    });
    expect(enqueue).toHaveBeenCalledWith({ requestId: 'f1', tenantId: T }, { retry: 0 });
  });
});

describe('review follow-ups', () => {
  it('writes a negative decimal as a number, not as a formula', () => {
    expect(csvCell('-12.50')).toBe('-12.50');
    expect(csvCell('-0')).toBe('-0');
    expect(csvCell('-1+1')).toBe("'-1+1");
  });

  it('a unique read keeps its unique key at the top level and pins the tenant beside it', () => {
    expect(pinReadArgsToTenant('Lead', { where: { id: 'l1' } }, T, 'findUnique')).toEqual({
      where: { id: 'l1', AND: [{ tenantId: T }] },
    });
    expect(
      pinReadArgsToTenant(
        'Lead',
        { where: { id: 'l1', AND: { status: 'NEW' } } },
        T,
        'findUniqueOrThrow'
      )
    ).toEqual({ where: { id: 'l1', AND: [{ status: 'NEW' }, { tenantId: T }] } });
    // A Tenant lookup for another id still finds nothing: the pin is an AND, not an overwrite.
    expect(pinReadArgsToTenant('Tenant', { where: { id: 'other' } }, T, 'findUnique')).toEqual({
      where: { id: 'other', AND: [{ id: T }] },
    });
  });

  it('refuses raw SQL as well as writes', () => {
    let extension: any;
    createTenantReadGuard({ $extends: (e: any) => ((extension = e), {}) }, T);
    for (const op of ['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe']) {
      expect(() => extension.query[op]()).toThrow(/refused/);
    }
  });

  it('stops retrying an email once someone has the link', async () => {
    const { tables, db } = world([
      {
        id: 'r',
        tenantId: T,
        status: 'READY',
        storagePath: `${T}/r-1.zip`,
        archiveSha256: 'b'.repeat(64),
        archiveBytes: 10n,
        expiresAt: new Date(t0.getTime() + 86_400_000),
        emailedAt: null,
        requestedById: 'owner',
        subscriptionId: null,
        requestedAt: t0,
        attempts: 1,
        updatedAt: t0,
      },
    ]);
    tables.user.push({
      id: 'asker',
      tenantId: T,
      email: 'asker@example.invalid',
      role: 'ADMIN',
      createdAt: new Date(t0.getTime() + 1),
    });
    tables.workspaceExportRequest[0].requestedById = 'asker';
    const sent: string[] = [];
    const { d, tmp } = deps(db, {
      sendEmail: async (m) => {
        if (m.recipientUserId === 'asker') throw new Error('bounce');
        sent.push(m.recipientUserId);
      },
    });
    await sweepWorkspaceExports(d, async () => {});
    expect(sent).toEqual(['owner']);
    expect(tables.workspaceExportRequest[0].emailedAt).toEqual(t0);
    await sweepWorkspaceExports(d, async () => {});
    expect(sent).toEqual(['owner']);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('a row that can never be delivered goes to the back of the line', async () => {
    const mk = (id: string, updatedAt: Date) => ({
      id,
      tenantId: T,
      status: 'READY',
      storagePath: `${T}/${id}.zip`,
      archiveSha256: 'b'.repeat(64),
      archiveBytes: 10n,
      expiresAt: new Date(t0.getTime() + 86_400_000),
      emailedAt: null,
      requestedById: null,
      subscriptionId: null,
      requestedAt: t0,
      attempts: 1,
      updatedAt,
    });
    const { tables, db } = world([mk('stuck', new Date(t0.getTime() - 1000)), mk('later', t0)]);
    tables.user.length = 0; // nobody to send to
    const { d, tmp } = deps(db);
    await sweepWorkspaceExports(d, async () => {});
    const [stuck, later] = tables.workspaceExportRequest;
    expect(stuck.updatedAt.getTime()).toBeGreaterThan(later.updatedAt.getTime() - 1);
    expect(stuck.emailedAt).toBeNull();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('a revived FAILED export is queued as a re-queue (a fresh job id), not as the first job', async () => {
    const { db } = world([
      {
        id: 'f1',
        tenantId: T,
        status: 'FAILED',
        attempts: MAX_EXPORT_ATTEMPTS,
        trigger: 'SUBSCRIPTION_ENDED',
        subscriptionId: 'sub_1',
        requestedAt: t0,
        updatedAt: t0,
      },
    ]);
    db.stripeSubscription = { count: async () => 0 };
    const enqueue = vi.fn(async () => {});
    await requestExportForEndedSubscription(db, { tenantId: T, subscriptionId: 'sub_1' }, enqueue);
    expect(enqueue).toHaveBeenCalledWith({ requestId: 'f1', tenantId: T }, { retry: 0 });
  });
});

describe('archives of crashed attempts do not outlive their request', () => {
  it('a new attempt removes what the earlier attempts uploaded', async () => {
    const { db } = world([
      {
        id: 'r1',
        tenantId: T,
        status: 'QUEUED',
        attempts: 2,
        trigger: 'ADMIN',
        requestedAt: t0,
        updatedAt: t0,
      },
    ]);
    const { d, removed, tmp } = deps(db);
    await processWorkspaceExport(d, { requestId: 'r1' });
    // The claim made this attempt number 3; attempts 1 and 2 left nothing behind.
    expect(removed).toEqual([`${T}/r1-1.zip`, `${T}/r1-2.zip`]);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('a request that gave up has every attempt archive removed', async () => {
    const stale = new Date(t0.getTime() - 2 * STALE_QUEUED_MS);
    const { db } = world([
      {
        id: 'dead',
        tenantId: T,
        status: 'QUEUED',
        attempts: MAX_EXPORT_ATTEMPTS,
        trigger: 'ADMIN',
        requestedAt: t0,
        updatedAt: stale,
      },
    ]);
    const { d, removed, tmp } = deps(db);
    await sweepWorkspaceExports(d, async () => {});
    expect(removed).toEqual(
      Array.from({ length: MAX_EXPORT_ATTEMPTS }, (_, i) => `${T}/dead-${i + 1}.zip`)
    );
    rmSync(tmp, { recursive: true, force: true });
  });
});
