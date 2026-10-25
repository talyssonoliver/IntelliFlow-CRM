/**
 * PG-203 DSAR — fixed email templates (spec Addendum A; compliance R3/R4 wording).
 *
 * The sender is a stub: Resend is never called.
 */
import { describe, it, expect, vi } from 'vitest';
import type { DsarNotice } from '@intelliflow/application';
import { buildAdminNewRequestEmail, buildDsarEmail, createDsarEmailNotifier } from '../dsar-email';

const LINK =
  'https://app.example.invalid/dsar/smith-law/verify#r=clhrequest000000000.' + 'A'.repeat(43);
const DATE = new Date('2026-11-22T10:00:00Z');
const firmName = 'Smith & <Law>\r\nBcc: x@example.invalid';

type PersonNotice = Exclude<DsarNotice, { kind: 'ADMIN_NEW_REQUEST' }>;

const notices: PersonNotice[] = [
  {
    kind: 'VERIFY_LINK',
    to: 'ada@example.invalid',
    firmName,
    type: 'ACCESS',
    link: LINK,
    expiresAt: DATE,
  },
  { kind: 'VERIFIED', to: 'ada@example.invalid', firmName, type: 'ERASURE', dueDate: DATE },
  {
    kind: 'EXPORT_LINK',
    to: 'ada@example.invalid',
    firmName,
    link: LINK,
    expiresAt: DATE,
    withheld: true,
  },
  {
    kind: 'EXTENDED',
    to: 'ada@example.invalid',
    firmName,
    type: 'ACCESS',
    newDueDate: DATE,
    reason: 'Many records',
  },
  {
    kind: 'COMPLETED',
    to: 'ada@example.invalid',
    firmName,
    type: 'OBJECTION',
    marketingStopped: true,
    withheld: [],
  },
  {
    kind: 'REJECTED',
    to: 'ada@example.invalid',
    firmName,
    type: 'RECTIFICATION',
    reason: 'Accurate',
    late: true,
  },
  { kind: 'RESTRICTION_LIFTING', to: 'ada@example.invalid', firmName },
  { kind: 'ERASURE_LOGGED', to: 'ada@example.invalid', firmName },
  { kind: 'ERASURE_CANCELLED', to: 'ada@example.invalid', firmName, reason: 'Withdrawn' },
];

describe('buildDsarEmail', () => {
  it.each(notices.map((n) => [n.kind, n] as const))(
    '%s goes to the person, escapes the firm name and keeps the subject on one line',
    (_kind, notice) => {
      const email = buildDsarEmail(notice);
      expect(email.to).toEqual(['ada@example.invalid']);
      expect(email.subject).not.toMatch(/[\r\n]/);
      expect(email.htmlBody).not.toContain('<Law>');
      expect(email.htmlBody).toContain('&lt;Law&gt;');
    }
  );

  it.each([
    'EXPORT_LINK',
    'EXTENDED',
    'COMPLETED',
    'REJECTED',
    'RESTRICTION_LIFTING',
    'ERASURE_CANCELLED',
  ])('%s names the right to complain to the ICO', (kind) => {
    const email = buildDsarEmail(notices.find((n) => n.kind === kind)!);
    expect(email.textBody).toContain('ico.org.uk');
  });

  it('puts the token only inside the link of the verification email', () => {
    const email = buildDsarEmail(notices[0]!);
    expect(email.textBody).toContain(LINK);
    expect(email.htmlBody).toContain(`href="${LINK}"`);
    expect(email.subject).not.toContain('A'.repeat(43));
  });

  it('tells the person what was withheld from an access copy and why (codex: Art 15(4))', () => {
    const email = buildDsarEmail({
      kind: 'COMPLETED',
      to: 'ada@example.invalid',
      firmName,
      type: 'ACCESS',
      marketingStopped: false,
      withheld: [
        { category: 'NOTES', count: 2, reason: 'Legal professional\nprivilege <b>' },
        { category: 'EXCESS_ROWS', count: 10, reason: 'Over the export limit' },
      ],
    });
    expect(email.textBody).toContain('What it withheld, and why:');
    expect(email.textBody).toContain('Notes (2): Legal professional privilege <b>');
    expect(email.textBody).toContain('Records beyond the export limit (10): Over the export limit');
    expect(email.htmlBody).toContain('privilege &lt;b&gt;');
    expect(email.htmlBody).not.toContain('<b>');
  });

  it('names every new withheld category in plain words, with the admin reason escaped (Q23, Q26)', () => {
    const email = buildDsarEmail({
      kind: 'COMPLETED',
      to: 'ada@example.invalid',
      firmName,
      type: 'ACCESS',
      marketingStopped: false,
      withheld: [
        { category: 'DESCRIPTIONS', count: 2, reason: 'Names <i>a third party</i>' },
        { category: 'AI_TEXT', count: 3, reason: 'Reviewed by staff' },
        { category: 'STAFF_TEXT', count: 1, reason: 'Internal opinion' },
        { category: 'OTHER_RECORDS', count: 4, reason: 'Calendar entries of staff' },
      ],
    });
    expect(email.textBody).toContain('Deal and task descriptions (2): Names <i>a third party</i>');
    expect(email.textBody).toContain(
      'Text written by AI, such as insights and recommendations (3)'
    );
    expect(email.textBody).toContain('Tags, qualification notes and booking answers (1)');
    expect(email.textBody).toContain('Calendar events, notifications and experiment records (4)');
    // The reason the admin typed is shown to the person, escaped in the HTML part.
    expect(email.htmlBody).toContain('Names &lt;i&gt;a third party&lt;/i&gt;');
    expect(email.htmlBody).not.toContain('<i>');
  });

  it('adds no withholding lines when nothing was withheld', () => {
    const email = buildDsarEmail(notices.find((n) => n.kind === 'COMPLETED')!);
    expect(email.textBody).not.toContain('withheld');
  });

  it('says the firm confirmed marketing stopped, never that it stopped automatically', () => {
    const email = buildDsarEmail(notices[4]!);
    expect(email.textBody).toContain(
      'Your objection is recorded and the firm has confirmed that marketing to you has stopped.'
    );
  });

  it('flags a late rejection and tells the person what was withheld from an export', () => {
    expect(buildDsarEmail(notices[5]!).textBody).toContain('after the one-month deadline');
    expect(buildDsarEmail(notices[2]!).textBody).toContain('not in this file yet');
    expect(
      buildDsarEmail({
        ...(notices[2] as Extract<PersonNotice, { kind: 'EXPORT_LINK' }>),
        withheld: false,
      }).textBody
    ).not.toContain('not in this file yet');
  });
});

