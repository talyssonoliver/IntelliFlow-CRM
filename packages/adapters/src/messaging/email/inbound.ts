/**
 * Inbound Email Parser
 *
 * Handles parsing and processing of inbound emails with support for:
 * - MIME parsing
 * - Attachment extraction
 * - Thread detection
 * - Spam/phishing detection
 *
 * KPI Target: Parse accuracy >= 99%
 */

import { z } from 'zod';
import { createHash } from 'crypto';

// Parsed email address schema
export const ParsedEmailAddressSchema = z.object({
  address: z.string().email(),
  name: z.string().optional(),
  raw: z.string(),
});

// Parsed attachment schema
export const ParsedAttachmentSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
  content: z.instanceof(Buffer),
  contentId: z.string().optional(),
  isInline: z.boolean(),
  checksum: z.string(), // SHA256 for integrity verification
});

// Email headers schema
export const EmailHeadersSchema = z.object({
  messageId: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.array(z.string()).optional(),
  subject: z.string(),
  date: z.date().optional(),
  from: ParsedEmailAddressSchema,
  to: z.array(ParsedEmailAddressSchema),
  cc: z.array(ParsedEmailAddressSchema).optional(),
  bcc: z.array(ParsedEmailAddressSchema).optional(),
  replyTo: ParsedEmailAddressSchema.optional(),
  listUnsubscribe: z.string().optional(),
  dkim: z.enum(['pass', 'fail', 'none']).optional(),
  spf: z.enum(['pass', 'fail', 'softfail', 'neutral', 'none']).optional(),
  dmarc: z.enum(['pass', 'fail', 'none']).optional(),
  receivedSpf: z.string().optional(),
  xOriginalTo: z.string().optional(),
  custom: z.record(z.string(), z.string()).optional(),
});

// Parsed email schema
export const ParsedEmailSchema = z.object({
  id: z.string(),
  headers: EmailHeadersSchema,
  textBody: z.string().optional(),
  htmlBody: z.string().optional(),
  attachments: z.array(ParsedAttachmentSchema),
  rawSize: z.number(),
  parsedAt: z.date(),
  threadId: z.string().optional(),
  isReply: z.boolean(),
  isForward: z.boolean(),
  spamScore: z.number().min(0).max(100).optional(),
  phishingIndicators: z.array(z.string()).optional(),
  parseErrors: z.array(z.string()).optional(),
});

export type ParsedEmailAddress = z.infer<typeof ParsedEmailAddressSchema>;
export type ParsedAttachment = z.infer<typeof ParsedAttachmentSchema>;
export type EmailHeaders = z.infer<typeof EmailHeadersSchema>;
export type ParsedEmail = z.infer<typeof ParsedEmailSchema>;

// Thread detection result
export interface ThreadInfo {
  threadId: string;
  position: number;
  parentMessageId?: string;
  isOriginal: boolean;
}

// Spam analysis result
export interface SpamAnalysis {
  score: number;
  reasons: string[];
  isSpam: boolean;
  isPhishing: boolean;
  indicators: {
    suspiciousLinks: string[];
    urgentLanguage: boolean;
    spoofedSender: boolean;
    mismatchedDomains: boolean;
  };
}

/**
 * Email address parser
 */
export function parseEmailAddress(raw: string): ParsedEmailAddress {
  const trimmed = raw.trim();

  // Pattern: "Name" <email@example.com> or Name <email@example.com>
  const namedMatch = trimmed.match(/^"?([^"<]+)"?\s*<([^>]+)>$/);
  if (namedMatch) {
    return {
      address: namedMatch[2].trim().toLowerCase(),
      name: namedMatch[1].trim(),
      raw: trimmed,
    };
  }

  // Pattern: <email@example.com>
  const bracketMatch = trimmed.match(/^<([^>]+)>$/);
  if (bracketMatch) {
    return {
      address: bracketMatch[1].trim().toLowerCase(),
      raw: trimmed,
    };
  }

  // Pattern: email@example.com
  return {
    address: trimmed.toLowerCase(),
    raw: trimmed,
  };
}

