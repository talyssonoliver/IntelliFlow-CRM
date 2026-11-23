/**
 * reembed-all.ts (MVP-012)
 *
 * Production moves embeddings from OpenRouter's Nemotron to Google Gemini (EMBEDDING_PROVIDER=gemini,
 * 2048 dimensions, so the vector(2048) columns stay). Vectors of two models cannot be compared, so
 * every stored embedding has to be made again after the switch. This script clears them and queues
 * the existing embedding jobs. It never calls a model itself: the ai-worker does that. Contact jobs
 * run under the ContactEmbedWorker's metering, purpose ceiling and erasure checks; contact note
 * jobs run under the reindex worker, which has none of those, so this script leaves out the notes
 * of erased contacts and of people with an active processing restriction.
 *
 * The tables with an embedding column are the models with Unsupported("vector(2048)") in
 * packages/db/prisma/schema.prisma, and what re-embeds each one:
 *   - contacts       -> queue intelliflow-contact-embed, job `embed` with reason `backfill`, job id
 *                       `backfill-<contactId>` (the same ids the ai-worker's own boot sweep uses, so
 *                       a contact is never queued twice). Consumed by ContactEmbedWorker.
 *   - contact_notes  -> queue intelliflow-document-reindex, job `reindex` (indexType notes, noteIds).
 *                       NOTE: no process consumes that queue today (ReindexWorker is not started by
 *                       ai-worker; it is only listed on Bull Board). The jobs wait until it is.
 *   - leads          -> nothing writes a lead embedding (no queue, no worker): cleared only.
 *   - lead_notes     -> same: cleared only.
 * `--tables` picks tables; by default only contacts is touched, the one table a running worker
 * rebuilds. contact_notes (its queue has no consumer yet), leads and lead_notes are cleared only
 * when named, because nothing would rebuild them.
 *
 * What it does:
 *   - Dry run (default): reads and counts, writes and queues nothing. Per table: rows, rows holding
 *     an embedding, and what `--apply` would do.
 *   - `--apply`: per batch of rows (keyset on id), sets embedding to NULL for rows that hold one,
 *     then queues the embedding job for every row of the batch (also rows already NULL, so a run that
 *     stopped half way is finished by running it again). Re-running is safe: contact jobs dedupe on
 *     their `backfill-<id>` id and note jobs on tenant, first note and size (so adding or removing notes between runs can queue a
 *     note twice). Between the clear and the
 *     queueing of a batch a stopped run leaves rows without an embedding until it is run again.
 *
 * Scope: `--tenant <id>` or `--all-tenants`, one of them is required. Every statement carries the
 * tenant filter when a tenant is given, and each queued job carries the row's own tenantId.
 *
 * Embedding model marker: none of the four tables has a metadata column to hold a model id, and
 * this change adds no migration, so there is no marker.
 *
 * Needs: DATABASE_URL. `--apply` also needs the workers' Redis settings (REDIS_HOST, REDIS_PORT,
 * REDIS_USERNAME, REDIS_PASSWORD, REDIS_DB, REDIS_TLS). Running --apply on production needs the
 * owner's yes, after EMBEDDING_PROVIDER=gemini is live on the ai-worker (otherwise the jobs would
 * embed with the old model again).
 *
 * Usage (from the repo root):
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/reembed-all.ts --tenant <id>
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/reembed-all.ts --tenant <id> --apply
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/reembed-all.ts --all-tenants --apply
 *   ... --tables contacts,contact_notes
 */
import {
  connect,
  databaseUrl,
  modeOf,
  runWhenInvoked,
  type BackfillPrisma,
} from './lib/backfill-cli';

const TAG = '[reembed-all]';
const BATCH_SIZE = 500;
/** ReindexJobDataSchema's batchSize ceiling is 100; note ids go in chunks of this size. */
const NOTE_JOB_CHUNK = 100;
const CONTACT_EMBED_QUEUE = 'intelliflow-contact-embed';
const DOCUMENT_REINDEX_QUEUE = 'intelliflow-document-reindex';

