/**
 * Two more scoring inputs for the lead (register #49), beside the activity history in
 * lead-activity-context.ts: the enquiry data the lead gave (or arrived with), and what the CRM's
 * own email records say about mail sent to it (opens and clicks, recorded since #1500) and mail
 * received from it.
 *
 * Before this the model saw a name, a company, a source and a handful of activity titles, so
 * every lead read as thin evidence: scores of 28 to 42 with a low-confidence "?" even for a lead
 * who had opened every mail. Each line is only written when there is something to say, so a lead
 * with no such data scores on what it has, as before.
 *
 * Privacy: no message body or subject is read. Free text typed into a qualification field
 * (budget, need, authority) is sanitized and capped; the referrer is reduced to its host and the
 * landing page to its path.
 */
import { sanitizeStringField } from '../utils/input-sanitizer';

const DAY_MS = 24 * 60 * 60 * 1000;
const FREE_TEXT_MAX = 200;
const NEED_MAX = 300;
const MAX_TAGS = 10;

/** The enquiry and attribution columns of a lead that say what it asked for and where it came from. */
export interface EnquiryFields {
  budget?: string | null;
  authority?: string | null;
  need?: string | null;
  timeline?: string | null;
  annualRevenue?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
  landingPath?: string | null;
  outreachSlug?: string | null;
  website?: string | null;
  location?: string | null;
  /** In pence, like Lead.estimatedValue. */
  estimatedValue?: number | null;
  tags?: string[] | null;
}

/** The Prisma select for the columns above. */
export const ENQUIRY_SELECT = {
  budget: true,
  authority: true,
  need: true,
  timeline: true,
  annualRevenue: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  referrer: true,
  landingPath: true,
  outreachSlug: true,
  website: true,
  location: true,
  estimatedValue: true,
  tags: true,
} as const;

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function hostOf(url: string): string {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname;
  } catch {
    return sanitizeStringField(url, 80);
  }
}

/** The host of a link, capped, for the prompt. */
function cappedHost(url: string): string {
  return sanitizeStringField(hostOf(url), 80);
}

const PATH_MAX = 120;

