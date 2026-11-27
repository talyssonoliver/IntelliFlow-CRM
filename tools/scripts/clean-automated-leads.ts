/**
 * clean-automated-leads.ts (MVP-011, register #57)
 *
 * Before the automated-sender guard (apps/api/src/modules/email/mail-sync-automated.ts) a
 * Microsoft DMARC aggregate report, no-reply notices and bounces became leads through the
 * unknown-sender rule and sat in "Who is waiting". This finds those leads in one tenant by the
 * same rule as the guard and archives them.
 *
 * What it matches: a lead with source EMAIL whose address is an automated sender (dmarc*, bounce*,
 * noreply, postmaster, mailer-daemon, abuse, notifications ...) or whose first note is the subject
 * of a DMARC aggregate report.
 *
 * What it changes (apply only), per matched lead:
 *   - status NEW -> LOST (the repo's archive: lead.bulkArchive sets LOST) and the tag
 *     `automated-sender`, which also takes the lead out of "Who is waiting" (waiting-load.ts);
 *   - one STATUS_CHANGE activity "Lead Archived" saying why (the same entry bulkArchive writes);
 *   - the lead's logged mail (email_records whose metadata.leadId is the lead) gets
 *     metadata.automatedSender = true, so the records can be found and undone.
 * Nothing is deleted. The lead's activities, notes and mail stay as they are.
 *
 * What it never touches: a matched lead somebody has worked (status other than NEW, any activity
 * by a user, any outbound mail) is listed as KEPT with the reason, for a person to decide.
 *
 * Safety (ADR-069 Class B: rows rewritten on existing production data):
 *   - Dry run by default: prints every planned change, writes nothing. `--apply` writes. Running
 *     --apply on production needs the owner's yes for that run (Aurora runs both herself).
 *   - Tenant-scoped and required: `--tenant <id>`; every write is keyed on the row's id AND tenantId.
 *   - Idempotent: an archived lead carries the tag and is skipped on a re-run.
 *   - Undo: the dry-run output lists every lead id and mail record id. To undo a lead, set its
 *     status back to NEW and remove the tag; the activity row says what changed.
 *
 * Usage (from the repo root):
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/clean-automated-leads.ts --tenant <id>
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/clean-automated-leads.ts --tenant <id> --apply
 */

import {
  isAutomatedAddress,
  isDmarcReportSubject,
} from '../../apps/api/src/modules/email/mail-sync-automated';
import {
  connect,
  databaseUrl,
  modeLine,
  modeOf,
  runWhenInvoked,
  type BackfillPrisma,
} from './lib/backfill-cli';

const BATCH_SIZE = 200;
const TAG = '[clean-automated-leads]';
/** The note the mail sync writes on a lead it creates: `Email enquiry: <subject>`. */
const ENQUIRY_NOTE = 'Email enquiry: ';
/** Same value as AUTOMATED_SENDER_TAG in apps/api/src/modules/waiting/waiting-load.ts. */
export const AUTOMATED_SENDER_TAG = 'automated-sender';

export interface ParsedArgs {
  isApply: boolean;
  tenantFilter: string | undefined;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const i = argv.indexOf('--tenant');
  const value = i !== -1 ? argv[i + 1] : undefined;
  return {
    isApply: argv.includes('--apply'),
    tenantFilter: value && !value.startsWith('--') ? value : undefined,
  };
}

export interface LeadFacts {
  id: string;
  email: string;
  status: string;
  tags: string[];
  /** The lead's notes (the sync writes "Email enquiry: <subject>" as the first). */
  notes: Array<{ content: string }>;
  activities: Array<{ type: string; userId: string | null; metadata: unknown }>;
}

export type Plan =
  | { action: 'archive'; reason: string }
  | { action: 'keep'; reason: string }
  | null;

function direction(metadata: unknown): unknown {
  return metadata && typeof metadata === 'object'
    ? (metadata as { direction?: unknown }).direction
    : undefined;
}

/** Why the lead is an automated sender's, or null. */
function automatedReason(lead: LeadFacts): string | null {
  if (isAutomatedAddress(lead.email)) return 'automated-sender';
  const subject = lead.notes.find((n) => n.content.startsWith(ENQUIRY_NOTE))?.content;
  if (subject && isDmarcReportSubject(subject.slice(ENQUIRY_NOTE.length))) return 'dmarc-report';
  return null;
}

