/**
 * Which way a lead's email went, for `lead.logActivity` (MVP-001).
 *
 * `logActivity` takes an optional `direction`, but the callers that logged replies before it
 * existed (import scripts, the owner's own tooling) send none, so a reply is stored as an EMAIL
 * titled "Reply received: ..." with no direction and the Emails tab reads it as "Sent". A reply
 * logged that way now stores `inbound`, so it reads correctly from the start. An explicit
 * direction always wins.
 */

export type ActivityDirection = 'inbound' | 'outbound';

const REPLY_RECEIVED_TITLE = /^reply received\b/i;

/** True for a title that says the lead wrote back: "Reply received: ...", dated or not. */
export function isReplyReceivedTitle(title: string): boolean {
  return REPLY_RECEIVED_TITLE.test(title.trim());
}

/** The direction to store: the one given, else inbound for an EMAIL titled "Reply received". */
export function activityDirection(input: {
  type: string;
  title: string;
  direction?: ActivityDirection | undefined;
}): ActivityDirection | undefined {
  if (input.direction) return input.direction;
  return input.type === 'EMAIL' && isReplyReceivedTitle(input.title) ? 'inbound' : undefined;
}

/** The `metadata` part of a new activity row: just the direction, or nothing. */
export function directionMetadata(input: {
  type: string;
  title: string;
  direction?: ActivityDirection | undefined;
}): { metadata: { direction: ActivityDirection } } | Record<string, never> {
  const direction = activityDirection(input);
  return direction ? { metadata: { direction } } : {};
}
