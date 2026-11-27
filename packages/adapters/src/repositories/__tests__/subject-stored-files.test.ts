import { describe, expect, it, vi } from 'vitest';
import type { StoredObjectConfig } from '@intelliflow/domain';
import {
  dealsAndTasks,
  planStoredFiles,
  queueStoredFiles,
  storedFileCounts,
} from '../subject-stored-files';

const T = 't1';
const IDS = { leadIds: ['l1'], contactIds: ['c1'] };
const FOREIGN_URL = 'https://files.example.invalid/b.pdf';
const config: StoredObjectConfig = {
  storageHost: 'abc.supabase.example.invalid',
  emailBucket: 'email-attachments',
};

interface Rows {
  leadFile?: Array<{ id: string; url: string | null }>;
  emailAttachment?: Array<{ id: string; fileUrl: string }>;
  ticketAttachment?: Array<{ id: string; url: string | null }>;
  chatMessage?: Array<{ id: string; attachments: unknown }>;
}

type Other = { source: string; locator: string | null; attachments: string | null };

/** A client: by-address lookups find nothing, the linked lookups find one row per table. */
function db(rows: Rows = {}, others: Other[] = []) {
  const model = (data: unknown[] = []) => ({
    findMany: vi.fn(async () => data),
    count: vi.fn(async () => 0),
    updateMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async () => ({ count: 0 })),
  });
  const linked = (id: string) => [{ id }];
  return {
    emailRecord: model(linked('e1')),
    ticket: model(linked('k1')),
    chatConversation: model(linked('h1')),
    feedbackSurvey: model(),
    opportunity: model(),
    task: model(),
    leadFile: model(rows.leadFile),
    emailAttachment: model(rows.emailAttachment),
    ticketAttachment: model(rows.ticketAttachment),
    chatMessage: model(rows.chatMessage),
    dsarStoredObject: model(),
    // The by-address lookups find nothing; the sharing lookup finds `others`.
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) =>
      strings.join('?').includes('strpos') ? others : []
    ),
    $executeRaw: vi.fn(async () => 1),
  } as any;
}

const sharingQueries = (client: any) =>
  client.$queryRaw.mock.calls.filter((c: unknown[]) =>
    (c[0] as TemplateStringsArray).join('?').includes('strpos')
  );

