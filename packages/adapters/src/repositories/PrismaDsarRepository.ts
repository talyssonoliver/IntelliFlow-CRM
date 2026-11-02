/**
 * Prisma implementation of DsarRepositoryPort (PG-203 DSAR, spec Addendum A).
 *
 * `reserveSubmission` counts the three caps and the resend cooldown and inserts in ONE
 * transaction, under a per-tenant then a per-email-hash advisory lock, so two concurrent
 * submissions cannot both pass a cap. It runs on the API's own connection (no tenant
 * context) because the global cap counts every firm's rows for the folded email hash.
 * Every status change is conditional on the status it replaces (single use, no double run).
 */
import type { PrismaClient } from '@intelliflow/db';
import type {
  DsarFirm,
  DsarPatch,
  DsarRecord,
  DsarRepositoryPort,
  NewPublicDsar,
  NewStaffDsar,
  ReserveSubmissionResult,
  SubmitCaps,
  TransitionCondition,
} from '@intelliflow/application';
import { DSAR_LIMITS, type DsarStatus } from '@intelliflow/domain';
import { upsertActiveRestriction } from './PrismaProcessingRestrictionRepository';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const LIST_LIMIT = 200;
/** Rows one purge statement deletes, and the most statements one purge call runs. */
const PURGE_BATCH = 500;
const PURGE_MAX_BATCHES = 50;

/** Columns of DsarRecord; the token hashes stay server-side but the service needs them. */
const RECORD = {
  id: true,
  tenantId: true,
  type: true,
  status: true,
  source: true,
  subjectEmail: true,
  details: true,
  objectionScope: true,
  identityMethod: true,
  receivedAt: true,
  verificationTokenHash: true,
  verificationExpiresAt: true,
  verifiedAt: true,
  slaDeadline: true,
  extendedUntil: true,
  exportTokenHash: true,
  exportExpiresAt: true,
  exportIssuedAt: true,
  exportDownloads: true,
  createdById: true,
  resolvedById: true,
  resolutionNote: true,
  clockBreached: true,
  erasureNoticeAt: true,
  completedAt: true,
  createdAt: true,
} as const;

/**
 * The firm's own ADMIN users whose access to it has not been revoked. Partner-granted
 * memberships are not counted: the second-admin rule and alerts are for the firm's staff.
 */
function activeAdminsOf(tenantId: string) {
  return {
    tenantId,
    role: 'ADMIN' as const,
    NOT: { memberships: { some: { tenantId, revokedAt: { not: null } } } },
  };
}

/** The CHECKs in 20261022120000 keep source/scope/method inside the domain unions. */
function toRecord(row: Record<string, unknown>): DsarRecord {
  return row as unknown as DsarRecord;
}

