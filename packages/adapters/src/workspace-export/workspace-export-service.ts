/**
 * Lifecycle of a workspace export request (agreement clause 5): create, run, deliver, expire.
 *
 *   requestWorkspaceExport / requestExportForEndedSubscription   create the audit row (QUEUED)
 *   processWorkspaceExport                                         the BullMQ job: build the ZIP,
 *                                                                  store it privately, sign a
 *                                                                  14-day link, email it
 *   sweepWorkspaceExports                                          re-queue stuck rows, retry
 *                                                                  unsent emails, expire old links
 *   issueDownloadLink                                              a fresh link for a READY row,
 *                                                                  never beyond its expiry
 *
 * The row is the source of truth: queueing is best-effort on top of it, and the sweep repairs a
 * lost job, so a customer's data is never at the mercy of one Redis write.
 */
import type { PrismaClient } from '@intelliflow/db';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runWorkspaceExport,
  type ExportFileStorage,
  type RunWorkspaceExportOptions,
  type WorkspaceExportResult,
} from './export-workspace';
import { EXPORT_LINK_TTL_SECONDS, type ExportArchiveStorage } from './supabase-export-storage';
import { createTenantReadGuard } from './tenant-read-guard';

export const WORKSPACE_EXPORT_QUEUE = 'intelliflow-workspace-export';
export const WORKSPACE_EXPORT_JOB = 'workspace:export';
export const WORKSPACE_EXPORT_SWEEP_JOB = 'workspace:export-sweep';
export const EXPORT_TTL_MS = EXPORT_LINK_TTL_SECONDS * 1000;
export const MAX_EXPORT_ATTEMPTS = 5;
/** One admin-triggered export per workspace per day. */
export const ADMIN_EXPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** A RUNNING row older than this belongs to a worker that died. */
export const STALE_RUNNING_MS = 60 * 60 * 1000;
/** A QUEUED row untouched this long lost its job. */
export const STALE_QUEUED_MS = 10 * 60 * 1000;

export type ExportEnqueue = (
  input: { requestId: string; tenantId: string },
  opts?: { retry?: number }
) => Promise<void>;

export type ExportRequestOutcome =
  | { kind: 'created'; requestId: string }
  | { kind: 'already_running'; requestId: string }
  | { kind: 'rate_limited'; retryAfter: Date }
  | {
      kind: 'skipped';
      reason: 'other_active_subscription' | 'unknown_workspace' | 'already_requested';
    };

const LIVE_SUBSCRIPTION_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE', 'UNPAID', 'PAUSED'] as const;

/**
 * An admin asks for the export. `prisma` is the request's tenant-scoped client.
 * Refuses a second request while one is queued or running, and more than one per day.
 */
export async function requestWorkspaceExport(
  prisma: PrismaClient,
  input: { tenantId: string; requestedById: string },
  enqueue: ExportEnqueue,
  now: () => Date = () => new Date()
): Promise<ExportRequestOutcome> {
  // The check and the insert run under one advisory lock per workspace, so a double click or
  // two administrators cannot both pass the checks and start two exports.
  const lockKey = `workspace-export:${input.tenantId}`;
  const decision = await prisma.$transaction(async (tx): Promise<ExportRequestOutcome> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const running = await tx.workspaceExportRequest.findFirst({
      where: { tenantId: input.tenantId, status: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true },
    });
    if (running) return { kind: 'already_running', requestId: running.id };

    const since = new Date(now().getTime() - ADMIN_EXPORT_COOLDOWN_MS);
    const recent = await tx.workspaceExportRequest.findFirst({
      where: {
        tenantId: input.tenantId,
        trigger: 'ADMIN',
        status: { not: 'FAILED' },
        requestedAt: { gt: since },
      },
      orderBy: { requestedAt: 'desc' },
      select: { requestedAt: true },
    });
    if (recent) {
      return {
        kind: 'rate_limited',
        retryAfter: new Date(recent.requestedAt.getTime() + ADMIN_EXPORT_COOLDOWN_MS),
      };
    }

    const created = await tx.workspaceExportRequest.create({
      data: {
        tenantId: input.tenantId,
        requestedById: input.requestedById,
        trigger: 'ADMIN',
        requestedAt: now(),
      },
      select: { id: true },
    });
    return { kind: 'created', requestId: created.id };
  });
  if (decision.kind !== 'created') return decision;
  const row = { id: decision.requestId };
  await enqueueSafely(enqueue, { requestId: row.id, tenantId: input.tenantId });
  return { kind: 'created', requestId: row.id };
}