describe('planStoredFiles (IFC-316)', () => {
  it('queues the email attachments the CRM owns to delete; everything else is kept, with its reason and its location', async () => {
    const client = db({
      leadFile: [
        { id: 'lf1', url: `${T}/lead/a.pdf` },
        { id: 'lf2', url: FOREIGN_URL },
      ],
      emailAttachment: [{ id: 'ea1', fileUrl: `${T}/1-c.pdf` }],
      ticketAttachment: [{ id: 'ta1', url: 'data:application/pdf;base64,AAAA...' }],
      chatMessage: [
        { id: 'cm1', attachments: [{ name: 'd.png', url: `${T}/d.png` }] },
        { id: 'cm2', attachments: [{ name: 'only-a-name.png' }] },
      ],
    });
    const plan = await planStoredFiles(client, T, 'ada@example.invalid', IDS, config);

    // Only the email attachment is a CRM object (nothing uploads lead, chat or ticket files to
    // storage); every other locator is kept as unmanaged, with its location kept for the admin.
    const unmanaged = (source: string, locator: string) => ({
      source,
      state: 'KEPT',
      reason: 'UNMANAGED',
      bucket: null,
      locator,
    });
    expect(plan.queue).toEqual([
      unmanaged('LEAD_FILE', `${T}/lead/a.pdf`),
      unmanaged('LEAD_FILE', FOREIGN_URL),
      {
        source: 'EMAIL_ATTACHMENT',
        state: 'PENDING',
        reason: null,
        bucket: 'email-attachments',
        locator: `${T}/1-c.pdf`,
      },
      unmanaged('CHAT_ATTACHMENT', `${T}/d.png`),
    ]);
    // Every row with a locator or an attachment list is cleared, including inline content.
    expect(plan).toMatchObject({
      leadFileIds: ['lf1', 'lf2'],
      emailAttachmentIds: ['ea1'],
      ticketAttachmentIds: ['ta1'],
      chatMessageIds: ['cm1', 'cm2'],
    });
    // Kept files are resolved: only what is still to delete is "left".
    expect(storedFileCounts(plan)).toEqual({
      toDelete: 1,
      keptShared: 0,
      keptUnmanaged: 3,
      left: {
        storedLeadFiles: 0,
        storedEmailAttachments: 1,
        storedChatAttachments: 0,
        storedTicketAttachments: 0,
      },
    });
  });

  it("never queues another tenant's path or a path with a traversal: kept as unmanaged", async () => {
    const plan = await planStoredFiles(
      db({
        leadFile: [
          { id: 'lf1', url: 'tenant-b/secret.pdf' },
          { id: 'lf2', url: `${T}/../tenant-b/secret.pdf` },
        ],
      }),
      T,
      'a',
      IDS,
      config
    );
    expect(plan.queue.map((q) => [q.state, q.reason, q.locator])).toEqual([
      ['KEPT', 'UNMANAGED', 'tenant-b/secret.pdf'],
      ['KEPT', 'UNMANAGED', `${T}/../tenant-b/secret.pdf`],
    ]);
  });

  it('keeps an object a retained record still uses: never deleted, no location, resolved', async () => {
    const client = db(
      {
        emailAttachment: [
          { id: 'ea1', fileUrl: `${T}/1-x.pdf` },
          { id: 'ea2', fileUrl: `${T}/2-y.pdf` },
        ],
      },
      // Another person's retained mail uses the first upload.
      [{ source: 'EMAIL_ATTACHMENT', locator: `${T}/1-x.pdf`, attachments: null }]
    );
    const plan = await planStoredFiles(client, T, 'a', IDS, config);
    expect(plan.queue).toEqual([
      {
        source: 'EMAIL_ATTACHMENT',
        state: 'KEPT',
        reason: 'SHARED_KEPT',
        bucket: null,
        locator: null,
      },
      {
        source: 'EMAIL_ATTACHMENT',
        state: 'PENDING',
        reason: null,
        bucket: 'email-attachments',
        locator: `${T}/2-y.pdf`,
      },
    ]);
    const counts = storedFileCounts(plan);
    expect(counts).toMatchObject({ toDelete: 1, keptShared: 1 });
    expect(counts.left.storedEmailAttachments).toBe(1);
  });

  it('compares the full identity: the same path in another bucket is not a shared object', async () => {
    // The erased attachment is in the email bucket. A retained LEAD file with the same
    // path lives in the files bucket, so it is a different object.
    const client = db({ emailAttachment: [{ id: 'ea1', fileUrl: `${T}/same.pdf` }] }, [
      { source: 'LEAD_FILE', locator: `${T}/same.pdf`, attachments: null },
    ]);
    const plan = await planStoredFiles(client, T, 'a', IDS, config);
    expect(plan.queue[0]).toMatchObject({ state: 'PENDING', bucket: 'email-attachments' });
    // ...while the same bucket and path, named as a storage URL, is shared.
    const url = `https://${config.storageHost}/storage/v1/object/sign/email-attachments/${T}/same.pdf?token=x`;
    const shared = await planStoredFiles(
      db({ emailAttachment: [{ id: 'ea1', fileUrl: `${T}/same.pdf` }] }, [
        { source: 'TICKET_ATTACHMENT', locator: url, attachments: null },
      ]),
      T,
      'a',
      IDS,
      config
    );
    expect(shared.queue[0]).toMatchObject({ state: 'KEPT', reason: 'SHARED_KEPT' });
  });

  it('reads a retained chat message that names the object', async () => {
    const named = `https://${config.storageHost}/storage/v1/object/sign/email-attachments/${T}/c.png?token=x`;
    const client = db({ emailAttachment: [{ id: 'ea1', fileUrl: `${T}/c.png` }] }, [
      {
        source: 'CHAT_ATTACHMENT',
        locator: null,
        attachments: JSON.stringify([{ name: 'c.png', url: named }]),
      },
    ]);
    expect((await planStoredFiles(client, T, 'a', IDS, config)).queue[0]).toMatchObject({
      state: 'KEPT',
      reason: 'SHARED_KEPT',
    });
    // An unreadable attachment list names nothing.
    const broken = db({ emailAttachment: [{ id: 'ea1', fileUrl: `${T}/c.png` }] }, [
      { source: 'CHAT_ATTACHMENT', locator: null, attachments: '{not json' },
    ]);
    expect((await planStoredFiles(broken, T, 'a', IDS, config)).queue[0]!.state).toBe('PENDING');
  });

  it('asks which objects are used with ONE query for all of them, scoped to the tenant', async () => {
    const files = Array.from({ length: 300 }, (_, i) => ({
      id: `ea${i}`,
      fileUrl: `${T}/${i}-f.pdf`,
    }));
    const client = db({ emailAttachment: files });
    const plan = await planStoredFiles(client, T, 'a', IDS, config);
    expect(plan.queue).toHaveLength(300);
    const queries = sharingQueries(client);
    expect(queries).toHaveLength(1);
    const [strings, ...params] = queries[0] as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join('?');
    for (const table of [
      'email_attachments',
      'lead_files',
      'ticket_attachments',
      'chat_messages',
    ]) {
      expect(sql).toContain(table);
    }
    expect(params.filter((p) => p === T)).toHaveLength(4);
    expect(params).toContainEqual(files.map((f) => f.fileUrl));
    // The erasure's own rows are excluded, so only OTHER records count.
    expect(params).toContainEqual(files.map((f) => f.id));
  });

  it('asks nothing when no file is an object the CRM could delete', async () => {
    const client = db({ leadFile: [{ id: 'lf1', url: FOREIGN_URL }] });
    await planStoredFiles(client, T, 'a', IDS, config);
    expect(sharingQueries(client)).toHaveLength(0);
  });

  it('locks each object, in a fixed order, only inside the erasure transaction', async () => {
    const files = [
      { id: 'ea1', fileUrl: `${T}/b.pdf` },
      { id: 'ea2', fileUrl: `${T}/a.pdf` },
    ];
    const preview = db({ emailAttachment: files });
    await planStoredFiles(preview, T, 'a', IDS, config);
    // A preview takes no lock.
    expect(preview.$executeRaw).not.toHaveBeenCalled();

    const tx = db({ emailAttachment: files });
    await planStoredFiles(tx, T, 'a', IDS, config, true);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...params] = tx.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock');
    // The lock is taken before the sharing is decided, on the sorted keys of this tenant.
    expect(params).toContain(T);
    expect(params).toContainEqual([`email-attachments/${T}/a.pdf`, `email-attachments/${T}/b.pdf`]);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.$queryRaw.mock.invocationCallOrder.at(-1)!
    );
  });

  it('lists a shared object once per source', async () => {
    const plan = await planStoredFiles(
      db({
        emailAttachment: [
          { id: 'ea1', fileUrl: `${T}/1-x.pdf` },
          { id: 'ea2', fileUrl: `${T}/1-x.pdf` },
        ],
      }),
      T,
      'a',
      IDS,
      config
    );
    expect(plan.queue).toHaveLength(1);
    expect(plan.emailAttachmentIds).toEqual(['ea1', 'ea2']);
  });

  it('reads only this tenant and only the rows linked to the person', async () => {
    const client = db();
    await planStoredFiles(client, T, 'a', IDS, config);
    expect(client.leadFile.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: T,
      leadId: { in: ['l1'] },
    });
    expect(client.emailAttachment.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: T,
      emailId: { in: ['e1'] },
    });
    expect(client.ticketAttachment.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: T,
      ticketId: { in: ['k1'] },
    });
    expect(client.chatMessage.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: T,
      conversationId: { in: ['h1'] },
    });
  });
});

