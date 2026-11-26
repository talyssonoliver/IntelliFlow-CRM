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
import { SupabaseExportStorage } from '../supabase-export-storage';
import { csvCell } from '../serialize';
import { scrubJson } from '../deny-list';
import { createTenantReadGuard, pinReadArgsToTenant } from '../tenant-read-guard';
import { runWorkspaceExport } from '../export-workspace';
import {
  MAX_EXPORT_ATTEMPTS,
  STALE_QUEUED_MS,
  STALE_RUNNING_MS,
  RECONCILE_BATCH,
  processWorkspaceExport,
  requestExportForEndedSubscription,
  resolveExportRecipients,
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
    workspaceExportRequest: rows.map((r) => ({
      claimCount: r.attempts ?? 0,
      archivesRemovedAt: null,
      ...r,
    })),
    stripeSubscription: [],
    user: [
      { id: 'owner', tenantId: T, email: 'owner@example.invalid', role: 'ADMIN', createdAt: t0 },
    ],
  };
  const db = makeDb(tables) as any;
  db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db);
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

describe('review follow-ups: paging and recipients', () => {
  it('keeps every later row when the last row of a page is deleted mid-export', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-h-'));
    const leads = [1, 2, 3, 4, 5].map((n) => ({
      id: `l${n}`,
      tenantId: T,
      email: `l${n}@x.invalid`,
    }));
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
      lead: leads,
    });
    const real = db.lead.findMany;
    let calls = 0;
    db.lead.findMany = async (args: any) => {
      const out = await real(args);
      calls += 1;
      // After the first page of the CSV read is served, a user deletes that page's last lead.
      if (calls === 1)
        leads.splice(
          leads.findIndex((l) => l.id === 'l2'),
          1
        );
      return out;
    };
    const out = join(dir, 'a.zip');
    await runWorkspaceExport({ db, tenantId: T, outputPath: out, pageSize: 2 });
    const csvIds = (readZip(out)['data/leads.csv']!.match(/l\d@x/g) ?? []).map((m) =>
      m.slice(0, 2)
    );
    expect(csvIds).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
  });

  it('drops an asker who is no longer an administrator of the workspace', async () => {
    const mk = (user: any[], tenantMembership: any[] = []) =>
      makeDb({ user, tenantMembership, stripeSubscription: [] }) as any;
    const req = { tenantId: T, requestedById: 'asker', subscriptionId: null };
    const owner = { id: 'owner', tenantId: T, email: 'o@x.invalid', role: 'ADMIN', createdAt: t0 };
    const ids = async (db: any) =>
      (await resolveExportRecipients(db, req)).map((r) => r.userId).sort();

    const demoted = { id: 'asker', tenantId: T, email: 'a@x.invalid', role: 'USER', createdAt: t0 };
    expect(await ids(mk([owner, demoted]))).toEqual(['owner']);

    const moved = {
      id: 'asker',
      tenantId: 'other',
      email: 'a@x.invalid',
      role: 'ADMIN',
      createdAt: t0,
    };
    expect(await ids(mk([owner, moved]))).toEqual(['owner']);

    const stillAdmin = {
      id: 'asker',
      tenantId: T,
      email: 'a@x.invalid',
      role: 'ADMIN',
      createdAt: t0,
    };
    expect(await ids(mk([owner, stillAdmin]))).toEqual(['asker', 'owner']);

    const invitedAdmin = [
      { id: 'm1', userId: 'asker', tenantId: T, role: 'ADMIN', revokedAt: null },
    ];
    expect(await ids(mk([owner, moved], invitedAdmin))).toEqual(['asker', 'owner']);
    const revoked = [{ id: 'm1', userId: 'asker', tenantId: T, role: 'ADMIN', revokedAt: t0 }];
    expect(await ids(mk([owner, moved], revoked))).toEqual(['owner']);
  });
});

