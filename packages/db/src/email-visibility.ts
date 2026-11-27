// Register #64 (owner decision 26/11/2026): personal mail is private.
//
// THE visibility policy for `email_records`, defined once. Every read of a mail row (the inbox,
// a thread, the unread counts, the hover card, the waiting card, the activity feed, the lead's
// open rate...) ANDs this in, so who may read a mail is decided in this file and nowhere else.
//
//  - Mail in a user's OWN mailbox (`email_mailboxes.scope = 'USER'`) is visible only to that user.
//    That includes mail whose mailbox was removed since: it keeps its owner (`mailboxOwnerId` in
//    the metadata for synced mail, the sending `userId` for mail composed in the CRM).
//  - Mail logged to a lead or a contact (the customer conversation: `contactId` set, or
//    `metadata.leadId`) stays visible to whoever can see that lead or contact (the same
//    ownership scope as the lead and contact lists: admin all, manager the team, else the owner).
//  - The company mailbox (`scope = 'TENANT'`), and inbound mail with no mailbox and no owner,
//    stay visible to the tenant.
//  - A draft is visible only to the person writing it.
//  - There is NO admin override: an administrator reads a colleague's personal mail only when it
//    is logged to a lead or contact the administrator can see, like anyone else.
//
// Two forms of one rule: a Prisma `where` fragment (`emailVisibilityWhere`) and a SQL predicate
// (`emailVisibleSql`) for the raw queries. `tests/integration/email-visibility.test.ts` runs both
// against one database and asserts they return the same rows.
//
// No Prisma client is needed here: they build `where` fragments, like ./membership.

import { Prisma } from '../generated/prisma/client';

/** Who is reading: the active tenant, the user, and the scope that decides which leads they see. */
export interface MailViewer {
  tenantId: string;
  userId: string;
  /** The tenant role (`createTenantWhereClause` scope): ADMIN sees every lead and contact. */
  role?: string | null;
  /** A manager's team: they see the leads and contacts those members own. */
  teamMemberIds?: readonly string[] | null;
}

/** The slice of a Prisma client these helpers need. */
export interface MailVisibilityDb {
  $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T>;
}

/** The viewer from a tRPC tenant context (`ctx.tenant`). */
export function mailViewerOf(tenant: {
  tenantId: string;
  userId: string;
  role?: string | null;
  teamMemberIds?: readonly string[] | null;
}): MailViewer {
  return {
    tenantId: tenant.tenantId,
    userId: tenant.userId,
    role: tenant.role ?? null,
    teamMemberIds: tenant.teamMemberIds ?? null,
  };
}

/** `AND <alias>."ownerId" ...`: the leads/contacts this viewer can see (as createTenantWhereClause). */
function ownerScopeSql(viewer: MailViewer, alias: Prisma.Sql): Prisma.Sql {
  if (viewer.role === 'ADMIN') return Prisma.empty;
  if (viewer.role === 'MANAGER' && viewer.teamMemberIds?.length) {
    const ids = [viewer.userId, ...viewer.teamMemberIds];
    return Prisma.sql`AND ${alias}."ownerId" IN (${Prisma.join(ids)})`;
  }
  return Prisma.sql`AND ${alias}."ownerId" = ${viewer.userId}`;
}

/** True SQL for "this mail is logged to a lead or contact the viewer can see". */
function loggedToVisibleSql(viewer: MailViewer, mail: Prisma.Sql): Prisma.Sql {
  const contact = Prisma.sql`c`;
  const lead = Prisma.sql`l`;
  return Prisma.sql`(
    (${mail}."contactId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = ${mail}."contactId" AND c."tenantId" = ${viewer.tenantId}
        ${ownerScopeSql(viewer, contact)}))
    OR (jsonb_typeof(${mail}.metadata -> 'leadId') = 'string' AND EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = ${mail}.metadata ->> 'leadId' AND l."tenantId" = ${viewer.tenantId}
        ${ownerScopeSql(viewer, lead)}))
  )`;
}

/**
 * The SQL form of the policy, for a raw query over `email_records <mail>` LEFT JOINed to
 * `email_mailboxes <mailbox>` on `<mailbox>.id = <mail>."mailboxId"`. Returns a boolean expression.
 */