export type TableName = 'contacts' | 'contact_notes' | 'leads' | 'lead_notes';

interface TableSpec {
  table: TableName;
  /** Queue the existing embedding job goes to; null when nothing re-embeds this table. */
  queue: typeof CONTACT_EMBED_QUEUE | typeof DOCUMENT_REINDEX_QUEUE | null;
}

export const TABLES: readonly TableSpec[] = [
  { table: 'contacts', queue: CONTACT_EMBED_QUEUE },
  { table: 'contact_notes', queue: DOCUMENT_REINDEX_QUEUE },
  { table: 'leads', queue: null },
  { table: 'lead_notes', queue: null },
];

export interface ParsedArgs {
  isApply: boolean;
  tenantFilter: string | undefined;
  allTenants: boolean;
  tables: TableName[];
}

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[i + 1] : undefined;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const wanted = argValue(argv, '--tables');
  const tables = wanted
    ? (wanted.split(',').map((t) => t.trim()) as TableName[])
    : (['contacts'] as TableName[]);
  return {
    isApply: argv.includes('--apply'),
    tenantFilter: argValue(argv, '--tenant'),
    allTenants: argv.includes('--all-tenants'),
    tables,
  };
}

/** The reason the arguments cannot be run, or null. */
export function argsError(args: ParsedArgs): string | null {
  if (args.tenantFilter && args.allTenants) return '--tenant and --all-tenants are exclusive.';
  if (!args.tenantFilter && !args.allTenants) {
    return '--tenant <id> is required (or --all-tenants, explicitly).';
  }
  const known = TABLES.map((t) => t.table as string);
  const unknown = args.tables.filter((t) => !known.includes(t));
  if (unknown.length > 0)
    return `unknown table(s): ${unknown.join(', ')} (known: ${known.join(', ')}).`;
  return null;
}

/** What the script needs from a queue (BullMQ's Queue, loaded only for --apply). */
export interface EmbedQueue {
  add(name: string, data: unknown, options: Record<string, unknown>): Promise<unknown>;
  getJob(id: string): Promise<{ getState(): Promise<string>; remove(): Promise<void> } | undefined>;
  /** Resolves once Redis answers (the connection retries forever, so this is the reachability check). */
  waitUntilReady(): Promise<unknown>;
  close(): Promise<void>;
}

export type QueueOpener = (queueName: string) => Promise<EmbedQueue>;

/** The queue, with the workers' own Redis settings. bullmq is loaded from packages/platform. */
export const openQueue: QueueOpener = async (queueName) => {
  const { createRequire } = await import('node:module');
  const { getBullMQConnectionOptions } = await import('../../packages/platform/src/queues');
  const requireFromPlatform = createRequire(
    new URL('../../packages/platform/package.json', import.meta.url)
  );
  const { Queue } = requireFromPlatform('bullmq') as {
    Queue: new (name: string, opts: { connection: unknown }) => EmbedQueue;
  };
  return new Queue(queueName, { connection: getBullMQConnectionOptions() });
};

interface Row {
  id: string;
  tenantId: string;
}

export interface TableCounts {
  total: number;
  withEmbedding: number;
}

export interface TableResult extends TableCounts {
  table: TableName;
  cleared: number;
  queued: number;
}

/** `"tenantId" = $n` when a tenant is given; the tenant is always a bound parameter. */
function tenantClause(args: ParsedArgs, paramIndex: number): { sql: string; params: string[] } {
  return args.tenantFilter
    ? { sql: ` AND "tenantId" = $${paramIndex}`, params: [args.tenantFilter] }
    : { sql: '', params: [] };
}