/**
 * Parse multiple email addresses from a header value
 */
export function parseEmailAddresses(header: string): ParsedEmailAddress[] {
  if (!header) return [];

  // Split by comma, but not within quotes
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let depth = 0;

  for (const char of header) {
    if (char === '"' && depth === 0) {
      inQuotes = !inQuotes;
    } else if (char === '<') {
      depth++;
    } else if (char === '>') {
      depth--;
    } else if (char === ',' && !inQuotes && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts.map(parseEmailAddress);
}

/**
 * MIME boundary parser
 */
export function parseMimeBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=["']?([^"';\s]+)["']?/i);
  return match ? match[1] : null;
}

/**
 * Decode quoted-printable content
 */
export function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Decode base64 content
 */
export function decodeBase64(input: string): Buffer {
  return Buffer.from(input.replace(/\s/g, ''), 'base64');
}

/**
 * Extract thread information from headers
 */
export function extractThreadInfo(headers: EmailHeaders): ThreadInfo {
  const references = headers.references || [];
  const inReplyTo = headers.inReplyTo;

  if (!inReplyTo && references.length === 0) {
    // This is an original message
    const threadId = headers.messageId || createHash('sha256')
      .update(`${headers.from.address}:${headers.subject}:${headers.date?.toISOString() || ''}`)
      .digest('hex')
      .slice(0, 16);

    return {
      threadId,
      position: 1,
      isOriginal: true,
    };
  }

  // This is a reply
  const threadId = references[0] || inReplyTo || createHash('sha256')
    .update(headers.subject.replace(/^(Re|Fwd|Fw):\s*/gi, ''))
    .digest('hex')
    .slice(0, 16);

  return {
    threadId,
    position: references.length + 1,
    parentMessageId: inReplyTo,
    isOriginal: false,
  };
}

/**
 * Detect if message is a forward
 */
