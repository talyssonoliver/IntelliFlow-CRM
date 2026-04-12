/**
 * Inbound Email Parser Additional Tests - covers uncovered paths
 * Targets: Buffer input, auth result parsing (softfail/neutral/none),
 * SpamAnalyzer patterns, forward/reply edge cases, full parse with attachments
 */

import { describe, it, expect } from 'vitest';
import {
  InboundEmailParser,
  SpamAnalyzer,
  parseEmailAddress,
  parseEmailAddresses,
  parseMimeBoundary,
  decodeQuotedPrintable,
  decodeBase64,
  extractThreadInfo,
  isForwardedMessage,
  isReplyMessage,
  parseMimeParts,
  parseHeaders,
  createInboundEmailParser,
} from '../inbound';

describe('InboundEmailParser - Buffer input', () => {
  it('should parse email from Buffer input', () => {
    const rawEmail = Buffer.from(
      [
        'From: sender@example.com',
        'To: recipient@test.com',
        'Subject: Buffer Test',
        '',
        'This is a test body.',
      ].join('\r\n')
    );

    const parser = new InboundEmailParser();
    const result = parser.parse(rawEmail);

    expect(result.headers.subject).toBe('Buffer Test');
    expect(result.headers.from.address).toBe('sender@example.com');
    expect(result.rawSize).toBeGreaterThan(0);
  });
});

describe('InboundEmailParser - auth result parsing', () => {
  it('should parse SPF softfail', () => {
    const raw = [
      'From: test@example.com',
      'To: me@example.com',
      'Subject: Auth test',
      'Authentication-Results: mx.example.com; spf=softfail; dkim=none; dmarc=none',
      '',
      'Body',
    ].join('\r\n');

    const parser = new InboundEmailParser();
    const result = parser.parse(raw);

    expect(result.headers.spf).toBe('softfail');
    expect(result.headers.dkim).toBe('none');
    expect(result.headers.dmarc).toBe('none');
  });

  it('should parse SPF neutral', () => {
    const raw = [
      'From: test@example.com',
      'To: me@example.com',
      'Subject: Auth test',
      'Authentication-Results: mx.example.com; spf=neutral',
      '',
      'Body',
    ].join('\r\n');

    const parser = new InboundEmailParser();
    const result = parser.parse(raw);

    expect(result.headers.spf).toBe('neutral');
  });

  it('should parse dkim=pass and spf=pass', () => {
    const raw = [
      'From: test@example.com',
      'To: me@example.com',
      'Subject: Auth test',
      'Authentication-Results: mx.example.com; dkim=pass; spf=pass; dmarc=pass',
      '',
      'Body',
    ].join('\r\n');

    const parser = new InboundEmailParser();
    const result = parser.parse(raw);

    expect(result.headers.dkim).toBe('pass');
    expect(result.headers.spf).toBe('pass');
    expect(result.headers.dmarc).toBe('pass');
  });

  it('should parse dkim=fail and spf=fail', () => {
    const raw = [
      'From: test@example.com',
      'To: me@example.com',
      'Subject: Auth test',
      'Authentication-Results: mx.example.com; dkim=fail; spf=fail; dmarc=fail',
      '',
      'Body',
    ].join('\r\n');

    const parser = new InboundEmailParser();
    const result = parser.parse(raw);

    expect(result.headers.dkim).toBe('fail');
    expect(result.headers.spf).toBe('fail');
    expect(result.headers.dmarc).toBe('fail');
  });
});

describe('SpamAnalyzer - content patterns', () => {
  it('should detect suspicious patterns in content', () => {
    const analyzer = new SpamAnalyzer();
    const email = {
      id: 'test-1',
      headers: {
        subject: 'URGENT ACTION REQUIRED - Verify your account immediately!',
        from: { address: 'phish@evil.com', raw: 'phish@evil.com' },
        to: [{ address: 'victim@example.com', raw: 'victim@example.com' }],
        dkim: 'fail' as const,
        spf: 'fail' as const,
        dmarc: 'fail' as const,
      },
      textBody: 'Click here to verify your identity. Your password will expire soon.',
      htmlBody: null,
      attachments: [],
      rawSize: 500,
      parsedAt: new Date(),
      isReply: false,
      isForward: false,
    };

    const result = analyzer.analyze(email as any);
    expect(result.score).toBeGreaterThan(50);
    expect(result.isSpam).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.indicators.urgentLanguage).toBe(true);
    expect(result.indicators.spoofedSender).toBe(true);
  });

  it('should detect suspicious links in HTML body', () => {
    const analyzer = new SpamAnalyzer();
    const email = {
      id: 'test-2',
      headers: {
        subject: 'Check this out',
        from: { address: 'sender@example.com', raw: 'sender@example.com' },
        to: [{ address: 'me@example.com', raw: 'me@example.com' }],
      },
      htmlBody:
        '<a href="https://bit.ly/abc123">Click here</a> <a href="https://tinyurl.com/xyz">And here</a>',
      attachments: [],
      rawSize: 200,
      parsedAt: new Date(),
      isReply: false,
      isForward: false,
    };

    const result = analyzer.analyze(email as any);
    expect(result.indicators.suspiciousLinks.length).toBeGreaterThan(0);
  });

  it('should return low score for clean email', () => {
    const analyzer = new SpamAnalyzer();
    const email = {
      id: 'test-3',
      headers: {
        subject: 'Meeting tomorrow',
        from: { address: 'colleague@work.com', raw: 'colleague@work.com' },
        to: [{ address: 'me@work.com', raw: 'me@work.com' }],
        dkim: 'pass' as const,
        spf: 'pass' as const,
      },
      textBody: 'Hi, can we meet at 2pm tomorrow?',
      htmlBody: null,
      attachments: [],
      rawSize: 100,
      parsedAt: new Date(),
      isReply: false,
      isForward: false,
    };

    const result = analyzer.analyze(email as any);
    expect(result.isSpam).toBe(false);
    expect(result.isPhishing).toBe(false);
  });
});

