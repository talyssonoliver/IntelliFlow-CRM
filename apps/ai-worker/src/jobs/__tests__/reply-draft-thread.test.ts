/**
 * MVP-012 PR C: the reply-draft job reads the conversation's latest stored mails when it runs
 * (with Cc), keeps one waiting draft per conversation, and never calls the model for a thread its
 * waiting draft already answers. Which mails a draft answers is known by identity (each answered
 * mail is marked with the draft), never by time (codex).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  setting: { findUnique: vi.fn() },
  draft: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  email: { findMany: vi.fn(), count: vi.fn() },
  executeRaw: vi.fn(),
}));
const llm = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('../../lib/data-request-guard', async (importOriginal) =>
  (await import('../../test/mocks/data-request-guard.mock')).passThroughGuard(
    await importOriginal()
  )
);
vi.mock('@intelliflow/db', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@intelliflow/db')),
  prisma: {
    contactAutomationSetting: db.setting,
    contactReplyDraft: db.draft,
    emailRecord: db.email,
    $executeRaw: db.executeRaw,
    $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
  },
}));
vi.mock('../../lib/llm-factory.js', () => ({
  createLLMForTenant: vi.fn().mockResolvedValue({
    withStructuredOutput: vi.fn(() => ({ invoke: llm.invoke })),
  }),
}));
vi.mock('../../utils/input-sanitizer.js', () => ({ sanitizeStringField: vi.fn((v: string) => v) }));

import { queuedAddressBlocked } from '../../lib/data-request-guard';
import { latestThread } from '../reply-draft-thread';
import { processReplyDraftJob } from '../reply-draft.job';

const TENANT = '00000000-0000-4000-a000-000000000001';
const at = (minute: number) => new Date(Date.UTC(2026, 10, 19, 10, minute));
const stored = (id: string, minute: number, cc: string | null = null) => ({
  id,
  fromEmail: 'robert@handyman.example.invalid',
  toEmail: 'owner@shop.example.invalid',
  ccEmails: cc,
  subject: `Fence ${id}`,
  body: `Body ${id}`,
  createdAt: at(minute),
});
const job = (over: Record<string, unknown> = {}) =>
  ({
    data: {
      leadId: 'lead-1',
      tenantId: TENANT,
      emailThreadId: 'conv-9',
      mailboxId: 'mbx-1',
      emailThread: [
        { from: 'robert@handyman.example.invalid', body: 'queued', at: at(1).toISOString() },
      ],
      ...over,
    },
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  db.setting.findUnique.mockResolvedValue(null); // never saved: drafting is on
  db.draft.findFirst.mockResolvedValue(null);
  db.draft.updateMany.mockResolvedValue({ count: 0 });
  db.draft.create.mockResolvedValue({ id: 'draft-new' });
  db.email.count.mockResolvedValue(0);
  db.executeRaw.mockResolvedValue(2);
  // Newest first, as the query asks: a second mail arrived while the job waited.
  db.email.findMany.mockResolvedValue([stored('m2', 2), stored('m1', 1)]);
  llm.invoke.mockResolvedValue({
    draftSubject: 'Re: Fence',
    draftBody: 'Thursday works.',
    tone: 'friendly',
    confidence: 0.8,
    modelVersion: 'v1',
  });
});

describe('the reply draft job reads the latest thread (MVP-012 PR C)', () => {
  it('answers every stored mail of the conversation, not the snapshot it was queued with', async () => {
    await expect(processReplyDraftJob(job())).resolves.toEqual({ draftId: 'draft-new' });
    const prompt = JSON.stringify(llm.invoke.mock.calls[0]![0]);
    expect(prompt).toContain('Fence m1');
    expect(prompt).toContain('Fence m2');
    expect(prompt).not.toContain('queued');
    expect(db.email.findMany.mock.calls[0]![0]).toMatchObject({
      where: {
        tenantId: TENANT,
        mailboxId: 'mbx-1',
        metadata: { path: ['conversationId'], equals: 'conv-9' },
      },
    });
  });

  it('replaces the waiting draft and marks each mail it answers with the new one', async () => {
    db.draft.findFirst.mockResolvedValue({ id: 'draft-old' });
    db.email.count.mockResolvedValue(1); // the old draft answered m1, not m2
    await processReplyDraftJob(job());
    expect(db.draft.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, leadId: 'lead-1', status: 'DRAFT', emailThreadId: 'conv-9' },
      data: { status: 'DISMISSED' },
    });
    expect(db.draft.create.mock.calls[0]![0].data).toMatchObject({
      leadId: 'lead-1',
      status: 'DRAFT',
      emailThreadId: 'conv-9',
    });
    // The answered mails are marked by id, in the database (metadata merged, not overwritten).
    const [sql, ...values] = db.executeRaw.mock.calls[0]!;
    expect((sql as string[]).join('?')).toContain("jsonb_build_object('replyDraftId'");
    expect(values).toEqual(['draft-new', TENANT, ['m1', 'm2']]);
  });

  it('calls no model when the waiting draft already answers every mail of the thread', async () => {
    db.draft.findFirst.mockResolvedValue({ id: 'draft-current' });
    db.email.count.mockResolvedValue(2);
    await expect(processReplyDraftJob(job())).resolves.toEqual({ skipped: true });
    expect(llm.invoke).not.toHaveBeenCalled();
    expect(db.draft.create).not.toHaveBeenCalled();
    expect(db.email.count.mock.calls[0]![0]).toEqual({
      where: {
        tenantId: TENANT,
        id: { in: ['m1', 'm2'] },
        metadata: { path: ['replyDraftId'], equals: 'draft-current' },
      },
    });
  });

  it('drafts again for a mail with the same received time, synced after the draft (codex)', async () => {
    // m2b shares m2's time but the waiting draft never read it: identity, not time, decides.
    db.email.findMany.mockResolvedValue([stored('m2b', 2), stored('m2', 2), stored('m1', 1)]);
    db.draft.findFirst.mockResolvedValue({ id: 'draft-old' });
    db.email.count.mockResolvedValue(2);
    await expect(processReplyDraftJob(job())).resolves.toEqual({ draftId: 'draft-new' });
    expect(llm.invoke).toHaveBeenCalledTimes(1);
  });

  it('drafts again for an older mail synced late (codex)', async () => {
    db.email.findMany.mockResolvedValue([stored('m2', 2), stored('m0-late', 0)]);
    db.draft.findFirst.mockResolvedValue({ id: 'draft-old' });
    db.email.count.mockResolvedValue(1); // only m2 was answered
    await expect(processReplyDraftJob(job())).resolves.toEqual({ draftId: 'draft-new' });
  });

  it('writes nothing when another job answered the thread while the model ran', async () => {
    // Not answered before the model call; answered when re-checked under the row lock.
    db.draft.findFirst.mockResolvedValue({ id: 'draft-race' });
    db.email.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    await expect(processReplyDraftJob(job())).resolves.toEqual({ skipped: true });
    expect(db.draft.create).not.toHaveBeenCalled();
    expect(db.draft.updateMany).not.toHaveBeenCalled();
  });

  it('checks Cc people for data requests too (codex)', async () => {
    db.email.findMany.mockResolvedValue([
      stored('m2', 2, 'partner@lead.example.invalid'),
      stored('m1', 1),
    ]);
    vi.mocked(queuedAddressBlocked).mockImplementation(
      async (_db: unknown, _tenant: string, address: string) =>
        address === 'partner@lead.example.invalid'
    );
    await expect(processReplyDraftJob(job())).resolves.toEqual({ skipped: true });
    expect(llm.invoke).not.toHaveBeenCalled();
    expect(db.draft.create).not.toHaveBeenCalled();
  });
});

describe('latestThread', () => {
  const threadDb = () =>
    ({ emailRecord: db.email, contactReplyDraft: db.draft, $executeRaw: db.executeRaw }) as never;

  it('maps the stored mails oldest first, with Cc and their ids', async () => {
    db.email.findMany.mockResolvedValue([stored('m2', 2, 'a@example.invalid'), stored('m1', 1)]);
    const result = await latestThread(
      threadDb(),
      { tenantId: TENANT, mailboxId: 'mbx-1', conversationId: 'conv-9' },
      []
    );
    expect(result.thread.map((m) => m.subject)).toEqual(['Fence m1', 'Fence m2']);
    expect(result.thread[1]).toMatchObject({ cc: 'a@example.invalid' });
    expect(result.recordIds).toEqual(['m1', 'm2']);
  });

  it('keeps the queued thread without a mailbox and conversation', async () => {
    const queued = [{ from: 'a@example.invalid', body: 'hi', at: at(1).toISOString() }];
    const result = await latestThread(threadDb(), { tenantId: TENANT }, queued);
    expect(result).toEqual({ thread: queued, recordIds: [] });
    expect(db.email.findMany).not.toHaveBeenCalled();
  });
});
