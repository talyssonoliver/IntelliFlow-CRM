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

/** The read-permission check per mailbox kind the sync reads. */
export const SYNC_READ_CHECKS: Readonly<
  Partial<Record<string, (scopes: readonly string[]) => boolean>>
> = {
  MICROSOFT: hasMailRead,
  ZOHO: hasZohoRead,
};
