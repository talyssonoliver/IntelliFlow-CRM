/**
 * The lead's engagement history for AI scoring.
 *
 * Without it the model saw only an email domain, a company and a source, so a lead that had
 * replied twice asking for the price scored 0 at confidence 0.05. The scoring prompt now also
 * gets the lead's status, its last contact, the latest pipeline stage, counts of emails sent
 * and replies, and its recent activities.
 *
 * Privacy: only the activity type, direction, date and title are used, never the description,
 * the metadata text or any message body. Titles are sanitized and capped. The COA pipeline
 * stage is a stage name and a date.
 *
 * Direction: `metadata.direction` when an activity was logged with one. Older rows have none,
 * so for an EMAIL it is inferred here from the event part of its title (before the first
 * colon), for the prompt only and never written back: starting "Reply", "Replied", "Received"
 * or "Inbound" means inbound ("Reply received: ..."); "sent", "outreach" or "outbound" means
 * outbound ("Follow-up email sent"). Any other email is counted as unknown direction rather
 * than guessed.
 *
 * TODO(#1177): once the mail bridge stores email_records for leads, count those too.
 */
import { sanitizeStringField } from '../utils/input-sanitizer';

/** How many activities are read for the counts, and how many are listed in the prompt. */
const COUNTED_ACTIVITIES = 200;
const LISTED_ACTIVITIES = 15;
const TITLE_MAX = 120;
const COA_SYNC_SOURCE = 'coa-pipeline-sync';
const DAY_MS = 24 * 60 * 60 * 1000;

export type ActivityDirection = 'inbound' | 'outbound';

export interface ActivityRow {
  type: string;
  title: string;
  timestamp: Date;
  metadata: unknown;
}

export interface LeadRow {
  status: string | null;
  lastContactedAt: Date | null;
}

export interface LeadActivityContext {
  status: string | null;
  lastContactedAt: Date | null;
  pipelineStage: { stage: string; since: Date | null } | null;
  counts: {
    emailsSent: number;
    replies: number;
    emailsUnknownDirection: number;
    calls: number;
    meetings: number;
  };
  recent: Array<{ type: string; direction: ActivityDirection | null; at: Date; title: string }>;
}

function metadataOf(row: ActivityRow): Record<string, unknown> {
  return row.metadata && typeof row.metadata === 'object'
    ? (row.metadata as Record<string, unknown>)
    : {};
}

/** The event part of a title: the text before its first colon ("Reply received: ..."). */
function titleEvent(title: string): string {
  return title.split(':', 1)[0].trim();
}

const INBOUND_EVENT = /^(reply|replied|received|inbound)\b/i;
const OUTBOUND_EVENT = /\b(sent|outreach|outbound)\b/i;

/**
 * The direction stored on the activity, else, for an EMAIL, inferred from the event part of
 * its title only, never from the words after it ("Email sent: please reply" is outbound).
 * Inbound when the event starts with reply/received/inbound, outbound when it says
 * sent/outreach/outbound; null when it says both or neither.
 */
export function activityDirection(row: ActivityRow): ActivityDirection | null {
  const stored = metadataOf(row)['direction'];
  if (stored === 'inbound' || stored === 'outbound') return stored;
  if (row.type !== 'EMAIL') return null;
  const event = titleEvent(row.title);
  const inbound = INBOUND_EVENT.test(event);
  const outbound = OUTBOUND_EVENT.test(event);
  if (inbound === outbound) return null;
  return inbound ? 'inbound' : 'outbound';
}

function latestPipelineStage(rows: ActivityRow[]): LeadActivityContext['pipelineStage'] {
  for (const row of rows) {
    const meta = metadataOf(row);
    if (meta['source'] !== COA_SYNC_SOURCE || typeof meta['coaStage'] !== 'string') continue;
    const since =
      typeof meta['stageChangedAt'] === 'string' ? new Date(meta['stageChangedAt']) : null;
    return {
      stage: sanitizeStringField(meta['coaStage'], 40),
      since: since && !Number.isNaN(since.getTime()) ? since : null,
    };
  }
  return null;
}

function countEngagement(rows: ActivityRow[]): LeadActivityContext['counts'] {
  const counts = { emailsSent: 0, replies: 0, emailsUnknownDirection: 0, calls: 0, meetings: 0 };
  for (const row of rows) {
    if (row.type === 'CALL') counts.calls++;
    else if (row.type === 'MEETING') counts.meetings++;
    else if (row.type === 'EMAIL') {
      const direction = activityDirection(row);
      if (direction === 'inbound') counts.replies++;
      else if (direction === 'outbound') counts.emailsSent++;
      else counts.emailsUnknownDirection++;
    }
  }
  return counts;
}