// Table names come from the TABLES constant above, never from input.
export async function countTable(
  prisma: BackfillPrisma,
  table: TableName,
  args: ParsedArgs
): Promise<TableCounts> {
  const t = tenantClause(args, 1);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS total, COUNT(embedding)::int AS "withEmbedding"
       FROM ${table} WHERE TRUE${t.sql}`,
    ...t.params
  )) as Array<TableCounts>;
  return { total: Number(rows[0]?.total ?? 0), withEmbedding: Number(rows[0]?.withEmbedding ?? 0) };
}

async function fetchBatch(
  prisma: BackfillPrisma,
  table: TableName,
  args: ParsedArgs,
  after: string
): Promise<Row[]> {
  const t = tenantClause(args, 2);
  return (await prisma.$queryRawUnsafe(
    `SELECT id, "tenantId" FROM ${table} WHERE id > $1${t.sql} ORDER BY id LIMIT ${BATCH_SIZE}`,
    after,
    ...t.params
  )) as Row[];
}

/** Sets embedding to NULL for the batch's rows that hold one; the tenant filter is repeated. */
async function clearBatch(
  prisma: BackfillPrisma,
  table: TableName,
  args: ParsedArgs,
  ids: string[]
): Promise<number> {
  const t = tenantClause(args, 2);
  return Number(
    await prisma.$executeRawUnsafe(
      `UPDATE ${table} SET embedding = NULL
         WHERE id = ANY($1::text[])${t.sql} AND embedding IS NOT NULL`,
      ids,
      ...t.params
    )
  );
}

/**
 * A finished backfill job of the same id would make BullMQ drop the new one as a duplicate (the
 * ai-worker's own sweep clears them the same way); a waiting, delayed or active one is left alone.
 */
async function clearFinishedJob(queue: EmbedQueue, jobId: string): Promise<void> {
  const existing = await queue.getJob(jobId);
  if (!existing) return;
  const state = await existing.getState();
  if (state === 'failed' || state === 'completed') await existing.remove();
}

/**
 * Notes whose contact was erased or has an active processing restriction: the reindex worker does
 * not check either, so they are not queued (same rule as isRestrictedOrErased for a contact).
 */
async function blockedNoteIds(prisma: BackfillPrisma, ids: string[]): Promise<Set<string>> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT n.id FROM contact_notes n JOIN contacts c ON c.id = n."contactId"
       WHERE n.id = ANY($1::text[]) AND (
         lower(c.email) LIKE '%@erased.invalid' OR EXISTS (
           SELECT 1 FROM processing_restrictions r
            WHERE r."tenantId" = n."tenantId" AND r."liftedAt" IS NULL
              AND lower(trim(r."subjectEmail")) = lower(trim(c.email))))`,
    ids
  )) as Array<{ id: string }>;
  return new Set(rows.map((r) => r.id));
}

async function queueBatch(
  prisma: BackfillPrisma,
  queue: EmbedQueue,
  spec: TableSpec,
  rows: Row[]
): Promise<number> {
  // The workers' own queues retry a job three times with this backoff; the Queue opened here has no
  // defaults, so a transient provider error would otherwise fail a job for good.
  const keep = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 24 * 60 * 60 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
  };
  if (spec.table === 'contacts') {
    for (const row of rows) {
      await clearFinishedJob(queue, `backfill-${row.id}`);
      await queue.add(
        'embed',
        { contactId: row.id, tenantId: row.tenantId, reason: 'backfill' },
        { jobId: `backfill-${row.id}`, ...keep }
      );
    }
    return rows.length;
  }
  // contact_notes: the reindex job takes note ids of one tenant, so group by tenant.
  const blocked = await blockedNoteIds(
    prisma,
    rows.map((r) => r.id)
  );
  const byTenant = new Map<string, string[]>();
  for (const row of rows) {
    if (blocked.has(row.id)) continue;
    byTenant.set(row.tenantId, [...(byTenant.get(row.tenantId) ?? []), row.id]);
  }
  let queued = 0;
  for (const [tenantId, ids] of byTenant) {
    for (let i = 0; i < ids.length; i += NOTE_JOB_CHUNK) {
      const noteIds = ids.slice(i, i + NOTE_JOB_CHUNK);
      const jobId = `reembed-notes-${tenantId}-${noteIds[0]}-${noteIds.length}`;
      await clearFinishedJob(queue, jobId);
      await queue.add(
        'reindex',
        { tenantId, noteIds, indexType: 'notes', reason: 'reembed-all' },
        { jobId, priority: 10, ...keep }
      );
      queued += noteIds.length;
    }
  }
  return queued;
}