describe('buildAdminNewRequestEmail', () => {
  it('carries the type and due date only, no personal data', () => {
    const email = buildAdminNewRequestEmail(
      {
        kind: 'ADMIN_NEW_REQUEST',
        tenantId: 't1',
        requestId: 'r1',
        type: 'ERASURE',
        dueDate: DATE,
      },
      ['admin@example.invalid']
    );
    expect(email.to).toEqual(['admin@example.invalid']);
    expect(email.textBody).toContain('erasure');
    expect(email.textBody).toContain('22 November 2026');
  });
});

describe('createDsarEmailNotifier', () => {
  const admin: DsarNotice = {
    kind: 'ADMIN_NEW_REQUEST',
    tenantId: 't1',
    requestId: 'r1',
    type: 'ACCESS',
    dueDate: DATE,
  };

  it('sends person notices through the sender', async () => {
    const sendEmail = vi.fn().mockResolvedValue({ isFailure: false });
    const notifier = createDsarEmailNotifier({ sender: { sendEmail }, adminEmails: vi.fn() });
    await expect(notifier.send(notices[1]!)).resolves.toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('alerts the firm’s admins, and logs only the tenant id when there are none', async () => {
    const sendEmail = vi.fn().mockResolvedValue({ isFailure: false });
    const adminEmails = vi
      .fn()
      .mockResolvedValueOnce(['a@example.invalid'])
      .mockResolvedValueOnce([]);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const notifier = createDsarEmailNotifier({ sender: { sendEmail }, adminEmails });
    await expect(notifier.send(admin)).resolves.toBe(true);
    expect(sendEmail.mock.calls[0]![0].to).toEqual(['a@example.invalid']);
    await expect(notifier.send(admin)).resolves.toBe(false);
    expect(errors).toHaveBeenCalledWith('[dsar] No admin to alert about a new request', {
      tenantId: 't1',
    });
    errors.mockRestore();
  });

  it('never throws and never logs an address when sending fails', async () => {
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing = createDsarEmailNotifier({
      sender: { sendEmail: vi.fn().mockRejectedValue(new TypeError('network')) },
      adminEmails: vi.fn().mockRejectedValue(new Error('db down')),
    });
    // false (not delivered) is what lets the service keep a restriction in place.
    await expect(failing.send(notices[0]!)).resolves.toBe(false);
    await expect(failing.send(admin)).resolves.toBe(false);
    const refused = createDsarEmailNotifier({
      sender: { sendEmail: vi.fn().mockResolvedValue({ isFailure: true }) },
      adminEmails: vi.fn(),
    });
    await expect(refused.send(notices[1]!)).resolves.toBe(false);
    await expect(
      createDsarEmailNotifier({ sender: undefined, adminEmails: vi.fn() }).send(notices[1]!)
    ).resolves.toBe(false);
    const logged = JSON.stringify(warns.mock.calls);
    expect(logged).toContain('TypeError');
    expect(logged).not.toContain('ada@example.invalid');
    expect(logged).not.toContain('A'.repeat(43));
    warns.mockRestore();
  });
});
