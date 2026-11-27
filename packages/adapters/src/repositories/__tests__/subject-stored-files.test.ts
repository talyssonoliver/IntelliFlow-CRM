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
const config: StoredObjectConfig = {
  storageHost: 'abc.supabase.example.invalid',
  emailBucket: 'email-attachments',
  filesBucket: 'crm-files',
};

interface Rows {
  leadFile?: Array<{ id: string; url: string | null }>;
  emailAttachment?: Array<{ id: string; fileUrl: string }>;
  ticketAttachment?: Array<{ id: string; url: string | null }>;
  chatMessage?: Array<{ id: string; attachments: unknown }>;
}

/** A client: by-address lookups find nothing, the linked lookups find one row per table. */
function db(rows: Rows = {}) {
  const model = (name: string, data: unknown[] = []) => ({
    findMany: vi.fn(async () => data),
    count: vi.fn(async () => 0),
    updateMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async () => ({ count: 0 })),
  });
  const linked = (id: string) => [{ id }];
  return {
    emailRecord: model('emailRecord', linked('e1')),
    ticket: model('ticket', linked('k1')),
    chatConversation: model('chatConversation', linked('h1')),
    feedbackSurvey: model('feedbackSurvey'),
    opportunity: model('opportunity'),
    task: model('task'),
    leadFile: model('leadFile', rows.leadFile),
    emailAttachment: model('emailAttachment', rows.emailAttachment),
    ticketAttachment: model('ticketAttachment', rows.ticketAttachment),
    chatMessage: model('chatMessage', rows.chatMessage),
    dsarStoredObject: model('dsarStoredObject'),
    $queryRaw: vi.fn(async () => []),
  } as any;
}

describe('planStoredFiles (IFC-316)', () => {
  it('sorts every source into queued objects, manual files and nothing to delete', async () => {
    const client = db({
      leadFile: [
        { id: 'lf1', url: `${T}/lead/a.pdf` },
        { id: 'lf2', url: 'https://files.example.invalid/b.pdf' },
      ],
      emailAttachment: [{ id: 'ea1', fileUrl: `${T}/1-c.pdf` }],
      ticketAttachment: [{ id: 'ta1', url: 'data:application/pdf;base64,AAAA...' }],
      chatMessage: [
        { id: 'cm1', attachments: [{ name: 'd.png', url: `${T}/d.png` }] },
        { id: 'cm2', attachments: [{ name: 'only-a-name.png' }] },
      ],
    });
    const plan = await planStoredFiles(client, T, 'ada@example.invalid', IDS, config);

    expect(plan.queue).toEqual([
      { source: 'LEAD_FILE', state: 'PENDING', bucket: 'crm-files', locator: `${T}/lead/a.pdf` },
      {
        source: 'LEAD_FILE',
        state: 'MANUAL',
        bucket: null,
        locator: 'https://files.example.invalid/b.pdf',
      },
      {
        source: 'EMAIL_ATTACHMENT',
        state: 'PENDING',
        bucket: 'email-attachments',
        locator: `${T}/1-c.pdf`,
      },
      { source: 'CHAT_ATTACHMENT', state: 'PENDING', bucket: 'crm-files', locator: `${T}/d.png` },
    ]);
    // Every row with a locator or an attachment list is cleared, including inline content.
    expect(plan).toMatchObject({
      leadFileIds: ['lf1', 'lf2'],
      emailAttachmentIds: ['ea1'],
      ticketAttachmentIds: ['ta1'],
      chatMessageIds: ['cm1', 'cm2'],
    });
    expect(storedFileCounts(plan)).toEqual({
      toDelete: 3,
      left: {
        storedLeadFiles: 2,
        storedEmailAttachments: 1,
        storedChatAttachments: 1,
        storedTicketAttachments: 0,
      },
      manual: {
        storedLeadFiles: 1,
        storedEmailAttachments: 0,
        storedChatAttachments: 0,
        storedTicketAttachments: 0,
      },
    });
  });

  it("never queues another tenant's path or a path with a traversal: it stays manual", async () => {
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
    expect(plan.queue.map((q) => q.state)).toEqual(['MANUAL', 'MANUAL']);
    expect(plan.queue.every((q) => q.bucket === null)).toBe(true);
  });

  it('never queues an object that a record outside the erasure still uses: it goes to the admin', async () => {
    const rows = { emailAttachment: [{ id: 'ea1', fileUrl: `${T}/1-x.pdf` }] };
    for (const [table, lookup] of [
      ['emailAttachment', (c: any) => c.emailAttachment.count],
      ['leadFile', (c: any) => c.leadFile.count],
      ['ticketAttachment', (c: any) => c.ticketAttachment.count],
    ] as const) {
      const client = db(rows);
      lookup(client).mockResolvedValue(1);
      const plan = await planStoredFiles(client, T, 'a', IDS, config);
      expect(plan.queue, table).toEqual([
        { source: 'EMAIL_ATTACHMENT', state: 'MANUAL', bucket: null, locator: `${T}/1-x.pdf` },
      ]);
      // The check looks only at rows outside this erasure's own, in this tenant.
      const where = client[table].count.mock.calls[0][0].where;
      expect(where).toMatchObject({ tenantId: T, id: { notIn: expect.any(Array) } });
    }
    // A chat message outside the erasure that names the same object counts too.
    const client = db(rows);
    client.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join('?').includes('FROM chat_messages') ? [{ n: 1n }] : []
    );
    expect((await planStoredFiles(client, T, 'a', IDS, config)).queue[0]!.state).toBe('MANUAL');
  });

  it('checks an object once it is not shared: it is queued to delete', async () => {
    const client = db({ emailAttachment: [{ id: 'ea1', fileUrl: `${T}/1-x.pdf` }] });
    const plan = await planStoredFiles(client, T, 'a', IDS, config);
    expect(plan.queue[0]).toMatchObject({ state: 'PENDING', bucket: 'email-attachments' });
    expect(client.emailAttachment.count.mock.calls[0][0].where).toMatchObject({
      fileUrl: { contains: `${T}/1-x.pdf` },
      id: { notIn: ['ea1'] },
    });
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
    const client = db({ leadFile: [{ id: 'lf1', url: `${T}/a.pdf` }] });
    const plan = await planStoredFiles(client, T, 'a', IDS, config);
    await queueStoredFiles(client, T, 'req-1', plan);
    expect(client.dsarStoredObject.createMany.mock.calls[0][0].data).toEqual([
      {
        tenantId: T,
        requestId: 'req-1',
        source: 'LEAD_FILE',
        state: 'PENDING',
        bucket: 'crm-files',
        locator: `${T}/a.pdf`,
      },
    ]);
    expect(client.leadFile.updateMany.mock.calls[0][0]).toEqual({
      where: { tenantId: T, id: { in: ['lf1'] } },
      data: { url: null },
    });
    expect(client.emailAttachment.updateMany.mock.calls[0][0].data).toEqual({ fileUrl: '' });
    expect(client.ticketAttachment.updateMany.mock.calls[0][0].data).toEqual({ url: null });
    expect(client.chatMessage.updateMany.mock.calls[0][0].where.tenantId).toBe(T);
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