describe('review follow-ups: sweep races and the export bucket', () => {
  it('does not fail a request, or delete its archive, when the worker finished first', async () => {
    const stale = new Date(t0.getTime() - 2 * STALE_QUEUED_MS);
    const { tables, db } = world([
      {
        id: 'late',
        tenantId: T,
        status: 'QUEUED',
        attempts: MAX_EXPORT_ATTEMPTS,
        trigger: 'ADMIN',
        requestedAt: t0,
        updatedAt: stale,
      },
    ]);
    // The worker publishes READY between the sweep's read and its write.
    const real = db.workspaceExportRequest.findMany;
    db.workspaceExportRequest.findMany = async (args: any) => {
      const out = await real(args);
      for (const r of tables.workspaceExportRequest) r.status = 'READY';
      return out;
    };
    const { d, removed, logged, tmp } = deps(db);
    await sweepWorkspaceExports(
      d,
      vi.fn(async () => {})
    );
    expect(tables.workspaceExportRequest[0].status).toBe('READY');
    expect(removed).toEqual([]);
    expect(logged).toEqual([]);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('does not reset a row that a worker reclaimed after the sweep read it', async () => {
    const stale = new Date(t0.getTime() - 2 * STALE_RUNNING_MS);
    const { tables, db } = world([
      {
        id: 'busy',
        tenantId: T,
        status: 'RUNNING',
        attempts: 1,
        startedAt: stale,
        trigger: 'ADMIN',
        requestedAt: t0,
        updatedAt: stale,
      },
    ]);
    const real = db.workspaceExportRequest.findMany;
    db.workspaceExportRequest.findMany = async (args: any) => {
      const out = await real(args);
      // claimExport: attempt 2, fresh heartbeat.
      Object.assign(tables.workspaceExportRequest[0], { attempts: 2, startedAt: t0 });
      return out;
    };
    const { d, tmp } = deps(db);
    const enqueue = vi.fn(async () => {});
    await sweepWorkspaceExports(d, enqueue);
    expect(tables.workspaceExportRequest[0]).toMatchObject({ status: 'RUNNING', attempts: 2 });
    expect(enqueue).not.toHaveBeenCalled();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('keeps a READY row for the next sweep when an earlier attempt archive cannot be removed', async () => {
    const { tables, db } = world([
      {
        id: 'old',
        tenantId: T,
        status: 'READY',
        attempts: 2,
        storagePath: `${T}/old-2.zip`,
        expiresAt: new Date(t0.getTime() - 1000),
        emailedAt: t0,
        requestedAt: t0,
        updatedAt: t0,
      },
    ]);
    const { d, tmp } = deps(db);
    d.archiveStorage.removeArchive = async (p) => {
      if (p.endsWith('old-1.zip')) throw new Error('storage down');
    };
    const res = await sweepWorkspaceExports(
      d,
      vi.fn(async () => {})
    );
    expect(res.expired).toBe(0);
    expect(tables.workspaceExportRequest[0].status).toBe('READY');
    rmSync(tmp, { recursive: true, force: true });
  });

  it('refuses to upload into a public export bucket: it is made private first', async () => {
    const storage = new SupabaseExportStorage('https://x.example.invalid', 'k'.repeat(20));
    const calls: string[] = [];
    (storage as any).client = {
      storage: {
        getBucket: async () => ({ data: { public: true } }),
        updateBucket: async (_n: string, o: any) => {
          calls.push(`update:${o.public}`);
          return { error: null };
        },
      },
    };
    await storage.ensureBucket();
    expect(calls).toEqual(['update:false']);
  });

  it('fails when a public export bucket cannot be made private', async () => {
    const storage = new SupabaseExportStorage('https://x.example.invalid', 'k'.repeat(20));
    (storage as any).client = {
      storage: {
        getBucket: async () => ({ data: { public: true } }),
        updateBucket: async () => ({ error: { message: 'denied' } }),
      },
    };
    await expect(storage.ensureBucket()).rejects.toThrow(/not private/);
  });

  it('reads the bucket back after losing a creation race', async () => {
    const storage = new SupabaseExportStorage('https://x.example.invalid', 'k'.repeat(20));
    let reads = 0;
    const updated: boolean[] = [];
    (storage as any).client = {
      storage: {
        getBucket: async () => ({ data: ++reads === 1 ? null : { public: true } }),
        createBucket: async () => ({ error: { message: 'The resource already exists' } }),
        updateBucket: async (_n: string, o: any) => {
          updated.push(o.public);
          return { error: null };
        },
      },
    };
    await storage.ensureBucket();
    expect(updated).toEqual([false]);
  });

  it('writes identical rows to the CSV and the JSON from one read', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-h-'));
    const leads = [1, 2, 3].map((n) => ({ id: `l${n}`, tenantId: T, email: `l${n}@x.invalid` }));
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
      lead: leads,
    });
    const real = db.lead.findMany;
    let reads = 0;
    db.lead.findMany = async (args: any) => {
      reads += 1;
      return real(args);
    };
    const out = join(dir, 'a.zip');
    await runWorkspaceExport({ db, tenantId: T, outputPath: out, pageSize: 10 });
    const zip = readZip(out);
    expect(JSON.parse(zip['data/leads.json']!).map((l: any) => l.id)).toEqual(['l1', 'l2', 'l3']);
    expect(zip['data/leads.csv']).toContain('l3@x.invalid');
    expect(reads).toBe(1);
  });
});

describe('review follow-ups: claims and cleanup of failed requests', () => {
  it('a replayed request never reuses an earlier claim number or archive path', async () => {
    const { tables, db } = world([
      {
        id: 'again',
        tenantId: T,
        status: 'FAILED',
        attempts: MAX_EXPORT_ATTEMPTS,
        claimCount: 5,
        trigger: 'SUBSCRIPTION_ENDED',
        subscriptionId: 'sub_1',
        requestedAt: t0,
        updatedAt: t0,
      },
    ]);
    const { d, tmp } = deps(db);
    // The replay resets the retry budget, not the claim counter.
    await db.workspaceExportRequest.updateMany({
      where: { id: 'again' },
      data: { status: 'QUEUED', attempts: 0 },
    });
    await processWorkspaceExport(d, { requestId: 'again' });
    expect(tables.workspaceExportRequest[0]).toMatchObject({
      status: 'READY',
      attempts: 1,
      claimCount: 6,
      storagePath: `${T}/again-6.zip`,
    });
    rmSync(tmp, { recursive: true, force: true });
  });

  it('keeps retrying the archives of a FAILED request until all are removed', async () => {
    const { tables, db } = world([
      {
        id: 'bad',
        tenantId: T,
        status: 'FAILED',
        attempts: MAX_EXPORT_ATTEMPTS,
        claimCount: 2,
        trigger: 'ADMIN',
        requestedAt: t0,
        updatedAt: t0,
      },
    ]);
    const { d, tmp } = deps(db);
    let down = true;
    d.archiveStorage.removeArchive = async (p) => {
      if (down && p.endsWith('bad-1.zip')) throw new Error('storage down');
    };
    await sweepWorkspaceExports(
      d,
      vi.fn(async () => {})
    );
    expect(tables.workspaceExportRequest[0].archivesRemovedAt).toBeNull();
    down = false;
    await sweepWorkspaceExports(
      d,
      vi.fn(async () => {})
    );
    expect(tables.workspaceExportRequest[0].archivesRemovedAt).toBeInstanceOf(Date);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('neutralises a formula that follows a line feed', () => {
    expect(csvCell('\n=1+1')).toBe('"\'\n=1+1"');
  });
});

describe('review follow-ups: storage reconciliation and cleanup order', () => {
  const OLD = new Date(t0.getTime() - 16 * 24 * 60 * 60 * 1000);
  const NEW = new Date(t0.getTime() - 3 * 24 * 60 * 60 * 1000);

  function reconDeps(objects: Array<{ path: string; at: Date }>) {
    const { db } = world([]);
    const { d, tmp } = deps(db);
    const removed: string[] = [];
    let lists = 0;
    d.archiveStorage.listArchivesOlderThan = async (cutoff, limit) => {
      lists += 1;
      return objects
        .filter((o) => o.at < cutoff && !removed.includes(o.path))
        .map((o) => o.path)
        .slice(0, limit);
    };
    d.archiveStorage.removeArchive = async (p) => void removed.push(p);
    return { d, removed, tmp, lists: () => lists };
  }

  it('removes archives older than 14 days plus a day grace, whatever any row says', async () => {
    const { d, removed, tmp } = reconDeps([
      { path: `${T}/late-6.zip`, at: OLD },
      { path: `${T}/live.zip`, at: NEW },
    ]);
    await sweepWorkspaceExports(
      d,
      vi.fn(async () => {})
    );
    expect(removed).toEqual([`${T}/late-6.zip`]);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('runs once a day, and keeps going while a batch comes back full', async () => {
    const many = Array.from({ length: RECONCILE_BATCH + 5 }, (_, i) => ({
      path: `${T}/o${i}.zip`,
      at: OLD,
    }));
    const { d, removed, tmp, lists } = reconDeps(many);
    await sweepWorkspaceExports(
      d,
      vi.fn(async () => {})
    );
    expect(removed).toHaveLength(RECONCILE_BATCH); // bounded per run
    await sweepWorkspaceExports(
      d,
      vi.fn(async () => {})
    ); // continues at once
    expect(removed).toHaveLength(RECONCILE_BATCH + 5);
    const before = lists();
    await sweepWorkspaceExports(
      d,
      vi.fn(async () => {})
    ); // pass finished: waits a day
    await sweepWorkspaceExports(
      d,
      vi.fn(async () => {})
    );
    expect(lists()).toBe(before);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('a failing deletion or listing never fails the sweep', async () => {
    const { d, tmp } = reconDeps([{ path: `${T}/x.zip`, at: OLD }]);
    d.archiveStorage.removeArchive = async () => {
      throw new Error('down');
    };
    await expect(
      sweepWorkspaceExports(
        d,
        vi.fn(async () => {})
      )
    ).resolves.toBeDefined();
    d.archiveStorage.listArchivesOlderThan = async () => {
      throw new Error('list down');
    };
    await expect(
      sweepWorkspaceExports(
        d,
        vi.fn(async () => {})
      )
    ).resolves.toBeDefined();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('lists old objects across tenants from the bucket, bounded by the limit', async () => {
    const storage = new SupabaseExportStorage('https://x.example.invalid', 'k'.repeat(20));
    const tree: Record<string, any[]> = {
      '': [{ name: 'ta' }, { name: 'tb' }],
      ta: [
        { id: '1', name: 'a-1.zip', updated_at: OLD.toISOString() },
        { id: '2', name: 'a-2.zip', updated_at: NEW.toISOString() },
      ],
      tb: [{ id: '3', name: 'b-1.zip', created_at: OLD.toISOString() }],
    };
    (storage as any).client = {
      storage: {
        from: () => ({ list: async (p: string) => ({ data: tree[p] ?? [], error: null }) }),
      },
    };
    const cutoff = new Date(t0.getTime() - 15 * 24 * 60 * 60 * 1000);
    expect(await storage.listArchivesOlderThan(cutoff, 10)).toEqual(['ta/a-1.zip', 'tb/b-1.zip']);
    expect(await storage.listArchivesOlderThan(cutoff, 1)).toEqual(['ta/a-1.zip']);
  });

  it('stamps every cleanup attempt so failing rows rotate to the back', async () => {
    const { tables, db } = world([
      {
        id: 'bad',
        tenantId: T,
        status: 'FAILED',
        attempts: 5,
        claimCount: 1,
        trigger: 'ADMIN',
        requestedAt: t0,
        updatedAt: t0,
      },
    ]);
    const { d, tmp } = deps(db);
    d.archiveStorage.removeArchive = async () => {
      throw new Error('down');
    };
    await sweepWorkspaceExports(
      d,
      vi.fn(async () => {})
    );
    expect(tables.workspaceExportRequest[0].lastCleanupAttemptAt).toEqual(t0);
    expect(tables.workspaceExportRequest[0].archivesRemovedAt).toBeNull();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('keeps a customer key named __proto__ when scrubbing JSON', () => {
    const out = scrubJson(JSON.parse('{"__proto__":{"label":"x"},"ok":1,"apiKey":"s"}')) as any;
    expect(JSON.stringify(out)).toBe('{"__proto__":{"label":"x"},"ok":1,"apiKey":"[redacted]"}');
  });
});

describe('review follow-ups: finalize, spreadsheet precision, expiry order', () => {
  it('protects numeric text that Excel would change, and nothing else', () => {
    expect(csvCell('00123')).toBe("'00123");
    expect(csvCell('1234567890123456789')).toBe("'1234567890123456789");
    expect(csvCell('1234567890.123456789')).toBe("'1234567890.123456789");
    expect(csvCell('12.50')).toBe('12.50');
    expect(csvCell('0')).toBe('0');
    expect(csvCell('0.5')).toBe('0.5');
    expect(csvCell(123456789012345678n)).toBe('123456789012345678'); // not text: left as is
  });

  it('finalize rejects (does not hang) when the output fails', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-h-'));
    const writer = new ArchiveWriter(join(dir, 'missing-folder', 'a.zip'));
    await expect(
      Promise.race([
        writer.finalize(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('hung')), 3000)),
      ])
    ).rejects.toThrow(/ENOENT|no such file/i);
  });

  it('stamps every expiry attempt so failing deletions rotate to the back', async () => {
    const { tables, db } = world([
      {
        id: 'old',
        tenantId: T,
        status: 'READY',
        attempts: 1,
        claimCount: 1,
        storagePath: `${T}/old-1.zip`,
        expiresAt: new Date(t0.getTime() - 1000),
        emailedAt: t0,
        requestedAt: t0,
        updatedAt: t0,
      },
    ]);
    const { d, tmp } = deps(db);
    d.archiveStorage.removeArchive = async () => {
      throw new Error('down');
    };
    await sweepWorkspaceExports(
      d,
      vi.fn(async () => {})
    );
    expect(tables.workspaceExportRequest[0]).toMatchObject({
      status: 'READY',
      lastCleanupAttemptAt: t0,
    });
    rmSync(tmp, { recursive: true, force: true });
  });
});
