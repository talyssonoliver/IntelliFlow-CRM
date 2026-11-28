/**
 * Whole-workspace export engine (agreement clause 5).
 *
 * Writes ONE ZIP for ONE tenant to a local path:
 *
 *   README.txt            what every file is, what is left out, how to check integrity
 *   manifest.json         row count, bytes and sha256 of every other file
 *   workspace.json        the workspace record
 *   data/<entity>.csv     one CSV and
 *   data/<entity>.json    one JSON per entity the tenant owns
 *   files/<bucket>/...    the tenant's files from private storage buckets
 *
 * Tenant boundary: every read states `tenantId` in its own `where`, and the caller hands in a
 * client that adds the same filter again (see createTenantReadGuard); users are read by an
 * explicit membership predicate. Storage is read only under `<tenantId>/`, and every returned
 * path is re-checked. Secrets: see ./deny-list.ts. Memory: rows are read in keyset pages and
 * written as they come; files are piped.
 */
import { Prisma, emailTeamVisibleWhere, isTeamVisibleEmail } from '@intelliflow/db';
import type { TeamMailContext, TeamMailRow } from '@intelliflow/db';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { rm, stat, writeFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import {
  DEFAULT_MAX_PART_BYTES,
  PartedArchive,
  type PartInfo,
  type PartedEntryInfo,
} from './parted-archive';
import {
  defaultExportFileBuckets,
  resolveEmailAttachmentsBucket,
  EXPORT_ENTITIES,
  MEMBERSHIP_EXPORT,
  TENANT_COLUMNS,
  USER_EXPORT,
} from './entities';
import { excludedColumns } from './deny-list';
import { csvHeader, csvLine, toJsonRow, type ExportRow } from './serialize';

export const EXPORT_FORMAT = 'intelliflow-workspace-export';
export const EXPORT_FORMAT_VERSION = 1;

/** The slice of PrismaClient the export reads. Every call is a read. */
export type ExportDb = Record<string, any>;

/** A stored object that is confirmed not to exist (404 / not found): the only open failure skipped. */
export class ExportFileMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportFileMissingError';
  }
}

/** Whether `err` says the object itself is gone, as opposed to a storage hiccup worth retrying. */
export function isMissingObjectError(err: unknown): boolean {
  if (err instanceof ExportFileMissingError) return true;
  const e = err as { status?: unknown; statusCode?: unknown; code?: unknown } | null;
  return (
    !!e &&
    (e.status === 404 || e.statusCode === 404 || e.statusCode === '404' || e.code === 'ENOENT')
  );
}

export interface ExportFileStorage {
  /** Every object under `<tenantId>/` in `bucket`, paths relative to the bucket root. */
  listFiles(bucket: string, tenantId: string): AsyncIterable<{ path: string; size: number | null }>;
  openFile(bucket: string, path: string): Promise<Readable>;
}

export interface RunWorkspaceExportOptions {
  db: ExportDb;
  tenantId: string;
  /** Where the ZIP is written (a local temp file). */
  outputPath: string;
  requestId?: string;
  files?: ExportFileStorage | null;
  buckets?: readonly string[];
  /**
   * The bucket that holds email attachments: only the files of exported mail are copied from it.
   * Defaults to the storage adapter's own name (EMAIL_ATTACHMENTS_BUCKET, else 'email-attachments').
   */
  emailAttachmentsBucket?: string;
  now?: () => Date;
  pageSize?: number;
  /** A part is closed once it passes this size (default about 4 GB). Tests inject a small one. */
  maxPartBytes?: number;
  /** Opening a stored file is retried with a growing delay before the export fails. */
  fileRetry?: { attempts?: number; delayMs?: number };
}

export interface ManifestFile {
  path: string;
  kind: 'csv' | 'json' | 'stored-file' | 'readme' | 'workspace';
  entity?: string;
  rows?: number;
  /** Which part (ZIP) of the export holds this file. */
  part: number;
  bytes: number;
  sha256: string;
}

