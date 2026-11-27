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
  /** PENDING: the CRM deletes it. MANUAL: it cannot, the admin does. */
  state: 'PENDING' | 'MANUAL';
  bucket: string | null;
  locator: string;
}

export interface StoredFilePlan {
  queue: QueuedObject[];
  /** Rows whose locator moves to the queue, by source. */
  leadFileIds: string[];
  emailAttachmentIds: string[];
  ticketAttachmentIds: string[];
  chatMessageIds: string[];
}

/** Every checklist key at 0, then the queued objects in the given states counted per source. */
function storedCounts(queue: QueuedObject[], states: QueuedObject['state'][]) {
  const counts: Record<string, number> = Object.fromEntries(
    Object.values(STORED_OBJECT_CHECKLIST_KEYS).map((key) => [key, 0])
  );
  for (const q of queue) {
    if (states.includes(q.state)) counts[STORED_OBJECT_CHECKLIST_KEYS[q.source]] += 1;
  }
  return counts;
}

/** What the erasure will delete from storage afterwards, and what is left until it has. */
export function storedFileCounts(plan: StoredFilePlan) {
  return {
    toDelete: plan.queue.filter((q) => q.state === 'PENDING').length,
    /** Queued or manual, per checklist key: what is left until the cleanup has run. */
    left: storedCounts(plan.queue, ['PENDING', 'MANUAL']),
    /** Only what the CRM cannot delete itself. */
    manual: storedCounts(plan.queue, ['MANUAL']),
  };
}

export async function planStoredFiles(
  db: Db,
  tenantId: string,
  email: string,
  ids: SubjectIds,
  config: StoredObjectConfig
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

  const queue: QueuedObject[] = [];
  const seen = new Set<string>();
  const add = (source: StoredObjectSource, locator: string | null) => {
    const found = classifyStoredLocator(source, locator, tenantId, config);
    if (found.kind === 'NONE') return;
    const where = found.kind === 'OBJECT' ? `${found.ref.bucket}/${found.ref.path}` : locator;
    const key = `${source}|${where}`;
    if (seen.has(key)) return;
    seen.add(key);
    queue.push(
      found.kind === 'OBJECT'
        ? { source, state: 'PENDING', bucket: found.ref.bucket, locator: found.ref.path }
        : { source, state: 'MANUAL', bucket: null, locator: String(locator).trim() }
    );
  };
  for (const f of leadFiles) add('LEAD_FILE', f.url);
  for (const f of emailFiles) add('EMAIL_ATTACHMENT', f.fileUrl);
  for (const f of ticketFiles) add('TICKET_ATTACHMENT', f.url);
  for (const m of chatMessages) {
    for (const locator of chatAttachmentLocators(m.attachments)) add('CHAT_ATTACHMENT', locator);
  }
  return {
    queue,
    leadFileIds: leadFiles.map((f) => f.id),
    emailAttachmentIds: emailFiles.map((f) => f.id),
    ticketAttachmentIds: ticketFiles.map((f) => f.id),
    chatMessageIds: chatMessages.map((m) => m.id),
  };
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
