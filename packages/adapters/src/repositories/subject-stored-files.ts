/**
 * The erased person's stored files (IFC-316): found by the same ids as their communications,
 * read BEFORE the erasure removes the person's address, then moved into the
 * `dsar_stored_objects` queue inside the erasure transaction. The queue is committed with the
 * erasure, so a crash after the commit cannot lose an object: the cleanup (application layer)
 * deletes the objects afterwards and settles each row.
 *
 * Lead files, email attachments, chat messages and ticket attachments all lose their locator
 * here (and chat messages their attachment list, which names the files). The locator lives only
 * in the queue until the object is deleted, then it is cleared there too.
 */
import { Prisma, type PrismaClient } from '@intelliflow/db';
import {
  STORED_OBJECT_CHECKLIST_KEYS,
  chatAttachmentLocators,
  classifyStoredLocator,
  type StoredObjectConfig,
  type StoredObjectReason,
  type StoredObjectRef,
  type StoredObjectSource,
} from '@intelliflow/domain';
import {
  communicationIds,
  subjectTaskWhere,
  type Db,
  type SubjectIds,
} from './subject-communications';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

interface QueuedObject {
  source: StoredObjectSource;
  /**
   * PENDING: the CRM owns the object and deletes it. KEPT: the CRM does not delete it, and the
   * row is read-only and resolved: SHARED_KEPT (another retained record still uses it) or
   * UNMANAGED (outside the CRM's own storage). A kept row stores no locator.
   */
  state: 'PENDING' | 'KEPT';
  reason: StoredObjectReason | null;
  bucket: string | null;
  locator: string | null;
}

export interface StoredFilePlan {
  queue: QueuedObject[];
  /** Rows whose locator moves to the queue, by source. */
  leadFileIds: string[];
  emailAttachmentIds: string[];
  ticketAttachmentIds: string[];
  chatMessageIds: string[];
}

/** Every checklist key at 0, then the queued objects counted per source. */
function pendingCounts(queue: QueuedObject[]) {
  const counts: Record<string, number> = Object.fromEntries(
    Object.values(STORED_OBJECT_CHECKLIST_KEYS).map((key) => [key, 0])
  );
  for (const q of queue) {
    if (q.state === 'PENDING') counts[STORED_OBJECT_CHECKLIST_KEYS[q.source]] += 1;
  }
  return counts;
}

/** What the erasure will delete from storage afterwards, and what it keeps (resolved). */
export function storedFileCounts(plan: StoredFilePlan) {
  const kept = (reason: StoredObjectReason) =>
    plan.queue.filter((q) => q.state === 'KEPT' && q.reason === reason).length;
  return {
    toDelete: plan.queue.filter((q) => q.state === 'PENDING').length,
    keptShared: kept('SHARED_KEPT'),
    keptUnmanaged: kept('UNMANAGED'),
    /** Still to delete, per checklist key: what is left until the cleanup has run. */
    left: pendingCounts(plan.queue),
  };
}

