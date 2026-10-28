/**
 * Builds the MIME for user mail sent from a user's mailbox (PG-207, ADR-085).
 *
 * One builder for every mailbox kind: SMTP sends the bytes as-is, Gmail takes
 * them as `raw`, Graph gets the same headers. nodemailer's MailComposer does the
 * RFC 2047 / base64 work, so nothing here concatenates header strings. Every
 * message carries our own `Message-ID` and `X-IntelliFlow-Record`, which is how
 * a bounce report is matched back to the email it refers to.
 */
import { randomBytes } from 'node:crypto';
import MailComposer from 'nodemailer/lib/mail-composer';
import { hasHeaderInjection } from '@intelliflow/domain';

export interface MimeAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface BuildMimeInput {
  /** EmailRecord id stamped as X-IntelliFlow-Record. */
  recordId: string;
  from: { address: string; name?: string | null };
  to: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  text?: string;
  attachments?: readonly MimeAttachment[];
  /** Gmail needs Bcc in the raw message; SMTP sends it in the envelope only. */
  keepBcc?: boolean;
}

export interface BuiltMime {
  raw: Buffer;
  messageId: string;
}

function assertHeaderSafe(values: ReadonlyArray<string | null | undefined>): void {
  for (const value of values) {
    if (value && hasHeaderInjection(value)) {
      throw new Error('Refusing to build a message: a header value contains a line break');
    }
  }
}

/** EmailRecord.messageIdHeader is VarChar(255). */
const MAX_MESSAGE_ID_LENGTH = 255;

/**
 * The sender's domain, or its rightmost whole labels when the whole would not
 * fit in `max` characters (a still-valid domain of the sender).
 */
function fitDomain(domain: string, max: number): string {
  const labels = domain.split('.');
  let fitted = labels.at(-1) ?? domain;
  for (let i = labels.length - 2; i >= 0; i--) {
    const next = `${labels[i]}.${fitted}`;
    if (next.length > max) break;
    fitted = next;
  }
  return fitted;
}

export async function buildMime(input: BuildMimeInput): Promise<BuiltMime> {
  assertHeaderSafe([
    input.recordId,
    input.subject,
    input.from.address,
    input.from.name,
    input.replyTo,
    ...input.to,
    ...(input.cc ?? []),
    ...(input.bcc ?? []),
    ...(input.attachments ?? []).map((a) => a.filename),
  ]);

  const domain = input.from.address.split('@')[1] ?? 'localhost';
  const local = `${input.recordId}.${randomBytes(8).toString('hex')}`;
  // `<local@domain>` fits the stored column (EmailRecord.messageIdHeader).
  const messageId = `<${local}@${fitDomain(domain, MAX_MESSAGE_ID_LENGTH - local.length - 3)}>`;

  const composer = new MailComposer({
    from: input.from.name
      ? { name: input.from.name, address: input.from.address }
      : input.from.address,
    to: [...input.to],
    cc: input.cc && input.cc.length > 0 ? [...input.cc] : undefined,
    bcc: input.bcc && input.bcc.length > 0 ? [...input.bcc] : undefined,
    replyTo: input.replyTo ?? undefined,
    subject: input.subject,
    html: input.html,
    text: input.text,
    messageId,
    headers: { 'X-IntelliFlow-Record': input.recordId },
    attachments: (input.attachments ?? []).map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const node = composer.compile();
  if (input.keepBcc) node.keepBcc = true;
  const raw = await node.build();
  return { raw, messageId };
}
