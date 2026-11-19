/**
 * MVP-012 PR C: a received mail logged on a lead or contact queues a reply draft (AI_REPLY_DRAFT)
 * with the real thread, when the tenant drafts replies (on unless it saved off). Never for sent
 * mail, never twice for one mail or one waiting conversation, and never failing the sync.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const enqueue = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/queue-producer', () => ({ enqueueOneShot: enqueue }));

import { THREAD_LIMIT, queueReplyDraftForSyncedMail } from '../mail-sync-reply-draft';
import { mail } from './inbox-sync-harness';

const TENANT = '00000000-0000-4000-a000-000000000001';
const mailbox = { id: 'mbx-1', tenantId: TENANT, userId: 'user-1' };
const lead = { contactId: null, leadId: 'lead-1' };

function prisma(
  over: {
    setting?: { aiAutoReplyDrafting: boolean } | null;
    waiting?: { id: string } | null;
    thread?: unknown[];
  } = {}
) {
  const stored = (n: number) => ({
    fromEmail: `p${n}@lead.example.invalid`,
    toEmail: 'owner@shop.example.invalid',
    subject: `Fence ${n}`,
    body: `Body ${n}`,
    createdAt: new Date(Date.UTC(2026, 10, 19, 10, n)),
  });
  return {
    contactAutomationSetting: { findUnique: vi.fn(async (_args: any) => over.setting ?? null) },
    contactReplyDraft: { findFirst: vi.fn(async (_args: any) => over.waiting ?? null) },
    // Newest first, as the query asks for.
    emailRecord: { findMany: vi.fn(async (_args: any) => over.thread ?? [stored(2), stored(1)]) },
  };
}

type Args = Parameters<typeof queueReplyDraftForSyncedMail>;
const queue = (
  db: ReturnType<typeof prisma>,
  o: { message?: Args[2]; folder?: Args[3]; party?: Args[4] } = {}
) =>
  queueReplyDraftForSyncedMail(
    { prisma: db },
    mailbox,
    o.message ?? mail({ conversationId: 'conv-9' }),
    o.folder ?? 'inbox',
    o.party ?? lead,
    'rec-1'
  );

beforeEach(() => {
  vi.clearAllMocks();
  enqueue.mockResolvedValue({ id: 'job-1' });
});

describe('queueReplyDraftForSyncedMail (MVP-012 PR C)', () => {
  it('queues a draft for an enquiry on a lead, with the thread oldest first', async () => {
    const db = prisma();
    await expect(queue(db)).resolves.toBe(true);
    const [queueName, jobName, data, options] = enqueue.mock.calls[0]!;
    expect(queueName).toBe('ai-reply-draft');
    expect(jobName).toBe('draft');
    expect(options).toEqual({
      jobId: 'reply-draft-rec-1',
      // Held while the job is queued or running: a second mail of the thread queues no other.
      deduplication: { id: `reply-draft:${TENANT}:lead:lead-1:conv-9` },
    });
    expect(data).toMatchObject({
      leadId: 'lead-1',
      tenantId: TENANT,
      emailThreadId: 'conv-9',
      createdBy: 'user-1',
    });
    expect(data).not.toHaveProperty('contactId');
    expect(data.emailThread.map((m: { subject: string }) => m.subject)).toEqual([
      'Fence 1',
      'Fence 2',
    ]);
    expect(data.emailThread[0]).toEqual({
      from: 'p1@lead.example.invalid',
      to: 'owner@shop.example.invalid',
      subject: 'Fence 1',
      body: 'Body 1',
      at: '2026-11-19T10:01:00.000Z',
    });
    // The thread is the conversation's stored mail in this mailbox, the latest few.
    expect(db.emailRecord.findMany.mock.calls[0]![0]).toMatchObject({
      where: {
        tenantId: TENANT,
        mailboxId: 'mbx-1',
        metadata: { path: ['conversationId'], equals: 'conv-9' },
      },
      orderBy: { createdAt: 'desc' },
      take: THREAD_LIMIT,
    });
  });

  it('drafts on the contact when the sender is a contact', async () => {
    await queue(prisma(), { party: { contactId: 'contact-1', leadId: null } });
    expect(enqueue.mock.calls[0]![2]).toMatchObject({ contactId: 'contact-1' });
  });

  it('is on for a tenant that never saved the setting, and follows a saved choice', async () => {
    await expect(queue(prisma({ setting: null }))).resolves.toBe(true);
    await expect(queue(prisma({ setting: { aiAutoReplyDrafting: true } }))).resolves.toBe(true);
    enqueue.mockClear();
    await expect(queue(prisma({ setting: { aiAutoReplyDrafting: false } }))).resolves.toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('never drafts for mail the owner sent, or mail with no lead or contact', async () => {
    await expect(queue(prisma(), { folder: 'sentitems' })).resolves.toBe(false);
    await expect(queue(prisma(), { party: { contactId: null, leadId: null } })).resolves.toBe(
      false
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('does not queue a second draft while one waits for the same conversation', async () => {
    const db = prisma({ waiting: { id: 'draft-1' } });
    await expect(queue(db)).resolves.toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
    expect(db.contactReplyDraft.findFirst.mock.calls[0]![0].where).toEqual({
      tenantId: TENANT,
      leadId: 'lead-1',
      status: 'DRAFT',
      emailThreadId: 'conv-9',
    });
  });

  it('uses just the stored mail when it has no conversation', async () => {
    const db = prisma();
    await queue(db, { message: mail({ conversationId: null }) });
    expect(enqueue.mock.calls[0]![3]).toEqual({ jobId: 'reply-draft-rec-1' });
    expect(db.emailRecord.findMany.mock.calls[0]![0].where).toEqual({
      tenantId: TENANT,
      id: 'rec-1',
    });
    expect(enqueue.mock.calls[0]![2]).not.toHaveProperty('emailThreadId');
  });

  it('never holds mail with no conversation back on an unrelated draft (codex)', async () => {
    const db = prisma({ waiting: { id: 'draft-other-thread' } });
    await expect(queue(db, { message: mail({ conversationId: null }) })).resolves.toBe(true);
    expect(db.contactReplyDraft.findFirst).not.toHaveBeenCalled();
  });

  it('keys the conversation by tenant and person, so another person’s thread is apart', async () => {
    await queue(prisma(), { party: { contactId: 'contact-1', leadId: null } });
    expect(enqueue.mock.calls[0]![3].deduplication).toEqual({
      id: `reply-draft:${TENANT}:contact:contact-1:conv-9`,
    });
  });

  it('cuts long bodies before queueing them', async () => {
    const long = {
      fromEmail: 'p@lead.example.invalid',
      toEmail: 'o@shop.example.invalid',
      subject: 's',
      body: 'x'.repeat(10_000),
      createdAt: new Date(),
    };
    await queue(prisma({ thread: [long] }));
    expect(enqueue.mock.calls[0]![2].emailThread[0].body).toHaveLength(4000);
  });

  it('never fails the sync: a queue that cannot be reached is logged and dropped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    enqueue.mockRejectedValueOnce(new Error('redis down'));
    await expect(queue(prisma())).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith('[mail-sync] reply draft not queued', expect.anything());
    warn.mockRestore();
  });
});
