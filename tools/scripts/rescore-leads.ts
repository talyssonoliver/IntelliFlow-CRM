/**
 * rescore-leads.ts (MVP-012, register #49)
 *
 * Lead scores read 28 to 42 with a low-confidence "?" because scoring saw only a name, a company
 * and a source. It now also gets the enquiry data, the email tracking (opens and clicks, #1500),
 * mail received and the notes count (apps/ai-worker/src/lib/lead-engagement-signals.ts). A lead
 * that was already scored is not re-run for 30 days if its own fields are unchanged, so this
 * script queues a fresh scoring job for the leads of one tenant.
 *
 * What it does:
 *   - Dry run (default): reads, writes nothing, queues nothing. Per lead it prints the current
 *     score, status and date, which of the new inputs the lead has, and the prompt lines the
 *     model will now see (message text is never read; email addresses in free text are redacted).
 *   - `--apply`: queues one `score-lead` job per lead on the scoring queue, with a job id that is
 *     unique to this run. The ai-worker scores it and writes the score, as for any automatic
 *     scoring. Nothing is written to the database by this script itself. The worker re-checks
 *     data requests (restricted or erased people) before any AI call, and this script also skips
 *     erased addresses and people with an active processing restriction.
 *
 * Needs: DATABASE_URL. `--apply` also needs the workers' Redis settings (REDIS_HOST, REDIS_PORT,
 * REDIS_USERNAME, REDIS_PASSWORD, REDIS_DB, REDIS_TLS, as the ai-worker reads them). Running it with --apply on production needs the owner's yes.
 *
 * Usage (from the repo root):
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/rescore-leads.ts --tenant <id>
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/rescore-leads.ts --tenant <id> --lead <id>
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/rescore-leads.ts --tenant <id> --only-low-confidence
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/rescore-leads.ts --tenant <id> --apply
 */
import {
  formatLeadActivityContext,
  loadLeadActivityContext,
} from '../../apps/ai-worker/src/lib/lead-activity-context';
import {
  connect,
  databaseUrl,
  modeLine,
  modeOf,
  runWhenInvoked,
  type BackfillPrisma,
} from './lib/backfill-cli';

const TAG = '[rescore-leads]';
const BATCH_SIZE = 200;
/** Where scoring's priority sits for a hand-run batch: behind interactive work. */
const MAX_LEADS_PER_RUN = 500;

export interface ParsedArgs {
  isApply: boolean;
  tenantFilter: string | undefined;
  leadFilter: string | undefined;
  onlyLowConfidence: boolean;
}

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[i + 1] : undefined;
}

export function parseArgs(argv: string[]): ParsedArgs {
  return {
    isApply: argv.includes('--apply'),
    tenantFilter: argValue(argv, '--tenant'),
    leadFilter: argValue(argv, '--lead'),
    onlyLowConfidence: argv.includes('--only-low-confidence'),
  };
}

export interface ScoredLead {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  source: string;
  ownerId: string;
  score: number;
  scoringStatus: string;
  scoredAt: Date | null;
}

/** The new inputs a lead has, by name, from its prompt lines (so a lead with none is easy to see). */
export function newInputsPresent(promptLines: string): string[] {
  const checks: Array<[string, RegExp]> = [
    ['email tracking', /^Email Tracking:/m],
    ['mail received', /^Emails Received From The Lead/m],
    ['notes', /^Notes:/m],
    ['qualification answers', /^(Stated Budget|Stated Need|Decision Authority|Stated Timeline):/m],
    ['campaign or landing page', /^(Arrived Via Campaign|Referrer|Landing Page):/m],
    ['concept page', /^Outreach Concept Page:/m],
  ];
  return checks.filter(([, re]) => re.test(promptLines)).map(([name]) => name);
}

function isErased(email: string): boolean {
  return email.toLowerCase().endsWith('@erased.invalid');
}

async function restrictedAddresses(prisma: BackfillPrisma, tenantId: string): Promise<Set<string>> {
  const rows = await prisma.processingRestriction.findMany({
    where: { tenantId, liftedAt: null },
    select: { subjectEmail: true },
  });
  return new Set(rows.map((r) => r.subjectEmail.trim().toLowerCase()));
}

