/**
 * MVP-001: which mailbox kinds the sync reads, and whether a mailbox granted what reading needs.
 * Pure (no provider client), so the mailbox DTO can say whether replies are logged.
 */

/** Microsoft reports scopes bare ("Mail.Read") or as resource URIs (".../Mail.Read"). */
export function hasMailRead(scopes: readonly string[]): boolean {
  return scopes.some((s) => s === 'Mail.Read' || s.toLowerCase().endsWith('/mail.read'));
}

/** Zoho needs both read scopes: messages (list, content) and folders (the Inbox and Sent ids). */
export function hasZohoRead(scopes: readonly string[]): boolean {
  const granted = new Set(scopes.map((s) => s.toLowerCase()));
  const has = (area: string) =>
    granted.has(`zohomail.${area}.read`) || granted.has(`zohomail.${area}.all`);
  return has('messages') && has('folders');
}

/**
 * MVP-011: Gmail reads with gmail.readonly (or the wider modify / full-mail scopes, never asked
 * for). Google reports full URIs; a Workspace domain that does not trust Aurora grants send only.
 */
export function hasGmailRead(scopes: readonly string[]): boolean {
  const names = new Set(scopes.map((s) => s.toLowerCase().replace(/\/$/, '').split('/').pop()));
  return names.has('gmail.readonly') || names.has('gmail.modify') || names.has('mail.google.com');
}

/**
 * MVP-013: Google Calendar events. The connect asks for `calendar.events`; the wider `calendar` scope
 * (never asked for) also lets events be written. Google reports full URIs, and a user can untick the
 * calendar permission on the consent screen, so this is checked on what was granted.
 */
export function hasGoogleCalendar(scopes: readonly string[]): boolean {
  const names = new Set(scopes.map((s) => s.toLowerCase().replace(/\/$/, '').split('/').pop()));
  return names.has('calendar.events') || names.has('calendar');
}

/** The read-permission check per mailbox kind the sync reads. */
export const SYNC_READ_CHECKS: Readonly<
  Partial<Record<string, (scopes: readonly string[]) => boolean>>
> = {
  MICROSOFT: hasMailRead,
  ZOHO: hasZohoRead,
  GMAIL: hasGmailRead,
};
