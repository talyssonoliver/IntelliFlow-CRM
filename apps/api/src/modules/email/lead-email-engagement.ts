/**
 * The open rate on a lead's profile card, from the CRM's own email records for the lead's address.
 * Until now the card read only the lead's activities, whose metadata carries open data for few
 * mails, so it showed a dash for leads who had been mailed and had opened mail.
 *
 * Counted in the database, over every record: a row limit applied before the eligibility filter
 * could drop tracked sends and give a wrong rate, so nothing is loaded and nothing is capped.
 *
 * A mail counts as a tracked send when it left (SENT, DELIVERED, OPENED, CLICKED) to the address
 * (To, Cc or Bcc, an exact address, not one it bounced for) and was sent from the CRM itself, or was
 * opened at all, so mail with no tracking cannot make an open rate of "0%". Mail sent from the CRM
 * has the sending user and stores no direction. Mail synced from a connected mailbox's Sent folder
 * also has the user but stores `direction` and a sync `source` (it carries no open tracking), and mail
 * logged by hand has no user, so neither counts as a send unless it was opened.
 *
 * It is opened when the record says so: openCount above 0, an openedAt, or the status OPENED/CLICKED.
 */
import { Prisma } from '@intelliflow/db';

/** Postgres regex for `address` as a whole address in a comma, semicolon or space separated list. */
export function addressPattern(address: string): string {
  const escaped = address.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `(^|[\\s,;<])${escaped}($|[\\s,;>])`;
}

interface RawDb {
  $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T>;
}

/** The recipient-list and bounce parts of the where clause, shared by both counts. */
function engagementSql(tenantId: string, address: string): Prisma.Sql {
  const pattern = addressPattern(address);
  const lowered = address.trim().toLowerCase();
  return Prisma.sql`
    WITH mail AS (
      SELECT
        (r."openCount" > 0 OR r."openedAt" IS NOT NULL OR r.status::text IN ('OPENED', 'CLICKED')) AS opened,
        (r."userId" IS NOT NULL
          AND jsonb_typeof(r.metadata -> 'direction') IS DISTINCT FROM 'string'
          AND jsonb_typeof(r.metadata -> 'source') IS DISTINCT FROM 'string') AS from_crm
      FROM email_records r
      WHERE r."tenantId" = ${tenantId}
        AND r.status::text IN ('SENT', 'DELIVERED', 'OPENED', 'CLICKED')
        AND COALESCE(r.metadata ->> 'direction', '') <> 'inbound'
        AND (r."toEmail" ~* ${pattern} OR r."ccEmails" ~* ${pattern} OR r."bccEmails" ~* ${pattern})
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(r.metadata -> 'bouncedRecipients') = 'array'
                 THEN r.metadata -> 'bouncedRecipients' ELSE '[]'::jsonb END
            || CASE WHEN jsonb_typeof(r.metadata -> 'hardBouncedRecipients') = 'array'
                    THEN r.metadata -> 'hardBouncedRecipients' ELSE '[]'::jsonb END
            || CASE WHEN jsonb_typeof(r.metadata -> 'rejectedRecipients') = 'array'
                    THEN r.metadata -> 'rejectedRecipients' ELSE '[]'::jsonb END
          ) AS bounced(address)
          WHERE lower(bounced.address) = ${lowered}
        )
    )
    SELECT
      (COUNT(*) FILTER (WHERE from_crm OR opened))::int AS sent,
      (COUNT(*) FILTER (WHERE opened))::int AS opened
    FROM mail`;
}

/** Tracked sends to the address and how many were opened, for one tenant. */
export async function leadEmailEngagement(
  db: RawDb,
  tenantId: string,
  address: string
): Promise<{ sent: number; opened: number }> {
  const rows = await db.$queryRaw<{ sent: number; opened: number }[]>(
    engagementSql(tenantId, address)
  );
  return { sent: Number(rows[0]?.sent ?? 0), opened: Number(rows[0]?.opened ?? 0) };
}
