import { describe, expect, it } from 'vitest';
import { parseDsn } from '../dsn-parser';
import { parseMimeBoundary } from '../inbound';
import { PASSING_AUTH, makeDsn } from './dsn-fixtures';

describe('parseDsn', () => {
  it('parses an RFC 3464 report with the original headers', () => {
    expect(parseDsn(makeDsn())).toEqual({
      reportingMta: 'mta.example.invalid',
      authenticated: true,
      reporterDomain: 'mta.example.invalid',
      recordId: 'crec123',
      originalMessageId: '<crec123.1@mail.example.invalid>',
      recipients: [
        { recipient: 'gone@example.invalid', action: 'failed', status: '5.1.1', diagnostic: null },
      ],
    });
  });

  it('reads the original headers from an embedded message/rfc822 part and CRLF line endings', () => {
    const parsed = parseDsn(makeDsn({ originalAs: 'rfc822', crlf: true }));
    expect(parsed?.recordId).toBe('crec123');
    expect(parsed?.originalMessageId).toBe('<crec123.1@mail.example.invalid>');
  });

  it('parses several recipients with soft and delayed statuses', () => {
    const parsed = parseDsn(
      makeDsn({
        recipients: [
          { address: 'Soft@Example.invalid', action: 'failed', status: '4.2.2' },
          { address: 'late@example.invalid', action: 'delayed', status: '4.4.7' },
        ],
      })
    );
    expect(parsed?.recipients).toEqual([
      { recipient: 'soft@example.invalid', action: 'failed', status: '4.2.2', diagnostic: null },
      { recipient: 'late@example.invalid', action: 'delayed', status: '4.4.7', diagnostic: null },
    ]);
  });

  it('keeps a short, address-redacted, control-free diagnostic', () => {
    const parsed = parseDsn(
      makeDsn({
        recipients: [
          {
            address: 'gone@example.invalid',
            action: 'failed',
            status: '5.1.1',
            diagnostic: `550 5.1.1 <gone@example.invalid> user unknown\u0007 ${'z'.repeat(400)}`,
          },
        ],
      })
    );
    const diagnostic = parsed?.recipients[0]?.diagnostic ?? '';
    expect(diagnostic).not.toContain('gone@example.invalid');
    expect(diagnostic).toContain('[address]');
    expect([...diagnostic].some((ch) => ch.charCodeAt(0) < 32)).toBe(false);
    expect(diagnostic.length).toBeLessThanOrEqual(200);
  });

  it('returns null ids when the original headers are missing', () => {
    const parsed = parseDsn(makeDsn({ originalAs: 'none' }));
    expect(parsed?.recordId).toBeNull();
    expect(parsed?.originalMessageId).toBeNull();
  });

  it.each([
    ['a non-report message', makeDsn({ topContentType: 'text/plain' })],
    ['a report of another type', makeDsn({ reportType: 'disposition-notification' })],
    [
      'a report with no boundary',
      makeDsn({ topContentType: 'multipart/report; report-type=delivery-status' }),
    ],
    ['too many parts', makeDsn({ extraParts: 30 })],
    ['an oversize message', makeDsn() + 'x'.repeat(300 * 1024)],
    ['garbage', 'not a mail at all'],
    ['empty input', ''],
  ])('returns null for %s (never throws)', (_label, raw) => {
    expect(parseDsn(raw)).toBeNull();
  });

  it('skips recipient blocks that are not addresses', () => {
    const parsed = parseDsn(
      makeDsn({ recipients: [{ address: 'not-an-address', action: 'failed', status: '5.1.1' }] })
    );
    expect(parsed?.recipients).toEqual([]);
  });

  it('treats a hostile boundary as a literal (no catastrophic backtracking)', () => {
    const boundary = '(a+)+$';
    const raw = [
      `Content-Type: multipart/report; report-type=delivery-status; boundary="${boundary}"`,
      '',
      `--${'a'.repeat(30_000)}!`,
      `--${boundary}`,
      'Content-Type: text/plain',
      '',
      'x',
      `--${boundary}--`,
    ].join('\n');
    const started = performance.now();
    expect(parseDsn(raw)).toBeNull(); // no delivery-status part
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('refuses a boundary longer than RFC 2046 allows', () => {
    expect(parseMimeBoundary(`multipart/report; boundary="${'b'.repeat(71)}"`)).toBeNull();
    expect(parseMimeBoundary(`multipart/report; boundary="${'b'.repeat(70)}"`)).toBe(
      'b'.repeat(70)
    );
  });

  describe('authenticated (#961: only a provider-verified mailer-daemon/postmaster report may act)', () => {
    const authOf = (options: Parameters<typeof makeDsn>[0]) =>
      parseDsn(makeDsn(options))?.authenticated;

    it('accepts mailer-daemon or postmaster with DKIM or SPF passing for its own domain', () => {
      expect(authOf({})).toBe(true);
      expect(
        authOf({
          from: 'postmaster@mta.example.invalid',
          authenticationResults: ['mx.example.invalid; spf=pass smtp.helo=out.mta.example.invalid'],
        })
      ).toBe(true);
      expect(
        authOf({
          authenticationResults: ['mx.example.invalid; dkim=pass header.i=@mta.example.invalid'],
        })
      ).toBe(true);
    });

    it('refuses a report with no Authentication-Results', () => {
      expect(authOf({ authenticationResults: null })).toBe(false);
    });

    it('refuses a report from anyone but mailer-daemon or postmaster (a forging recipient)', () => {
      expect(authOf({ from: 'Colleague <colleague@mta.example.invalid>' })).toBe(false);
    });

    it('refuses a pass for some other domain than the report’s sender', () => {
      expect(
        authOf({
          authenticationResults: [
            'mx.example.invalid; dkim=pass header.d=attacker.example.invalid; spf=pass smtp.mailfrom=attacker.example.invalid',
          ],
        })
      ).toBe(false);
      // A look-alike suffix is not a subdomain.
      expect(
        authOf({
          authenticationResults: ['mx.example.invalid; dkim=pass header.d=evilmta.example.invalid'],
        })
      ).toBe(false);
    });

    it('reads the Microsoft form, which has no authserv-id before the first result', () => {
      expect(
        authOf({
          authenticationResults: [
            'spf=pass (sender IP is 192.0.2.1) smtp.mailfrom=mta.example.invalid; dkim=none (message not signed)',
          ],
        })
      ).toBe(true);
    });

    it('ignores comments: a domain inside parentheses is not what passed', () => {
      expect(
        authOf({
          authenticationResults: [
            'mx.example.invalid; dkim=pass (x header.d=mta.example.invalid y) header.d=attacker.example.net',
          ],
        })
      ).toBe(false);
    });

    it('refuses a report with more than one From header', () => {
      const raw = makeDsn().replace(
        'From: Mail Delivery Subsystem',
        'From: Colleague <colleague@example.invalid>\nFrom: Mail Delivery Subsystem'
      );
      expect(parseDsn(raw)?.authenticated).toBe(false);
    });

    it('names the authenticated reporter domain, and none when unauthenticated', () => {
      expect(parseDsn(makeDsn())?.reporterDomain).toBe('mta.example.invalid');
      expect(parseDsn(makeDsn({ authenticationResults: null }))?.reporterDomain).toBeNull();
    });

    it('refuses fail, softfail and none', () => {
      expect(
        authOf({
          authenticationResults: [
            'mx.example.invalid; dkim=fail header.d=mta.example.invalid; spf=softfail smtp.helo=mta.example.invalid',
          ],
        })
      ).toBe(false);
    });

    it('reads only the topmost header (the receiving provider’s): a pass added lower down by the sender does not count', () => {
      expect(
        authOf({
          authenticationResults: [
            'mx.example.invalid; dkim=none; spf=fail smtp.helo=mta.example.invalid',
            PASSING_AUTH,
          ],
        })
      ).toBe(false);
    });
  });

  it('keeps every recipient a send can have, and no more than that', () => {
    const recipients = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        address: `r${i}@example.invalid`,
        action: 'failed',
        status: '5.1.1',
      }));
    // A send may have up to EMAIL_LIMITS.maxRecipients (100) recipients.
    expect(parseDsn(makeDsn({ recipients: recipients(80) }))?.recipients).toHaveLength(80);
    expect(parseDsn(makeDsn({ recipients: recipients(120) }))?.recipients).toHaveLength(100);
  });
});