export async function planStoredFiles(
  db: Db,
  tenantId: string,
  email: string,
  ids: SubjectIds,
  config: StoredObjectConfig,
  /** Inside the erasure transaction only: lock each object while its sharing is decided. */
  lock = false
): Promise<StoredFilePlan> {
  const c = await communicationIds(db, tenantId, email, ids);
  const [leadFiles, emailFiles, ticketFiles, chatMessages] = await Promise.all([
    db.leadFile.findMany({
      where: { tenantId, leadId: { in: ids.leadIds }, url: { not: null } },
      select: { id: true, url: true },
    }),
    db.emailAttachment.findMany({
      where: { tenantId, emailId: { in: c.emailRecords }, fileUrl: { not: '' } },
      select: { id: true, fileUrl: true },
    }),
    db.ticketAttachment.findMany({
      where: { tenantId, ticketId: { in: c.tickets }, url: { not: null } },
      select: { id: true, url: true },
    }),
    db.chatMessage.findMany({
      where: { tenantId, conversationId: { in: c.chats }, attachments: { not: Prisma.DbNull } },
      select: { id: true, attachments: true },
    }),
  ]);

  const rowIds = {
    leadFileIds: leadFiles.map((f) => f.id),
    emailAttachmentIds: emailFiles.map((f) => f.id),
    ticketAttachmentIds: ticketFiles.map((f) => f.id),
    chatMessageIds: chatMessages.map((m) => m.id),
  };
  const locators: Array<[StoredObjectSource, string | null]> = [
    ...leadFiles.map((f): [StoredObjectSource, string | null] => ['LEAD_FILE', f.url]),
    ...emailFiles.map((f): [StoredObjectSource, string | null] => ['EMAIL_ATTACHMENT', f.fileUrl]),
    ...ticketFiles.map((f): [StoredObjectSource, string | null] => ['TICKET_ATTACHMENT', f.url]),
    ...chatMessages.flatMap((m) =>
      chatAttachmentLocators(m.attachments).map((l): [StoredObjectSource, string | null] => [
        'CHAT_ATTACHMENT',
        l,
      ])
    ),
  ];

  // Sorted in memory first: what is not an object the CRM owns is never touched.
  const seen = new Set<string>();
  const candidates: Array<{
    source: StoredObjectSource;
    found: ReturnType<typeof classifyStoredLocator>;
  }> = [];
  for (const [source, locator] of locators) {
    const found = classifyStoredLocator(source, locator, tenantId, config);
    if (found.kind === 'NONE') continue;
    const where = found.kind === 'OBJECT' ? `${found.ref.bucket}/${found.ref.path}` : locator;
    const key = `${source}|${where}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ source, found });
  }
  const owned = candidates.flatMap((c) => (c.found.kind === 'OBJECT' ? [c.found.ref] : []));
  const shared = await sharedObjects(db, tenantId, owned, rowIds, config, lock);

  // The CRM deletes only an object it alone owns: in its bucket, under this firm's prefix, and
  // used by no retained record. Everything else is kept, read-only and resolved, with its reason;
  // no location is stored for it (the erased person's own link to it is removed with the rest).
  const queue: QueuedObject[] = candidates.map(({ source, found }) => {
    if (found.kind !== 'OBJECT') {
      return { source, state: 'KEPT', reason: 'UNMANAGED', bucket: null, locator: null };
    }
    return shared.has(objectKey(found.ref))
      ? { source, state: 'KEPT', reason: 'SHARED_KEPT', bucket: null, locator: null }
      : {
          source,
          state: 'PENDING',
          reason: null,
          bucket: found.ref.bucket,
          locator: found.ref.path,
        };
  });
  return { queue, ...rowIds };
}

/** The parsed JSON, or null when it is not JSON (an unreadable list names nothing). */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const objectKey = (ref: StoredObjectRef) => `${ref.bucket}/${ref.path}`;

/**
 * Which of these objects a record outside this erasure's own rows, in the same tenant, still
 * uses. The match is on the full identity (bucket and path, as the classifier reads each other
 * locator), not on a path substring, so an unrelated file with the same path in another bucket
 * does not count. One query finds the candidate rows; the identities are compared in memory.
 *
 * Inside the erasure transaction each object is first locked (transaction-scoped advisory lock,
 * in a fixed order), so two erasures that share an object cannot both decide "kept": the second
 * one waits for the first to commit and then sees that the first's reference is gone.
 */
async function sharedObjects(
  db: Db,
  tenantId: string,
  objects: StoredObjectRef[],
  planned: Omit<StoredFilePlan, 'queue'>,
  config: StoredObjectConfig,
  lock: boolean
): Promise<Set<string>> {
  if (objects.length === 0) return new Set();
  const keys = [...new Set(objects.map(objectKey))].sort((a, b) => (a < b ? -1 : 1));
  if (lock) {
    await db.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${tenantId} || '/' || s.k, 0))
      FROM (SELECT k FROM unnest(${keys}::text[]) AS k ORDER BY k) AS s`;
  }
  const paths = [...new Set(objects.map((o) => o.path))];
  const rows = await db.$queryRaw<
    Array<{ source: StoredObjectSource; locator: string | null; attachments: string | null }>
  >`
    SELECT 'EMAIL_ATTACHMENT' AS source, e."fileUrl" AS locator, NULL::text AS attachments
      FROM email_attachments e WHERE e."tenantId" = ${tenantId}
        AND NOT (e.id = ANY(${planned.emailAttachmentIds}::text[]))
        AND EXISTS (SELECT 1 FROM unnest(${paths}::text[]) p WHERE strpos(e."fileUrl", p) > 0)
    UNION ALL
    SELECT 'LEAD_FILE', l.url, NULL FROM lead_files l WHERE l."tenantId" = ${tenantId}
        AND NOT (l.id = ANY(${planned.leadFileIds}::text[]))
        AND EXISTS (SELECT 1 FROM unnest(${paths}::text[]) p WHERE strpos(l.url, p) > 0)
    UNION ALL
    SELECT 'TICKET_ATTACHMENT', t.url, NULL FROM ticket_attachments t WHERE t."tenantId" = ${tenantId}
        AND NOT (t.id = ANY(${planned.ticketAttachmentIds}::text[]))
        AND EXISTS (SELECT 1 FROM unnest(${paths}::text[]) p WHERE strpos(t.url, p) > 0)
    UNION ALL
    SELECT 'CHAT_ATTACHMENT', NULL, c.attachments::text FROM chat_messages c
      WHERE c."tenantId" = ${tenantId} AND NOT (c.id = ANY(${planned.chatMessageIds}::text[]))
        AND EXISTS (SELECT 1 FROM unnest(${paths}::text[]) p WHERE strpos(c.attachments::text, p) > 0)`;
  const used = new Set<string>();
  const note = (source: StoredObjectSource, locator: string | null) => {
    const found = classifyStoredLocator(source, locator, tenantId, config);
    if (found.kind === 'OBJECT') used.add(objectKey(found.ref));
  };
  for (const row of rows) {
    if (row.attachments === null) note(row.source, row.locator);
    else {
      for (const locator of chatAttachmentLocators(parseJson(row.attachments))) {
        note(row.source, locator);
      }
    }
  }
  return new Set(keys.filter((k) => used.has(k)));
}