function pathOf(path: string): string {
  try {
    return sanitizeStringField(new URL(path, 'https://placeholder.invalid').pathname, PATH_MAX);
  } catch {
    return sanitizeStringField(path.split(/[?#]/, 1)[0] ?? '', PATH_MAX);
  }
}

/** The enquiry data as prompt lines; empty when the lead has none of it. */
export function enquiryLines(fields: EnquiryFields | null | undefined): string[] {
  if (!fields) return [];
  const lines: string[] = [];
  const qualification: Array<[string, string | null | undefined, number]> = [
    ['Stated Budget', fields.budget, FREE_TEXT_MAX],
    ['Stated Need', fields.need, NEED_MAX],
    ['Decision Authority', fields.authority, FREE_TEXT_MAX],
    ['Stated Timeline', fields.timeline, 40],
    ['Company Revenue Band', fields.annualRevenue, 20],
  ];
  for (const [label, value, max] of qualification) {
    if (present(value) && value !== 'unknown') {
      lines.push(`${label}: ${sanitizeStringField(value, max)}`);
    }
  }
  if (fields.estimatedValue && fields.estimatedValue > 0) {
    lines.push(`Estimated Deal Value: £${Math.round(fields.estimatedValue / 100)}`);
  }
  const campaign = [fields.utmSource, fields.utmMedium, fields.utmCampaign]
    .filter(present)
    .map((part) => sanitizeStringField(part, 60));
  if (campaign.length > 0) lines.push(`Arrived Via Campaign: ${campaign.join(' / ')}`);
  if (present(fields.referrer)) lines.push(`Referrer: ${cappedHost(fields.referrer)}`);
  if (present(fields.landingPath)) lines.push(`Landing Page: ${pathOf(fields.landingPath)}`);
  if (present(fields.outreachSlug)) {
    lines.push(`Outreach Concept Page: ${sanitizeStringField(fields.outreachSlug, 80)}`);
  }
  if (present(fields.website)) lines.push(`Website: ${cappedHost(fields.website)}`);
  if (present(fields.location)) lines.push(`Location: ${sanitizeStringField(fields.location, 80)}`);
  const tags = (fields.tags ?? []).filter(present).slice(0, MAX_TAGS);
  if (tags.length > 0) {
    lines.push(`Tags: ${tags.map((tag) => sanitizeStringField(tag, 50)).join(', ')}`);
  }
  return lines;
}

/** What the CRM's email records say about one lead's address. */
export interface EmailTracking {
  /** Mail sent to the address from the CRM (or opened), not counting bounces. */
  sent: number;
  /** Of those, how many were opened at least once. */
  opened: number;
  /** Of those, how many had a link clicked. */
  clicked: number;
  /** Total opens and clicks recorded across them. */
  openEvents: number;
  clickEvents: number;
  lastOpenedAt: Date | null;
  lastClickedAt: Date | null;
  /** Mail received from the address and stored by the mailbox sync. */
  received: number;
}

interface TrackingRow {
  sent: number | bigint | null;
  opened: number | bigint | null;
  clicked: number | bigint | null;
  open_events: number | bigint | null;
  click_events: number | bigint | null;
  last_opened_at: Date | string | null;
  last_clicked_at: Date | string | null;
  received: number | bigint | null;
}

/** Anything with Prisma's tagged-template `$queryRaw`. */
export interface RawReader {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/** Postgres regex for `address` as a whole address in a comma, semicolon or space separated list. */
export function addressPattern(address: string): string {
  const escaped = address.trim().replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return `(^|[\\s,;<])${escaped}($|[\\s,;>])`;
}

const toCount = (value: number | bigint | null | undefined): number => Number(value ?? 0);
const toDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Tracked sends to the address, their opens and clicks, and mail received from it, for one
 * tenant. A mail counts as a send when it left (SENT, DELIVERED, OPENED, CLICKED) to the address
 * and was sent from the CRM itself (it has the sending user and no stored direction or sync
 * source) or was opened at all, and the address is not one it bounced for: the same rule as the
 * lead's Open Rate (apps/api email/lead-email-engagement.ts), so the two never disagree.
 */
export async function loadEmailTracking(
  db: RawReader,
  tenantId: string,
  address: string
): Promise<EmailTracking | undefined> {
  const pattern = addressPattern(address);
  const lowered = address.trim().toLowerCase();
  const rows = await db.$queryRaw<TrackingRow[]>`
    WITH mail AS (
      SELECT
        (COALESCE(r.metadata ->> 'direction', '') = 'inbound') AS inbound,
        (r."openCount" > 0 OR r."openedAt" IS NOT NULL OR r.status::text IN ('OPENED', 'CLICKED')) AS opened,
        (r."clickCount" > 0 OR r."clickedAt" IS NOT NULL OR r.status::text = 'CLICKED') AS clicked,
        (r."userId" IS NOT NULL
          AND jsonb_typeof(r.metadata -> 'direction') IS DISTINCT FROM 'string'
          AND jsonb_typeof(r.metadata -> 'source') IS DISTINCT FROM 'string') AS from_crm,
        r."openCount", r."clickCount", r."openedAt", r."clickedAt"
      FROM email_records r
      WHERE r."tenantId" = ${tenantId}
        AND (
          (COALESCE(r.metadata ->> 'direction', '') = 'inbound' AND r."fromEmail" ~* ${pattern})
          OR (
            COALESCE(r.metadata ->> 'direction', '') <> 'inbound'
            AND r.status::text IN ('SENT', 'DELIVERED', 'OPENED', 'CLICKED')
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
        )
    )
    SELECT
      (COUNT(*) FILTER (WHERE NOT inbound AND (from_crm OR opened)))::int AS sent,
      (COUNT(*) FILTER (WHERE NOT inbound AND opened))::int AS opened,
      (COUNT(*) FILTER (WHERE NOT inbound AND clicked))::int AS clicked,
      (COALESCE(SUM(GREATEST("openCount", CASE WHEN opened THEN 1 ELSE 0 END)) FILTER (WHERE NOT inbound), 0))::int AS open_events,
      (COALESCE(SUM(GREATEST("clickCount", CASE WHEN clicked THEN 1 ELSE 0 END)) FILTER (WHERE NOT inbound), 0))::int AS click_events,
      MAX("openedAt") FILTER (WHERE NOT inbound) AS last_opened_at,
      MAX("clickedAt") FILTER (WHERE NOT inbound) AS last_clicked_at,
      (COUNT(*) FILTER (WHERE inbound))::int AS received
    FROM mail`;
  const row = rows[0];
  if (!row) return undefined;
  return {
    sent: toCount(row.sent),
    opened: toCount(row.opened),
    clicked: toCount(row.clicked),
    openEvents: toCount(row.open_events),
    clickEvents: toCount(row.click_events),
    lastOpenedAt: toDate(row.last_opened_at),
    lastClickedAt: toDate(row.last_clicked_at),
    received: toCount(row.received),
  };
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(date: Date, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
  return days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`;
}

function lastSeen(date: Date | null, now: Date): string {
  return date ? `, last ${isoDay(date)} (${daysAgo(date, now)})` : '';
}

/** The email record counts as prompt lines; empty when the lead has no email records at all. */
export function emailTrackingLines(
  tracking: EmailTracking | null | undefined,
  now: Date
): string[] {
  if (!tracking || (tracking.sent === 0 && tracking.received === 0)) return [];
  const lines: string[] = [];
  if (tracking.sent > 0) {
    lines.push(
      `Email Tracking: ${tracking.sent} tracked emails sent, ${tracking.opened} opened (${tracking.openEvents} opens${lastSeen(tracking.lastOpenedAt, now)}), ${tracking.clicked} with a link clicked (${tracking.clickEvents} clicks${lastSeen(tracking.lastClickedAt, now)})`
    );
  }
  if (tracking.received > 0) {
    lines.push(`Emails Received From The Lead (mailbox sync): ${tracking.received}`);
  }
  return lines;
}
