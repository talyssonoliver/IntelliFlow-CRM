import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ADMIN_EXPORT_COOLDOWN_MS,
  EXPORT_TTL_MS,
  ExportLinkError,
  MAX_EXPORT_ATTEMPTS,
  issueDownloadLink,
  processWorkspaceExport,
  requestExportForEndedSubscription,
  requestWorkspaceExport,
  sweepWorkspaceExports,
  type ExportJobDeps,
  type ExportMail,
} from '../workspace-export-service';
import { EXPORT_LINK_TTL_SECONDS, type ExportArchiveStorage } from '../supabase-export-storage';
import { createTenantReadGuard, pinReadArgsToTenant } from '../tenant-read-guard';
import { makeDb } from './helpers';

const T = 'tenant_a_aaaaaaaaaaaaaaaaaaaa';
const day = 24 * 60 * 60 * 1000;
const t0 = new Date('2026-11-23T12:00:00.000Z');

function world(extra: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {
    tenant: [
      {
        id: T,
        name: 'Alpha Ltd',
        slug: 'alpha',
        status: 'ACTIVE',
        plan: 'STARTER',
        createdAt: t0,
        updatedAt: t0,
      },
    ],
    workspaceExportRequest: [],
    stripeSubscription: [],
    user: [
      {
        id: 'owner',
        tenantId: T,
        email: 'owner@example.invalid',
        role: 'ADMIN',
        createdAt: new Date('2026-01-01'),
        stripeCustomerId: 'cus_1',
      },
      {
        id: 'asker',
        tenantId: T,
        email: 'asker@example.invalid',
        role: 'ADMIN',
        createdAt: new Date('2026-02-01'),
      },
    ],
    ...extra,
  };
  const db = makeDb(tables) as any;
  db.$extends = () => db;
  db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db);
  db.$executeRaw = async () => 0;
  return { tables, db };
}

function storage() {
  const calls = {
    uploaded: [] as string[],
    signed: [] as Array<{ path: string; seconds: number }>,
    removed: [] as string[],
  };
  const s: ExportArchiveStorage = {
    ensureBucket: async () => {},
    uploadArchive: async (path) => void calls.uploaded.push(path),
    signedDownloadUrl: async (path, seconds) => {
      calls.signed.push({ path, seconds });
      return `https://storage.example.invalid/sign/${path}?token=T`;
    },
    removeArchive: async (path) => void calls.removed.push(path),
  };
  return { s, calls };
}

const fakeRun = vi.fn(async (o: any) => ({
  archivePath: o.outputPath,
  archiveBytes: 2048,
  archiveSha256: 'a'.repeat(64),
  rowCounts: { leads: 3, deals: 1 },
  storedFileCount: 2,
  manifest: { workspace: { id: T, name: 'Alpha Ltd', slug: 'alpha' }, skippedFiles: [] },
}));

function deps(db: any, over: Partial<ExportJobDeps> = {}) {
  const { s, calls } = storage();
  const mails: ExportMail[] = [];
  const tmp = mkdtempSync(join(tmpdir(), 'wsx-svc-'));
  const d: ExportJobDeps = {
    prisma: db,
    archiveStorage: s,
    fileStorage: null,
    sendEmail: async (m) => void mails.push(m),
    runExport: fakeRun as never,
    tmpDir: tmp,
    now: () => t0,
    ...over,
  };
  return { d, calls, mails, tmp };
}

