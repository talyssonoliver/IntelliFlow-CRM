import { describe, expect, it, vi } from 'vitest';
import {
  ERASED_NAME,
  ERASED_NOTE,
  communicationCounts,
  eraseCommunications,
  remainingChecklist,
} from '../subject-communications';

const TABLES = (
  'emailRecord emailAttachment ticket ticketAttachment ticketNextStep ticketAIInsight ' +
  'chatConversation chatMessage feedbackSurvey notification autoResponseDraft contactReplyDraft ' +
  'calendarEvent experimentAssignment opportunity task leadFile'
).split(' ');

/** A client whose by-address lookups find `byAddress` ids and whose linked lookups find `linked`. */
function db(linked: Record<string, string[]> = {}) {
  const model = (name: string) => ({
    findMany: vi.fn(async () => (linked[name] ?? []).map((id) => ({ id }))),
    count: vi.fn(async () => 0),
    updateMany: vi.fn(async () => ({ count: (linked[name] ?? []).length })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  });
  const client: Record<string, any> = Object.fromEntries(TABLES.map((t) => [t, model(t)]));
  client.$queryRaw = vi.fn(async () => []);
  client.$executeRaw = vi.fn(async () => 2);
  return client;
}

const IDS = { leadIds: ['l1'], contactIds: ['c1'] };
const INPUT = { tenantId: 't1', email: 'ada@example.invalid', ids: IDS, now: new Date(0) };
const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');

describe('eraseCommunications (IFC-316)', () => {
  it('anonymises tickets, chats, feedback and calendar events, keeping staff fields', async () => {
    const tx = db({ ticket: ['k1'], chatConversation: ['h1'], feedbackSurvey: ['f1'] });
    await eraseCommunications(tx as never, INPUT);

    expect(tx.ticket.updateMany.mock.calls[0][0]).toMatchObject({
      where: { tenantId: 't1', id: { in: ['k1'] } },
      data: { subject: 'Erased ticket', description: null, contactName: ERASED_NAME },
    });
    expect(tx.ticket.updateMany.mock.calls[0][0].data.contactEmail).toMatch(/@erased\.invalid$/);
    expect(tx.chatConversation.updateMany.mock.calls[0][0].data).toMatchObject({
      contactName: ERASED_NAME,
      contactEmail: null,
      subject: null,
    });
    expect(tx.feedbackSurvey.updateMany.mock.calls[0][0].data).toMatchObject({
      comment: null,
      followUpNote: null,
    });
    expect(tx.calendarEvent.updateMany.mock.calls[0][0]).toMatchObject({
      where: { tenantId: 't1', contactId: { in: ['c1'] } },
      data: { title: 'Erased event', description: null, location: null },
    });
    // Its url is inline file content, not a locator, so it goes too.
    expect(tx.ticketAttachment.updateMany.mock.calls[0][0].data).toEqual({
      name: 'erased',
      url: null,
    });
    expect(tx.ticketAIInsight.deleteMany).toHaveBeenCalled();
  });

  it('deletes the drafts and experiment assignments about the person', async () => {
    const tx = db();
    const counts = await eraseCommunications(tx as never, INPUT);
    expect(tx.autoResponseDraft.deleteMany.mock.calls[0][0].where).toMatchObject({
      tenantId: 't1',
    });
    expect(tx.contactReplyDraft.deleteMany.mock.calls[0][0]).toEqual({
      where: { tenantId: 't1', contactId: { in: ['c1'] } },
    });
    expect(tx.experimentAssignment.deleteMany.mock.calls[0][0]).toEqual({
      where: { leadId: { in: ['l1'] } },
    });
    expect(counts).toMatchObject({
      autoResponseDrafts: 1,
      contactReplyDrafts: 1,
      experimentAssignments: 1,
    });
  });

  it('rewrites message text and replaces only the person’s address in address lists', async () => {
    const tx = db({ emailRecord: ['e1'], ticket: ['k1'], chatConversation: ['h1'] });
    await eraseCommunications(tx as never, INPUT);
    const statements = tx.$executeRaw.mock.calls.map(sqlOf);
    const mail = statements.find((s: string) => s.includes('UPDATE email_records'))!;
    for (const column of ['"toEmail"', '"ccEmails"', '"bccEmails"', '"fromEmail"']) {
      expect(mail).toContain(column);
    }
    const mailCall = tx.$executeRaw.mock.calls.find((c: unknown[]) =>
      sqlOf(c).includes('UPDATE email_records')
    )!;
    expect(mailCall).toContain(ERASED_NOTE);
    expect(statements.some((s: string) => s.includes('UPDATE ticket_activities'))).toBe(true);
    expect(statements.some((s: string) => s.includes('UPDATE chat_messages'))).toBe(true);
  });
});

describe('what the erasure covers and leaves', () => {
  it('counts the communications it erases', async () => {
    const counts = await communicationCounts(db({ ticket: ['k1', 'k2'] }) as never, 't1', 'a', IDS);
    expect(counts).toMatchObject({ tickets: 2, emailRecords: 0, chats: 0 });
  });

  it('leaves only deals, tasks and stored files on the checklist', async () => {
    const checklist = await remainingChecklist(db() as never, 't1', 'a', IDS);
    expect(Object.keys(checklist).sort()).toEqual([
      'deals',
      'storedChatAttachments',
      'storedEmailAttachments',
      'storedLeadFiles',
      'tasks',
    ]);
  });
});