/**
 * Build the context from rows already ordered newest first. `stageRows` holds the latest
 * pipeline-sync note when it was read on its own (so other activity cannot push it out);
 * without it the stage is looked for in `rows`.
 */
export function buildLeadActivityContext(
  lead: LeadRow,
  rows: ActivityRow[],
  stageRows: ActivityRow[] = rows
): LeadActivityContext {
  const counts = countEngagement(rows);
  const recent = rows
    // The AI's own score updates say nothing about the lead's engagement.
    .filter((row) => row.type !== 'SCORE_UPDATE')
    .slice(0, LISTED_ACTIVITIES)
    .map((row) => ({
      type: row.type,
      direction: activityDirection(row),
      at: row.timestamp,
      title: sanitizeStringField(row.title, TITLE_MAX),
    }));
  return {
    status: lead.status,
    lastContactedAt: lead.lastContactedAt,
    pipelineStage: latestPipelineStage(stageRows),
    counts,
    recent,
  };
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(date: Date, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
  return days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`;
}

/** The context as prompt lines, appended to the lead information. */
export function formatLeadActivityContext(context: LeadActivityContext, now: Date): string {
  const lines: string[] = [];
  if (context.status) lines.push(`Lead Status: ${sanitizeStringField(context.status, 40)}`);
  lines.push(
    context.lastContactedAt
      ? `Last Contacted: ${isoDay(context.lastContactedAt)} (${daysAgo(context.lastContactedAt, now)})`
      : 'Last Contacted: never'
  );
  if (context.pipelineStage) {
    const since = context.pipelineStage.since
      ? ` (since ${isoDay(context.pipelineStage.since)})`
      : '';
    lines.push(`Pipeline Stage: ${context.pipelineStage.stage}${since}`);
  }
  const { emailsSent, replies, emailsUnknownDirection, calls, meetings } = context.counts;
  const unknown =
    emailsUnknownDirection > 0 ? `, ${emailsUnknownDirection} emails of unknown direction` : '';
  lines.push(
    `Engagement: ${emailsSent} emails sent to the lead, ${replies} replies from the lead${unknown}, ${calls} calls, ${meetings} meetings`
  );
  if (context.recent.length === 0) {
    lines.push('Recent Activity: none recorded');
  } else {
    lines.push('Recent Activity (newest first):');
    for (const item of context.recent) {
      const direction = item.direction ? ` ${item.direction}` : '';
      lines.push(`- ${isoDay(item.at)} ${item.type}${direction}: ${item.title}`);
    }
  }
  return lines.join('\n');
}

interface ActivityReader {
  lead: {
    findFirst(args: unknown): Promise<LeadRow | null>;
  };
  leadActivity: {
    findMany(args: unknown): Promise<ActivityRow[]>;
    findFirst(args: unknown): Promise<ActivityRow | null>;
  };
}

/**
 * Read the lead's engagement history, scoped to its tenant. Returns undefined when it cannot
 * be read: the scoring then runs on the lead fields alone, as before.
 */
export async function loadLeadActivityContext(
  prisma: ActivityReader,
  leadId: string,
  tenantId: string
): Promise<LeadActivityContext | undefined> {
  try {
    const select = { type: true, title: true, timestamp: true, metadata: true };
    const [lead, rows, stage] = await Promise.all([
      prisma.lead.findFirst({
        where: { id: leadId, tenantId },
        select: { status: true, lastContactedAt: true },
      }),
      // Score updates are left out before the limit, so they cannot push engagement out.
      prisma.leadActivity.findMany({
        where: { leadId, tenantId, type: { not: 'SCORE_UPDATE' } },
        orderBy: { timestamp: 'desc' },
        take: COUNTED_ACTIVITIES,
        select,
      }),
      // The latest pipeline stage is read on its own, however much other activity came after.
      prisma.leadActivity.findFirst({
        where: {
          leadId,
          tenantId,
          type: 'NOTE',
          metadata: { path: ['source'], equals: COA_SYNC_SOURCE },
        },
        orderBy: { timestamp: 'desc' },
        select,
      }),
    ]);
    if (!lead) return undefined;
    return buildLeadActivityContext(lead, rows, stage ? [stage] : []);
  } catch {
    return undefined;
  }
}
