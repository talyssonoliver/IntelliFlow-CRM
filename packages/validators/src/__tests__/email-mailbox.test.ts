import { describe, expect, it } from 'vitest';
import {
  mailboxHostSchema,
  oauthCompleteInputSchema,
  oauthStartInputSchema,
  saveSmtpMailboxInputSchema,
  secretUpdateSchema,
} from '../email-mailbox';

const filler = (n: number) => 'x'.repeat(n);

const baseSmtp = {
  scope: 'USER' as const,
  smtpHost: 'smtp.mail.example.com',
  smtpPort: 587,
  smtpSecurity: 'STARTTLS' as const,
  smtpUsername: 'me@mail.example.com',
  fromAddress: 'me@mail.example.com',
  fromName: 'Me',
};

describe('mailboxHostSchema', () => {
  it.each([
    'smtp.gmail.com',
    'outlook.office365.com',
    'mail.example-host.co.uk',
    'SMTP.Example.Com',
  ])('accepts hostname %s', (host) => {
    expect(mailboxHostSchema.safeParse(host).success).toBe(true);
  });

  it('lower-cases and trims the host', () => {
    expect(mailboxHostSchema.parse('  SMTP.Example.Com ')).toBe('smtp.example.com');
  });

  it.each([
    ['scheme', 'smtp://smtp.example.com'],
    ['path', 'smtp.example.com/x'],
    ['port', 'smtp.example.com:587'],
    ['IPv4 literal', '8.8.8.8'],
    ['private IPv4 literal', '10.0.0.5'],
    ['IPv6 literal', '::1'],
    ['bracketed IPv6', '[2001:db8::1]'],
    ['hex shorthand', '0x7f.1'],
    ['integer shorthand', '2130706433'],
    ['localhost', 'localhost'],
    ['.localhost', 'mail.localhost'],
    ['.local', 'printer.local'],
    ['.internal', 'metadata.google.internal'],
    ['single label', 'mailserver'],
    ['non-ASCII (IDN)', 'mäil.example.com'],
    ['punycode label is allowed only as ASCII', 'xn--mil-noa.example.com'],
    ['leading hyphen', '-mail.example.com'],
    ['empty', ''],
    ['too long', `${'a'.repeat(250)}.com`],
  ])('rejects %s (%s)', (label, host) => {
    const result = mailboxHostSchema.safeParse(host);
    if (label === 'punycode label is allowed only as ASCII') {
      expect(result.success).toBe(true);
    } else {
      expect(result.success).toBe(false);
    }
  });
});

describe('secretUpdateSchema', () => {
  it('treats absent as keep, null as clear and a string as set', () => {
    expect(secretUpdateSchema.parse(undefined)).toBeUndefined();
    expect(secretUpdateSchema.parse(null)).toBeNull();
    expect(secretUpdateSchema.parse(filler(16))).toBe(filler(16));
  });

  it('rejects empty and over-long secrets', () => {
    expect(secretUpdateSchema.safeParse('').success).toBe(false);
    expect(secretUpdateSchema.safeParse(filler(513)).success).toBe(false);
  });
});

describe('saveSmtpMailboxInputSchema', () => {
  it('accepts a valid SMTP mailbox without IMAP', () => {
    expect(saveSmtpMailboxInputSchema.safeParse(baseSmtp).success).toBe(true);
  });

  it('accepts IMAP fields for bounce reading', () => {
    expect(
      saveSmtpMailboxInputSchema.safeParse({
        ...baseSmtp,
        imapHost: 'imap.mail.example.com',
        imapPort: 993,
        imapUsername: 'me@mail.example.com',
        imapPassword: filler(12),
      }).success
    ).toBe(true);
  });

  it.each([25, 143, 2526, 0, 70000])('rejects SMTP port %i', (smtpPort) => {
    expect(saveSmtpMailboxInputSchema.safeParse({ ...baseSmtp, smtpPort }).success).toBe(false);
  });

  it('rejects an IMAP port other than 993', () => {
    expect(
      saveSmtpMailboxInputSchema.safeParse({
        ...baseSmtp,
        imapHost: 'imap.example.com',
        imapPort: 143,
      }).success
    ).toBe(false);
  });

  it.each([
    ['CR in from name', { fromName: 'Me\r\nBcc: a@b.example' }],
    ['angle bracket in from name', { fromName: 'Me <x>' }],
    ['quote in from name', { fromName: 'Me "x"' }],
    ['bad from address', { fromAddress: 'not-an-address' }],
    ['CR in username', { smtpUsername: 'me\r\nX: y' }],
    ['unknown security', { smtpSecurity: 'NONE' }],
  ])('rejects %s', (_label, patch) => {
    expect(saveSmtpMailboxInputSchema.safeParse({ ...baseSmtp, ...patch }).success).toBe(false);
  });

  it('rejects unknown keys (tenantId and userId are never client-supplied)', () => {
    expect(saveSmtpMailboxInputSchema.safeParse({ ...baseSmtp, tenantId: 't' }).success).toBe(
      false
    );
    expect(saveSmtpMailboxInputSchema.safeParse({ ...baseSmtp, userId: 'u' }).success).toBe(false);
  });
});

describe('OAuth inputs', () => {
  it('accepts GMAIL and MICROSOFT providers for the user scope', () => {
    expect(oauthStartInputSchema.parse({ provider: 'GMAIL', scope: 'USER' })).toEqual({
      provider: 'GMAIL',
      scope: 'USER',
    });
    expect(oauthStartInputSchema.safeParse({ provider: 'SMTP', scope: 'USER' }).success).toBe(
      false
    );
  });

  it('requires a bounded code and state on completion', () => {
    expect(
      oauthCompleteInputSchema.safeParse({ provider: 'GMAIL', code: filler(40), state: filler(43) })
        .success
    ).toBe(true);
    expect(
      oauthCompleteInputSchema.safeParse({ provider: 'GMAIL', code: '', state: filler(43) }).success
    ).toBe(false);
    expect(
      oauthCompleteInputSchema.safeParse({
        provider: 'GMAIL',
        code: filler(5000),
        state: filler(43),
      }).success
    ).toBe(false);
  });
});
