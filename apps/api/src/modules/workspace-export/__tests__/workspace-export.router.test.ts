/**
 * Whole-workspace export router: administrators only, the context tenant only, one at a time,
 * one a day, a link that never outlives the export, and an audit trail without links.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { workspaceExportRouter } from '../workspace-export.router';
import {
  prismaMock,
  createAdminContext,
  createManagerContext,
  createTestContext,
  TEST_UUIDS,
} from '../../../test/setup';

const auditLog = vi.fn();
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction: auditLog }),
}));

const enqueue = vi.fn();
vi.mock('../workspace-export.queue', () => ({
  enqueueWorkspaceExport: (...args: unknown[]) => enqueue(...args),
}));

const signedDownloadUrl = vi.fn();
vi.mock('@intelliflow/adapters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@intelliflow/adapters')>()),
  SupabaseExportStorage: class {
    signedDownloadUrl = signedDownloadUrl;
  },
}));

const TENANT = TEST_UUIDS.tenant;
const ADMIN = TEST_UUIDS.admin1;
const NOW = new Date('2026-11-23T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const admin = () => workspaceExportRouter.createCaller(createAdminContext());

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  auditLog.mockResolvedValue('audit-1');
  enqueue.mockResolvedValue(undefined);
  process.env.SUPABASE_URL = 'https://project.example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-placeholder';
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) =>
    fn(prismaMock)) as never);
  prismaMock.$executeRaw.mockResolvedValue(0 as never);
  prismaMock.workspaceExportRequest.findFirst.mockResolvedValue(null as never);
  prismaMock.workspaceExportRequest.create.mockResolvedValue({ id: 'req_1' } as never);
});

describe('permissions (administrators only)', () => {
  it.each([
    ['MANAGER', () => workspaceExportRouter.createCaller(createManagerContext())],
    ['USER', () => workspaceExportRouter.createCaller(createTestContext())],
  ])('refuses a %s on every procedure, before any export work', async (_role, caller) => {
    const c = caller();
    await expect(c.request()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(c.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(c.downloadLink({ requestId: 'r1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prismaMock.workspaceExportRequest.create).not.toHaveBeenCalled();
    expect(prismaMock.workspaceExportRequest.findMany).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('refuses a caller with no session', async () => {
    const c = workspaceExportRouter.createCaller(createTestContext({ user: null }));
    await expect(c.request()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('request', () => {
  it('records who asked, queues the job and audits it without any link', async () => {
    const out = await admin().request();
    expect(out).toEqual({ requestId: 'req_1' });
    expect(prismaMock.workspaceExportRequest.create.mock.calls[0]![0].data).toMatchObject({
      tenantId: TENANT,
      requestedById: ADMIN,
      trigger: 'ADMIN',
    });
    expect(enqueue).toHaveBeenCalledWith({ requestId: 'req_1', tenantId: TENANT });
    expect(auditLog).toHaveBeenCalledWith('EXPORT', 'system', 'req_1', TENANT, {
      actorId: ADMIN,
      metadata: { kind: 'workspace_export', trigger: 'ADMIN' },
    });
  });

  it('still answers when the queue is down (the row is durable; the sweep re-queues)', async () => {
    enqueue.mockRejectedValue(new Error('redis down'));
    await expect(admin().request()).resolves.toEqual({ requestId: 'req_1' });
  });

  it('refuses a second export while one is queued or running', async () => {
    prismaMock.workspaceExportRequest.findFirst.mockResolvedValueOnce({ id: 'busy' } as never);
    await expect(admin().request()).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.workspaceExportRequest.create).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rate-limits to one admin export a day', async () => {
    prismaMock.workspaceExportRequest.findFirst
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ requestedAt: new Date(NOW.getTime() - 3_600_000) } as never);
    await expect(admin().request()).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: expect.stringContaining('once a day'),
    });
    expect(prismaMock.workspaceExportRequest.create).not.toHaveBeenCalled();
    // The cooldown looks at this tenant's admin requests only, ignoring failed ones.
    const where = prismaMock.workspaceExportRequest.findFirst.mock.calls[1]![0]!.where;
    expect(where).toMatchObject({ tenantId: TENANT, trigger: 'ADMIN', status: { not: 'FAILED' } });
  });
});

describe('list', () => {
  it('lists this workspace only and never exposes a storage path or a link', async () => {
    prismaMock.workspaceExportRequest.findMany.mockResolvedValue([
      {
        id: 'r1',
        tenantId: TENANT,
        trigger: 'SUBSCRIPTION_ENDED',
        status: 'READY',
        requestedAt: NOW,
        completedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 14 * DAY),
        emailedAt: NOW,
        fileCount: 2,
        archiveBytes: 2048n,
        archiveSha256: 'a'.repeat(64),
        rowCounts: { totalRows: 5 },
        storageBucket: 'workspace-exports',
        storagePath: `${TENANT}/r1.zip`,
        error: 'internal detail',
      },
    ] as never);
    const rows = await admin().list();
    expect(prismaMock.workspaceExportRequest.findMany.mock.calls[0]![0]).toMatchObject({
      where: { tenantId: TENANT },
      take: 10,
    });
    expect(rows[0]).toMatchObject({
      id: 'r1',
      archiveBytes: 2048,
      status: 'READY',
      totalRows: 5,
      skippedFiles: 0,
    });
    const text = JSON.stringify(rows);
    expect(text).not.toContain('storagePath');
    expect(text).not.toContain('.zip');
    expect(text).not.toContain('internal detail');
  });
});

describe('downloadLink', () => {
  const ready = (over: Record<string, unknown> = {}) =>
    ({
      id: 'r1',
      tenantId: TENANT,
      status: 'READY',
      storagePath: `${TENANT}/r1.zip`,
      expiresAt: new Date(NOW.getTime() + 4 * DAY),
      ...over,
    }) as never;

  it('issues a link that lasts until the export expires, and audits the issue without it', async () => {
    prismaMock.workspaceExportRequest.findFirst.mockResolvedValue(ready());
    signedDownloadUrl.mockResolvedValue('https://storage.example.invalid/sign?token=SECRET');
    const out = await admin().downloadLink({ requestId: 'r1' });
    expect(out.url).toContain('storage.example.invalid');
    expect(signedDownloadUrl).toHaveBeenCalledWith(
      `${TENANT}/r1.zip`,
      4 * 24 * 3600,
      expect.any(String)
    );
    expect(prismaMock.workspaceExportRequest.findFirst.mock.calls[0]![0]).toMatchObject({
      where: { id: 'r1', tenantId: TENANT },
    });
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('SECRET');
  });

  it('refuses a link after the 14 days', async () => {
    prismaMock.workspaceExportRequest.findFirst.mockResolvedValue(
      ready({ expiresAt: new Date(NOW.getTime() - 1000) })
    );
    await expect(admin().downloadLink({ requestId: 'r1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('expired'),
    });
    expect(signedDownloadUrl).not.toHaveBeenCalled();
  });

  it("treats another workspace's export as not found", async () => {
    prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) =>
      fn(prismaMock)) as never);
    prismaMock.$executeRaw.mockResolvedValue(0 as never);
    prismaMock.workspaceExportRequest.findFirst.mockResolvedValue(null as never);
    await expect(admin().downloadLink({ requestId: 'foreign' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('refuses an export that is not ready', async () => {
    prismaMock.workspaceExportRequest.findFirst.mockResolvedValue(
      ready({ status: 'RUNNING', storagePath: null, expiresAt: null })
    );
    await expect(admin().downloadLink({ requestId: 'r1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('says so when storage is not configured', async () => {
    delete process.env.SUPABASE_URL;
    vi.resetModules();
    const { workspaceExportRouter: fresh } = await import('../workspace-export.router.js');
    prismaMock.workspaceExportRequest.findFirst.mockResolvedValue(ready());
    await expect(
      fresh.createCaller(createAdminContext()).downloadLink({ requestId: 'r1' })
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});
