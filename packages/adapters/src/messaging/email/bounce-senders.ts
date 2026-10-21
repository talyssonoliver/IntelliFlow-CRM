/**
 * Local parts that system bounce reports come from: `postmaster`,
 * `mailer-daemon`, and Microsoft Exchange's `MicrosoftExchange<hex>` NDR
 * sender. One list for the provider listing (oauth-mailbox) and the DSN
 * parser, so they cannot disagree (#970). Recognising the sender is never
 * enough to act on a report: the parser and the bounce reader also require
 * provider authentication, a trusted receiver and an entitled reporter (#961).
 */
const BOUNCE_SENDER_LOCAL_PART = /^(postmaster|mailer-daemon|microsoftexchange[0-9a-f]*)$/i;

/** Whether `localPart` (before the `@`) is a system bounce sender. */
export function isBounceSenderLocalPart(localPart: string): boolean {
  return BOUNCE_SENDER_LOCAL_PART.test(localPart);
}

/** Whether `address` is from a system bounce sender. */
export function isBounceSenderAddress(address: string): boolean {
  const at = address.lastIndexOf('@');
  return at > 0 && isBounceSenderLocalPart(address.slice(0, at));
}