describe('requestWorkspaceExport (admin trigger)', () => {
  it('creates an audit row and queues the job', async () => {
    const { db, tables } = world();
    const enqueue = vi.fn(async () => {});
    const out = await requestWorkspaceExport(
      db,
      { tenantId: T, requestedById: 'asker' },
      enqueue,
      () => t0
    );
    expect(out.kind).toBe('created');
    expect(tables.workspaceExportRequest[0]).toMatchObject({
      tenantId: T,
      requestedById: 'asker',
      trigger: 'ADMIN',
      status: 'QUEUED',
    });
    expect(enqueue).toHaveBeenCalledWith({
      requestId: tables.workspaceExportRequest[0].id,
      tenantId: T,
    });
  });

  it('refuses a second request while one is queued or running', async () => {
    const { db, tables } = world();
    const enqueue = vi.fn(async () => {});
    await requestWorkspaceExport(db, { tenantId: T, requestedById: 'asker' }, enqueue, () => t0);
    const again = await requestWorkspaceExport(
      db,
      { tenantId: T, requestedById: 'asker' },
      enqueue,
      () => t0
    );
    expect(again.kind).toBe('already_running');
    expect(tables.workspaceExportRequest).toHaveLength(1);
  });

  it('rate-limits to one admin export a day, and a failed one does not count', async () => {
    const { db, tables } = world();
    const enqueue = vi.fn(async () => {});
    await requestWorkspaceExport(db, { tenantId: T, requestedById: 'asker' }, enqueue, () => t0);
    tables.workspaceExportRequest[0].status = 'READY';
    const soon = await requestWorkspaceExport(
      db,
      { tenantId: T, requestedById: 'asker' },
      enqueue,
      () => new Date(t0.getTime() + 60_000)
    );
    expect(soon).toEqual({
      kind: 'rate_limited',
      retryAfter: new Date(t0.getTime() + ADMIN_EXPORT_COOLDOWN_MS),
    });
    tables.workspaceExportRequest[0].status = 'FAILED';
    const retry = await requestWorkspaceExport(
      db,
      { tenantId: T, requestedById: 'asker' },
      enqueue,
      () => new Date(t0.getTime() + 60_000)
    );
    expect(retry.kind).toBe('created');
    tables.workspaceExportRequest[1].status = 'READY';
    const next = await requestWorkspaceExport(
      db,
      { tenantId: T, requestedById: 'asker' },
      enqueue,
      () => new Date(t0.getTime() + ADMIN_EXPORT_COOLDOWN_MS + 120_000)
    );
    expect(next.kind).toBe('created');
  });

  it('keeps the row when Redis is down (the sweep re-queues it)', async () => {
    const { db, tables } = world();
    const out = await requestWorkspaceExport(
      db,
      { tenantId: T, requestedById: 'asker' },
      async () => {
        throw new Error('redis down');
      },
      () => t0
    );
    expect(out.kind).toBe('created');
    expect(tables.workspaceExportRequest).toHaveLength(1);
  });
});

