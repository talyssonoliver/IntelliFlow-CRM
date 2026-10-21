import type { MailboxStatus } from './email-constants';

export interface SendingMailboxCandidate {
  id: string;
  status: MailboxStatus;
}

export interface ResolveSendingMailboxArgs<M extends SendingMailboxCandidate> {
  /** The sender's own mailbox (scope USER), whatever its status, or null. */
  userMailbox: M | null;
  /** The tenant's company mailbox (scope TENANT), or null. */
  tenantMailbox: M | null;
  /** Tenant setting `allowTenantMailboxFallback`. */
  allowFallback: boolean;
  /** Admins may always send through the company mailbox. */
  isAdmin: boolean;
}

export type ResolveSendingMailboxResult<M> =
  | { mailbox: M }
  | { refusal: 'NO_MAILBOX' | 'MAILBOX_ERROR' };

/**
 * Picks the mailbox user mail leaves from (ADR-085, owner rulings Q4/Q7).
 *
 * A user who has their own mailbox always sends from it; if it is broken the
 * send is refused rather than silently sent from the company address, so the
 * From identity never changes behind the user's back. The company mailbox is
 * used only by users without one, when the admin allowed it (or by admins).
 */
export function resolveSendingMailbox<M extends SendingMailboxCandidate>(
  args: ResolveSendingMailboxArgs<M>
): ResolveSendingMailboxResult<M> {
  const { userMailbox, tenantMailbox, allowFallback, isAdmin } = args;

  if (userMailbox) {
    return userMailbox.status === 'ACTIVE'
      ? { mailbox: userMailbox }
      : { refusal: 'MAILBOX_ERROR' };
  }

  if (tenantMailbox?.status === 'ACTIVE' && (allowFallback || isAdmin)) {
    return { mailbox: tenantMailbox };
  }

  return { refusal: 'NO_MAILBOX' };
}
