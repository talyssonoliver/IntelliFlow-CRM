/**
 * MVP-014 "Who is waiting", decided inside Postgres.
 *
 * `loadWaiting` (waiting-load.ts) reads every email_record and every EMAIL activity of the tenant
 * into Node to find who has an inbound mail with no later reply. Measured on prod on 27/11/2026
 * (EGRESS_LOG) that was ~330 mail rows, ~330 activity rows and ~170 leads on every call of
 * `waiting.list`, the top egress spender of the free Supabase plan. This file runs the same
 * decision in one SQL statement and returns only the people to show, so the rows that leave the
 * database follow the list the card renders (`limit` plus one row of totals), not the mail volume.
 *
 * It is a line-for-line port of the pure rules in waiting-for-reply.ts and waiting-load.ts, kept
 * equal by tests/integration/waiting-sql.test.ts, which runs both on one database:
 *
 *  - people: the viewer's leads and contacts (same owner scope as createTenantWhereClause), minus
 *    leads archived as an automated sender;
 *  - mail: email_records the viewer may read (`emailVisibleSql`, register #64: a colleague's
 *    personal mail never answers a lead on someone else's card), direction by recordDirection;
 *  - a record reaches a person by address (From for inbound; To, Cc and Bcc for outbound, minus
 *    bounced or rejected addresses) or by its contact link;
 *  - EMAIL activities of leads and contacts, read at their logged record's time and, when they
 *    carry no direction, in that record's direction; an outbound one whose record never reached
 *    the person is not a reply;
 *  - a lead and a contact with one email address are one person (pickWaiting): their histories
 *    merge and the person is listed as the lead(s), else as the contact(s);
 *  - waiting = an inbound after the last outbound; `since` is the first such inbound, `unanswered`
 *    the distinct mails since; oldest first.
 *
 * Differences from the loader, all in favour of the data: the 50,000-row read caps and the
 * coverage floor that guards them are gone (SQL reads no window), so a tenant above the caps no
 * longer loses its oldest history; the 5,000-id cap of the logged personal mail list is gone too.
 * Below the caps (every tenant today) the output is identical.
 */

import { Prisma, emailVisibleSql, type MailViewer } from '@intelliflow/db';
import { AUTOMATED_SENDER_TAG, toPerson } from './waiting-load';
import type { WaitingItem, WaitingKind } from './waiting-for-reply';

/** The raw query methods of a Prisma client, or of one of its transactions. */
export interface RawQueries {
  $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T>;
  $executeRaw: (query: Prisma.Sql) => Promise<number>;
}

/** A Prisma client (the tenant-scoped one included): raw queries, and transactions for the tenant binding. */
export interface RawDb {
  $transaction: <T>(fn: (tx: RawQueries) => Promise<T>) => Promise<T>;
}

export interface WaitingPage {
  /** Oldest first, at most `limit` of them. */
  items: WaitingItem[];
  /** Everyone waiting, before `limit`. */
  total: number;
  leadTotal: number;
  contactTotal: number;
}

/** Same scope as createTenantWhereClause: admin all, manager the team, everyone else their own. */
function ownerScope(viewer: MailViewer, alias: string): Prisma.Sql {
  const a = Prisma.raw(alias);
  if (viewer.role === 'ADMIN') return Prisma.empty;
  if (viewer.role === 'MANAGER' && viewer.teamMemberIds?.length) {
    return Prisma.sql`AND ${a}."ownerId" IN (${Prisma.join([viewer.userId, ...viewer.teamMemberIds])})`;
  }
  return Prisma.sql`AND ${a}."ownerId" = ${viewer.userId}`;
}

/**
 * splitAddresses/bareAddress for one split part `p`: what sits between `<` and `>` (or the whole
 * part), trimmed and lower-cased. The caller keeps only parts that hold an `@`.
 */
const bare = (p: string): string =>
  `lower(btrim(split_part(CASE WHEN position('<' in ${p}) > 0 THEN substr(${p}, position('<' in ${p}) + 1) ELSE ${p} END, '>', 1)))`;

/** The address separator of splitAddresses: commas, semicolons and white space. */
const SEP = `'[,;\\s]+'`;

/** `metadata.direction` when it is exactly 'inbound' or 'outbound' (metadataDirection). */
const storedDirection = (col: string): string =>
  `(CASE WHEN jsonb_typeof(${col}) = 'object' AND ${col} ->> 'direction' IN ('inbound', 'outbound') THEN ${col} ->> 'direction' END)`;

/** JavaScript truthiness of a JSON value (isUntaggedRecordLog reads `Boolean(emailRecordId)`). */
const truthy = (v: string): string =>
  `(CASE jsonb_typeof(${v}) WHEN 'string' THEN (${v} #>> '{}') <> '' WHEN 'number' THEN (${v})::text::numeric <> 0 WHEN 'boolean' THEN ${v} = 'true'::jsonb WHEN 'array' THEN true WHEN 'object' THEN true ELSE false END)`;

/**
 * The statement. `limit` cuts the page; the totals are counted over the full result before it.
 */