/**
 * A subscription ended: queue the export at once, once per subscription, and only when the
 * workspace has no other live subscription (an engine plan ending must not export a customer
 * who still pays for the CRM). `prisma` is the service client (a webhook has no user).
 */
export async function requestExportForEndedSubscription(
  prisma: PrismaClient,
  input: { tenantId: string; subscriptionId: string },
  enqueue: ExportEnqueue,
  now: () => Date = () => new Date()
): Promise<ExportRequestOutcome> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { id: true },
  });
  if (!tenant) return { kind: 'skipped', reason: 'unknown_workspace' };

  const stillLive = await prisma.stripeSubscription.count({
    where: {
      tenantId: input.tenantId,
      stripeSubscriptionId: { not: input.subscriptionId },
      status: { in: [...LIVE_SUBSCRIPTION_STATUSES] },
    },
  });
  if (stillLive > 0) return { kind: 'skipped', reason: 'other_active_subscription' };

  const existing = await prisma.workspaceExportRequest.findFirst({
    where: { tenantId: input.tenantId, subscriptionId: input.subscriptionId },
    select: { id: true, status: true },
  });
  if (existing?.status === 'FAILED') {
    // A redelivery or a replay after a permanent failure gives the commitment another go.
    await prisma.workspaceExportRequest.updateMany({
      where: { id: existing.id, status: 'FAILED' },
      data: { status: 'QUEUED', attempts: 0, error: null },
    });
    await enqueueSafely(
      enqueue,
      { requestId: existing.id, tenantId: input.tenantId },
      { retry: 0 }
    );
    return { kind: 'created', requestId: existing.id };
  }
  if (existing) return { kind: 'skipped', reason: 'already_requested' };

  let id: string;
  try {
    const row = await prisma.workspaceExportRequest.create({
      data: {
        tenantId: input.tenantId,
        trigger: 'SUBSCRIPTION_ENDED',
        subscriptionId: input.subscriptionId,
        requestedAt: now(),
      },
      select: { id: true },
    });
    id = row.id;
  } catch (err) {
    // A concurrent webhook redelivery won the unique (tenantId, subscriptionId) race.
    if ((err as { code?: string }).code === 'P2002') {
      return { kind: 'skipped', reason: 'already_requested' };
    }
    throw err;
  }
  await enqueueSafely(enqueue, { requestId: id, tenantId: input.tenantId });
  return { kind: 'created', requestId: id };
}

/** The row is durable; a failed enqueue is repaired by the sweep, so it never fails the caller. */
async function enqueueSafely(
  enqueue: ExportEnqueue,
  input: { requestId: string; tenantId: string },
  opts?: { retry?: number }
): Promise<void> {
  try {
    await (opts ? enqueue(input, opts) : enqueue(input));
  } catch {
    // swept within minutes
  }
}

// ---------------------------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------------------------

export interface ExportMail {
  recipientUserId: string;
  tenantId: string;
  subject: string;
  body: string;
}

export interface ExportJobDeps {
  /** Service client: the worker reads requests across tenants. Export reads go through the guard. */
  prisma: PrismaClient;
  archiveStorage: ExportArchiveStorage;
  fileStorage: ExportFileStorage | null;
  sendEmail: (mail: ExportMail) => Promise<void>;
  buckets?: readonly string[];
  tmpDir?: string;
  now?: () => Date;
  /** Test seam. */
  runExport?: (opts: RunWorkspaceExportOptions) => Promise<WorkspaceExportResult>;
  log?: {
    info(o: unknown, m?: string): void;
    warn(o: unknown, m?: string): void;
    error(o: unknown, m?: string): void;
  };
}

