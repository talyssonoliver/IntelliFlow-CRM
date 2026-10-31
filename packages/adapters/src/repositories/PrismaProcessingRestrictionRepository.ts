/**
 * Prisma implementation of ProcessingRestrictionPort (PG-203 DSAR, owner ruling Q18,
 * spec sign-off 1).
 *
 * One ACTIVE row per (tenantId, subjectEmail), enforced by the partial unique index
 * processing_restrictions_active_key. Every write is an upsert into that row:
 * `blocksMarketing` is OR-ed and the triggering request id is appended once. Prisma cannot
 * target a partial index in an upsert, so the merge is raw SQL (ON CONFLICT ... WHERE).
 */
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@intelliflow/db';
import {
  isErasedEmail,
  normalizeSubjectEmail,
  type RepositoryTransaction,
} from '@intelliflow/domain';
import type {
  ActiveRestriction,
  ProcessingRestrictionPort,
  RestrictionStatus,
} from '@intelliflow/application';

const ACTIVE_SELECT = {
  id: true,
  tenantId: true,
  subjectEmail: true,
  blocksMarketing: true,
  dsarRequestIds: true,
  createdAt: true,
} as const;

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export class PrismaProcessingRestrictionRepository implements ProcessingRestrictionPort {
  constructor(private readonly prisma: PrismaClient) {}

  async status(
    tenantId: string,
    subjectEmail: string,
    tx?: RepositoryTransaction
  ): Promise<RestrictionStatus> {
    const email = normalizeSubjectEmail(subjectEmail);
    // An erased record's placeholder address is never processed again (codex): every
    // consumer of this check (scoring, drafts, embedding, the banner) treats it as restricted.
    if (isErasedEmail(email)) return { restricted: true, blocksMarketing: true, since: null };
    const db = (tx as Tx | undefined) ?? this.prisma;
    // In the caller's transaction: the address lock first, held until it commits, so a
    // restriction written meanwhile waits for the caller's write instead of racing it (codex).
    if (tx) await db.$executeRaw`SELECT dsar_subject_lock(${tenantId}, ${email})`;
    const row = await db.processingRestriction.findFirst({
      where: { tenantId, subjectEmail: email, liftedAt: null },
      select: { blocksMarketing: true, createdAt: true },
    });
    if (!row) return { restricted: false, blocksMarketing: false, since: null };
    return { restricted: true, blocksMarketing: row.blocksMarketing, since: row.createdAt };
  }

  async restrict(input: {
    tenantId: string;
    subjectEmail: string;
    blocksMarketing: boolean;
    dsarRequestId: string;
    createdById: string | null;
  }): Promise<ActiveRestriction> {
    return this.upsert(this.prisma, {
      tenantId: input.tenantId,
      subjectEmail: normalizeSubjectEmail(input.subjectEmail),
      blocksMarketing: input.blocksMarketing,
      dsarRequestIds: [input.dsarRequestId],
      createdById: input.createdById,
    });
  }

  async findActive(tenantId: string, restrictionId: string): Promise<ActiveRestriction | null> {
    return this.prisma.processingRestriction.findFirst({
      where: { id: restrictionId, tenantId, liftedAt: null },
      select: ACTIVE_SELECT,
    });
  }

  async listActive(tenantId: string): Promise<ActiveRestriction[]> {
    return this.prisma.processingRestriction.findMany({
      where: { tenantId, liftedAt: null },
      select: ACTIVE_SELECT,
      // Every active restriction: one hidden here could never be lifted (codex).
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Detach the request from every active row it holds (followEmail copies a restriction to a
   * changed address, so one request can hold several). A row is lifted only when no other
   * request keeps it (a RESTRICTION merged with an OBJECTION stays restricted for the
   * objection). Returns the first lifted row, or null when every row is still held.
   */
  async liftForRequest(input: {
    tenantId: string;
    dsarRequestId: string;
    liftedById: string;
    note: string;
  }): Promise<ActiveRestriction | null> {
    return this.prisma.$transaction(async (tx) => {
      // The address locks first, as restrict() and the address carry take them (codex): a carry
      // to a new address either commits before (and its copy is lifted below) or waits until
      // this lift commits (and finds nothing active to copy). Byte order, the order the AI write
      // guard sorts its addresses in, so the two never wait on each other.
      await tx.$executeRaw`
        SELECT dsar_subject_lock(${input.tenantId}, held.email) FROM (
          SELECT DISTINCT "subjectEmail" COLLATE "C" AS email FROM processing_restrictions
          WHERE "tenantId" = ${input.tenantId} AND "liftedAt" IS NULL
            AND ${input.dsarRequestId} = ANY("dsarRequestIds")
          ORDER BY 1) AS held`;
      const rows = await tx.$queryRaw<Array<{ id: string; dsarRequestIds: string[] }>>`
        SELECT id, "dsarRequestIds" FROM processing_restrictions
        WHERE "tenantId" = ${input.tenantId} AND "liftedAt" IS NULL
          AND ${input.dsarRequestId} = ANY("dsarRequestIds")
        ORDER BY "createdAt"
        FOR UPDATE`;
      let firstLifted: ActiveRestriction | null = null;
      for (const row of rows) {
        const remaining = row.dsarRequestIds.filter((id) => id !== input.dsarRequestId);
        if (remaining.length > 0) {
          await tx.processingRestriction.update({
            where: { id: row.id },
            data: { dsarRequestIds: remaining },
          });
          continue;
        }
        const lifted = await tx.processingRestriction.update({
          where: { id: row.id },
          data: { liftedAt: new Date(), liftedById: input.liftedById, liftNote: input.note },
          select: ACTIVE_SELECT,
        });
        firstLifted ??= lifted;
      }
      return firstLifted;
    });
  }

  async lift(input: {
    tenantId: string;
    restrictionId: string;
    expectedRequestIds: string[];
    liftedById: string;
    note: string;
  }): Promise<ActiveRestriction | null> {
    return this.prisma.$transaction(async (tx) => {
      // The person's address lock first, as in liftForRequest (codex).
      await tx.$executeRaw`
        SELECT dsar_subject_lock(${input.tenantId}, "subjectEmail") FROM processing_restrictions
        WHERE id = ${input.restrictionId} AND "tenantId" = ${input.tenantId} AND "liftedAt" IS NULL`;
      const updated = await tx.processingRestriction.updateMany({
        where: {
          id: input.restrictionId,
          tenantId: input.tenantId,
          liftedAt: null,
          dsarRequestIds: { equals: input.expectedRequestIds },
        },
        data: { liftedAt: new Date(), liftedById: input.liftedById, liftNote: input.note },
      });
      if (updated.count === 0) return null;
      return tx.processingRestriction.findFirst({
        where: { id: input.restrictionId, tenantId: input.tenantId },
        select: ACTIVE_SELECT,
      });
    });
  }

  async followEmail(tenantId: string, fromEmail: string, toEmail: string): Promise<void> {
    const from = normalizeSubjectEmail(fromEmail);
    const to = normalizeSubjectEmail(toEmail);
    if (from === to) return;
    // One locked statement (dsar_carry_restriction): the read and the copy cannot interleave
    // with a restriction being written for either address. The old row stays active.
    await this.prisma.$executeRaw`SELECT dsar_carry_restriction(${tenantId}, ${from}, ${to})`;
  }

  private upsert(
    db: PrismaClient | Tx,
    row: Parameters<typeof upsertActiveRestriction>[1]
  ): Promise<ActiveRestriction> {
    return upsertActiveRestriction(db, row);
  }
}

/**
 * Insert the person's active restriction, or merge into the one already there (OR
 * `blocksMarketing`, union of request ids). Shared with PrismaDsarRepository so a staff
 * RESTRICTION and its restriction are written in one transaction.
 */
export async function upsertActiveRestriction(
  db: PrismaClient | Tx,
  row: {
    tenantId: string;
    subjectEmail: string;
    blocksMarketing: boolean;
    dsarRequestIds: string[];
    createdById: string | null;
  }
): Promise<ActiveRestriction> {
  // The person's address lock first (dsar_subject_lock), shared with the trigger that carries a
  // restriction when a record changes address, so the two cannot interleave (codex).
  const result = await db.$queryRaw<ActiveRestriction[]>`
      WITH subject_lock AS (SELECT dsar_subject_lock(${row.tenantId}, ${row.subjectEmail}))
      INSERT INTO processing_restrictions
        (id, "tenantId", "subjectEmail", "blocksMarketing", "dsarRequestIds", "createdById", "updatedAt")
      SELECT ${randomUUID()}, ${row.tenantId}, ${row.subjectEmail}, ${row.blocksMarketing},
        ${row.dsarRequestIds}::text[], ${row.createdById}, now()
      FROM subject_lock
      ON CONFLICT ("tenantId", "subjectEmail") WHERE "liftedAt" IS NULL DO UPDATE SET
        "blocksMarketing" = processing_restrictions."blocksMarketing" OR EXCLUDED."blocksMarketing",
        "dsarRequestIds" = ARRAY(
          SELECT DISTINCT unnest(processing_restrictions."dsarRequestIds" || EXCLUDED."dsarRequestIds")
          ORDER BY 1
        ),
        "updatedAt" = now()
      RETURNING id, "tenantId", "subjectEmail", "blocksMarketing", "dsarRequestIds", "createdAt"`;
  return result[0]!;
}