export interface ManifestPart {
  part: number;
  /** The name the part is downloaded as. */
  file: string;
  bytes: number | null;
  /** null for part 1 inside its own manifest (it cannot hold its own hash): see the standalone manifest.json. */
  sha256: string | null;
}

export interface WorkspaceExportManifest {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_FORMAT_VERSION;
  requestId: string | null;
  workspace: { id: string; name: string; slug: string };
  generatedAt: string;
  /** Every ZIP of the export, in order. */
  parts: ManifestPart[];
  /** Rows per entity (the CSV and the JSON of one entity are checked to agree). */
  entities: Record<string, { rows: number; description: string }>;
  files: ManifestFile[];
  skippedFiles: Array<{ bucket: string; path: string; reason: string }>;
  warnings: string[];
}

export interface WorkspaceExportResult {
  /** Part 1 (the only part of a small export). */
  archivePath: string;
  /** All parts together. */
  archiveBytes: number;
  /** Part 1. */
  archiveSha256: string;
  /** Every part, local file and checksum. */
  parts: PartInfo[];
  /** The complete manifest as its own file, with the checksum of every part. */
  manifestPath: string;
  manifest: WorkspaceExportManifest;
  /** Rows per entity, for the audit row. */
  rowCounts: Record<string, number>;
  storedFileCount: number;
}

interface Plan {
  name: string;
  model: string;
  description: string;
  columns: string[];
  /** The columns that identify a row and order the keyset read (`id` unless the model has none). */
  keyColumns: readonly string[];
  urlColumns: readonly string[];
  /** Extra predicate beyond `tenantId` (users, and the team-visible mail). */
  where: (tenantId: string, now: Date) => Record<string, unknown>;
}

/**
 * Personal mail is private (owner decision 26/11/2026, no admin override): the export carries only
 * the mail the whole team may read (see emailTeamVisibleWhere), and the attachment rows of exactly
 * that mail.
 */
const TEAM_MAIL_WHERE: Record<string, (tenantId: string) => Record<string, unknown>> = {
  EmailRecord: (tenantId) => ({ tenantId, ...emailTeamVisibleWhere() }),
  EmailAttachment: (tenantId) => ({ tenantId, email: { is: emailTeamVisibleWhere() } }),
};

const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** All scalar columns of a model, in schema order, minus the export exclusions. */
export function exportColumns(model: string): string[] {
  const scalarEnum = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[
    `${model}ScalarFieldEnum`
  ];
  if (!scalarEnum) throw new Error(`No scalar fields known for model ${model}`);
  const excluded = new Set(excludedColumns(model));
  return Object.keys(scalarEnum).filter((c) => !excluded.has(c));
}