describe('Forward detection', () => {
  it('should detect Fwd: prefix', () => {
    expect(isForwardedMessage('Fwd: Important doc')).toBe(true);
  });

  it('should detect Fw: prefix', () => {
    expect(isForwardedMessage('Fw: FYI')).toBe(true);
  });

  it('should detect [Fwd: prefix', () => {
    expect(isForwardedMessage('[Fwd: Something]')).toBe(true);
  });

  it('should detect forwarded message body indicators', () => {
    expect(isForwardedMessage('Regular subject', '---------- Forwarded message ---------')).toBe(
      true
    );
    expect(isForwardedMessage('Regular subject', '-------- Original Message --------')).toBe(true);
    expect(isForwardedMessage('Regular subject', 'Begin forwarded message:')).toBe(true);
  });

  it('should return false for non-forwarded messages', () => {
    expect(isForwardedMessage('Hello world')).toBe(false);
    expect(isForwardedMessage('Hello world', 'Regular body text')).toBe(false);
  });
});

describe('Reply detection', () => {
  it('should detect Re: prefix', () => {
    const headers = {
      subject: 'Re: Previous email',
      from: { address: 'a@b.com', raw: '' },
      to: [],
    };
    expect(isReplyMessage('Re: Previous email', headers as any)).toBe(true);
  });

  it('should detect AW: prefix (German)', () => {
    const headers = {
      subject: 'AW: Vorherige E-Mail',
      from: { address: 'a@b.com', raw: '' },
      to: [],
    };
    expect(isReplyMessage('AW: Vorherige E-Mail', headers as any)).toBe(true);
  });

  it('should detect SV: prefix (Scandinavian)', () => {
    const headers = { subject: 'SV: Test', from: { address: 'a@b.com', raw: '' }, to: [] };
    expect(isReplyMessage('SV: Test', headers as any)).toBe(true);
  });

  it('should detect reply by In-Reply-To header', () => {
    const headers = {
      subject: 'No prefix',
      from: { address: 'a@b.com', raw: '' },
      to: [],
      inReplyTo: 'msg-123',
    };
    expect(isReplyMessage('No prefix', headers as any)).toBe(true);
  });

  it('should detect reply by references', () => {
    const headers = {
      subject: 'No prefix',
      from: { address: 'a@b.com', raw: '' },
      to: [],
      references: ['ref-1'],
    };
    expect(isReplyMessage('No prefix', headers as any)).toBe(true);
  });
});

describe('parseEmailAddresses', () => {
  it('should parse multiple addresses', () => {
    const result = parseEmailAddresses('John <john@test.com>, Jane <jane@test.com>');
    expect(result).toHaveLength(2);
  });

  it('should return empty for empty string', () => {
    expect(parseEmailAddresses('')).toEqual([]);
  });
});

describe('parseMimeBoundary', () => {
  it('should extract boundary from content type', () => {
    const result = parseMimeBoundary('multipart/mixed; boundary="abc123"');
    expect(result).toBe('abc123');
  });

  it('should return null when no boundary', () => {
    expect(parseMimeBoundary('text/plain; charset=utf-8')).toBeNull();
  });
});

describe('decodeQuotedPrintable', () => {
  it('should decode quoted-printable encoding', () => {
    expect(decodeQuotedPrintable('Hello=20World')).toBe('Hello World');
    expect(decodeQuotedPrintable('Line=\r\ncontinuation')).toBe('Linecontinuation');
  });
});

describe('extractThreadInfo', () => {
  it('should generate threadId for original message', () => {
    const headers = {
      messageId: 'msg-001',
      subject: 'New thread',
      from: { address: 'a@b.com', raw: '' },
      to: [],
    };
    const result = extractThreadInfo(headers as any);
    expect(result.isOriginal).toBe(true);
    expect(result.threadId).toBe('msg-001');
    expect(result.position).toBe(1);
  });

  it('should detect reply thread', () => {
    const headers = {
      inReplyTo: 'msg-001',
      references: ['msg-001'],
      subject: 'Re: New thread',
      from: { address: 'a@b.com', raw: '' },
      to: [],
    };
    const result = extractThreadInfo(headers as any);
    expect(result.isOriginal).toBe(false);
    expect(result.parentMessageId).toBe('msg-001');
    expect(result.position).toBe(2);
  });
});

describe('InboundEmailParser - parse error handling', () => {
  it('should return minimal email on parse error', () => {
    const parser = new InboundEmailParser();
    // Pass content that will cause a parsing error
    const result = parser.parse('');
    expect(result.headers.subject).toBeDefined();
  });
});

describe('createInboundEmailParser factory', () => {
  it('should return an InboundEmailParser instance', () => {
    const parser = createInboundEmailParser();
    expect(parser).toBeInstanceOf(InboundEmailParser);
  });
});