describe('requestExportForEndedSubscription (trigger on cancel)', () => {
  it('queues an export at once for the ended subscription', async () => {
    const { db, tables } = world();
    const enqueue = vi.fn(async () => {});
    const out = await requestExportForEndedSubscription(
      db,
      { tenantId: T, subscriptionId: 'sub_1' },
      enqueue,
      () => t0
    );
    expect(out.kind).toBe('created');
    expect(tables.workspaceExportRequest[0]).toMatchObject({
      tenantId: T,
      trigger: 'SUBSCRIPTION_ENDED',
      subscriptionId: 'sub_1',
      status: 'QUEUED',
    });
    expect(tables.workspaceExportRequest[0].requestedById ?? null).toBeNull();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('is idempotent per subscription (webhook redelivery)', async () => {
    const { db, tables } = world();
    const enqueue = vi.fn(async () => {});
    await requestExportForEndedSubscription(
      db,
      { tenantId: T, subscriptionId: 'sub_1' },
      enqueue,
      () => t0
    );
    const again = await requestExportForEndedSubscription(
      db,
      { tenantId: T, subscriptionId: 'sub_1' },
      enqueue,
      () => t0
    );
    expect(again).toEqual({ kind: 'skipped', reason: 'already_requested' });
    expect(tables.workspaceExportRequest).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('survives a unique-constraint race', async () => {
    const { db, tables } = world();
    const real = db.workspaceExportRequest;
    db.workspaceExportRequest = {
      ...real,
      findFirst: async () => null,
      create: async () => {
        throw Object.assign(new Error('dup'), { code: 'P2002' });
      },
    };
    const out = await requestExportForEndedSubscription(
      db,
      { tenantId: T, subscriptionId: 'sub_1' },
      vi.fn(),
      () => t0
    );
    expect(out).toEqual({ kind: 'skipped', reason: 'already_requested' });
    expect(tables.workspaceExportRequest).toHaveLength(0);
  });

  it('does not export a workspace that still has a live subscription', async () => {
    const { db, tables } = world({
      stripeSubscription: [
        { id: '1', tenantId: T, stripeSubscriptionId: 'sub_engine', status: 'CANCELED' },
        { id: '2', tenantId: T, stripeSubscriptionId: 'sub_crm', status: 'ACTIVE' },
      ],
    });
    const out = await requestExportForEndedSubscription(
      db,
      { tenantId: T, subscriptionId: 'sub_engine' },
      vi.fn(),
      () => t0
    );
    expect(out).toEqual({ kind: 'skipped', reason: 'other_active_subscription' });
    expect(tables.workspaceExportRequest).toHaveLength(0);
  });

  it('skips a subscription whose tenant is unknown', async () => {
    const { db } = world();
    const out = await requestExportForEndedSubscription(
      db,
      { tenantId: 'ghost', subscriptionId: 's' },
      vi.fn(),
      () => t0
    );
    expect(out).toEqual({ kind: 'skipped', reason: 'unknown_workspace' });
  });
});

describe('processWorkspaceExport', () => {
  it('builds, stores, records counts and a 14-day expiry, and emails the owner and the asker', async () => {
    const { db, tables } = world();
    await requestWorkspaceExport(
      db,
      { tenantId: T, requestedById: 'asker' },
      async () => {},
      () => t0
    );
    const { d, calls, mails, tmp } = deps(db);
    const out = await processWorkspaceExport(d, { requestId: tables.workspaceExportRequest[0].id });
    expect(out).toMatchObject({ status: 'ready', emailed: true });

    const row = tables.workspaceExportRequest[0];
    expect(row).toMatchObject({
      status: 'READY',
      archiveSha256: 'a'.repeat(64),
      storagePath: `${T}/${row.id}-1.zip`,
      fileCount: 2,
      error: null,
    });
    expect(row.rowCounts).toEqual({
      entities: { leads: 3, deals: 1 },
      totalRows: 4,
      storedFiles: 2,
      skippedFiles: 0,
    });
    expect(Number(row.archiveBytes)).toBe(2048);
    expect(row.expiresAt.getTime()).toBe(t0.getTime() + 14 * day);
    expect(row.emailedAt).toEqual(t0);
    expect(row.attempts).toBe(1);

    expect(calls.uploaded).toEqual([`${T}/${row.id}-1.zip`]);
    // The link is signed for exactly 14 days.
    expect(calls.signed[0]!.seconds).toBe(14 * 24 * 60 * 60);
    expect(EXPORT_LINK_TTL_SECONDS).toBe(1_209_600);
    expect(mails.map((m) => m.recipientUserId).sort()).toEqual(['asker', 'owner']);
    expect(mails[0]!.body).toContain('https://storage.example.invalid/sign/');
    expect(mails[0]!.body).toContain('2026-12-07');
    expect(mails.every((m) => m.tenantId === T)).toBe(true);
    // The local temp archive is gone.
    expect(existsSync(tmp) ? readdirSync(tmp) : []).toEqual([]);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('reads only through the tenant guard, pinned to the request tenant', async () => {
    const { db, tables } = world();
    await requestWorkspaceExport(
      db,
      { tenantId: T, requestedById: 'asker' },
      async () => {},
      () => t0
    );
    const run = vi.fn(fakeRun);
    const extended = vi.fn(() => ({ guarded: true }));
    db.$extends = extended;
    const { d, tmp } = deps(db, { runExport: run as never });
    await processWorkspaceExport(d, { requestId: tables.workspaceExportRequest[0].id });
    expect(extended).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0]).toMatchObject({ tenantId: T, db: { guarded: true } });
    rmSync(tmp, { recursive: true, force: true });
  });

  it('a SUBSCRIPTION_ENDED export emails the payer of that subscription', async () => {
    const { db, tables } = world({
      stripeSubscription: [
        {
          id: '1',
          tenantId: T,
          stripeSubscriptionId: 'sub_1',
          stripeCustomerId: 'cus_payer',
          status: 'CANCELED',
        },
      ],
    });
    tables.user.push({
      id: 'payer',
      tenantId: T,
      email: 'payer@example.invalid',
      role: 'USER',
      createdAt: new Date('2026-03-01'),
      stripeCustomerId: 'cus_payer',
    });
    await requestExportForEndedSubscription(
      db,
      { tenantId: T, subscriptionId: 'sub_1' },
      async () => {},
      () => t0
    );
    const { d, mails, tmp } = deps(db);
    await processWorkspaceExport(d, { requestId: tables.workspaceExportRequest[0].id });
    expect(mails.map((m) => m.recipientUserId).sort()).toEqual(['owner', 'payer']);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('keeps the export when the email fails and leaves emailedAt for the sweep', async () => {
    const { db, tables } = world();
    await requestWorkspaceExport(
      db,
      { tenantId: T, requestedById: 'asker' },
      async () => {},
      () => t0
    );
    const { d, tmp } = deps(db, {
      sendEmail: async () => {
        throw new Error('smtp down');
      },
    });
    const out = await processWorkspaceExport(d, { requestId: tables.workspaceExportRequest[0].id });
    expect(out).toMatchObject({ status: 'ready', emailed: false });
    expect(tables.workspaceExportRequest[0]).toMatchObject({ status: 'READY', emailedAt: null });
    rmSync(tmp, { recursive: true, force: true });
  });

  it('marks the row QUEUED on a failure, FAILED after the last attempt, and rethrows', async () => {
    const { db, tables } = world();
    await requestWorkspaceExport(
      db,
      { tenantId: T, requestedById: 'asker' },
      async () => {},
      () => t0
    );
    const { d, tmp } = deps(db, {
      runExport: (async () => {
        throw new Error('disk full');
      }) as never,
    });
    await expect(
      processWorkspaceExport(d, { requestId: tables.workspaceExportRequest[0].id })
    ).rejects.toThrow('disk full');
    expect(tables.workspaceExportRequest[0]).toMatchObject({
      status: 'QUEUED',
      error: 'disk full',
      attempts: 1,
    });
    tables.workspaceExportRequest[0].attempts = MAX_EXPORT_ATTEMPTS - 1;
    await expect(
      processWorkspaceExport(d, { requestId: tables.workspaceExportRequest[0].id })
    ).rejects.toThrow();
    expect(tables.workspaceExportRequest[0].status).toBe('FAILED');
    // A FAILED row is not claimed again.
    expect(
      await processWorkspaceExport(d, { requestId: tables.workspaceExportRequest[0].id })
    ).toMatchObject({ status: 'skipped' });
    rmSync(tmp, { recursive: true, force: true });
  });

  it('does not run a request that is not queued, or is already running', async () => {
    const { db, tables } = world();
    await requestWorkspaceExport(
      db,
      { tenantId: T, requestedById: 'asker' },
      async () => {},
      () => t0
    );
    const run = vi.fn(fakeRun);
    const { d, tmp } = deps(db, { runExport: run as never });
    tables.workspaceExportRequest[0].status = 'RUNNING';
    tables.workspaceExportRequest[0].startedAt = t0;
    expect(
      await processWorkspaceExport(d, { requestId: tables.workspaceExportRequest[0].id })
    ).toMatchObject({ status: 'skipped' });
    expect(run).not.toHaveBeenCalled();
    // The row is untouched: no attempt counted, still RUNNING for the worker that owns it.
    expect(tables.workspaceExportRequest[0]).toMatchObject({ status: 'RUNNING', attempts: 0 });
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe('download link expiry', () => {
  const ready = (over: Record<string, any> = {}) => ({
    id: 'r1',
    tenantId: T,
    status: 'READY',
    storagePath: `${T}/r1.zip`,
    expiresAt: new Date(t0.getTime() + 14 * day),
    ...over,
  });

  it('issues a link that lasts no longer than the export itself', async () => {
    const { db } = world({ workspaceExportRequest: [ready()] });
    const { s, calls } = storage();
    const later = new Date(t0.getTime() + 10 * day);
    const link = await issueDownloadLink(db, s, { tenantId: T, requestId: 'r1' }, () => later);
    expect(calls.signed[0]!.seconds).toBe(4 * 24 * 60 * 60);
    expect(link.expiresAt.getTime()).toBe(t0.getTime() + 14 * day);
  });

  it('refuses an expired export and one that is not ready', async () => {
    const { s } = storage();
    const after = new Date(t0.getTime() + 15 * day);
    await expect(
      issueDownloadLink(
        world({ workspaceExportRequest: [ready()] }).db,
        s,
        { tenantId: T, requestId: 'r1' },
        () => after
      )
    ).rejects.toMatchObject({ reason: 'expired' });
    await expect(
      issueDownloadLink(
        world({ workspaceExportRequest: [ready({ status: 'EXPIRED' })] }).db,
        s,
        { tenantId: T, requestId: 'r1' },
        () => t0
      )
    ).rejects.toBeInstanceOf(ExportLinkError);
    await expect(
      issueDownloadLink(
        world({
          workspaceExportRequest: [
            ready({ status: 'RUNNING', expiresAt: null, storagePath: null }),
          ],
        }).db,
        s,
        { tenantId: T, requestId: 'r1' },
        () => t0
      )
    ).rejects.toMatchObject({ reason: 'not_ready' });
  });

  it("never hands out another tenant's export", async () => {
    const { db } = world({ workspaceExportRequest: [ready({ tenantId: 'other_tenant' })] });
    await expect(
      issueDownloadLink(db, storage().s, { tenantId: T, requestId: 'r1' }, () => t0)
    ).rejects.toMatchObject({ reason: 'not_found' });
  });
});

describe('sweep', () => {
  it('expires old exports: removes the archive and marks the row', async () => {
    const { db, tables } = world({
      workspaceExportRequest: [
        {
          id: 'old',
          tenantId: T,
          status: 'READY',
          storagePath: `${T}/old.zip`,
          expiresAt: new Date(t0.getTime() - 1000),
          emailedAt: t0,
          requestedAt: t0,
          attempts: 1,
          updatedAt: t0,
        },
        {
          id: 'fresh',
          tenantId: T,
          status: 'READY',
          storagePath: `${T}/fresh.zip`,
          expiresAt: new Date(t0.getTime() + day),
          emailedAt: t0,
          requestedAt: t0,
          attempts: 1,
          updatedAt: t0,
        },
      ],
    });
    const { d, calls } = deps(db);
    const res = await sweepWorkspaceExports(d, async () => {});
    expect(res.expired).toBe(1);
    expect(calls.removed).toEqual([`${T}/old.zip`]);
    expect(tables.workspaceExportRequest.map((r) => r.status)).toEqual(['EXPIRED', 'READY']);
  });

  it('re-queues a lost job and a dead worker, but not a recent one', async () => {
    const { db } = world({
      workspaceExportRequest: [
        {
          id: 'lost',
          tenantId: T,
          status: 'QUEUED',
          attempts: 0,
          requestedAt: t0,
          updatedAt: new Date(t0.getTime() - 30 * 60_000),
        },
        {
          id: 'dead',
          tenantId: T,
          status: 'RUNNING',
          attempts: 1,
          startedAt: new Date(t0.getTime() - 2 * 60 * 60_000),
          requestedAt: t0,
          updatedAt: t0,
        },
        {
          id: 'recent',
          tenantId: T,
          status: 'QUEUED',
          attempts: 0,
          requestedAt: t0,
          updatedAt: new Date(t0.getTime() - 60_000),
        },
      ],
    });
    const enqueue = vi.fn(async () => {});
    const res = await sweepWorkspaceExports(deps(db).d, enqueue);
    expect(res.requeued).toBe(2);
    expect(enqueue.mock.calls.map((c: any) => c[0].requestId).sort()).toEqual(['dead', 'lost']);
  });

  it('retries an email that did not go out', async () => {
    const { db, tables } = world({
      workspaceExportRequest: [
        {
          id: 'r',
          tenantId: T,
          status: 'READY',
          storagePath: `${T}/r.zip`,
          archiveSha256: 'b'.repeat(64),
          archiveBytes: 10n,
          expiresAt: new Date(t0.getTime() + 5 * day),
          emailedAt: null,
          requestedById: 'asker',
          subscriptionId: null,
          requestedAt: t0,
          attempts: 1,
          updatedAt: t0,
        },
      ],
    });
    const { d, mails, calls } = deps(db);
    const res = await sweepWorkspaceExports(d, async () => {});
    expect(res.emailsRetried).toBe(1);
    expect(mails.length).toBe(2);
    expect(calls.signed[0]!.seconds).toBe(5 * 24 * 60 * 60);
    expect(tables.workspaceExportRequest[0].emailedAt).toEqual(t0);
  });
});

describe('tenant read guard', () => {
  it('pins every read of a tenant model, the Tenant row and leaves users to their own predicate', () => {
    expect(pinReadArgsToTenant('Lead', { where: { status: 'NEW' } }, T)).toEqual({
      where: { AND: [{ status: 'NEW' }, { tenantId: T }] },
    });
    expect(pinReadArgsToTenant('Lead', undefined, T)).toEqual({ where: { tenantId: T } });
    expect(pinReadArgsToTenant('Lead', { where: { tenantId: 'other' } }, T)).toEqual({
      where: { AND: [{ tenantId: 'other' }, { tenantId: T }] },
    });
    expect(pinReadArgsToTenant('Tenant', { where: { id: 'other' } }, T)).toEqual({
      where: { AND: [{ id: 'other' }, { id: T }] },
    });
    const userArgs = { where: { OR: [] } };
    expect(pinReadArgsToTenant('User', userArgs, T)).toBe(userArgs);
  });

  it('refuses writes', async () => {
    let hook: any;
    const guarded = createTenantReadGuard(
      {
        $extends: (e: any) => {
          hook = e.query.$allModels.$allOperations;
          return {};
        },
      },
      T
    );
    expect(guarded).toEqual({});
    const query = vi.fn(async () => 'ok');
    for (const operation of [
      'create',
      'update',
      'delete',
      'deleteMany',
      'upsert',
      'updateMany',
      'createMany',
    ]) {
      await expect(hook({ model: 'Lead', operation, args: {}, query })).rejects.toThrow(
        /read-only/
      );
    }
    expect(query).not.toHaveBeenCalled();
    await expect(hook({ model: 'Lead', operation: 'findMany', args: {}, query })).resolves.toBe(
      'ok'
    );
    expect(query).toHaveBeenCalledWith({ where: { tenantId: T } });
  });

  it('exports expiry as exactly 14 days', () => {
    expect(EXPORT_TTL_MS).toBe(14 * day);
  });
});