async function applyTable(
  prisma: BackfillPrisma,
  spec: TableSpec,
  args: ParsedArgs,
  counts: TableCounts,
  queue: EmbedQueue | undefined
): Promise<TableResult> {
  const result: TableResult = { table: spec.table, ...counts, cleared: 0, queued: 0 };
  let after = '';
  for (;;) {
    const rows = await fetchBatch(prisma, spec.table, args, after);
    const last = rows.at(-1);
    if (!last) break;
    result.cleared += await clearBatch(
      prisma,
      spec.table,
      args,
      rows.map((r) => r.id)
    );
    if (queue) result.queued += await queueBatch(prisma, queue, spec, rows);
    console.log(
      `${TAG} ${spec.table}: ${result.cleared} cleared, ${result.queued} queued of ${counts.total}`
    );
    if (rows.length < BATCH_SIZE) break;
    after = last.id;
  }
  return result;
}

function dryRunLine(spec: TableSpec, counts: TableCounts): string {
  let job = ' (no job re-embeds it)';
  if (spec.table === 'contacts') {
    job = ` and queue ${counts.total} jobs on ${spec.queue}`;
  } else if (spec.queue) {
    job =
      ` and queue up to ${counts.total} notes (in jobs of ${NOTE_JOB_CHUNK}) on ${spec.queue}, ` +
      'which no worker consumes yet';
  }
  return (
    `${TAG} ${spec.table}: ${counts.total} rows, ${counts.withEmbedding} hold an embedding; ` +
    `--apply would clear ${counts.withEmbedding}${job}`
  );
}

/** Opens a queue once; it must answer before any row is cleared, or the clear would strand rows. */
async function queueFor(
  name: string,
  queues: Map<string, EmbedQueue>,
  openQueueFn: QueueOpener
): Promise<EmbedQueue> {
  const known = queues.get(name);
  if (known) return known;
  const queue = await openQueueFn(name);
  queues.set(name, queue);
  await queue.waitUntilReady();
  return queue;
}

export async function run(
  prisma: BackfillPrisma,
  args: ParsedArgs,
  openQueueFn: QueueOpener = openQueue
): Promise<TableResult[]> {
  const results: TableResult[] = [];
  const queues = new Map<string, EmbedQueue>();
  try {
    for (const spec of TABLES.filter((t) => args.tables.includes(t.table))) {
      const counts = await countTable(prisma, spec.table, args);
      if (!args.isApply) {
        results.push({ table: spec.table, ...counts, cleared: 0, queued: 0 });
        console.log(dryRunLine(spec, counts));
        continue;
      }
      const queue = spec.queue ? await queueFor(spec.queue, queues, openQueueFn) : undefined;
      results.push(await applyTable(prisma, spec, args, counts, queue));
    }
  } finally {
    for (const queue of queues.values()) await queue.close();
  }
  return results;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const problem = argsError(args);
  if (problem) {
    console.error(`${TAG} ERROR: ${problem}`);
    process.exit(1);
  }
  const url = databaseUrl(TAG);
  if (!url) process.exit(1);
  const scope = args.tenantFilter ? `tenant=${args.tenantFilter}` : 'ALL TENANTS';
  console.log(`${TAG} mode=${modeOf(args)} ${scope} tables=${args.tables.join(',')}`);
  const prisma = connect(url!);
  try {
    const results = await run(prisma, args);
    for (const r of results) {
      console.log(
        `${TAG} done ${r.table}: ${r.total} rows, ${r.withEmbedding} held an embedding, ` +
          `${r.cleared} cleared, ${r.queued} queued`
      );
    }
    if (!args.isApply) console.log(`${TAG} dry run: nothing changed; add --apply to run it`);
  } finally {
    await prisma.$disconnect();
  }
}

runWhenInvoked(import.meta.url, 'reembed-all.ts', main, TAG);