describe('queueStoredFiles', () => {
  it('queues the objects and takes the locators off the rows, all scoped to the tenant', async () => {
    const client = db({ emailAttachment: [{ id: 'ea1', fileUrl: `${T}/a.pdf` }] });
    const plan = await planStoredFiles(client, T, 'a', IDS, config);
    await queueStoredFiles(client, T, 'req-1', plan);
    expect(client.dsarStoredObject.createMany.mock.calls[0][0].data).toEqual([
      {
        tenantId: T,
        requestId: 'req-1',
        source: 'EMAIL_ATTACHMENT',
        state: 'PENDING',
        reason: null,
        bucket: 'email-attachments',
        locator: `${T}/a.pdf`,
      },
    ]);
    expect(client.emailAttachment.updateMany.mock.calls[0][0]).toEqual({
      where: { tenantId: T, id: { in: ['ea1'] } },
      data: { fileUrl: '' },
    });
    expect(client.leadFile.updateMany.mock.calls[0][0].data).toEqual({ url: null });
    expect(client.ticketAttachment.updateMany.mock.calls[0][0].data).toEqual({ url: null });
    expect(client.chatMessage.updateMany.mock.calls[0][0].where.tenantId).toBe(T);
  });

  it('records an unmanaged file with its reason and its location, and still removes the person’s link', async () => {
    const client = db({ leadFile: [{ id: 'lf1', url: FOREIGN_URL }] });
    const plan = await planStoredFiles(client, T, 'a', IDS, config);
    await queueStoredFiles(client, T, 'req-1', plan);
    expect(client.dsarStoredObject.createMany.mock.calls[0][0].data).toEqual([
      {
        tenantId: T,
        requestId: 'req-1',
        source: 'LEAD_FILE',
        state: 'KEPT',
        reason: 'UNMANAGED',
        bucket: null,
        locator: FOREIGN_URL,
      },
    ]);
    expect(client.leadFile.updateMany.mock.calls[0][0].data).toEqual({ url: null });
  });

  it('writes no queue row when there is nothing to delete', async () => {
    const client = db();
    await queueStoredFiles(client, T, 'req-1', await planStoredFiles(client, T, 'a', IDS, config));
    expect(client.dsarStoredObject.createMany).not.toHaveBeenCalled();
  });
});

describe('dealsAndTasks', () => {
  it('counts the deals and tasks that stay for the admin', async () => {
    const client = db();
    client.opportunity.count.mockResolvedValue(2);
    client.task.count.mockResolvedValue(3);
    expect(await dealsAndTasks(client, T, 'a', IDS)).toEqual({ deals: 2, tasks: 3 });
  });
});