/** What to do with a lead: archive it, keep it (worked by a person), or leave it (not automated). */
export function planLead(lead: LeadFacts): Plan {
  if (lead.tags.includes(AUTOMATED_SENDER_TAG)) return null; // done on an earlier run
  const reason = automatedReason(lead);
  if (!reason) return null;
  if (lead.status !== 'NEW')
    return { action: 'keep', reason: `${reason}, but status is ${lead.status}` };
  // Scoring writes its own entries (SCORE_UPDATE); any other entry by a user, or mail out, is work.
  const worked = lead.activities.some(
    (a) => (a.type !== 'SCORE_UPDATE' && a.userId !== null) || direction(a.metadata) === 'outbound'
  );
  if (worked) {
    return { action: 'keep', reason: `${reason}, but a person worked it or we wrote to it` };
  }
  return { action: 'archive', reason };
}

export interface Totals {
  archived: number;
  kept: number;
  scanned: number;
  records: number;
}

type Prisma = BackfillPrisma;

function fetchBatch(prisma: Prisma, tenantId: string, cursor: string | undefined) {
  return prisma.lead.findMany({
    where: { tenantId, source: 'EMAIL' },
    select: {
      id: true,
      email: true,
      status: true,
      tags: true,
      notes: {
        where: { content: { startsWith: ENQUIRY_NOTE } },
        select: { content: true },
        take: 1,
      },
      activities: { select: { type: true, userId: true, metadata: true } },
    },
    orderBy: { id: 'asc' },
    take: BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

/** The mail records logged against the lead (email_records.metadata.leadId). */
function recordsOf(prisma: Prisma, tenantId: string, leadId: string) {
  return prisma.emailRecord.findMany({
    where: { tenantId, metadata: { path: ['leadId'], equals: leadId } },
    select: { id: true, subject: true, metadata: true },
  });
}

async function archive(
  prisma: Prisma,
  tenantId: string,
  lead: LeadFacts,
  reason: string,
  records: Awaited<ReturnType<typeof recordsOf>>
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      // Still NEW: a lead a person moved since it was read is left alone (the update then fails).
      where: { id: lead.id, tenantId, status: 'NEW' },
      data: { status: 'LOST', tags: { push: AUTOMATED_SENDER_TAG } },
    });
    await tx.leadActivity.create({
      data: {
        type: 'STATUS_CHANGE',
        title: 'Lead Archived',
        description: `Status changed from ${lead.status} to LOST: automated sender (${reason})`,
        userName: 'System',
        leadId: lead.id,
        tenantId,
        metadata: { oldStatus: lead.status, newStatus: 'LOST', source: TAG, reason },
      },
    });
    for (const record of records) {
      const meta =
        record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
          ? (record.metadata as Record<string, unknown>)
          : {};
      await tx.emailRecord.update({
        where: { id: record.id, tenantId },
        data: { metadata: { ...meta, automatedSender: true } as never },
      });
    }
  });
}

async function handleLead(
  prisma: Prisma,
  args: ParsedArgs & { tenantFilter: string },
  lead: LeadFacts,
  totals: Totals
): Promise<void> {
  const plan = planLead(lead);
  if (!plan) return;
  if (plan.action === 'keep') {
    totals.kept += 1;
    console.log(`${TAG} KEPT lead=${lead.id} email=${lead.email} (${plan.reason})`);
    return;
  }
  const records = await recordsOf(prisma, args.tenantFilter, lead.id);
  totals.archived += 1;
  totals.records += records.length;
  const recordList = records.map((r) => [r.id, JSON.stringify(r.subject)].join(' ')).join(', ');
  console.log(
    `${TAG} ${args.isApply ? 'archiving' : 'would archive'} lead=${lead.id} email=${lead.email}` +
      ` reason=${plan.reason} activities=${lead.activities.length}` +
      ` records=[${recordList}]`
  );
  if (args.isApply) await archive(prisma, args.tenantFilter, lead, plan.reason, records);
}

export async function run(
  prisma: Prisma,
  args: ParsedArgs & { tenantFilter: string },
  totals: Totals
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const leads = await fetchBatch(prisma, args.tenantFilter, cursor);
    for (const lead of leads) {
      totals.scanned += 1;
      await handleLead(prisma, args, lead as LeadFacts, totals);
    }
    if (leads.length < BATCH_SIZE) return;
    cursor = leads[leads.length - 1]!.id;
  }
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!args.tenantFilter) {
    console.error(`${TAG} ERROR: --tenant <id> is required.`);
    process.exit(1);
    return;
  }
  const url = databaseUrl(TAG);
  if (!url) {
    process.exit(1);
    return;
  }
  const prisma = connect(url);
  console.log(modeLine(TAG, args));
  const totals: Totals = { archived: 0, kept: 0, scanned: 0, records: 0 };
  try {
    await run(prisma, { ...args, tenantFilter: args.tenantFilter }, totals);
  } finally {
    await prisma.$disconnect();
  }
  console.log(`${TAG} summary:`, { ...totals, mode: modeOf(args) });
}

// Importing this module (e.g. from a test) must not run main(), connect to a database, or exit.
runWhenInvoked(import.meta.url, 'clean-automated-leads.ts', main, TAG);