export type ProcessOutcome =
  | { status: 'ready'; requestId: string; emailed: boolean }
  | { status: 'skipped'; requestId: string; reason: string };

const noopLog = { info() {}, warn() {}, error() {} };

/** Who should get the link: the payer of the ended subscription, else the first admin; plus the asker. */
export async function resolveExportRecipients(
  prisma: PrismaClient,
  request: { tenantId: string; requestedById: string | null; subscriptionId: string | null }
): Promise<Array<{ userId: string; email: string }>> {
  const ids = new Set<string>();
  if (request.subscriptionId) {
    const sub = await prisma.stripeSubscription.findUnique({
      where: { stripeSubscriptionId: request.subscriptionId },
      select: { stripeCustomerId: true },
    });
    if (sub) {
      const payer = await prisma.user.findFirst({
        where: { stripeCustomerId: sub.stripeCustomerId, tenantId: request.tenantId },
        select: { id: true },
      });
      if (payer) ids.add(payer.id);
    }
  }
  // The workspace owner: the earliest-created administrator of the workspace.
  const owner = await prisma.user.findFirst({
    where: { tenantId: request.tenantId, role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (owner) ids.add(owner.id);
  // The asker only counts while they are still an administrator of this workspace (home tenant or
  // an active membership): a removed or demoted admin must not get the link on a later retry.
  if (request.requestedById) {
    const asker = await prisma.user.findFirst({
      where: {
        id: request.requestedById,
        OR: [
          { tenantId: request.tenantId, role: 'ADMIN' },
          {
            memberships: {
              some: { tenantId: request.tenantId, role: 'ADMIN', revokedAt: null },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (asker) ids.add(asker.id);
  }
  if (ids.size === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, email: true },
  });
  return users.filter((u) => u.email).map((u) => ({ userId: u.id, email: u.email }));
}

export function renderExportEmail(input: {
  workspaceName: string;
  url: string;
  expiresAt: Date;
  bytes: number | bigint;
  sha256: string;
}): { subject: string; body: string } {
  const mb = (Number(input.bytes) / (1024 * 1024)).toFixed(1);
  return {
    subject: `Your workspace data export is ready: ${input.workspaceName}`,
    body: [
      `The export of all data in the workspace "${input.workspaceName}" is ready.`,
      '',
      `Download (private link, valid until ${input.expiresAt.toISOString().slice(0, 10)}):`,
      input.url,
      '',
      `Size: ${mb} MB. SHA-256: ${input.sha256}`,
      '',
      'The ZIP holds one CSV and one JSON file for every kind of record, your stored files, a',
      'README that explains each file, and a manifest with row counts and checksums.',
      '',
      'Anyone with this link can download the archive until it expires, so keep it private. After',
      `${input.expiresAt.toISOString().slice(0, 10)} the link stops working and the archive is deleted.`,
    ].join('\n'),
  };
}

/** Where attempt `n` of a request stores its archive: one path per attempt, so runs never collide. */
export function attemptArchivePath(tenantId: string, requestId: string, attempt: number): string {
  return `${tenantId}/${requestId}-${attempt}.zip`;
}

/**
 * Removes the archives of attempts `1..upTo` that a crash left behind (the kept one is never
 * touched). The ZIP holds a customer's whole workspace and must not outlive its 14 days.
 */
async function removeAttemptArchives(
  deps: Pick<ExportJobDeps, 'archiveStorage' | 'log'>,
  request: { id: string; tenantId: string },
  upTo: number,
  keep?: string,
  strict = false
): Promise<void> {
  for (let n = 1; n <= upTo; n += 1) {
    const path = attemptArchivePath(request.tenantId, request.id, n);
    if (path === keep) continue;
    await deps.archiveStorage.removeArchive(path).catch((err: unknown) => {
      if (strict) throw err;
      deps.log?.warn(
        { requestId: request.id, path, err: String(err) },
        'stale export archive not removed'
      );
    });
  }
}

/** How often a running export proves it is alive (the stale-RUNNING check reads startedAt). */
export const HEARTBEAT_MS = 60 * 1000;

type ClaimedRequest = NonNullable<
  Awaited<ReturnType<PrismaClient['workspaceExportRequest']['findUnique']>>
>;

/** QUEUED, or RUNNING by a worker that died. Anything else is not ours to run. */
async function claimExport(
  deps: ExportJobDeps,
  requestId: string,
  now: () => Date
): Promise<ClaimedRequest | null> {
  const startedAt = now();
  const staleBefore = new Date(startedAt.getTime() - STALE_RUNNING_MS);
  // One transaction: the claim's row lock is held until the read, so the row read back is the
  // one this claim produced (a worker that stalls here cannot pick up a later worker's claim).
  return deps.prisma.$transaction(async (tx) => {
    const claimed = await tx.workspaceExportRequest.updateMany({
      where: {
        id: requestId,
        attempts: { lt: MAX_EXPORT_ATTEMPTS },
        OR: [{ status: 'QUEUED' }, { status: 'RUNNING', startedAt: { lt: staleBefore } }],
      },
      data: {
        status: 'RUNNING',
        startedAt,
        attempts: { increment: 1 },
        claimCount: { increment: 1 },
        archivesRemovedAt: null,
        error: null,
      },
    });
    if (claimed.count === 0) return null;
    return tx.workspaceExportRequest.findUnique({ where: { id: requestId } });
  });
}

/**
 * Runs one export request end to end. Throws on failure so BullMQ retries.
 *
 * The claim is identified by (id, RUNNING, claimCount): every write this run makes states it, so a
 * run that was reclaimed after a stall (claimCount moved on) cannot overwrite the newer run's
 * result, and removes the archive it uploaded under its own per-attempt path.
 */
export async function processWorkspaceExport(
  deps: ExportJobDeps,
  input: { requestId: string }
): Promise<ProcessOutcome> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? noopLog;
  const { prisma, archiveStorage } = deps;

  const request = await claimExport(deps, input.requestId, now);
  if (!request) return { status: 'skipped', requestId: input.requestId, reason: 'not queued' };

  // A crashed earlier attempt may have uploaded an archive that never became READY.
  await removeAttemptArchives(deps, request, request.claimCount - 1);

  const ownsClaim = {
    id: request.id,
    status: 'RUNNING' as const,
    claimCount: request.claimCount,
  };
  const heartbeat = setInterval(() => {
    prisma.workspaceExportRequest
      .updateMany({ where: ownsClaim, data: { startedAt: now() } })
      .catch(() => undefined);
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  const dir = deps.tmpDir ?? join(tmpdir(), 'intelliflow-workspace-export');
  const archivePath = join(dir, `${request.id}-${randomUUID()}.zip`);
  const storagePath = attemptArchivePath(request.tenantId, request.id, request.claimCount);
  let uploaded = false;
  try {
    await mkdir(dir, { recursive: true });
    const result = await (deps.runExport ?? runWorkspaceExport)({
      db: createTenantReadGuard(prisma as never, request.tenantId),
      tenantId: request.tenantId,
      outputPath: archivePath,
      requestId: request.id,
      files: deps.fileStorage,
      buckets: deps.buckets,
      now,
    });

    uploaded = true;
    await archiveStorage.uploadArchive(storagePath, archivePath);

    const completedAt = now();
    const expiresAt = new Date(completedAt.getTime() + EXPORT_TTL_MS);
    const skipped = result.manifest.skippedFiles.length;
    const ready = await prisma.workspaceExportRequest.updateMany({
      where: ownsClaim,
      data: {
        status: 'READY',
        rowCounts: {
          entities: result.rowCounts,
          totalRows: Object.values(result.rowCounts).reduce((a, b) => a + b, 0),
          storedFiles: result.storedFileCount,
          skippedFiles: skipped,
        },
        fileCount: result.storedFileCount,
        archiveBytes: BigInt(result.archiveBytes),
        archiveSha256: result.archiveSha256,
        storageBucket: 'workspace-exports',
        storagePath,
        completedAt,
        expiresAt,
        error:
          skipped > 0 ? `${skipped} stored file(s) could not be copied; see manifest.json` : null,
      },
    });
    if (ready.count === 0) {
      // Another run took this request over while we worked: its result stands, ours goes.
      await archiveStorage.removeArchive(storagePath).catch(() => undefined);
      return { status: 'skipped', requestId: request.id, reason: 'superseded' };
    }
    uploaded = false;

    const emailed = await deliverLink(deps, request, {
      storagePath,
      expiresAt,
      bytes: result.archiveBytes,
      sha256: result.archiveSha256,
      workspaceName: result.manifest.workspace.name,
    });
    log.info({ requestId: request.id, emailed }, 'workspace export ready');
    return { status: 'ready', requestId: request.id, emailed };
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await prisma.workspaceExportRequest
      .updateMany({
        where: ownsClaim,
        data: {
          // The claim already counted this run in the row.
          status: request.attempts >= MAX_EXPORT_ATTEMPTS ? 'FAILED' : 'QUEUED',
          error: message,
        },
      })
      .catch(() => undefined);
    // An archive that was uploaded but never became READY is not left behind.
    if (uploaded) await archiveStorage.removeArchive(storagePath).catch(() => undefined);
    log.error({ requestId: request.id, err: message }, 'workspace export failed');
    throw err;
  } finally {
    clearInterval(heartbeat);
    await rm(archivePath, { force: true }).catch(() => undefined);
  }
}

/** Sign the link and email every recipient. A mail failure leaves emailedAt empty for the sweep. */
async function deliverLink(
  deps: ExportJobDeps,
  request: {
    id: string;
    tenantId: string;
    requestedById: string | null;
    subscriptionId: string | null;
    emailedToUserIds?: string[];
  },
  info: {
    storagePath: string;
    expiresAt: Date;
    bytes: number | bigint;
    sha256: string;
    workspaceName: string;
  }
): Promise<boolean> {
  const now = deps.now ?? (() => new Date());
  const remaining = Math.floor((info.expiresAt.getTime() - now().getTime()) / 1000);
  if (remaining <= 0) return false;
  try {
    const recipients = await resolveExportRecipients(deps.prisma, request);
    if (recipients.length === 0) return false;
    const url = await deps.archiveStorage.signedDownloadUrl(
      info.storagePath,
      remaining,
      `workspace-export-${request.id}.zip`
    );
    const mail = renderExportEmail({
      workspaceName: info.workspaceName,
      url,
      expiresAt: info.expiresAt,
      bytes: info.bytes,
      sha256: info.sha256,
    });
    // Delivery is tracked per recipient: one who already has the link is never mailed again,
    // and one whose mail failed is retried on its own until every recipient has it.
    const already = new Set(request.emailedToUserIds ?? []);
    const delivered: string[] = [];
    let failures = 0;
    for (const r of recipients) {
      if (already.has(r.userId)) continue;
      try {
        await deps.sendEmail({
          recipientUserId: r.userId,
          tenantId: request.tenantId,
          subject: mail.subject,
          body: mail.body,
        });
        delivered.push(r.userId);
      } catch (err) {
        failures += 1;
        deps.log?.warn(
          { requestId: request.id, recipientUserId: r.userId, err: String(err) },
          'workspace export email not sent to one recipient'
        );
      }
    }
    if (delivered.length === 0 && failures > 0) return false;
    await deps.prisma.workspaceExportRequest.update({
      where: { id: request.id },
      data: {
        emailedToUserIds: [...already, ...delivered],
        ...(failures === 0 ? { emailedAt: now() } : {}),
      },
    });
    return failures === 0;
  } catch (err) {
    deps.log?.warn({ requestId: request.id, err: String(err) }, 'workspace export email not sent');
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Links and the sweep
// ---------------------------------------------------------------------------------------------

export class ExportLinkError extends Error {
  constructor(
    readonly reason: 'not_found' | 'not_ready' | 'expired',
    message: string
  ) {
    super(message);
    this.name = 'ExportLinkError';
  }
}

/**
 * A fresh signed link for a READY export of `tenantId`, valid until the row's expiresAt and
 * never longer. `prisma` is the caller's tenant-scoped client; the id is also matched to the tenant.
 */
export async function issueDownloadLink(
  prisma: PrismaClient,
  archiveStorage: Pick<ExportArchiveStorage, 'signedDownloadUrl'>,
  input: { tenantId: string; requestId: string },
  now: () => Date = () => new Date()
): Promise<{ url: string; expiresAt: Date }> {
  const row = await prisma.workspaceExportRequest.findFirst({
    where: { id: input.requestId, tenantId: input.tenantId },
  });
  if (!row) throw new ExportLinkError('not_found', 'Export not found');
  if (row.status === 'EXPIRED' || (row.expiresAt && row.expiresAt.getTime() <= now().getTime())) {
    throw new ExportLinkError('expired', 'This export has expired. Request a new one.');
  }
  if (row.status !== 'READY' || !row.storagePath || !row.expiresAt) {
    throw new ExportLinkError('not_ready', 'This export is not ready yet.');
  }
  const seconds = Math.floor((row.expiresAt.getTime() - now().getTime()) / 1000);
  const url = await archiveStorage.signedDownloadUrl(
    row.storagePath,
    Math.min(seconds, EXPORT_LINK_TTL_SECONDS),
    `workspace-export-${row.id}.zip`
  );
  return { url, expiresAt: row.expiresAt };
}

export interface SweepResult {
  requeued: number;
  emailsRetried: number;
  expired: number;
}

/** Rows that used up every attempt without finishing can never run again: say so, loudly. */
async function failExhausted(deps: ExportJobDeps, now: Date): Promise<number> {
  const { prisma } = deps;
  const exhausted = await prisma.workspaceExportRequest.findMany({
    where: {
      attempts: { gte: MAX_EXPORT_ATTEMPTS },
      OR: [
        { status: 'QUEUED', updatedAt: { lt: new Date(now.getTime() - STALE_QUEUED_MS) } },
        { status: 'RUNNING', startedAt: { lt: new Date(now.getTime() - STALE_RUNNING_MS) } },
      ],
    },
    select: { id: true, tenantId: true, trigger: true },
    take: 50,
  });
  let failed = 0;
  for (const row of exhausted) {
    // Re-check exhaustion and staleness in the write itself: a worker that resumed and finished
    // after the read above must not be failed, nor have its archive removed.
    const { count } = await prisma.workspaceExportRequest.updateMany({
      where: {
        id: row.id,
        attempts: { gte: MAX_EXPORT_ATTEMPTS },
        OR: [
          { status: 'QUEUED', updatedAt: { lt: new Date(now.getTime() - STALE_QUEUED_MS) } },
          { status: 'RUNNING', startedAt: { lt: new Date(now.getTime() - STALE_RUNNING_MS) } },
        ],
      },
      data: { status: 'FAILED', error: 'Gave up after repeated failures' },
    });
    if (count !== 1) continue;
    failed += 1;
    // An export the customer is owed (agreement clause 5) failing for good needs a person.
    deps.log?.error(
      { requestId: row.id, tenantId: row.tenantId, trigger: row.trigger },
      'workspace export gave up: needs manual follow-up'
    );
  }
  return failed;
}

/**
 * FAILED requests whose archives are not yet confirmed removed (a crashed attempt may have
 * uploaded one). Retried every sweep until every attempt's archive is gone, then marked.
 */
async function removeFailedArchives(deps: ExportJobDeps): Promise<number> {
  const { prisma } = deps;
  const rows = await prisma.workspaceExportRequest.findMany({
    where: { status: 'FAILED', archivesRemovedAt: null },
    select: { id: true, tenantId: true, claimCount: true },
    // Never-tried rows first, then the least recently tried: rows that keep failing cannot
    // monopolise the batch and starve the others.
    orderBy: { lastCleanupAttemptAt: { sort: 'asc', nulls: 'first' } },
    take: 20,
  });
  let cleaned = 0;
  for (const row of rows) {
    await prisma.workspaceExportRequest.updateMany({
      where: { id: row.id, status: 'FAILED' },
      data: { lastCleanupAttemptAt: deps.now?.() ?? new Date() },
    });
    try {
      await removeAttemptArchives(deps, row, row.claimCount, undefined, true);
      await prisma.workspaceExportRequest.updateMany({
        where: { id: row.id, status: 'FAILED', claimCount: row.claimCount },
        data: { archivesRemovedAt: deps.now?.() ?? new Date() },
      });
      cleaned += 1;
    } catch (err) {
      deps.log?.warn({ requestId: row.id, err: String(err) }, 'failed export archives not removed');
    }
  }
  return cleaned;
}

/** An archive older than its 14-day link plus this grace is never legitimate. */
export const ARCHIVE_GRACE_MS = 24 * 60 * 60 * 1000;
export const RECONCILE_BATCH = 500;
export const RECONCILE_EVERY_MS = 24 * 60 * 60 * 1000;
const lastReconcile = new WeakMap<object, number>();

/**
 * Storage reconciliation, whatever the request rows say: removes bucket objects older than the
 * link lifetime plus a day (late uploads of stale workers, failed deletions). At most
 * RECONCILE_BATCH objects per run; a full batch means more may remain, so the next sweep
 * continues. A finished pass waits a day before the next one.
 */
export async function reconcileExportStorage(deps: ExportJobDeps, now: Date): Promise<number> {
  const storage = deps.archiveStorage;
  if (!storage.listArchivesOlderThan) return 0;
  const last = lastReconcile.get(storage);
  if (last !== undefined && now.getTime() - last < RECONCILE_EVERY_MS) return 0;
  try {
    const cutoff = new Date(now.getTime() - EXPORT_TTL_MS - ARCHIVE_GRACE_MS);
    const paths = await storage.listArchivesOlderThan(cutoff, RECONCILE_BATCH);
    let removed = 0;
    for (const path of paths) {
      try {
        await storage.removeArchive(path);
        removed += 1;
      } catch (err) {
        deps.log?.warn({ path, err: String(err) }, 'stale export archive not removed');
      }
    }
    deps.log?.info({ removed, found: paths.length }, 'workspace export storage reconciled');
    // A full batch: more may remain, so no daily wait.
    if (paths.length < RECONCILE_BATCH) lastReconcile.set(storage, now.getTime());
    return removed;
  } catch (err) {
    deps.log?.warn({ err: String(err) }, 'workspace export storage reconciliation failed');
    return 0;
  }
}

/** Rows whose job was lost (QUEUED too long) or whose worker died (RUNNING too long). */
async function requeueStuck(
  deps: ExportJobDeps,
  enqueue: ExportEnqueue,
  now: Date
): Promise<number> {
  const { prisma } = deps;
  const stuck = await prisma.workspaceExportRequest.findMany({
    where: {
      attempts: { lt: MAX_EXPORT_ATTEMPTS },
      OR: [
        { status: 'QUEUED', updatedAt: { lt: new Date(now.getTime() - STALE_QUEUED_MS) } },
        { status: 'RUNNING', startedAt: { lt: new Date(now.getTime() - STALE_RUNNING_MS) } },
      ],
    },
    select: { id: true, tenantId: true, attempts: true, claimCount: true, status: true },
    take: 50,
  });
  let requeued = 0;
  for (const row of stuck) {
    // RUNNING goes back to QUEUED; a QUEUED row is only touched (updatedAt), so the next sweep
    // does not re-queue it again at once.
    // The write names the attempt and the staleness it read: a worker that reclaimed the row
    // since (a fresh attempt, a fresh heartbeat) must not be reset to QUEUED.
    const { count } = await prisma.workspaceExportRequest.updateMany({
      where:
        row.status === 'RUNNING'
          ? {
              id: row.id,
              status: 'RUNNING',
              claimCount: row.claimCount,
              startedAt: { lt: new Date(now.getTime() - STALE_RUNNING_MS) },
            }
          : {
              id: row.id,
              status: 'QUEUED',
              claimCount: row.claimCount,
              updatedAt: { lt: new Date(now.getTime() - STALE_QUEUED_MS) },
            },
      data: row.status === 'RUNNING' ? { status: 'QUEUED' } : { error: null },
    });
    if (count !== 1) continue;
    try {
      await enqueue({ requestId: row.id, tenantId: row.tenantId }, { retry: row.attempts });
      requeued += 1;
    } catch {
      // next sweep
    }
  }
  return requeued;
}

/** READY rows whose email never went out. */
async function retryUnsentEmails(deps: ExportJobDeps, now: Date): Promise<number> {
  const { prisma } = deps;
  const unsent = await prisma.workspaceExportRequest.findMany({
    where: { status: 'READY', emailedAt: null, expiresAt: { gt: now } },
    // Least recently tried first, so rows that can never be delivered cannot starve the others.
    orderBy: { updatedAt: 'asc' },
    take: 20,
  });
  let retried = 0;
  for (const row of unsent) {
    if (!row.storagePath || !row.expiresAt || !row.archiveSha256) continue;
    const tenant = await prisma.tenant.findUnique({
      where: { id: row.tenantId },
      select: { name: true },
    });
    const ok = await deliverLink(deps, row, {
      storagePath: row.storagePath,
      expiresAt: row.expiresAt,
      bytes: row.archiveBytes ?? 0,
      sha256: row.archiveSha256,
      workspaceName: tenant?.name ?? 'your workspace',
    });
    if (ok) {
      retried += 1;
    } else {
      // Touch the row (updatedAt) so the next sweep tries other rows first.
      await prisma.workspaceExportRequest.updateMany({
        where: { id: row.id, status: 'READY', emailedAt: null },
        data: { emailedAt: null },
      });
    }
  }
  return retried;
}

/** Links past their 14 days: the archive goes with them. */
async function expireOldExports(deps: ExportJobDeps, now: Date): Promise<number> {
  const old = await deps.prisma.workspaceExportRequest.findMany({
    where: { status: 'READY', expiresAt: { lte: now } },
    select: { id: true, tenantId: true, claimCount: true, storagePath: true },
    // Never-tried first, then least recently tried: failing deletions rotate to the back.
    orderBy: { lastCleanupAttemptAt: { sort: 'asc', nulls: 'first' } },
    take: 50,
  });
  let expired = 0;
  for (const row of old) {
    await deps.prisma.workspaceExportRequest.updateMany({
      where: { id: row.id, status: 'READY' },
      data: { lastCleanupAttemptAt: now },
    });
    try {
      // Every attempt's archive goes, not only the kept one: a failed earlier cleanup must not
      // outlive the retention period. A failure keeps the row READY, so the next sweep retries.
      await removeAttemptArchives(deps, row, row.claimCount, row.storagePath ?? undefined, true);
      if (row.storagePath) await deps.archiveStorage.removeArchive(row.storagePath);
      await deps.prisma.workspaceExportRequest.update({
        where: { id: row.id },
        data: { status: 'EXPIRED' },
      });
      expired += 1;
    } catch (err) {
      deps.log?.warn({ requestId: row.id, err: String(err) }, 'workspace export expiry failed');
    }
  }
  return expired;
}

/** Repairs what a crash or a lost job left behind. Safe to run every few minutes. */
export async function sweepWorkspaceExports(
  deps: ExportJobDeps,
  enqueue: ExportEnqueue
): Promise<SweepResult> {
  const now = (deps.now ?? (() => new Date()))();
  await failExhausted(deps, now);
  await removeFailedArchives(deps);
  await reconcileExportStorage(deps, now);
  return {
    requeued: await requeueStuck(deps, enqueue, now),
    emailsRetried: await retryUnsentEmails(deps, now),
    expired: await expireOldExports(deps, now),
  };
}
