/**
 * Who may connect which mailbox, enforced on the server (so a lane or a person clicking "connect"
 * cannot get around it):
 *
 * 1. Allowlist. A tenant with an allowlist accepts only those addresses. The owner's own tenant has
 *    one built in (only the professional mailbox), because on 2026-11-22 a personal Gmail was
 *    connected to it and Aurora then imported mail from it. Other tenants have none unless they set
 *    MAILBOX_CONNECT_ALLOWLIST_<TENANT ID, upper-cased, other characters as _>=a@x.com,b@y.com in
 *    the API environment. An explicit list replaces the built-in one; there is no wildcard. Fail
 *    closed: an unset variable on the owner's tenant means the built-in list, never "anything".
 *    The sync also skips a mailbox that is not on its tenant's list (a mailbox connected before
 *    the list existed), and the connection test refuses to bring it back.
 * 2. Personal mailbox notice. A consumer address (gmail.com, outlook.com, yahoo.*, icloud.com, ...)
 *    is a personal mailbox: Aurora imports the mail it has with the tenant's leads and contacts, so
 *    the user confirms once (`acceptPersonal`) before it is connected.
 *
 * Customer issue register #58 (docs: ops/reviews/aurora-customer-issue-register.md).
 */
import { TRPCError } from '@trpc/server';

/** The owner's tenant and the only address that may be connected to it. */
export const OWNER_TENANT_ID = 'cmqgpih4e000004jyh6mmv87m';
const BUILT_IN_ALLOWLISTS: Readonly<Record<string, readonly string[]>> = {
  [OWNER_TENANT_ID]: ['talysson@leangency.com'],
};

/** The text of the personal-mailbox confirmation (the web shows the same words). */
export const PERSONAL_MAILBOX_NOTICE =
  'This looks like a personal mailbox. Aurora will import mail with your leads and contacts. Continue?';
/** The prefix of the refusal that asks for the confirmation. */
export const PERSONAL_MAILBOX_CODE = 'PERSONAL_MAILBOX';

const CONSUMER_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.co.uk',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'ymail.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'gmx.com',
  'gmx.co.uk',
  'gmx.net',
  'mail.com',
  'btinternet.com',
  'sky.com',
]);

const normalise = (address: string): string => address.trim().toLowerCase();

function domainOf(address: string): string {
  const at = normalise(address).lastIndexOf('@');
  return at < 0 ? '' : normalise(address).slice(at + 1);
}

/** True for a consumer mail domain: gmail.com and friends, and yahoo.* (yahoo.com, yahoo.co.uk ...). */
export function isConsumerMailAddress(address: string): boolean {
  const domain = domainOf(address);
  if (!domain) return false;
  return (
    CONSUMER_DOMAINS.has(domain) ||
    /^yahoo\.(com(\.[a-z]{2})?|co\.[a-z]{2}|[a-z]{2,3})$/.test(domain)
  );
}

/** The tenant's allowlist: from the environment, else the built-in one, else none (null). */
export function mailboxAllowlist(
  tenantId: string,
  env: NodeJS.ProcessEnv = process.env
): string[] | null {
  const configured =
    env[
      `MAILBOX_CONNECT_ALLOWLIST_${tenantId.toUpperCase().replaceAll(/[^A-Z0-9]/g, '_')}`
    ]?.trim();
  if (configured) {
    return configured
      .split(',')
      .map(normalise)
      .filter((entry) => entry.length > 0);
  }
  const builtIn = BUILT_IN_ALLOWLISTS[tenantId];
  return builtIn ? [...builtIn] : null;
}

/** Refuses an address that is not on the tenant's allowlist. A tenant without one is unaffected. */
export function assertMailboxAllowed(
  tenantId: string,
  address: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): void {
  const allowed = mailboxAllowlist(tenantId, env);
  if (!allowed) return;
  if (address && allowed.includes(normalise(address))) return;
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: `MAILBOX_NOT_ALLOWED: Only ${allowed.join(', ')} can be connected to this workspace. This mailbox was not connected.`,
  });
}

/**
 * Asks for the confirmation before a consumer address is connected. `scope` rides in the message
 * so the sign-in page can start the same connection again with the confirmation given.
 */
export function assertPersonalConfirmed(
  address: string | null | undefined,
  accepted: boolean | undefined,
  scope: string
): void {
  if (!address || accepted === true || !isConsumerMailAddress(address)) return;
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: `${PERSONAL_MAILBOX_CODE}:${scope}: ${PERSONAL_MAILBOX_NOTICE}`,
  });
}

/** What a mailbox signs in and sends as: the provider account, else the from address and any address-shaped login. */
export interface MailboxIdentity {
  accountAddress?: string | null;
  fromAddress?: string | null;
  smtpUsername?: string | null;
  imapUsername?: string | null;
}

/** The address-shaped identities of a mailbox (an OAuth mailbox is its verified account address). */
export function mailboxIdentities(mailbox: MailboxIdentity): string[] {
  const identities = mailbox.accountAddress
    ? [mailbox.accountAddress]
    : [mailbox.fromAddress, mailbox.smtpUsername, mailbox.imapUsername];
  return identities.filter((a): a is string => typeof a === 'string' && a.includes('@'));
}

/** The allowlist check over every identity of the mailbox; a mailbox with none is refused when a list applies. */
export function assertIdentitiesAllowed(
  tenantId: string,
  mailbox: MailboxIdentity,
  env: NodeJS.ProcessEnv = process.env
): void {
  const identities = mailboxIdentities(mailbox);
  if (identities.length === 0) assertMailboxAllowed(tenantId, null, env);
  for (const address of identities) assertMailboxAllowed(tenantId, address, env);
}