export function emailVisibleSql(
  viewer: MailViewer,
  aliases: { mail: string; mailbox: string }
): Prisma.Sql {
  const e = Prisma.raw(aliases.mail);
  const m = Prisma.raw(aliases.mailbox);
  const me = viewer.userId;
  return Prisma.sql`(
    NOT (COALESCE(${e}.metadata ->> 'isDraft', '') = 'true' AND ${e}."userId" IS DISTINCT FROM ${me})
    AND (
      ${m}.scope = 'TENANT'
      OR (${m}.scope = 'USER' AND ${m}."userId" = ${me})
      OR (${e}."mailboxId" IS NULL AND ${e}."userId" IS NULL
          AND ${e}.metadata ->> 'mailboxOwnerId' IS NULL)
      OR (${e}."mailboxId" IS NULL AND ${e}."userId" = ${me})
      OR (${e}."mailboxId" IS NULL AND ${e}.metadata ->> 'mailboxOwnerId' = ${me})
      OR ${loggedToVisibleSql(viewer, e)}
    )
  )`;
}

/**
 * The most logged-personal-mail ids one lookup returns when no `only` bound is given (newest first).
 * Prisma inlines them as bind parameters of an `id IN (...)` filter, and Postgres allows 65,535 per
 * statement, so the list is capped well below that. Past the cap the OLDEST logged personal mail of
 * a colleague drops out of list views: the failure is closed (hidden), never open. A single-mail
 * read passes `only` and is never affected.
 */
export const LOGGED_PERSONAL_MAIL_ID_CAP = 5000;

/**
 * Ids of mail in a personal mailbox (anyone's) that the viewer may read because it is logged to a
 * lead or contact they can see. Bounded by that set, never the whole table; it is the
 * one part of the policy a Prisma `where` cannot express (email_records has no relation to leads).
 */