export function isForwardedMessage(subject: string, body?: string): boolean {
  const forwardPatterns = [
    /^Fwd?:/i,
    /^Fw:/i,
    /^Forwarded:/i,
    /^\[Fwd:/i,
  ];

  if (forwardPatterns.some(p => p.test(subject))) {
    return true;
  }

  if (body) {
    const forwardIndicators = [
      '---------- Forwarded message ---------',
      '-------- Original Message --------',
      'Begin forwarded message:',
      '> From:',
    ];
    return forwardIndicators.some(indicator => body.includes(indicator));
  }

  return false;
}

/**
 * Detect if message is a reply
 */
export function isReplyMessage(subject: string, headers: EmailHeaders): boolean {
  const replyPatterns = [
    /^Re:/i,
    /^RE\[/i,
    /^AW:/i, // German
    /^SV:/i, // Scandinavian
  ];

  if (replyPatterns.some(p => p.test(subject))) {
    return true;
  }

  return !!headers.inReplyTo || (headers.references?.length || 0) > 0;
}

/**
 * Spam and phishing analyzer
 */
export class SpamAnalyzer {
  private suspiciousPatterns = [
    /urgent.*action.*required/i,
    /verify.*account.*immediately/i,
    /your.*account.*has.*been.*suspended/i,
    /click.*here.*to.*verify/i,
    /confirm.*your.*identity/i,
    /unusual.*activity.*detected/i,
    /password.*expire/i,
    /wire.*transfer/i,
    /inheritance.*claim/i,
    /lottery.*winner/i,
  ];

  private suspiciousLinkPatterns = [
    /bit\.ly/i,
    /tinyurl/i,
    /goo\.gl/i,
    /t\.co/i,
    /ow\.ly/i,
  ];

  analyze(email: ParsedEmail): SpamAnalysis {
    const reasons: string[] = [];
    let score = 0;
    const suspiciousLinks: string[] = [];

    // Check authentication results
    if (email.headers.dkim === 'fail') {
      score += 30;
      reasons.push('DKIM signature failed');
    }
    if (email.headers.spf === 'fail') {
      score += 30;
      reasons.push('SPF check failed');
    }
    if (email.headers.dmarc === 'fail') {
      score += 30;
      reasons.push('DMARC check failed');
    }

    // Check content
    const content = `${email.headers.subject} ${email.textBody || ''} ${email.htmlBody || ''}`;

    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(content)) {
        score += 10;
        reasons.push(`Suspicious pattern: ${pattern.source}`);
      }
    }

    // Check for suspicious links in HTML
    if (email.htmlBody) {
      const linkMatches = email.htmlBody.matchAll(/href=["']([^"']+)["']/gi);
      for (const match of linkMatches) {
        const url = match[1];
        for (const linkPattern of this.suspiciousLinkPatterns) {
          if (linkPattern.test(url)) {
            suspiciousLinks.push(url);
            score += 5;
          }
        }
      }
    }

    // Check for urgency language
    const urgentLanguage = /urgent|immediately|right away|asap|act now/i.test(content);
    if (urgentLanguage) {
      score += 5;
      reasons.push('Contains urgent language');
    }

    // Check for mismatched domains
    const fromDomain = email.headers.from.address.split('@')[1];
    const mismatchedDomains = email.htmlBody
      ? /href=["'][^"']*(?!.*fromDomain)[^"']*["']/i.test(email.htmlBody)
      : false;

    // Cap score at 100
    score = Math.min(score, 100);

    return {
      score,
      reasons,
      isSpam: score >= 50,
      isPhishing: score >= 70,
      indicators: {
        suspiciousLinks,
        urgentLanguage,
        spoofedSender: email.headers.spf === 'fail' || email.headers.dkim === 'fail',
        mismatchedDomains,
      },
    };
  }
}

/**
 * MIME part representation
 */
interface MimePart {
  headers: Record<string, string>;
  body: string | Buffer;
  contentType: string;
  contentTransferEncoding?: string;
  isAttachment: boolean;
  filename?: string;
  contentId?: string;
}

/**
 * Parse raw MIME content into parts
 */
export function parseMimeParts(raw: string, boundary?: string): MimePart[] {
  if (!boundary) {
    // Single part message
    const [headerSection, ...bodyParts] = raw.split(/\r?\n\r?\n/);
    const headers = parseHeaders(headerSection);
    const body = bodyParts.join('\n\n');

    return [{
      headers,
      body,
      contentType: headers['content-type'] || 'text/plain',
      contentTransferEncoding: headers['content-transfer-encoding'],
      isAttachment: false,
    }];
  }

  const parts: MimePart[] = [];
  const boundaryMarker = `--${boundary}`;
  const endMarker = `--${boundary}--`;

  const sections = raw.split(new RegExp(`${boundaryMarker}(?!-)`));

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.startsWith(endMarker.slice(2))) continue;

    const [headerSection, ...bodyParts] = trimmed.split(/\r?\n\r?\n/);
    if (!headerSection) continue;

    const headers = parseHeaders(headerSection);
    const body = bodyParts.join('\n\n');

    const contentType = headers['content-type'] || 'text/plain';
    const contentDisposition = headers['content-disposition'] || '';

    const isAttachment = contentDisposition.includes('attachment') ||
      (contentDisposition.includes('filename') && !contentDisposition.includes('inline'));

    const filenameMatch = contentDisposition.match(/filename=["']?([^"';\s]+)["']?/i);
    const filename = filenameMatch ? filenameMatch[1] : undefined;

    const contentIdMatch = headers['content-id']?.match(/<([^>]+)>/);
    const contentId = contentIdMatch ? contentIdMatch[1] : undefined;

    parts.push({
      headers,
      body,
      contentType,
      contentTransferEncoding: headers['content-transfer-encoding'],
      isAttachment,
      filename,
      contentId,
    });

    // Handle nested multipart
    const nestedBoundary = parseMimeBoundary(contentType);
    if (nestedBoundary && typeof body === 'string') {
      const nestedParts = parseMimeParts(body, nestedBoundary);
      parts.push(...nestedParts);
    }
  }

  return parts;
}

