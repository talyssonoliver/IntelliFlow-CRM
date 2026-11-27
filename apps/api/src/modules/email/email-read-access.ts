/**
 * Who may read an email record: ONE rule, used by the email view (getEmail, getThread) and the
 * attachment proxy, so an attachment is never served to someone the email is not shown to, nor
 * refused to someone it is shown to.
 *
 * Register #64 (owner decision 26/11/2026): personal mail is private. This is the INTERIM
 * implementation of that policy for these three readers. It mirrors, rule for rule, the shared
 * predicate of the parallel PR (fix/personal-mail-private, packages/db/src/email-visibility.ts,
 * `emailVisibleSql` / `emailVisibilityWhere`). When that PR merges, `canReadEmailRecord` is replaced
 * by a call to that predicate and the tests here become its callers' tests.
 *
 *  - A draft is visible only to the person writing it.
 *  - Mail in the company mailbox (scope TENANT) is visible to the tenant.
 *  - Mail in a user's own mailbox (scope USER) is visible only to that user.
 *  - Mail with no mailbox: unowned inbound mail (no user, no mailboxOwnerId) is visible to the
 *    tenant; otherwise only to its owner (userId or metadata.mailboxOwnerId).
 *  - Mail logged to a lead or contact (contactId, or metadata.leadId) is also visible to whoever can
 *    see that lead or contact: createTenantWhereClause scope (admin all, manager the team, else the
 *    owner).
 *  - There is NO admin override for personal mail.
 */
import { createTenantWhereClause } from '../../security/tenant-context';
import type { EmailRouterCtx } from './email-access';

/** What the rule reads from an email record (select these with `mailbox: { select: { scope, userId } }`). */
export interface ReadableEmail {
  userId: string | null;
  mailboxId?: string | null;
  contactId?: string | null;
  metadata: unknown;
  mailbox?: { scope: string; userId: string | null } | null;
}

/** The record fields and relation the rule needs, for a Prisma `select` or `include`. */
export const READABLE_EMAIL_SELECT = {
  userId: true,
  mailboxId: true,
  contactId: true,
  metadata: true,
  mailbox: { select: { scope: true, userId: true } },
} as const;

type Decision = 'yes' | 'no' | 'logged';

/** The part of the rule that needs no lookup; 'logged' = only visible if logged to a visible person. */
function decide(userId: string, email: ReadableEmail): Decision {
  const meta = (email.metadata as { isDraft?: unknown; mailboxOwnerId?: unknown } | null) ?? {};
  if (meta.isDraft === true && email.userId !== userId) return 'no';
  const mailbox = email.mailbox;
  if (mailbox?.scope === 'TENANT') return 'yes';
  if (mailbox?.scope === 'USER' && mailbox.userId === userId) return 'yes';
  const noMailbox = !email.mailboxId;
  const owner = typeof meta.mailboxOwnerId === 'string' ? meta.mailboxOwnerId : null;
  if (noMailbox && email.userId === null && owner === null) return 'yes';
  if (noMailbox && (email.userId === userId || owner === userId)) return 'yes';
  return 'logged';
}

async function loggedToVisiblePerson(c: EmailRouterCtx, email: ReadableEmail): Promise<boolean> {
  const leadId = (email.metadata as { leadId?: unknown } | null)?.leadId;
  if (typeof leadId === 'string') {
    const lead = await c.prismaWithTenant.lead.findFirst({
      where: createTenantWhereClause(c.tenant as never, { id: leadId }),
      select: { id: true },
    });
    if (lead) return true;
  }
  if (email.contactId) {
    const contact = await c.prismaWithTenant.contact.findFirst({
      where: createTenantWhereClause(c.tenant as never, { id: email.contactId }),
      select: { id: true },
    });
    if (contact) return true;
  }
  return false;
}

export async function canReadEmailRecord(
  c: EmailRouterCtx,
  email: ReadableEmail
): Promise<boolean> {
  const decision = decide(c.tenant.userId, email);
  if (decision !== 'logged') return decision === 'yes';
  return loggedToVisiblePerson(c, email);
}