export async function loggedPersonalMailIds(
  db: MailVisibilityDb,
  viewer: MailViewer,
  /** Only these mail ids matter (a single-mail read): keeps the lookup, and the list, to them. */
  only?: readonly string[]
): Promise<string[]> {
  if (only && only.length === 0) return [];
  const among = only ? Prisma.sql`AND e.id IN (${Prisma.join([...only])})` : Prisma.empty;
  const logged = loggedToVisibleSql(viewer, Prisma.sql`e`);
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT e.id
    FROM email_records e
    LEFT JOIN email_mailboxes m ON m.id = e."mailboxId"
    WHERE e."tenantId" = ${viewer.tenantId}
      AND (m.scope = 'USER'
        OR (e."mailboxId" IS NULL
            AND (e."userId" IS NOT NULL OR e.metadata ->> 'mailboxOwnerId' IS NOT NULL)))
      ${among}
      AND ${logged}
    ORDER BY e."createdAt" DESC
    LIMIT ${LOGGED_PERSONAL_MAIL_ID_CAP}`);
  return rows.map((r) => r.id);
}

/**
 * The Prisma form of the policy. `loggedIds` is `loggedPersonalMailIds`; without it only the
 * mailbox rules apply, so a caller that cannot look it up fails CLOSED (logged personal mail of
 * others stays hidden). AND it into the caller's where: `{ tenantId, AND: [emailVisibilityWhere(..)] }`.
 */
export function emailVisibilityWhere(viewerUserId: string, loggedIds: readonly string[] = []) {
  const mailboxRules: Record<string, unknown>[] = [
    { mailbox: { is: { scope: 'TENANT' } } },
    { mailbox: { is: { scope: 'USER', userId: viewerUserId } } },
    // No mailbox (inbound webhook, or the mailbox was removed): shared only when nobody owns it.
    {
      mailboxId: null,
      userId: null,
      metadata: { path: ['mailboxOwnerId'], equals: Prisma.AnyNull },
    },
    { mailboxId: null, userId: viewerUserId },
    { mailboxId: null, metadata: { path: ['mailboxOwnerId'], equals: viewerUserId } },
  ];
  if (loggedIds.length > 0) mailboxRules.push({ id: { in: [...loggedIds] } });
  return {
    AND: [
      {
        // A draft is the writer's alone.
        OR: [
          { metadata: { path: ['isDraft'], equals: Prisma.AnyNull } },
          { metadata: { path: ['isDraft'], equals: false } },
          { userId: viewerUserId },
        ],
      },
      { OR: mailboxRules },
    ],
  };
}

/**
 * The mail EVERYONE in the tenant may read, with no personal viewer: the policy above with nobody
 * signed in. For a read that has no single reader, such as the whole-workspace export that goes to
 * the tenant's administrators, where a mail may leave only when no colleague's privacy rests on it:
 *
 *  - the company mailbox (`scope = 'TENANT'`) and inbound mail with no mailbox and no owner;
 *  - mail logged to a lead or a contact (`contactId` set, or `metadata.leadId`), which is the
 *    customer conversation and not personal;
 *  - never a draft, and never mail that is only in a user's personal mailbox.
 *
 * There is no administrator branch (owner decision 26/11/2026): an administrator who exports the
 * workspace gets exactly what any colleague could already read. `metadata.leadId` is matched as a
 * string, like the SQL form; the lead is not looked up (a Prisma `where` cannot join it).
 */
export function emailTeamVisibleWhere() {
  return {
    AND: [
      {
        // A draft is its writer's alone.
        OR: [
          { metadata: { path: ['isDraft'], equals: Prisma.AnyNull } },
          { metadata: { path: ['isDraft'], equals: false } },
        ],
      },
      {
        OR: [
          { mailbox: { is: { scope: 'TENANT' } } },
          {
            mailboxId: null,
            userId: null,
            metadata: { path: ['mailboxOwnerId'], equals: Prisma.AnyNull },
          },
          { contactId: { not: null } },
          { metadata: { path: ['leadId'], string_starts_with: '' } },
        ],
      },
    ],
  };
}

/** The viewer's full Prisma visibility fragment: looks up the logged-to-a-visible-person ids. */
export async function visibleEmailWhere(
  db: MailVisibilityDb,
  viewer: MailViewer,
  only?: readonly string[]
) {
  return emailVisibilityWhere(viewer.userId, await loggedPersonalMailIds(db, viewer, only));
}

/**
 * The owner filter of the leads (or contacts) a viewer can see, as a Prisma `where` on them:
 * `{}` for an admin, the team's for a manager, the viewer's own otherwise. Same scope as
 * `createTenantWhereClause`, and as the logged-mail branch above.
 */
export function visiblePeopleWhere(viewer: Pick<MailViewer, 'userId' | 'role' | 'teamMemberIds'>) {
  if (viewer.role === 'ADMIN') return {};
  if (viewer.role === 'MANAGER' && viewer.teamMemberIds?.length) {
    return { ownerId: { in: [viewer.userId, ...viewer.teamMemberIds] } };
  }
  return { ownerId: viewer.userId };
}

/**
 * The timeline entry a logged mail leaves on its lead or contact (a LeadActivity or ContactActivity
 * of type EMAIL carries the mail's subject and sender) is as visible as the person it is on: a
 * `where` for those activity rows. Other activity types are unaffected. With no viewer, no EMAIL
 * entry is shown (fails closed).
 */
export function emailActivityWhere(
  person: 'lead' | 'contact',
  viewer?: Pick<MailViewer, 'userId' | 'role' | 'teamMemberIds'> | null
) {
  if (!viewer) return { type: { not: 'EMAIL' as const } };
  return {
    OR: [{ type: { not: 'EMAIL' as const } }, { [person]: { is: visiblePeopleWhere(viewer) } }],
  };
}

/** The SQL form of `emailActivityWhere`, for the activity counts: a condition on `<table>`'s rows. */
export function emailActivitySql(
  person: 'lead' | 'contact',
  tenantId: string,
  viewer?: Pick<MailViewer, 'userId' | 'role' | 'teamMemberIds'> | null
): Prisma.Sql {
  if (!viewer) return Prisma.sql`AND "type"::text <> 'EMAIL'`;
  const table = Prisma.raw(person === 'lead' ? 'leads' : 'contacts');
  const column = Prisma.raw(person === 'lead' ? '"leadId"' : '"contactId"');
  const scope = ownerScopeSql({ tenantId, ...viewer }, Prisma.sql`p`);
  return Prisma.sql`AND ("type"::text <> 'EMAIL' OR ${column} IN (
    SELECT p.id FROM ${table} p
    WHERE p."tenantId" = ${tenantId} ${scope}))`;
}