/**
 * Parse email headers from raw string
 */
export function parseHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);

  let currentKey = '';
  let currentValue = '';

  for (const line of lines) {
    if (line.match(/^\s+/)) {
      // Continuation of previous header
      currentValue += ' ' + line.trim();
    } else {
      // Save previous header
      if (currentKey) {
        headers[currentKey.toLowerCase()] = currentValue;
      }

      // Parse new header
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        currentKey = line.slice(0, colonIndex).trim();
        currentValue = line.slice(colonIndex + 1).trim();
      }
    }
  }

  // Save last header
  if (currentKey) {
    headers[currentKey.toLowerCase()] = currentValue;
  }

  return headers;
}

/**
 * Main inbound email parser
 */
export class InboundEmailParser {
  private spamAnalyzer: SpamAnalyzer;

  constructor() {
    this.spamAnalyzer = new SpamAnalyzer();
  }

  /**
   * Parse raw email content
   * KPI: Parse accuracy >= 99%
   */
  parse(raw: string | Buffer): ParsedEmail {
    const rawString = Buffer.isBuffer(raw) ? raw.toString('utf-8') : raw;
    const rawSize = Buffer.byteLength(rawString);
    const parseErrors: string[] = [];

    try {
      // Split headers from body
      const [headerSection, ...bodyParts] = rawString.split(/\r?\n\r?\n/);
      const rawHeaders = parseHeaders(headerSection);
      const rawBody = bodyParts.join('\n\n');

      // Parse email addresses
      const from = parseEmailAddress(rawHeaders['from'] || '');
      const to = parseEmailAddresses(rawHeaders['to'] || '');
      const cc = parseEmailAddresses(rawHeaders['cc'] || '');
      const bcc = parseEmailAddresses(rawHeaders['bcc'] || '');
      const replyTo = rawHeaders['reply-to'] ? parseEmailAddress(rawHeaders['reply-to']) : undefined;

      // Parse date
      let date: Date | undefined;
      try {
        date = rawHeaders['date'] ? new Date(rawHeaders['date']) : undefined;
      } catch {
        parseErrors.push('Invalid date header');
      }

      // Parse references
      const references = rawHeaders['references']
        ? rawHeaders['references'].split(/\s+/).filter(Boolean)
        : undefined;

      // Build headers object
      const headers: EmailHeaders = {
        messageId: rawHeaders['message-id']?.replace(/[<>]/g, ''),
        inReplyTo: rawHeaders['in-reply-to']?.replace(/[<>]/g, ''),
        references,
        subject: rawHeaders['subject'] || '(no subject)',
        date,
        from,
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        replyTo,
        listUnsubscribe: rawHeaders['list-unsubscribe'],
        dkim: this.parseDkimResult(rawHeaders['authentication-results']),
        spf: this.parseSpfResult(rawHeaders['authentication-results']),
        dmarc: this.parseDmarcResult(rawHeaders['authentication-results']),
        receivedSpf: rawHeaders['received-spf'],
        xOriginalTo: rawHeaders['x-original-to'],
      };

      // Parse MIME parts
      const contentType = rawHeaders['content-type'] || 'text/plain';
      const boundary = parseMimeBoundary(contentType);
      const parts = parseMimeParts(rawBody, boundary || undefined);

      // Extract text and HTML bodies
      let textBody: string | undefined;
      let htmlBody: string | undefined;
      const attachments: ParsedAttachment[] = [];

      for (const part of parts) {
        if (part.isAttachment && part.filename) {
          // Process attachment
          let content: Buffer;
          if (part.contentTransferEncoding === 'base64') {
            content = decodeBase64(part.body as string);
          } else if (part.contentTransferEncoding === 'quoted-printable') {
            content = Buffer.from(decodeQuotedPrintable(part.body as string));
          } else {
            content = Buffer.isBuffer(part.body) ? part.body : Buffer.from(part.body);
          }

          attachments.push({
            filename: part.filename,
            contentType: part.contentType.split(';')[0].trim(),
            size: content.length,
            content,
            contentId: part.contentId,
            isInline: part.headers['content-disposition']?.includes('inline') || false,
            checksum: createHash('sha256').update(content).digest('hex'),
          });
        } else if (part.contentType.startsWith('text/plain') && !textBody) {
          textBody = this.decodeBody(part);
        } else if (part.contentType.startsWith('text/html') && !htmlBody) {
          htmlBody = this.decodeBody(part);
        }
      }

      // Thread detection
      const threadInfo = extractThreadInfo(headers);
      const isReply = isReplyMessage(headers.subject, headers);
      const isForward = isForwardedMessage(headers.subject, textBody);

      // Generate email ID
      const id = headers.messageId || createHash('sha256')
        .update(`${from.address}:${headers.subject}:${date?.toISOString() || Date.now()}`)
        .digest('hex')
        .slice(0, 32);

      const email: ParsedEmail = {
        id,
        headers,
        textBody,
        htmlBody,
        attachments,
        rawSize,
        parsedAt: new Date(),
        threadId: threadInfo.threadId,
        isReply,
        isForward,
        parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
      };

      // Spam analysis
      const spamAnalysis = this.spamAnalyzer.analyze(email);
      email.spamScore = spamAnalysis.score;
      email.phishingIndicators = spamAnalysis.indicators.suspiciousLinks;

      return email;
    } catch (error) {
      // Return minimal parsed email on error
      return {
        id: createHash('sha256').update(rawString.slice(0, 1000)).digest('hex').slice(0, 32),
        headers: {
          subject: '(parse error)',
          from: { address: 'unknown@example.com', raw: 'unknown' },
          to: [],
        },
        attachments: [],
        rawSize,
        parsedAt: new Date(),
        isReply: false,
        isForward: false,
        parseErrors: [error instanceof Error ? error.message : 'Unknown parse error'],
      };
    }
  }