export function waitingSql(
  viewer: MailViewer,
  opts: { limit?: number | undefined } = {}
): Prisma.Sql {
  const t = viewer.tenantId;
  const limit = opts.limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${opts.limit}`;
  const visible = emailVisibleSql(viewer, { mail: 'e', mailbox: 'mb' });
  const bouncedKeys = `ARRAY['bouncedRecipients', 'hardBouncedRecipients', 'rejectedRecipients']`;

  return Prisma.sql`
WITH people AS (
  SELECT 'lead'::text AS kind, l.id, l."firstName", l."lastName", l.email, l.company,
         lower(l.email) AS ekey
  FROM leads l
  WHERE l."tenantId" = ${t} ${ownerScope(viewer, 'l')}
    AND NOT COALESCE(l.status::text = 'LOST' AND ${AUTOMATED_SENDER_TAG} = ANY (l.tags), false)
  UNION ALL
  SELECT 'contact'::text, c.id, c."firstName", c."lastName", c.email, c.company, lower(c.email)
  FROM contacts c
  WHERE c."tenantId" = ${t} ${ownerScope(viewer, 'c')}
),
rec0 AS (
  SELECT e.id, e.subject, e.status::text AS status, e."userId", e."contactId", e."fromEmail",
         e."toEmail", e."ccEmails", e."bccEmails", e.metadata,
         COALESCE(e."sentAt", e."createdAt") AS etime,
         ${Prisma.raw(storedDirection('e.metadata'))} AS stored
  FROM email_records e
  LEFT JOIN email_mailboxes mb ON mb.id = e."mailboxId"
  WHERE e."tenantId" = ${t} AND ${visible}
),
-- recordDirection: stored inbound; DELIVERED with no stored direction and no sender is inbound;
-- a sent status is outbound; anything else (draft, failed, bounced) is not a mail that moved.
rec AS (
  SELECT r.*,
    (CASE WHEN r.stored = 'inbound' THEN 'inbound'
          WHEN r.stored IS NULL AND r.status = 'DELIVERED' AND r."userId" IS NULL THEN 'inbound'
          WHEN r.status IN ('SENT', 'DELIVERED', 'OPENED', 'CLICKED') THEN 'outbound' END) AS dir,
    COALESCE((
      SELECT array_agg(${Prisma.raw(bare('s.part'))})
      FROM unnest(${Prisma.raw(bouncedKeys)}) k,
        LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(r.metadata -> k) = 'array' THEN r.metadata -> k ELSE '[]'::jsonb END) el,
        LATERAL regexp_split_to_table(el #>> '{}', ${Prisma.raw(SEP)}) AS s(part)
      WHERE jsonb_typeof(el) = 'string' AND ${Prisma.raw(bare('s.part'))} LIKE '%@%'
    ), ARRAY[]::text[]) AS bounced
  FROM rec0 r
),
rec_addr AS (
  SELECT r.id AS rid, ${Prisma.raw(bare('s.part'))} AS addr
  FROM rec r,
    LATERAL regexp_split_to_table(
      CASE WHEN r.dir = 'inbound' THEN r."fromEmail"
           ELSE concat_ws(',', r."toEmail", r."ccEmails", r."bccEmails") END,
      ${Prisma.raw(SEP)}) AS s(part)
  WHERE r.dir IS NOT NULL AND ${Prisma.raw(bare('s.part'))} LIKE '%@%'
),
-- email_records as mail events of the people they reached (by address, or by the contact link).
rec_ev AS (
  SELECT p.ekey AS grp, r.dir, r.etime, r.subject, r.id AS ref, 1 AS src
  FROM rec_addr a
  JOIN rec r ON r.id = a.rid AND a.addr <> ALL (r.bounced)
  JOIN people p ON p.ekey = a.addr
  UNION ALL
  SELECT p.ekey, r.dir, r.etime, r.subject, r.id, 1
  FROM rec r
  JOIN people p ON p.kind = 'contact' AND p.id = r."contactId"
  WHERE r.dir IS NOT NULL AND p.ekey <> ALL (r.bounced)
),
act0 AS (
  SELECT 'lead'::text AS kind, a."leadId" AS pid, a.title, a."timestamp" AS ts, a.metadata
  FROM lead_activities a WHERE a."tenantId" = ${t} AND a.type::text = 'EMAIL'
  UNION ALL
  SELECT 'contact'::text, a."contactId", a.title, a."timestamp", a.metadata
  FROM contact_activities a WHERE a."tenantId" = ${t} AND a.type::text = 'EMAIL'
),
act1 AS (
  SELECT p.ekey AS grp, a.title, a.ts,
         ${Prisma.raw(storedDirection('a.metadata'))} AS stored,
         (CASE WHEN jsonb_typeof(a.metadata -> 'emailRecordId') = 'string'
               THEN a.metadata ->> 'emailRecordId' END) AS rid,
         COALESCE(jsonb_typeof(a.metadata) = 'object'
           AND ${Prisma.raw(storedDirection('a.metadata'))} IS NULL
           AND ${Prisma.raw(truthy(`(a.metadata -> 'emailRecordId')`))}, false) AS untagged
  FROM act0 a
  JOIN people p ON p.kind = a.kind AND p.id = a.pid
),
-- activityMail: a record log with no direction takes its record's; one whose record is not
-- readable is dropped; an outbound one whose record never reached the person is not a reply.
act2 AS (
  SELECT a.grp, a.title, a.ts, a.rid, a.untagged, a.stored, r.id AS rec_id, r.etime AS rec_etime,
         r.dir AS rec_dir, r.bounced AS rec_bounced,
         (CASE WHEN r.id IS NOT NULL AND a.untagged THEN r.dir
               ELSE COALESCE(a.stored,
                 CASE WHEN a.title ~* '^\\s*reply received\\y' THEN 'inbound' END, 'outbound') END) AS dir
  FROM act1 a
  LEFT JOIN rec r ON r.id = a.rid
  WHERE NOT (r.id IS NULL AND a.untagged)
),
act_ev AS (
  SELECT grp, dir, COALESCE(rec_etime, ts) AS etime, title AS subject, rid AS ref, 0 AS src
  FROM act2
  WHERE dir IS NOT NULL
    AND NOT (rec_id IS NOT NULL AND dir = 'outbound' AND (rec_dir IS NULL OR grp = ANY (rec_bounced)))
),
ev AS (SELECT * FROM act_ev UNION ALL SELECT * FROM rec_ev),
last_out AS (
  SELECT grp, max(etime) AS etime FROM ev WHERE dir = 'outbound' GROUP BY grp
),
open_in AS (
  SELECT ev.* FROM ev LEFT JOIN last_out lo ON lo.grp = ev.grp
  WHERE ev.dir = 'inbound' AND (lo.etime IS NULL OR ev.etime > lo.etime)
),
waiting AS (
  SELECT grp,
         (array_agg(etime ORDER BY etime, src, ref))[1] AS since,
         (array_agg(subject ORDER BY etime, src, ref))[1] AS subject,
         count(DISTINCT COALESCE('r:' || ref,
           't:' || floor(extract(epoch FROM etime) * 1000)::bigint::text || '|' || subject)) AS unanswered
  FROM open_in GROUP BY grp
),
listed AS (
  SELECT p.kind, p.id, p."firstName", p."lastName", p.email, p.company,
         w.since, w.subject, w.unanswered
  FROM waiting w
  JOIN people p ON p.ekey = w.grp
   AND (p.kind = 'lead' OR NOT EXISTS (SELECT 1 FROM people q WHERE q.ekey = w.grp AND q.kind = 'lead'))
)
SELECT kind, id, "firstName", "lastName", email, company, since, subject,
       unanswered::int AS unanswered,
       count(*) OVER ()::int AS total,
       (count(*) FILTER (WHERE kind = 'lead') OVER ())::int AS "leadTotal",
       (count(*) FILTER (WHERE kind = 'contact') OVER ())::int AS "contactTotal"
FROM listed
ORDER BY since, id COLLATE "C"
${limit}`;
}

interface Row {
  kind: WaitingKind;
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  company: string | null;
  since: Date | string;
  subject: string;
  unanswered: number;
  total: number;
  leadTotal: number;
  contactTotal: number;
}

/** A timestamp column back as a Date: `timestamp(3)` holds UTC without a zone marker. */
function asDate(v: Date | string): Date {
  if (v instanceof Date) return v;
  return new Date(/[zZ]|[+-]\d\d(:?\d\d)?$/.test(v) ? v : `${v.replace(' ', 'T')}Z`);
}

/**
 * Who is waiting for our reply, oldest first: the first `limit` of them and the counts of all.
 * The same answer as `loadWaiting` for the same viewer, computed in the database.
 */
export async function loadWaitingPage(
  db: RawDb,
  viewer: MailViewer,
  opts: { limit?: number | undefined } = {}
): Promise<WaitingPage> {
  const statement = waitingSql(viewer, opts);
  // A raw query skips the tenant client's per-operation `SET app.current_tenant_id` (it only hooks
  // model operations), so with row level security on, a session with no tenant, or another one's,
  // would see none of the tenant's rows. Bind the tenant for this transaction only (set_config
  // with is_local) and run the statement on the same connection, so the answer never depends on
  // what an earlier request left on a pooled connection.
  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT set_config('app.current_tenant_id', ${viewer.tenantId}, true)`
    );
    return tx.$queryRaw<Row[]>(statement);
  });
  const first = rows[0];
  if (!first) {
    // A limit past the end of an empty result: nothing waits (rows carry the totals).
    return { items: [], total: 0, leadTotal: 0, contactTotal: 0 };
  }
  return {
    items: rows.map((r) => ({
      ...toPerson(r.kind, { ...r, firstName: r.firstName, lastName: r.lastName }),
      since: asDate(r.since),
      subject: r.subject,
      unanswered: Number(r.unanswered),
    })),
    total: Number(first.total),
    leadTotal: Number(first.leadTotal),
    contactTotal: Number(first.contactTotal),
  };
}