/** The files the export writes under data/, in order. */
export function buildPlans(): Plan[] {
  const plans: Plan[] = EXPORT_ENTITIES.map((e) => ({
    name: e.name,
    model: e.model,
    description: e.description,
    columns: exportColumns(e.model),
    keyColumns: e.keyColumns ?? ['id'],
    urlColumns: e.urlColumns ?? [],
    where: TEAM_MAIL_WHERE[e.model] ?? ((tenantId) => ({ tenantId })),
  }));
  plans.push({
    name: MEMBERSHIP_EXPORT.name,
    model: MEMBERSHIP_EXPORT.model,
    description: MEMBERSHIP_EXPORT.description,
    columns: [...MEMBERSHIP_EXPORT.columns],
    keyColumns: ['id'],
    urlColumns: [],
    // Like the users file: the operator staff grants are not the customer records.
    where: (tenantId) => ({ tenantId, source: { not: 'PORTAL_STAFF' } }),
  });
  plans.push({
    name: USER_EXPORT.name,
    model: USER_EXPORT.model,
    description: USER_EXPORT.description,
    columns: [...USER_EXPORT.columns],
    keyColumns: ['id'],
    urlColumns: [],
    // Home users plus members with a live membership. The tenant client does not filter users
    // (they can live in another home tenant), so the predicate is explicit.
    // Platform staff (PORTAL_STAFF, pinned, short-lived grants) are the operator's people, not the
    // customer's users: their details stay out of the customer's archive.
    where: (tenantId, now) => ({
      OR: [
        { tenantId },
        {
          memberships: {
            some: {
              tenantId,
              revokedAt: null,
              source: { not: 'PORTAL_STAFF' },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
          },
        },
      ],
    }),
  });
  return plans;
}

/**
 * Keyset condition for "rows after `last`" over `keys` (id alone, or a composite key): a row is
 * after when its first differing key column is greater.
 */
function afterKey(keys: readonly string[], last: ExportRow): Record<string, unknown> {
  return {
    OR: keys.map((key, i) => ({
      ...Object.fromEntries(keys.slice(0, i).map((k) => [k, last[k]])),
      [key]: { gt: last[key] },
    })),
  };
}

/** Decides, row by row, whether a row read from the database goes into the archive. */
type RowFilter = (row: ExportRow) => boolean;

/** Every id of `model` matching `where`, read in keyset pages (small tables: ids only). */
async function readIds(
  db: ExportDb,
  model: string,
  where: Record<string, unknown>,
  pageSize: number
): Promise<Set<string>> {
  const delegate = db[lowerFirst(model)];
  if (!delegate?.findMany) throw new Error(`Export database has no ${model} delegate`);
  const ids = new Set<string>();
  let after: string | undefined;
  for (;;) {
    const rows: Array<{ id: string }> = await delegate.findMany({
      where: after ? { AND: [where, { id: { gt: after } }] } : where,
      orderBy: { id: 'asc' },
      take: pageSize,
      select: { id: true },
    });
    for (const r of rows) ids.add(r.id);
    if (rows.length < pageSize) return ids;
    after = rows[rows.length - 1]!.id;
  }
}

async function* readPages(
  db: ExportDb,
  plan: Plan,
  tenantId: string,
  now: Date,
  pageSize: number,
  keep: RowFilter | null = null
): AsyncGenerator<ExportRow[]> {
  const delegate = db[lowerFirst(plan.model)];
  if (!delegate?.findMany) throw new Error(`Export database has no ${plan.model} delegate`);
  const keys = plan.keyColumns;
  const select = Object.fromEntries([...new Set([...keys, ...plan.columns])].map((c) => [c, true]));
  let last: ExportRow | undefined;
  for (;;) {
    const rows: ExportRow[] = await delegate.findMany({
      // Keyset paging (key > last key), not a Prisma cursor: a cursor row deleted mid-export would
      // match nothing and silently cut off every later row.
      where: last
        ? { AND: [plan.where(tenantId, now), afterKey(keys, last)] }
        : plan.where(tenantId, now),
      orderBy: keys.map((k) => ({ [k]: 'asc' })),
      take: pageSize,
      select,
    });
    if (rows.length === 0) return;
    // Paging follows the rows read; the filter only drops rows from what is written.
    const kept = keep ? rows.filter(keep) : rows;
    if (kept.length > 0) yield kept;
    if (rows.length < pageSize) return;
    last = rows[rows.length - 1]!;
  }
}

interface SpoolChunk {
  /** 1 for the first chunk (data/<name>.csv), then 2, 3, ... (data/<name>.part-N.csv). */
  n: number;
  csvPath: string;
  jsonPath: string;
  rows: number;
}

/**
 * One read of the entity feeds BOTH files, so the CSV and the JSON always hold the same rows with
 * the same values (two separate reads could see an edit in between). Both are spooled to
 * temporary files in that pass, so their sizes are known before either goes into a part. A table
 * bigger than `maxChunkBytes` continues in further chunk files (own header, own JSON array):
 * no single file of the archive can then be too big for one part.
 */
async function* spoolChunks(
  spoolBase: string,
  plan: Plan,
  pages: AsyncIterable<ExportRow[]>,
  maxChunkBytes: number
): AsyncGenerator<SpoolChunk> {
  const open = (path: string) => {
    const stream = createWriteStream(path);
    const closed = new Promise<void>((resolve, reject) => {
      stream.once('close', resolve);
      stream.once('error', reject);
    });
    closed.catch(() => undefined);
    const write = (s: string) =>
      new Promise<void>((resolve, reject) =>
        stream.write(s, (err) => (err ? reject(err) : resolve()))
      );
    return { stream, closed, write };
  };
  let n = 0;
  let cur: {
    csv: ReturnType<typeof open>;
    json: ReturnType<typeof open>;
    rows: number;
    csvBytes: number;
    jsonBytes: number;
  } | null = null;
  const start = async () => {
    n += 1;
    const csv = open(`${spoolBase}.${plan.name}.${n}.csv.spool`);
    const json = open(`${spoolBase}.${plan.name}.${n}.json.spool`);
    const header = '\ufeff' + csvHeader(plan.columns);
    await csv.write(header);
    await json.write('[');
    cur = { csv, json, rows: 0, csvBytes: Buffer.byteLength(header), jsonBytes: 1 };
  };
  const finish = async (): Promise<SpoolChunk> => {
    const c = cur!;
    await c.json.write(c.rows === 0 ? ']\n' : '\n]\n');
    c.csv.stream.end();
    c.json.stream.end();
    await Promise.all([c.csv.closed, c.json.closed]);
    cur = null;
    return {
      n,
      csvPath: `${spoolBase}.${plan.name}.${n}.csv.spool`,
      jsonPath: `${spoolBase}.${plan.name}.${n}.json.spool`,
      rows: c.rows,
    };
  };
  try {
    await start();
    for await (const page of pages) {
      for (const row of page) {
        const out = toJsonRow(row, plan.columns, plan.urlColumns);
        const csvLineText = csvLine(out, plan.columns);
        const body = JSON.stringify(out);
        const csvLen = Buffer.byteLength(csvLineText);
        const jsonLen = Buffer.byteLength(body) + 2;
        if (
          cur!.rows > 0 &&
          (cur!.csvBytes + csvLen > maxChunkBytes || cur!.jsonBytes + jsonLen > maxChunkBytes)
        ) {
          yield await finish();
          await start();
        }
        const jsonText = (cur!.rows === 0 ? '\n' : ',\n') + body;
        await cur!.csv.write(csvLineText);
        await cur!.json.write(jsonText);
        cur!.rows += 1;
        cur!.csvBytes += csvLen;
        cur!.jsonBytes += jsonLen;
      }
    }
    yield await finish();
  } catch (err) {
    const c = cur as { csv: ReturnType<typeof open>; json: ReturnType<typeof open> } | null;
    c?.csv.stream.destroy();
    c?.json.stream.destroy();
    throw err;
  }
}

/** A stored object path is only ever the tenant's own, and never steps out of it. */
export function isTenantStoragePath(tenantId: string, path: string): boolean {
  if (!path.startsWith(`${tenantId}/`) || path.length === tenantId.length + 1) return false;
  const segments = path.slice(tenantId.length + 1).split('/');
  return (
    !path.includes('\\') &&
    segments.every((s) => s !== '' && s !== '.' && s !== '..' && !/\0|%2e|%2f|%5c/i.test(s))
  );
}

export function renderReadme(
  manifest: WorkspaceExportManifest,
  plans: readonly Pick<Plan, 'name' | 'description'>[]
): string {
  const lines: string[] = [];
  lines.push(`Workspace data export: ${manifest.workspace.name}`);
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Workspace: ${manifest.workspace.name} (${manifest.workspace.slug})`);
  lines.push(`Generated: ${manifest.generatedAt} (UTC)`);
  if (manifest.requestId) lines.push(`Export request: ${manifest.requestId}`);
  lines.push('');
  lines.push('This archive is a standalone copy of the data your workspace owns. Every record is');
  lines.push('in two forms: data/<name>.csv (opens in Excel, Numbers or any spreadsheet) and');
  lines.push(
    'data/<name>.json (one JSON array per file, for systems and scripts). The two files of'
  );
  lines.push(
    'an entity hold the same rows. A very large table continues in further files of the same'
  );
  lines.push(
    'shape, data/<name>.part-2.csv and so on (each with its own header or JSON array): read'
  );
  lines.push('them one after the other. The rows per file are in manifest.json.');
  lines.push('');
  lines.push('Format notes');
  lines.push(
    '- Text is UTF-8. CSV files start with a byte-order mark so Excel reads accents correctly.'
  );
  lines.push(
    '- Dates and times are ISO-8601 in UTC. Money and large numbers are written as decimal'
  );
  lines.push('  text so no precision is lost.');
  lines.push(
    '- In CSV, list and JSON columns (tags, attendees, metadata) are written as JSON text.'
  );
  lines.push(
    '- Relations are by id: a column such as contactId matches the id column of contacts.'
  );
  lines.push(
    '- In CSV, a text cell that starts with = + - @ or a tab gets a leading apostrophe, so a'
  );
  lines.push(
    '  spreadsheet shows it as text and never runs it as a formula. A text value Excel would change',
    '  (leading zeros, more than 15 digits) gets the apostrophe too. The JSON files are exact.'
  );
  lines.push('');
  lines.push('Files in this archive');
  lines.push('---------------------');
  lines.push('README.txt          this file');
  lines.push('manifest.json       row count, size and sha256 of every other file');
  lines.push('workspace.json      the workspace record (name, slug, plan, dates)');
  for (const p of plans) {
    const rows = manifest.entities[p.name]?.rows ?? 0;
    lines.push(`data/${p.name}.csv, data/${p.name}.json   (${rows} rows)`);
    lines.push(`    ${p.description}`);
  }
  const stored = manifest.files.filter((f) => f.kind === 'stored-file');
  lines.push(
    `files/<bucket>/...  ${stored.length} stored file(s): email attachments and case documents`
  );
  lines.push('                    under the same names they have in storage.');
  lines.push('');
  lines.push('Not included');
  lines.push('------------');
  lines.push('Credentials and secrets of any kind: passwords, session and OAuth tokens, mailbox');
  lines.push(
    'passwords, API keys and webhook secrets are never exported. Also left out because it is'
  );
  lines.push('platform data and not your records: AI embeddings and derived scores, audit and');
  lines.push('security logs, API usage counters, and billing records (your invoices are in your');
  lines.push('payment provider account). Call recording links are not included.');
  lines.push("Private email: mail in a person's own mailbox and unsent drafts are private to that");
  lines.push('person and are excluded, with their attachments. Included: mail in the company');
  lines.push('mailbox, inbound mail nobody owns, and mail logged to a lead or a contact.');
  lines.push('');
  lines.push('Checking the archive');
  lines.push('--------------------');
  lines.push(
    'manifest.json lists the sha256 of every file. On Linux or macOS: sha256sum data/leads.csv'
  );
  lines.push('On Windows (PowerShell): Get-FileHash data\\leads.csv -Algorithm SHA256');
  lines.push('The sha256 of each ZIP is shown on the export request and in the email.');
  if (manifest.parts.length > 1) {
    lines.push(
      `This export is split into ${manifest.parts.length} ZIP parts (each file says which part holds it in`
    );
    lines.push('manifest.json). Download all parts and extract them into one folder. The separate');
    lines.push('manifest.json download lists every part with its size and sha256.');
  }
  if (manifest.skippedFiles.length > 0 || manifest.warnings.length > 0) {
    lines.push('');
    lines.push('Notes on this export');
    lines.push('--------------------');
    for (const w of manifest.warnings) lines.push(`- ${w}`);
    for (const s of manifest.skippedFiles) {
      lines.push(`- Stored file not copied: ${s.bucket}/${s.path} (${s.reason})`);
    }
  }
  lines.push('');
  return lines.join('\r\n');
}

interface ExportRun {
  writer: PartedArchive;
  files: ManifestFile[];
  entities: WorkspaceExportManifest['entities'];
  warnings: string[];
  skippedFiles: WorkspaceExportManifest['skippedFiles'];
  /** The bucket that holds email attachments. */
  emailBucket: string;
  /** Ids of the exported mail: only their attachment rows are exported. */
  emailIds: Set<string>;
  /** Storage paths of the exported email attachments: the only objects copied from that bucket. */
  attachmentPaths: Set<string>;
  /** Stored email attachments left out because their mail is private. */
  privateAttachmentsLeftOut: number;
  track(info: PartedEntryInfo, extra: Omit<ManifestFile, 'bytes' | 'sha256' | 'part'>): void;
}

/**
 * The row-level filter of an entity, or null. Personal mail is private (owner decision
 * 26/11/2026): a mail is exported only when the whole team may read it, with the check the
 * database `where` cannot do (the lead or contact it is logged to must still exist), and an
 * attachment row only when its mail was exported. Mail is read before its attachments.
 */
async function rowFilterFor(
  run: ExportRun,
  plan: Plan,
  ctx: { db: ExportDb; tenantId: string; pageSize: number }
): Promise<RowFilter | null> {
  if (plan.model === 'EmailRecord') {
    const { db, tenantId, pageSize } = ctx;
    const [tenantMailboxIds, contactIds, leadIds] = await Promise.all([
      readIds(db, 'EmailMailbox', { tenantId, scope: 'TENANT' }, pageSize),
      readIds(db, 'Contact', { tenantId }, pageSize),
      readIds(db, 'Lead', { tenantId }, pageSize),
    ]);
    const team: TeamMailContext = { tenantMailboxIds, contactIds, leadIds };
    return (row) => {
      if (!isTeamVisibleEmail(row as TeamMailRow, team)) return false;
      run.emailIds.add(String(row.id));
      return true;
    };
  }
  if (plan.model === 'EmailAttachment') {
    return (row) => {
      if (!run.emailIds.has(String(row.emailId))) return false;
      if (typeof row.fileUrl === 'string') run.attachmentPaths.add(row.fileUrl);
      return true;
    };
  }
  return null;
}

/** One entity: its CSV, then its JSON, each from its own keyset read. */
async function writeEntityFiles(
  run: ExportRun,
  plan: Plan,
  ctx: {
    db: ExportDb;
    tenantId: string;
    now: Date;
    pageSize: number;
    spoolBase: string;
    maxChunkBytes: number;
  }
): Promise<void> {
  const spools: string[] = [];
  let total = 0;
  try {
    const keep = await rowFilterFor(run, plan, ctx);
    const pages = readPages(ctx.db, plan, ctx.tenantId, ctx.now, ctx.pageSize, keep);
    const chunks = spoolChunks(ctx.spoolBase, plan, pages, ctx.maxChunkBytes);
    for await (const chunk of chunks) {
      spools.push(chunk.csvPath, chunk.jsonPath);
      const base = chunk.n === 1 ? plan.name : `${plan.name}.part-${chunk.n}`;
      const csvName = `data/${base}.csv`;
      const jsonName = `data/${base}.json`;
      // The raw size is an upper bound of what the entry adds to a part, so a part with room for
      // it is chosen.
      const csv = await run.writer.addStream(
        csvName,
        createReadStream(chunk.csvPath),
        (await stat(chunk.csvPath)).size
      );
      run.track(csv, { path: csvName, kind: 'csv', entity: plan.name, rows: chunk.rows });
      const json = await run.writer.addStream(
        jsonName,
        createReadStream(chunk.jsonPath),
        (await stat(chunk.jsonPath)).size
      );
      run.track(json, { path: jsonName, kind: 'json', entity: plan.name, rows: chunk.rows });
      await Promise.all([rm(chunk.csvPath, { force: true }), rm(chunk.jsonPath, { force: true })]);
      total += chunk.rows;
    }
  } finally {
    await Promise.all(spools.map((p) => rm(p, { force: true })));
  }
  run.entities[plan.name] = { rows: total, description: plan.description };
}

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/**
 * Opens a stored object. A confirmed missing object is thrown at once (the caller skips and says
 * so). Any other failure (5xx, rate limit, timeout) is retried with a doubling delay, then thrown:
 * the job fails and BullMQ retries it, instead of an archive that silently lacks files.
 */
async function openWithRetry(
  storage: ExportFileStorage,
  bucket: string,
  path: string,
  retry: { attempts: number; delayMs: number }
): Promise<Readable> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await storage.openFile(bucket, path);
    } catch (err) {
      if (isMissingObjectError(err) || attempt >= retry.attempts) throw err;
      await sleep(retry.delayMs * 2 ** (attempt - 1));
    }
  }
}

/** Why an object is not copied, or null when it is. Counts the private attachments left out. */
function skipReason(
  run: ExportRun,
  bucket: string,
  tenantId: string,
  path: string
): { reason: string; silent: boolean } | null {
  if (!isTenantStoragePath(tenantId, path)) {
    return { reason: 'path outside the workspace folder', silent: false };
  }
  // Email attachments leave only with their mail: an object that no exported attachment row
  // points at belongs to private mail (a personal mailbox or a draft) and stays out.
  if (bucket === run.emailBucket && !run.attachmentPaths.has(path)) {
    run.privateAttachmentsLeftOut += 1;
    return { reason: 'private mail', silent: true };
  }
  return null;
}

/** One stored object into the archive, or a recorded skip when it is confirmed gone. */
async function copyStoredFile(
  run: ExportRun,
  storage: ExportFileStorage,
  target: { bucket: string; tenantId: string; retry: { attempts: number; delayMs: number } },
  obj: { path: string; size: number | null }
): Promise<void> {
  const { bucket, tenantId, retry } = target;
  const skip = skipReason(run, bucket, tenantId, obj.path);
  if (skip) {
    if (!skip.silent) run.skippedFiles.push({ bucket, path: obj.path, reason: skip.reason });
    return;
  }
  let stream: Readable;
  try {
    stream = await openWithRetry(storage, bucket, obj.path, retry);
  } catch (err) {
    if (!isMissingObjectError(err)) throw err;
    // The object is confirmed gone: say so in the README and manifest, keep going.
    const reason = err instanceof Error ? err.message : String(err);
    run.skippedFiles.push({ bucket, path: obj.path, reason: reason.slice(0, 200) });
    return;
  }
  const entryName = `files/${bucket}/${obj.path.slice(tenantId.length + 1)}`;
  // An error while streaming corrupts the archive entry, so it fails the whole export.
  run.track(await run.writer.addStream(entryName, stream, obj.size), {
    path: entryName,
    kind: 'stored-file',
  });
}

/** The tenant's own objects from each bucket, streamed into files/<bucket>/. */
async function copyStoredFiles(
  run: ExportRun,
  storage: ExportFileStorage,
  buckets: readonly string[],
  tenantId: string,
  retry: { attempts: number; delayMs: number }
): Promise<void> {
  for (const bucket of buckets) {
    // A listing error is not swallowed: an export that silently lacks a bucket's files is
    // worse than a failed job that BullMQ retries. A bucket that does not exist lists empty.
    for await (const obj of storage.listFiles(bucket, tenantId)) {
      await copyStoredFile(run, storage, { bucket, tenantId, retry }, obj);
    }
  }
}

export async function runWorkspaceExport(
  opts: RunWorkspaceExportOptions
): Promise<WorkspaceExportResult> {
  const { db, tenantId, outputPath } = opts;
  if (!tenantId) throw new Error('A tenantId is required');
  const now = opts.now ?? (() => new Date());
  const generatedAt = now();
  const pageSize = opts.pageSize ?? 500;
  const emailBucket = opts.emailAttachmentsBucket ?? resolveEmailAttachmentsBucket();
  const buckets = opts.buckets ?? defaultExportFileBuckets(emailBucket);

  const tenant = await db.tenant.findFirst({
    where: { id: tenantId },
    select: Object.fromEntries(TENANT_COLUMNS.map((c) => [c, true])),
  });
  if (!tenant || tenant.id !== tenantId) throw new Error(`Workspace ${tenantId} not found`);

  const plans = buildPlans();
  const writer = new PartedArchive(outputPath, opts.maxPartBytes ?? DEFAULT_MAX_PART_BYTES);
  const run: ExportRun = {
    writer,
    files: [],
    entities: {},
    warnings: [],
    skippedFiles: [],
    emailBucket,
    emailIds: new Set<string>(),
    attachmentPaths: new Set<string>(),
    privateAttachmentsLeftOut: 0,
    track(info, extra) {
      this.files.push({ ...extra, part: info.part, bytes: info.bytes, sha256: info.sha256 });
    },
  };

  try {
    const workspaceJson = JSON.stringify(
      toJsonRow(tenant as ExportRow, TENANT_COLUMNS, []),
      null,
      2
    );
    run.track(await writer.addGenerated('workspace.json', (w) => w(workspaceJson + '\n')), {
      path: 'workspace.json',
      kind: 'workspace',
    });

    for (const plan of plans) {
      await writeEntityFiles(run, plan, {
        db,
        tenantId,
        now: generatedAt,
        pageSize,
        spoolBase: outputPath,
        maxChunkBytes: opts.maxPartBytes ?? DEFAULT_MAX_PART_BYTES,
      });
    }
    if (opts.files) {
      await copyStoredFiles(run, opts.files, buckets, tenantId, {
        attempts: opts.fileRetry?.attempts ?? 4,
        delayMs: opts.fileRetry?.delayMs ?? 1000,
      });
    }
    if (run.privateAttachmentsLeftOut > 0) {
      run.warnings.push(
        `${run.privateAttachmentsLeftOut} stored email attachment file(s) belong to private mail ` +
          'and were left out.'
      );
    }

    // Every data part is closed first, so the manifest can list their sizes and checksums.
    const later = await writer.finalizeLaterParts();
    const total = later.length + 1;
    const partFile = (n: number) => partDownloadName(opts.requestId ?? null, n, total);
    const partsFor = (first: PartInfo | null): ManifestPart[] => [
      {
        part: 1,
        file: partFile(1),
        bytes: first ? first.bytes : null,
        sha256: first ? first.sha256 : null,
      },
      ...later.map((p) => ({
        part: p.part,
        file: partFile(p.part),
        bytes: p.bytes,
        sha256: p.sha256,
      })),
    ];
    const manifest: WorkspaceExportManifest = {
      format: EXPORT_FORMAT,
      version: EXPORT_FORMAT_VERSION,
      requestId: opts.requestId ?? null,
      workspace: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      generatedAt: generatedAt.toISOString(),
      parts: partsFor(null),
      entities: run.entities,
      files: run.files,
      skippedFiles: run.skippedFiles,
      warnings: run.warnings,
    };
    const readme = renderReadme(manifest, plans);
    const readmeInfo = await writer.addToFirstPart('README.txt', (w) => w(readme));
    manifest.files.unshift({ ...readmeInfo, path: 'README.txt', kind: 'readme' });
    await writer.addToFirstPart('manifest.json', (w) =>
      w(JSON.stringify(manifest, null, 2) + '\n')
    );

    const first = await writer.finalizeFirstPart();
    // The standalone copy is complete: part 1's own checksum can only be known now.
    const manifestPath = `${outputPath}.manifest.json`;
    await writeFile(
      manifestPath,
      JSON.stringify({ ...manifest, parts: partsFor(first) }, null, 2) + '\n',
      'utf8'
    );
    const parts = [first, ...later];
    const rowCounts: Record<string, number> = {};
    for (const [name, e] of Object.entries(run.entities)) rowCounts[name] = e.rows;
    return {
      archivePath: outputPath,
      archiveBytes: parts.reduce((sum, p) => sum + p.bytes, 0),
      archiveSha256: first.sha256,
      parts,
      manifestPath,
      manifest: { ...manifest, parts: partsFor(first) },
      rowCounts,
      storedFileCount: run.files.filter((f) => f.kind === 'stored-file').length,
    };
  } catch (err) {
    writer.abort();
    throw err;
  }
}

/** What a part is downloaded as: one ZIP keeps the plain name. */
export function partDownloadName(requestId: string | null, part: number, total: number): string {
  const base = requestId ? `workspace-export-${requestId}` : 'workspace-export';
  return total > 1 ? `${base}-part-${part}.zip` : `${base}.zip`;
}

/** sha256 of a string, hex (used by tests and callers that verify the manifest). */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
