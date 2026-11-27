/**
 * The one rule for who may read an email record, used by the email view (inboundEmailRouter.getEmail)
 * and by the attachment proxy (email-attachment-proxy.ts), so an attachment is never served to
 * someone the email itself is not shown to, nor refused to someone it is shown to.
 *
 * Today the rule is the email view's: the record is in the caller's tenant (the lookup is tenant
 * scoped) and a draft is private to the person writing it. The visibility predicate for personal
 * mailboxes (packages/db/src/email-visibility.ts, parallel PR fix/personal-mail-private) is meant
 * to replace the body of this function: whichever of the two PRs merges second switches to it here,
 * in one line, and both callers follow.
 */
export interface ReadableEmail {
  userId: string | null;
  metadata: unknown;
}

export function canReadEmailRecord(userId: string, record: ReadableEmail): boolean {
  const isDraft = (record.metadata as { isDraft?: unknown } | null)?.isDraft === true;
  return !isDraft || record.userId === userId;
}
