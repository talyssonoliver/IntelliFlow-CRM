/**
 * Delivery-status notification (RFC 3464) parser for the PG-207 bounce reader.
 *
 * Bounce mail is untrusted input from anyone who can mail the mailbox, so the
 * parser is deliberately narrow (CA-18/SEC-09): it accepts only
 * `multipart/report; report-type=delivery-status`, caps size and part count,
 * never renders anything, and returns only the per-recipient status fields
 * plus the two ids that let the caller match the report to an email we sent
 * (`X-IntelliFlow-Record` and the original `Message-ID`). The diagnostic text
 * is truncated, stripped of control characters and has addresses redacted,
 * so no third-party content is stored. Malformed input returns null; it never
 * throws.
 */
import { EMAIL_LIMITS } from '@intelliflow/domain';
import { parseHeaders, parseMimeBoundary, parseMimeParts } from './inbound';

export interface DsnRecipient {
  recipient: string;
  action: string;
  status: string;
  diagnostic: string | null;
}

export interface ParsedDsn {
  reportingMta: string | null;
  recordId: string | null;
  originalMessageId: string | null;
  recipients: DsnRecipient[];
}

const MAX_PARTS = 20;
/**
 * Every recipient a send can have (a report about a full send must not lose
 * any), and no more: the cap bounds what one forged report can store.
 */
const MAX_RECIPIENTS = EMAIL_LIMITS.maxRecipients;
const ADDRESS = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,255}$/;

/** Replaces every whitespace-separated token containing "@" (linear, no backtracking). */
function redactAddresses(value: string): string {
  return value
    .split(/\s+/)
    .map((token) => (token.includes('@') ? '[address]' : token))
    .join(' ');
}

/** Turns control characters (C0 and DEL) into spaces without a control-character regex. */
function stripControlCharacters(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    out += code < 32 || code === 127 ? ' ' : ch;
  }
  return out;
}

function splitHeadBody(raw: string): [string, string] {
  const match = /\r?\n\r?\n/.exec(raw);
  if (!match) return [raw, ''];
  return [raw.slice(0, match.index), raw.slice(match.index + match[0].length)];
}

function cleanDiagnostic(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = redactAddresses(stripControlCharacters(value.replace(/^[a-z0-9-]+;\s*/i, '')))
    .trim()
    .slice(0, EMAIL_LIMITS.maxDiagnosticLength);
  return cleaned || null;
}

function recipientAddress(fields: Record<string, string>): string | null {
  const raw = fields['final-recipient'] ?? fields['original-recipient'];
  if (!raw) return null;
  const address = raw
    .replace(/^[a-z0-9-]+;\s*/i, '')
    .replace(/^<|>$/g, '')
    .trim()
    .toLowerCase();
  return ADDRESS.test(address) ? address : null;
}

function bodyText(body: string | Buffer | undefined): string {
  if (body === undefined) return '';
  return typeof body === 'string' ? body : body.toString('utf8');
}

export function parseDsn(raw: string): ParsedDsn | null {
  try {
    if (!raw || Buffer.byteLength(raw, 'utf8') > EMAIL_LIMITS.bounceScanMaxMessageBytes)
      return null;

    const [head, body] = splitHeadBody(raw);
    const contentType = parseHeaders(head)['content-type'] ?? '';
    if (!/^multipart\/report\b/i.test(contentType)) return null;
    if (!/report-type\s*=\s*"?delivery-status"?/i.test(contentType)) return null;
    const boundary = parseMimeBoundary(contentType);
    if (!boundary) return null;

    const parts = parseMimeParts(body, boundary);
    if (parts.length === 0 || parts.length > MAX_PARTS) return null;

    const statusPart = parts.find((p) => /^message\/delivery-status\b/i.test(p.contentType));
    if (!statusPart) return null;

    const blocks = bodyText(statusPart.body)
      .split(/\r?\n\s*\r?\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => parseHeaders(block));
    const [perMessage = {}, ...perRecipient] = blocks;

    const recipients: DsnRecipient[] = [];
    for (const fields of perRecipient.slice(0, MAX_RECIPIENTS)) {
      const recipient = recipientAddress(fields);
      if (!recipient) continue;
      recipients.push({
        recipient,
        action: (fields['action'] ?? '').trim().toLowerCase(),
        status: (fields['status'] ?? '').trim(),
        diagnostic: cleanDiagnostic(fields['diagnostic-code']),
      });
    }

    const original = parts.find((p) =>
      /^(message\/rfc822|text\/rfc822-headers)\b/i.test(p.contentType)
    );
    const originalHeaders = original ? parseHeaders(splitHeadBody(bodyText(original.body))[0]) : {};

    return {
      reportingMta: perMessage['reporting-mta']?.replace(/^[a-z0-9-]+;\s*/i, '').trim() || null,
      recordId: originalHeaders['x-intelliflow-record']?.trim() || null,
      originalMessageId: originalHeaders['message-id']?.trim() || null,
      recipients,
    };
  } catch {
    return null;
  }
}