/** Deals and tasks stay on the checklist (owner ruling Q23); counted for the preview and result. */
export async function dealsAndTasks(
  db: Db,
  tenantId: string,
  email: string,
  ids: SubjectIds
): Promise<{ deals: number; tasks: number }> {
  const c = await communicationIds(db, tenantId, email, ids);
  const [deals, tasks] = await Promise.all([
    db.opportunity.count({ where: { tenantId, contactId: { in: ids.contactIds } } }),
    db.task.count({ where: subjectTaskWhere(tenantId, ids, c.dealIds) }),
  ]);
  return { deals, tasks };
}

/**
 * Inside the erasure transaction: queue the objects and take the locators off the rows. The
 * queue rows and the cleared rows commit or roll back together, so there is never a locator in
 * neither place.
 */
export async function queueStoredFiles(
  tx: Tx,
  tenantId: string,
  requestId: string,
  plan: StoredFilePlan
): Promise<void> {
  if (plan.queue.length > 0) {
    await tx.dsarStoredObject.createMany({
      data: plan.queue.map((q) => ({
        tenantId,
        requestId,
        source: q.source,
        state: q.state,
        reason: q.reason,
        bucket: q.bucket,
        locator: q.locator,
      })),
    });
  }
  await tx.leadFile.updateMany({
    where: { tenantId, id: { in: plan.leadFileIds } },
    data: { url: null },
  });
  await tx.emailAttachment.updateMany({
    where: { tenantId, id: { in: plan.emailAttachmentIds } },
    data: { fileUrl: '' },
  });
  await tx.ticketAttachment.updateMany({
    where: { tenantId, id: { in: plan.ticketAttachmentIds } },
    data: { url: null },
  });
  // The attachment list names the files, so it goes whole.
  await tx.chatMessage.updateMany({
    where: { tenantId, id: { in: plan.chatMessageIds } },
    data: { attachments: Prisma.DbNull },
  });
}