export class PrismaDsarRepository implements DsarRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async reserveSubmission(
    record: NewPublicDsar,
    caps: SubmitCaps,
    now: Date
  ): Promise<ReserveSubmissionResult> {
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const hourAgo = new Date(now.getTime() - HOUR_MS);
    const cooldownStart = new Date(now.getTime() - caps.resendCooldownMinutes * 60_000);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('lock_timeout', '2s', true)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'dsar:t:' + record.tenantId}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'dsar:e:' + record.capEmailHash}))`;

        const recent = await tx.dsarRequest.findFirst({
          where: {
            tenantId: record.tenantId,
            type: record.type,
            subjectEmail: record.subjectEmail,
            status: 'PENDING_VERIFICATION',
            createdAt: { gt: cooldownStart },
          },
          select: { id: true },
        });
        if (recent) return { outcome: 'COOLDOWN' as const };

        // The caps limit the public form only: requests staff logged for the person never
        // stop them from asking themselves (codex).
        const perTenantEmail = await tx.dsarRequest.count({
          where: {
            tenantId: record.tenantId,
            source: 'PUBLIC_FORM',
            subjectEmail: record.subjectEmail,
            createdAt: { gt: dayAgo },
          },
        });
        if (perTenantEmail >= caps.perTenantEmailPerDay) return { outcome: 'CAPPED' as const };

        if (record.ipHash) {
          const perIp = await tx.dsarRequest.count({
            where: {
              tenantId: record.tenantId,
              source: 'PUBLIC_FORM',
              ipHash: record.ipHash,
              createdAt: { gt: hourAgo },
            },
          });
          if (perIp >= caps.perIpPerHour) return { outcome: 'CAPPED' as const };
        }

        const global = await tx.dsarRequest.count({
          where: {
            source: 'PUBLIC_FORM',
            capEmailHash: record.capEmailHash,
            createdAt: { gt: dayAgo },
          },
        });
        if (global >= caps.globalEmailPerDay) return { outcome: 'CAPPED' as const };

        // Owner Q24: a flood of rotating addresses and IPs is stopped per firm, under the
        // tenant lock taken above. Same generic reply as the other caps.
        const perTenant = await tx.dsarRequest.count({
          where: { tenantId: record.tenantId, source: 'PUBLIC_FORM', createdAt: { gt: dayAgo } },
        });
        if (perTenant >= caps.perTenantPerDay) return { outcome: 'CAPPED' as const };

        const created = await tx.dsarRequest.create({
          data: {
            tenantId: record.tenantId,
            type: record.type,
            status: 'PENDING_VERIFICATION',
            source: 'PUBLIC_FORM',
            subjectEmail: record.subjectEmail,
            capEmailHash: record.capEmailHash,
            details: record.details,
            objectionScope: record.objectionScope,
            ipHash: record.ipHash,
            receivedAt: now,
            verificationTokenHash: record.verificationTokenHash,
            verificationExpiresAt: record.verificationExpiresAt,
          },
          select: RECORD,
        });
        return { outcome: 'CREATED' as const, record: toRecord(created) };
      },
      { timeout: 15_000 }
    );
  }

  async createStaff(record: NewStaffDsar): Promise<DsarRecord> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.dsarRequest.create({
        data: {
          tenantId: record.tenantId,
          type: record.type,
          status: 'VERIFIED',
          source: 'STAFF',
          subjectEmail: record.subjectEmail,
          capEmailHash: record.capEmailHash,
          details: record.details,
          objectionScope: record.objectionScope,
          identityMethod: record.identityMethod,
          identityNote: record.identityNote,
          receivedAt: record.receivedAt,
          receivedOnReason: record.receivedOnReason,
          verifiedAt: record.verifiedAt,
          slaDeadline: record.slaDeadline,
          createdById: record.createdById,
        },
        select: RECORD,
      });
      if (record.initialRestriction) {
        await upsertActiveRestriction(tx, {
          tenantId: record.tenantId,
          subjectEmail: record.subjectEmail,
          blocksMarketing: record.initialRestriction.blocksMarketing,
          dsarRequestIds: [created.id],
          createdById: record.createdById,
        });
      }
      return toRecord(created);
    });
  }

  async findById(id: string): Promise<DsarRecord | null> {
    const row = await this.prisma.dsarRequest.findUnique({ where: { id }, select: RECORD });
    return row ? toRecord(row) : null;
  }

  async findForTenant(tenantId: string, id: string): Promise<DsarRecord | null> {
    const row = await this.prisma.dsarRequest.findFirst({
      where: { id, tenantId },
      select: RECORD,
    });
    return row ? toRecord(row) : null;
  }

  /**
   * Every open request (pending or verified) is returned, however many there are, so an old
   * overdue request can never fall off the page. Closed history is the most recent
   * LIST_LIMIT rows. With a status filter, an open status is unbounded and a closed one is
   * bounded the same way.
   */
  async list(tenantId: string, status?: DsarStatus): Promise<DsarRecord[]> {
    const open = (s: DsarStatus) => s === 'PENDING_VERIFICATION' || s === 'VERIFIED';
    // Owner Q24: a request nobody confirmed in time is not work for staff; it is purged later.
    const notExpired = {
      OR: [
        { status: { not: 'PENDING_VERIFICATION' as const } },
        { verificationExpiresAt: null },
        { verificationExpiresAt: { gt: new Date() } },
      ],
    };
    const query = (statuses: DsarStatus[], bounded: boolean) =>
      this.prisma.dsarRequest.findMany({
        where: { tenantId, status: { in: statuses }, ...notExpired },
        select: RECORD,
        orderBy: { receivedAt: 'desc' },
        ...(bounded ? { take: LIST_LIMIT } : {}),
      });
    if (status) return (await query([status], !open(status))).map(toRecord);
    const [openRows, closedRows] = await Promise.all([
      query(['PENDING_VERIFICATION', 'VERIFIED'], false),
      query(['COMPLETED', 'REJECTED'], true),
    ]);
    return [...openRows, ...closedRows].map(toRecord);
  }

  /**
   * Owner Q24: delete requests that were never confirmed, once the link has been expired for
   * `DSAR_LIMITS.pendingPurgeDays`. Runs across firms (the caller uses the unscoped client), in
   * batches of `batchSize` that skip rows another replica holds, and stops after a bounded
   * number of batches. Verified, completed and staff-logged requests are never touched.
   */
  async purgeExpiredUnverified(now: Date, batchSize: number = PURGE_BATCH): Promise<number> {
    const cutoff = new Date(now.getTime() - DSAR_LIMITS.pendingPurgeDays * DAY_MS);
    let purged = 0;
    for (let i = 0; i < PURGE_MAX_BATCHES; i += 1) {
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM dsar_requests
         WHERE id IN (
           SELECT id FROM dsar_requests
            WHERE status = 'PENDING_VERIFICATION'
              AND "verificationExpiresAt" < ${cutoff}
            ORDER BY id
            LIMIT ${batchSize}
              FOR UPDATE SKIP LOCKED)`;
      purged += deleted;
      if (deleted < batchSize) break;
    }
    return purged;
  }

  async transition(
    tenantId: string,
    id: string,
    expectedStatus: DsarStatus,
    patch: DsarPatch,
    condition?: TransitionCondition
  ): Promise<DsarRecord | null> {
    const where = {
      id,
      tenantId,
      status: expectedStatus,
      ...(condition?.onlyIfNotExtended ? { extendedUntil: null } : {}),
    };
    const restrict = condition?.restrict;
    if (!restrict) {
      const updated = await this.prisma.dsarRequest.updateMany({ where, data: patch });
      if (updated.count === 0) return null;
      return this.findForTenant(tenantId, id);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dsarRequest.updateMany({ where, data: patch });
      if (updated.count === 0) return null;
      await upsertActiveRestriction(tx, {
        tenantId,
        subjectEmail: restrict.subjectEmail,
        blocksMarketing: restrict.blocksMarketing,
        dsarRequestIds: [id],
        createdById: restrict.createdById,
      });
      const row = await tx.dsarRequest.findFirst({ where: { id, tenantId }, select: RECORD });
      return row ? toRecord(row) : null;
    });
  }

  async recordDownload(input: {
    id: string;
    tokenHash: string;
    maxDownloads: number;
    now: Date;
  }): Promise<boolean> {
    const updated = await this.prisma.dsarRequest.updateMany({
      where: {
        id: input.id,
        exportTokenHash: input.tokenHash,
        status: { not: 'REJECTED' },
        exportExpiresAt: { gt: input.now },
        exportDownloads: { lt: input.maxDownloads },
      },
      data: { exportDownloads: { increment: 1 }, exportDownloadedAt: input.now },
    });
    return updated.count === 1;
  }

  async countAdmins(tenantId: string): Promise<number> {
    return this.prisma.user.count({ where: activeAdminsOf(tenantId) });
  }

  /** Addresses for admin alerts (no personal data of the requester goes in them). */
  async adminEmails(tenantId: string): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: activeAdminsOf(tenantId),
      select: { email: true },
    });
    return admins.map((a) => a.email);
  }

  async findFirm(tenantId: string): Promise<DsarFirm | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, bookingHandle: true, bookingPrivacyUrl: true },
    });
    if (!tenant) return null;
    return {
      tenantId: tenant.id,
      name: tenant.name,
      handle: tenant.bookingHandle,
      privacyUrl: tenant.bookingPrivacyUrl,
    };
  }
}
