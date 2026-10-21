import { describe, expect, it } from 'vitest';
import { buildMime, type BuildMimeInput } from '../mime';

const base: BuildMimeInput = {
  recordId: 'crec123',
  from: { address: 'me@mail.example.invalid', name: 'Me Example' },
  to: ['a@example.invalid'],
  subject: 'Hello',
  html: '<p>Hi</p>',
};

describe('buildMime', () => {
  it('keeps the Message-ID within 255 characters (the stored column) for a very long domain', async () => {
    const label = (n: number) => 'd'.repeat(n);
    const domain = `${label(60)}.${label(60)}.${label(60)}.${label(40)}.example`;
    const { messageId } = await buildMime({
      ...base,
      recordId: 'c'.repeat(25),
      from: { address: `me@${domain}`, name: 'Me' },
    });
    expect(messageId.length).toBeLessThanOrEqual(255);
    // Still a domain of the sender: its rightmost labels, whole.
    const right = messageId.slice(messageId.indexOf('@') + 1, -1);
    expect(domain.endsWith(right)).toBe(true);
    expect(right.startsWith('.')).toBe(false);
  });

  it('sets From, To, Subject, a Message-ID on the sender domain and the record header', async () => {
    const { raw, messageId } = await buildMime(base);
    const text = raw.toString('utf8');
    expect(text).toMatch(/^From: Me Example <me@mail\.example\.invalid>$/m);
    expect(text).toMatch(/^To: a@example\.invalid$/m);
    expect(text).toMatch(/^Subject: Hello$/m);
    expect(messageId).toMatch(/^<crec123\.[0-9a-f]{16}@mail\.example\.invalid>$/);
    expect(text).toContain(`Message-ID: ${messageId}`);
    // Header names are case-insensitive (MailComposer writes X-Intelliflow-Record).
    expect(text).toMatch(/^X-IntelliFlow-Record: crec123\r?$/im);
    expect(text).toMatch(/^MIME-Version: 1\.0$/m);
  });

  it('adds Cc, Reply-To and (only when asked) Bcc', async () => {
    const withoutBcc = (
      await buildMime({
        ...base,
        cc: ['c@example.invalid'],
        bcc: ['b@example.invalid'],
        replyTo: 'r@example.invalid',
      })
    ).raw.toString('utf8');
    expect(withoutBcc).toMatch(/^Cc: c@example\.invalid$/m);
    expect(withoutBcc).toMatch(/^Reply-To: r@example\.invalid$/m);
    expect(withoutBcc).not.toMatch(/^Bcc:/m);

    const withBcc = (
      await buildMime({ ...base, bcc: ['b@example.invalid'], keepBcc: true })
    ).raw.toString('utf8');
    expect(withBcc).toMatch(/^Bcc: b@example\.invalid$/m);
  });

  it('encodes a non-ASCII subject (RFC 2047)', async () => {
    const text = (await buildMime({ ...base, subject: 'Relatório – São Paulo' })).raw.toString(
      'utf8'
    );
    expect(text).toMatch(/^Subject: =\?UTF-8\?/m);
    expect(text).not.toContain('Relatório');
  });

  it('attaches files as base64 parts', async () => {
    const text = (
      await buildMime({
        ...base,
        attachments: [
          {
            filename: 'report.pdf',
            content: Buffer.from('pdf-bytes'),
            contentType: 'application/pdf',
          },
        ],
      })
    ).raw.toString('utf8');
    expect(text).toMatch(/Content-Type: application\/pdf; name=report\.pdf/);
    expect(text).toContain(Buffer.from('pdf-bytes').toString('base64'));
  });

  it.each([
    ['subject', { subject: 'a\r\nBcc: x@example.invalid' }],
    ['from name', { from: { address: 'me@mail.example.invalid', name: 'Me\nX: y' } }],
    ['recipient', { to: ['a@example.invalid\r\nBcc: x@example.invalid'] }],
    ['reply-to', { replyTo: 'r@example.invalid\nX: y' }],
    ['record id', { recordId: 'crec\r\nX: y' }],
  ])('refuses a %s carrying a header injection', async (_label, patch) => {
    await expect(buildMime({ ...base, ...patch })).rejects.toThrow(/header/i);
  });
});