function fetchBatch(prisma: BackfillPrisma, args: ParsedArgs, cursor: string | undefined) {
  return prisma.lead.findMany({
    where: {
      tenantId: args.tenantFilter!,
      ...(args.leadFilter ? { id: args.leadFilter } : {}),
      ...(args.onlyLowConfidence
        ? { scoringStatus: { in: ['NEEDS_REVIEW', 'NONE', 'FAILED'] } }
        : {}),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      company: true,
      title: true,
      phone: true,
      source: true,
      ownerId: true,
      score: true,
      scoringStatus: true,
      scoredAt: true,
    },
    orderBy: { id: 'asc' },
    take: BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

/** What the script needs from the scoring queue (BullMQ's Queue, loaded only for --apply). */
export interface ScoringQueue {
  add(name: string, data: unknown, options: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * The scoring queue, with the workers' own Redis settings (getBullMQConnectionOptions: REDIS_HOST,
 * REDIS_PORT, REDIS_USERNAME, REDIS_PASSWORD, REDIS_DB, REDIS_TLS). bullmq is not a root
 * dependency, so it is loaded from packages/platform, which depends on it.
 */
async function openScoringQueue(): Promise<ScoringQueue> {
  const { createRequire } = await import('node:module');
  const { QUEUE_NAMES, getBullMQConnectionOptions } =
    await import('../../packages/platform/src/queues');
  const requireFromPlatform = createRequire(
    new URL('../../packages/platform/package.json', import.meta.url)
  );
  const { Queue } = requireFromPlatform('bullmq') as {
    Queue: new (name: string, opts: { connection: unknown }) => ScoringQueue;
  };
  return new Queue(QUEUE_NAMES.AI_SCORING, { connection: getBullMQConnectionOptions() });
}

/** Queues the scoring job for one lead; the worker scores and writes it. */
async function queueScoring(
  queue: ScoringQueue,
  lead: ScoredLead,
  tenantId: string,
  runId: string
): Promise<void> {
  const { leadAiFingerprint, leadAiJobFromStoredLead, leadAiJobId } =
    await import('../../packages/platform/src/queues');
  const job = leadAiJobFromStoredLead(
    { leadId: lead.id, tenantId, correlationId: `rescore-${runId}` },
    lead
  );
  await queue.add('score-lead', job, {
    jobId: leadAiJobId('SCORE', lead.id, leadAiFingerprint(job), `rescore${runId}`),
    removeOnComplete: { age: 7 * 24 * 60 * 60 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
  });
}

/** Email addresses in free text (a note, a tag) are never printed. */
export function redactAddresses(text: string): string {
  return text
    .split(' ')
    .map((word) => (word.includes('@') ? '[address]' : word))
    .join(' ');
}

export interface Totals {
  seen: number;
  skipped: number;
  queued: number;
}

async function handleLead(
  prisma: BackfillPrisma,
  args: ParsedArgs,
  lead: ScoredLead,
  restricted: Set<string>,
  runId: string,
  totals: Totals,
  queue: ScoringQueue | undefined
): Promise<void> {
  totals.seen += 1;
  if (isErased(lead.email) || restricted.has(lead.email.trim().toLowerCase())) {
    totals.skipped += 1;
    console.log(`${TAG} skip lead=${lead.id} (erased or processing restricted)`);
    return;
  }
  const context = await loadLeadActivityContext(prisma as never, lead.id, args.tenantFilter!);
  const promptLines = context ? formatLeadActivityContext(context, new Date()) : '';
  const inputs = newInputsPresent(promptLines);
  console.log(
    `${TAG} ${modeOf(args) === 'APPLY' ? 'queueing' : 'would queue'} lead=${lead.id}` +
      ` current score=${lead.score} status=${lead.scoringStatus}` +
      ` scoredAt=${lead.scoredAt ? lead.scoredAt.toISOString().slice(0, 10) : 'never'}` +
      ` new inputs: ${inputs.length > 0 ? inputs.join(', ') : 'none (it has none of them)'}`
  );
  if (!args.isApply) {
    console.log(
      promptLines
        .split('\n')
        .map((l) => `${TAG}     ${l}`)
        .join('\n')
    );
    return;
  }
  await queueScoring(queue!, lead, args.tenantFilter!, runId);
  totals.queued += 1;
}

export async function run(
  prisma: BackfillPrisma,
  args: ParsedArgs,
  queue?: ScoringQueue
): Promise<Totals> {
  const totals: Totals = { seen: 0, skipped: 0, queued: 0 };
  const restricted = await restrictedAddresses(prisma, args.tenantFilter!);
  const runId = Date.now().toString(36);
  let cursor: string | undefined;
  while (totals.seen < MAX_LEADS_PER_RUN) {
    const batch = await fetchBatch(prisma, args, cursor);
    if (batch.length === 0) break;
    for (const lead of batch) {
      if (totals.seen >= MAX_LEADS_PER_RUN) break;
      await handleLead(prisma, args, lead as ScoredLead, restricted, runId, totals, queue);
    }
    cursor = batch[batch.length - 1]!.id;
  }
  return totals;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tenantFilter) {
    console.error(`${TAG} ERROR: --tenant <id> is required.`);
    process.exit(1);
  }
  const url = databaseUrl(TAG);
  if (!url) process.exit(1);
  console.log(modeLine(TAG, args));
  const prisma = connect(url!);
  const queue = args.isApply ? await openScoringQueue() : undefined;
  try {
    const totals = await run(prisma, args, queue);
    console.log(
      `${TAG} done: ${totals.seen} leads read, ${totals.skipped} skipped, ${totals.queued} queued` +
        (args.isApply ? '' : ' (dry run: nothing queued; add --apply to queue)') +
        (totals.seen >= MAX_LEADS_PER_RUN
          ? ` (stopped at ${MAX_LEADS_PER_RUN}; run again for more)`
          : '')
    );
  } finally {
    await queue?.close();
    await prisma.$disconnect();
  }
}

runWhenInvoked(import.meta.url, 'rescore-leads.ts', main, TAG);
