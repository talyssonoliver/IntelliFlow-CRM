/**
 * MVP-012 PR C: the reply-draft job reads the conversation's latest stored mails when it runs
 * (with Cc), keeps one waiting draft per conversation, and never calls the model for a mail a
 * waiting draft already answers (codex).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  setting: { findUnique: vi.fn() },
  draft: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  email: { findMany: vi.fn() },
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
const stored = (minute: number, cc: string | null = null) => ({
  fromEmail: 'robert@handyman.example.invalid',
  toEmail: 'owner@shop.example.invalid',
  ccEmails: cc,
  subject: `Fence ${minute}`,
  body: `Body ${minute}`,
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
  // Newest first, as the query asks: a second mail arrived while the job waited.
  db.email.findMany.mockResolvedValue([stored(2), stored(1)]);
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
    expect(prompt).toContain('Fence 1');
    expect(prompt).toContain('Fence 2');
    expect(prompt).not.toContain('queued');
    expect(db.email.findMany.mock.calls[0]![0]).toMatchObject({
      where: {
        tenantId: TENANT,
        mailboxId: 'mbx-1',
        metadata: { path: ['conversationId'], equals: 'conv-9' },
      },
    });
  });

  it('stamps the draft with the newest mail it answers and sets an older waiting one aside', async () => {
    await processReplyDraftJob(job());
    expect(db.draft.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT,
        leadId: 'lead-1',
        status: 'DRAFT',
        emailThreadId: 'conv-9',
        createdAt: { lt: at(2) },
      },
      data: { status: 'DISMISSED' },
    });
    expect(db.draft.create.mock.calls[0]![0].data).toMatchObject({
      leadId: 'lead-1',
      status: 'DRAFT',
      emailThreadId: 'conv-9',
      createdAt: at(2),
    });
  });

  it('calls no model when a waiting draft already answers the newest mail', async () => {
    db.draft.findFirst.mockResolvedValue({ id: 'draft-current' });
    await expect(processReplyDraftJob(job())).resolves.toEqual({ skipped: true });
    expect(llm.invoke).not.toHaveBeenCalled();
    expect(db.draft.create).not.toHaveBeenCalled();
    expect(db.draft.findFirst.mock.calls[0]![0].where).toMatchObject({
      emailThreadId: 'conv-9',
      status: 'DRAFT',
      createdAt: { gte: at(2) },
    });
  });

  it('writes nothing when another job answered the newest mail while the model ran', async () => {
    // Not answered before the model call; answered when re-checked under the row lock.
    db.draft.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'draft-race' });
    await expect(processReplyDraftJob(job())).resolves.toEqual({ skipped: true });
    expect(db.draft.create).not.toHaveBeenCalled();
    expect(db.draft.updateMany).not.toHaveBeenCalled();
  });

  it('checks Cc people for data requests too (codex)', async () => {
    db.email.findMany.mockResolvedValue([stored(2, 'partner@lead.example.invalid'), stored(1)]);
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
  it('maps the stored mails oldest first, with Cc and the newest time', async () => {
    const result = await latestThread(
      { emailRecord: db.email, contactReplyDraft: db.draft } as never,
      { tenantId: TENANT, mailboxId: 'mbx-1', conversationId: 'conv-9' },
      []
    );
    db.email.findMany.mockResolvedValue([stored(3, 'a@example.invalid')]);
    const withCc = await latestThread(
      { emailRecord: db.email, contactReplyDraft: db.draft } as never,
      { tenantId: TENANT, mailboxId: 'mbx-1', conversationId: 'conv-9' },
      []
    );
    expect(result.thread.map((m) => m.subject)).toEqual(['Fence 1', 'Fence 2']);
    expect(result.newestAt).toEqual(at(2));
    expect(withCc.thread[0]).toMatchObject({ cc: 'a@example.invalid' });
  });

  it('keeps the queued thread, unstamped, without a mailbox and conversation', async () => {
    const queued = [{ from: 'a@example.invalid', body: 'hi', at: at(1).toISOString() }];
    const result = await latestThread(
      { emailRecord: db.email, contactReplyDraft: db.draft } as never,
      { tenantId: TENANT },
      queued
    );
    expect(result).toEqual({ thread: queued, newestAt: null });
    expect(db.email.findMany).not.toHaveBeenCalled();
  });
});
