/**
 * Data-request guards for the AI workers (PG-203, owner Q18; spec sign-off 8).
 *
 * The API checks processing restrictions before it queues work, but a job can sit in the
 * queue while a person is restricted or erased, and the scheduled dispatcher reads leads
 * directly. So scoring jobs re-read the lead before any AI call, the dispatcher leaves
 * erased and restricted people out, and contact embedding skips them too.
 */
import { isErasedEmail, normalizeSubjectEmail } from '@intelliflow/domain';

export type ScoringBlock = 'LEAD_MISSING' | 'ERASED' | 'EMAIL_CHANGED' | 'RESTRICTED';

export interface GuardPrisma {
  lead: {
    findFirst(args: {
      where: { id: string; tenantId: string };
      select: { email: true };
    }): Promise<{ email: string } | null>;
  };
  processingRestriction: {
    findFirst(args: {
      where: { tenantId: string; subjectEmail: string; liftedAt: null };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    findMany(args: {
      where: { tenantId: string; liftedAt: null };
      select: { subjectEmail: true };
    }): Promise<Array<{ subjectEmail: string }>>;
  };
}

/** An erased placeholder address, or a person with an active processing restriction. */
export async function isRestrictedOrErased(
  prisma: Pick<GuardPrisma, 'processingRestriction'>,
  tenantId: string,
  rawEmail: string
): Promise<boolean> {
  const email = normalizeSubjectEmail(rawEmail);
  if (isErasedEmail(email)) return true;
  const restriction = await prisma.processingRestriction.findFirst({
    where: { tenantId, subjectEmail: email, liftedAt: null },
    select: { id: true },
  });
  return restriction !== null;
}

/** Why this job must not be scored, or null when it may. */
export async function scoringBlockedBy(
  prisma: GuardPrisma,
  job: { leadId: string; tenantId: string; email: string }
): Promise<ScoringBlock | null> {
  const lead = await prisma.lead.findFirst({
    where: { id: job.leadId, tenantId: job.tenantId },
    select: { email: true },
  });
  if (!lead) return 'LEAD_MISSING';
  const email = normalizeSubjectEmail(lead.email);
  if (isErasedEmail(email)) return 'ERASED';
  if (email !== normalizeSubjectEmail(job.email)) return 'EMAIL_CHANGED';
  return (await isRestrictedOrErased(prisma, job.tenantId, email)) ? 'RESTRICTED' : null;
}

/** The slice of a Prisma transaction client the locked write needs. */
export interface LockingTx extends Pick<GuardPrisma, 'processingRestriction'> {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/**
 * Run `write` only while the lead is still eligible, holding the lead row lock. The erasure
 * updates the same row inside its own transaction, so an erasure that starts while a scoring
 * job is in flight either waits for this write (and then deletes what it wrote) or finishes
 * first (and this check then sees the erased address and writes nothing).
 */
type LockedWrite<T> = { written: true; value: T } | { written: false; reason: ScoringBlock };

/** The checks on a locked row's current email, then the write. */
async function writeIfEligibleRow<T>(
  tx: LockingTx,
  row: { email: string } | undefined,
  job: { tenantId: string; email: string },
  write: (tx: LockingTx) => Promise<T>
): Promise<LockedWrite<T>> {
  if (!row) return { written: false, reason: 'LEAD_MISSING' };
  const email = normalizeSubjectEmail(row.email);
  if (isErasedEmail(email)) return { written: false, reason: 'ERASED' };
  if (email !== normalizeSubjectEmail(job.email))
    return { written: false, reason: 'EMAIL_CHANGED' };
  // The person's address lock (dsar_subject_lock), held to commit: a restriction being written
  // for this address either committed before (and is seen below) or waits until this write is
  // done (codex). Order: entity row, then address, as in the address-change trigger.
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT dsar_subject_lock(${job.tenantId}, ${email})) AS l`;
  if (await isRestrictedOrErased(tx, job.tenantId, email)) {
    return { written: false, reason: 'RESTRICTED' };
  }
  return { written: true, value: await write(tx) };
}

export async function writeIfStillEligible<T>(
  prisma: { $transaction<R>(fn: (tx: LockingTx) => Promise<R>): Promise<R> },
  job: { leadId: string; tenantId: string; email: string },
  write: (tx: LockingTx) => Promise<T>
): Promise<LockedWrite<T>> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ email: string }>>`
      SELECT email FROM leads WHERE id = ${job.leadId} AND "tenantId" = ${job.tenantId}
      FOR UPDATE`;
    return writeIfEligibleRow(tx, rows[0], job, write);
  });
}

/**
 * The same guard for a contact: the embedding is written only under the contact row lock,
 * after re-reading its email, so an erasure that ran during the embedding call wins.
 */
export async function writeContactIfStillEligible<T>(
  prisma: { $transaction<R>(fn: (tx: LockingTx) => Promise<R>): Promise<R> },
  job: { contactId: string; tenantId: string; email: string },
  write: (tx: LockingTx) => Promise<T>
): Promise<LockedWrite<T>> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ email: string }>>`
      SELECT email FROM contacts WHERE id = ${job.contactId} AND "tenantId" = ${job.tenantId}
      FOR UPDATE`;
    return writeIfEligibleRow(tx, rows[0], job, write);
  });
}

/** A client that can run a raw query (the dispatcher's candidate read). */
export interface RawQueryPrisma {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/**
 * Ids of up to `limit` leads of one firm the dispatcher may queue: never scored or scored
 * before `staleBefore`, not erased, and not restricted. The restriction is compared in SQL
 * on the normalised address (dsar_normalise_email, the key normalizeSubjectEmail makes)
 * before the limit, so a restricted row never takes a place in the batch however its address
 * is stored, and the eligible leads behind it are always reached (codex).
 */
export async function dispatchCandidateIds(
  prisma: RawQueryPrisma,
  input: { tenantId: string; restricted: string[]; staleBefore: Date; limit: number }
): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT l.id FROM leads l
    WHERE l."tenantId" = ${input.tenantId}
      AND l.email NOT LIKE '%@erased.invalid'
      AND NOT (dsar_normalise_email(l.email) = ANY(${input.restricted}::text[]))
      AND (
        NOT EXISTS (SELECT 1 FROM lead_ai_insights i WHERE i."leadId" = l.id)
        OR EXISTS (
          SELECT 1 FROM lead_ai_insights i
          WHERE i."leadId" = l.id AND i."updatedAt" < ${input.staleBefore}
        )
      )
    ORDER BY l.id
    LIMIT ${input.limit}`;
  return rows.map((r) => r.id);
}

/** The firm's restricted addresses (normalised), for the dispatcher's query and filter. */
export async function restrictedEmails(prisma: GuardPrisma, tenantId: string): Promise<string[]> {
  const rows = await prisma.processingRestriction.findMany({
    where: { tenantId, liftedAt: null },
    select: { subjectEmail: true },
  });
  return rows.map((r) => r.subjectEmail);
}

export async function scorableLeads<T extends { email: string }>(
  prisma: GuardPrisma,
  tenantId: string,
  leads: T[],
  known?: string[]
): Promise<T[]> {
  const restricted = new Set(known ?? (await restrictedEmails(prisma, tenantId)));
  return leads.filter((lead) => {
    const email = normalizeSubjectEmail(lead.email);
    return !isErasedEmail(email) && !restricted.has(email);
  });
}
