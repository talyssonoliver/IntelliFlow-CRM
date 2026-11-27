/**
 * MVP-011 (register #57): automated mail is never an enquiry. One test per rule of the guard
 * (mail-sync-automated.ts), and the mail that must still become a lead: a real person, and a real
 * reply to our mail even when it carries bulk headers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tokens = vi.hoisted(() => ({
  getOAuthAccess: vi.fn(),
  hasOAuthClient: vi.fn((..._args: unknown[]) => true),
}));
vi.mock('../mailbox-transport', () => ({
  getOAuthAccess: tokens.getOAuthAccess,
  hasOAuthClient: tokens.hasOAuthClient,
  oauthClientEnvNames: () => [],
}));

import { runInboxSync } from '../outlook-inbox-sync';
import {
  bulkReason,
  isAutomatedAddress,
  machineReason,
  referencedMessageIds,
} from '../mail-sync-automated';
import { mail, round, setup } from './inbox-sync-harness';

function enquirySetup(messages: ReturnType<typeof mail>[], sentIds: string[] = []) {
  const own = { accountAddress: 'me@shop.example.invalid', fromAddress: 'me@shop.example.invalid' };
  const harness = setup({ mailbox: own, rounds: [round({ messages })] });
  const prisma = harness.prisma as any;
  prisma.contact.findFirst = vi.fn(async () => null);
  prisma.emailMailbox.findMany = vi.fn(async () => [own]);
  prisma.dsarRequest = { findFirst: vi.fn(async () => null) };
  prisma.leadNote = { create: vi.fn(async () => ({})) };
  prisma.lead.findFirst = vi.fn(async () => null);
  // The mail we sent: findFirst answers for the sent-mail lookup (a Message-ID filter) only.
  const realFind = prisma.emailRecord.findFirst;
  prisma.emailRecord.findFirst = vi.fn(async (args: any) => {
    const wanted: string[] | undefined = args?.where?.messageIdHeader?.in;
    if (wanted) return wanted.some((id) => sentIds.includes(id)) ? { id: 'sent-1' } : null;
    return realFind(args);
  });
  const createLead = vi.fn(async (props: any) => ({
    isFailure: false,
    value: { id: { value: `lead-${props.email}` } },
  }));
  harness.deps.createLead = createLead as never;
  return { ...harness, prisma, createLead };
}

async function leadsFor(messages: ReturnType<typeof mail>[], sentIds: string[] = []) {
  const { deps, createLead, prisma } = enquirySetup(messages, sentIds);
  await runInboxSync(deps);
  return { created: createLead.mock.calls.length, records: prisma.emailRecord.create.mock.calls };
}

const person = (overrides: Partial<ReturnType<typeof mail>> = {}) =>
  mail({ providerMessageId: 'x', fromAddress: 'sam@customer.example.invalid', ...overrides });

describe('automated mail never becomes a lead (register #57)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.getOAuthAccess.mockResolvedValue({ accessToken: 'access-for-tests', tokenVersion: 0 });
    tokens.hasOAuthClient.mockReturnValue(true);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  it('skips the Microsoft DMARC aggregate report that started this (dmarcreport@microsoft.com)', async () => {
    const result = await leadsFor([
      person({
        fromAddress: 'dmarcreport@microsoft.com',
        subject:
          'Report Domain: shop.example.invalid Submitter: protection.outlook.com Report-ID: 1',
      }),
    ]);
    expect(result.created).toBe(0);
    expect(result.records).toHaveLength(0); // no lead, so no log and no waiting entry
  });

  it.each([
    ['dmarc-reports@mail.example.invalid'],
    ['dmarc_noreply@mail.example.invalid'],
    ['noreply@mail.example.invalid'],
    ['no-reply@mail.example.invalid'],
    ['donotreply@mail.example.invalid'],
    ['do-not-reply@mail.example.invalid'],
    ['postmaster@mail.example.invalid'],
    ['mailer-daemon@mail.example.invalid'],
    ['abuse@mail.example.invalid'],
    ['bounce@mail.example.invalid'],
    ['bounces+abc123@mail.example.invalid'],
    ['bounce-1234@mail.example.invalid'],
    ['bounce1234@mail.example.invalid'],
    ['noreply-dmarc-support@mail.example.invalid'],
    ['dmarcreport@microsoft.com'],
    ['notifications@mail.example.invalid'],
  ])('skips the sender %s', async (fromAddress) => {
    expect(isAutomatedAddress(fromAddress)).toBe(true);
    expect((await leadsFor([person({ fromAddress })])).created).toBe(0);
  });

  it('does not take a person for a machine because of their name', () => {
    for (const address of [
      'sam@customer.example.invalid',
      'dmitri@customer.example.invalid',
      'abusan@customer.example.invalid',
      'dmarcus@customer.example.invalid',
      'bouncer@customer.example.invalid',
      'notify.me@customer.example.invalid',
    ]) {
      expect(isAutomatedAddress(address)).toBe(false);
    }
  });

  it('skips Auto-Submitted other than "no" and keeps Auto-Submitted: no', async () => {
    for (const value of [
      'auto-replied',
      'auto-generated',
      'Auto-Notified',
      '(by a rule) auto-replied',
    ]) {
      const message = person({ signals: { autoSubmitted: value } });
      expect(machineReason(message)).toBe('auto-submitted');
      expect((await leadsFor([message])).created).toBe(0);
    }
    const human = person({ signals: { autoSubmitted: '(a person) no; x-origin=human (typed)' } });
    expect(machineReason(human)).toBeNull();
    expect((await leadsFor([human])).created).toBe(1);
  });

  it('skips multipart/report, and a bare zip or gzip when the subject says report', async () => {
    const report = person({ signals: { contentType: 'multipart/report' } });
    expect(machineReason(report)).toBe('report-content-type');
    expect((await leadsFor([report])).created).toBe(0);
    for (const contentType of ['application/zip', 'application/gzip']) {
      const message = person({
        subject: 'Aggregate report for shop.example.invalid',
        signals: { contentType },
      });
      expect(machineReason(message)).toBe('report-attachment');
      expect((await leadsFor([message])).created).toBe(0);
    }
  });

  it('keeps a person whose whole mail is a zip, and one with an attachment (multipart/mixed)', async () => {
    const zip = person({
      subject: 'Plans for the extension',
      signals: { contentType: 'application/zip' },
    });
    expect((await leadsFor([zip])).created).toBe(1);
    const mixed = person({ signals: { contentType: 'multipart/mixed' } });
    expect((await leadsFor([mixed])).created).toBe(1);
  });

  it('skips the DMARC aggregate subject even where headers cannot be read (Zoho)', async () => {
    const message = person({
      subject: 'Report Domain: a.example.invalid Submitter: b.example.invalid Report-ID: 9',
    });
    expect(machineReason(message)).toBe('dmarc-report');
    expect((await leadsFor([message])).created).toBe(0);
  });

  it.each([
    ['List-Id', { listId: true }],
    ['List-Unsubscribe', { listUnsubscribe: true }],
    ['Precedence: bulk', { precedence: 'bulk' }],
    ['Precedence: junk', { precedence: 'Junk' }],
    ['Precedence: list', { precedence: 'list' }],
  ])('skips bulk mail with %s', async (_name, signals) => {
    const message = person({ signals });
    expect(bulkReason(message)).not.toBeNull();
    expect((await leadsFor([message])).created).toBe(0);
  });

  it('skips mail the reader flagged bulk (older flag)', async () => {
    expect((await leadsFor([person({ bulk: true })])).created).toBe(0);
  });

  it('still makes a lead of a real person writing for the first time', async () => {
    const result = await leadsFor([person({ subject: 'Boiler quote', signals: {} })]);
    expect(result.created).toBe(1);
    expect(result.records).toHaveLength(1);
  });

  it('still makes a lead of a real reply to our mail that carries List-Unsubscribe', async () => {
    const reply = person({
      signals: {
        listUnsubscribe: true,
        precedence: 'bulk',
        inReplyTo: '<ours-1@shop.example.invalid>',
        references: '<ours-0@shop.example.invalid> <ours-1@shop.example.invalid>',
      },
    });
    expect((await leadsFor([reply], ['<ours-1@shop.example.invalid>'])).created).toBe(1);
    // The Message-ID may be stored without its angle brackets.
    expect((await leadsFor([reply], ['ours-1@shop.example.invalid'])).created).toBe(1);
  });

  it('skips the same bulk headers when the reply names a mail we never sent', async () => {
    const stranger = person({
      signals: { listUnsubscribe: true, inReplyTo: '<someone-elses@other.example.invalid>' },
    });
    expect((await leadsFor([stranger], ['<ours-1@shop.example.invalid>'])).created).toBe(0);
  });

  it('a reply to our mail does not lift a machine rule (an auto-reply or a bounce is still a machine)', async () => {
    const autoReply = person({
      signals: { autoSubmitted: 'auto-replied', inReplyTo: '<ours-1@shop.example.invalid>' },
    });
    expect((await leadsFor([autoReply], ['<ours-1@shop.example.invalid>'])).created).toBe(0);
    const bounce = person({
      fromAddress: 'mailer-daemon@mail.example.invalid',
      signals: { inReplyTo: '<ours-1@shop.example.invalid>' },
    });
    expect((await leadsFor([bounce], ['<ours-1@shop.example.invalid>'])).created).toBe(0);
  });

  it('keeps the direct parent of a reply in a thread of more than 20 messages', () => {
    const thread = Array.from({ length: 30 }, (_, i) => `<m${i}@x.invalid>`);
    const ids = referencedMessageIds({
      inReplyTo: '<parent@x.invalid>',
      references: thread.join(' '),
    });
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe('<parent@x.invalid>');
    expect(ids).toContain('<m29@x.invalid>');
    expect(ids).not.toContain('<m0@x.invalid>');
  });

  it('reads the Message-IDs a reply names, once each', () => {
    expect(
      referencedMessageIds({
        inReplyTo: '<a@x.invalid>',
        references: '<b@x.invalid> <a@x.invalid>',
      })
    ).toEqual(['<a@x.invalid>', '<b@x.invalid>']);
    expect(referencedMessageIds(undefined)).toEqual([]);
  });
});