  private decodeBody(part: MimePart): string {
    if (part.contentTransferEncoding === 'base64') {
      return decodeBase64(part.body as string).toString('utf-8');
    } else if (part.contentTransferEncoding === 'quoted-printable') {
      return decodeQuotedPrintable(part.body as string);
    }
    return typeof part.body === 'string' ? part.body : part.body.toString('utf-8');
  }

  private parseDkimResult(authResults?: string): 'pass' | 'fail' | 'none' | undefined {
    if (!authResults) return undefined;
    if (/dkim=pass/i.test(authResults)) return 'pass';
    if (/dkim=fail/i.test(authResults)) return 'fail';
    if (/dkim=none/i.test(authResults)) return 'none';
    return undefined;
  }

  private parseSpfResult(authResults?: string): 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | undefined {
    if (!authResults) return undefined;
    if (/spf=pass/i.test(authResults)) return 'pass';
    if (/spf=fail/i.test(authResults)) return 'fail';
    if (/spf=softfail/i.test(authResults)) return 'softfail';
    if (/spf=neutral/i.test(authResults)) return 'neutral';
    if (/spf=none/i.test(authResults)) return 'none';
    return undefined;
  }

  private parseDmarcResult(authResults?: string): 'pass' | 'fail' | 'none' | undefined {
    if (!authResults) return undefined;
    if (/dmarc=pass/i.test(authResults)) return 'pass';
    if (/dmarc=fail/i.test(authResults)) return 'fail';
    if (/dmarc=none/i.test(authResults)) return 'none';
    return undefined;
  }
}

// Export singleton instance
export const inboundEmailParser = new InboundEmailParser();

// Export factory function
export function createInboundEmailParser(): InboundEmailParser {
  return new InboundEmailParser();
}
