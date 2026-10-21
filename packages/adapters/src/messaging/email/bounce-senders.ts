/**
 * Local parts that system bounce reports come from: `postmaster`,
 * `mailer-daemon`, and Microsoft Exchange's `MicrosoftExchange<hex>` NDR
 * sender. One list for the provider listing (oauth-mailbox) and the DSN
 * parser, so they cannot disagree (#970). Recognising the sender is never
 * enough to act on a report: the parser and the bounce reader also require
 * provider authentication, a trusted receiver and an entitled reporter (#961).
 */
const SYSTEM_SENDER_LOCAL_PART = /^(postmaster|mailer-daemon)$/i;
/** Exchange's NDR sender: `MicrosoftExchange` and exactly 32 hex characters (a GUID). */
const EXCHANGE_SENDER_LOCAL_PART = /^microsoftexchange[0-9a-f]{32}$/i;

/** Whether `localPart` (before the `@`) is a system bounce sender. */
export function isBounceSenderLocalPart(localPart: string): boolean {
  return SYSTEM_SENDER_LOCAL_PART.test(localPart) || isExchangeSenderLocalPart(localPart);
}

/**
 * Whether `localPart` is Exchange's NDR sender. Such a report is never entitled
 * through a provider domain (outlook.com and the like): real Exchange NDRs come
 * from the recipient's or the sending organisation's own domain (N-4).
 */
export function isExchangeSenderLocalPart(localPart: string): boolean {
  return EXCHANGE_SENDER_LOCAL_PART.test(localPart);
}

/** Whether `address` is from a system bounce sender. */
export function isBounceSenderAddress(address: string): boolean {
  const at = address.lastIndexOf('@');
  return at > 0 && isBounceSenderLocalPart(address.slice(0, at));
}
