/**
 * MVP-011 (register #57): the header facts that tell automated mail from a person's mail, read the
 * same way for every reader that can see headers (Gmail, Microsoft Graph). The enquiry guard in
 * apps/api (mail-sync-automated.ts) decides what they mean; this file only collects them.
 */

/** What a message's headers say about who or what sent it. Absent keys were not on the mail. */
export interface MailAutomationSignals {
  /** Auto-Submitted header value (RFC 3834): anything but "no" is a machine's mail. */
  autoSubmitted?: string;
  /** A List-Id header: mail from a mailing list. */
  listId?: boolean;
  /** A List-Unsubscribe header: bulk or marketing mail (a reply to us can carry it too). */
  listUnsubscribe?: boolean;
  /** Precedence header value (bulk, junk, list). */
  precedence?: string;
  /** The top-level Content-Type media type, lower case (multipart/report for bounces and reports). */
  contentType?: string;
  /** In-Reply-To header: the Message-ID of the mail this one answers. */
  inReplyTo?: string;
  /** References header: the Message-IDs of the thread so far. */
  references?: string;
}

/** Reads the signals from any header lookup (case-insensitive name -> value or null). */
export function readAutomationSignals(
  get: (name: string) => string | null | undefined
): MailAutomationSignals {
  const text = (name: string): string | undefined => get(name)?.trim() || undefined;
  const signals: MailAutomationSignals = {};
  const autoSubmitted = text('Auto-Submitted');
  if (autoSubmitted) signals.autoSubmitted = autoSubmitted;
  if (text('List-Id')) signals.listId = true;
  if (text('List-Unsubscribe')) signals.listUnsubscribe = true;
  const precedence = text('Precedence');
  if (precedence) signals.precedence = precedence;
  const contentType = text('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType) signals.contentType = contentType;
  const inReplyTo = text('In-Reply-To');
  if (inReplyTo) signals.inReplyTo = inReplyTo;
  const references = text('References');
  if (references) signals.references = references;
  return signals;
}

/** A lookup over a list of {name, value} headers (Gmail and Graph both return that shape). */
export function headerLookup(
  headers: ReadonlyArray<{ name?: string | null; value?: string | null }> | null | undefined
): (name: string) => string | null {
  return (name) => {
    const wanted = name.toLowerCase();
    return headers?.find((h) => h.name?.toLowerCase() === wanted)?.value ?? null;
  };
}
