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
import { Prisma } from '@intelliflow/db';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { ArchiveWriter, type ArchiveEntryInfo } from './archive-writer';
import {
  DEFAULT_EXPORT_FILE_BUCKETS,
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
  now?: () => Date;
  pageSize?: number;
}

export interface ManifestFile {
  path: string;
  kind: 'csv' | 'json' | 'stored-file' | 'readme' | 'workspace';
  entity?: string;
  rows?: number;
  bytes: number;
  sha256: string;
}

export interface WorkspaceExportManifest {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_FORMAT_VERSION;
  requestId: string | null;
  workspace: { id: string; name: string; slug: string };
  generatedAt: string;
  /** Rows per entity (the CSV and the JSON of one entity are checked to agree). */
  entities: Record<string, { rows: number; description: string }>;
  files: ManifestFile[];
  skippedFiles: Array<{ bucket: string; path: string; reason: string }>;
  warnings: string[];
}

export interface WorkspaceExportResult {
  archivePath: string;
  archiveBytes: number;
  archiveSha256: string;
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
  urlColumns: readonly string[];
  /** Extra predicate beyond `tenantId` (users only). */
  where: (tenantId: string, now: Date) => Record<string, unknown>;
}

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
    urlColumns: e.urlColumns ?? [],
    where: (tenantId) => ({ tenantId }),
  }));
  plans.push({
    name: MEMBERSHIP_EXPORT.name,
    model: MEMBERSHIP_EXPORT.model,
    description: MEMBERSHIP_EXPORT.description,
    columns: [...MEMBERSHIP_EXPORT.columns],
    urlColumns: [],
    where: (tenantId) => ({ tenantId }),
  });
  plans.push({
    name: USER_EXPORT.name,
    model: USER_EXPORT.model,
    description: USER_EXPORT.description,
    columns: [...USER_EXPORT.columns],
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

async function* readPages(
  db: ExportDb,
  plan: Plan,
  tenantId: string,
  now: Date,
  pageSize: number
): AsyncGenerator<ExportRow[]> {
  const delegate = db[lowerFirst(plan.model)];
  if (!delegate?.findMany) throw new Error(`Export database has no ${plan.model} delegate`);
  const select = Object.fromEntries([...new Set(['id', ...plan.columns])].map((c) => [c, true]));
  let cursor: string | undefined;
  for (;;) {
    const rows: ExportRow[] = await delegate.findMany({
      // Keyset paging (id > last id), not a Prisma cursor: a cursor row deleted mid-export would
      // match nothing and silently cut off every later row.
      where: cursor
        ? { AND: [plan.where(tenantId, now), { id: { gt: cursor } }] }
        : plan.where(tenantId, now),
      orderBy: { id: 'asc' },
      take: pageSize,
      select,
    });
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < pageSize) return;
    cursor = String(rows[rows.length - 1]!.id);
  }
}

/**
 * One read of the entity feeds BOTH files, so the CSV and the JSON always hold the same rows with
 * the same values (two separate reads could see an edit in between). The CSV goes straight into
 * the archive; the JSON is spooled to a temporary file in the same pass and added right after.
 */
async function writeCsvAndSpoolJson(
  write: (s: string) => Promise<void>,
  spoolPath: string,
  pages: AsyncIterable<ExportRow[]>,
  plan: Plan
): Promise<number> {
  const spool = createWriteStream(spoolPath);
  const spoolClosed = new Promise<void>((resolve, reject) => {
    spool.once('close', resolve);
    spool.once('error', reject);
  });
  spoolClosed.catch(() => undefined);
  const spoolWrite = (s: string) =>
    new Promise<void>((resolve, reject) =>
      spool.write(s, (err) => (err ? reject(err) : resolve()))
    );
  try {
    await write('\ufeff' + csvHeader(plan.columns));
    await spoolWrite('[');
    let rows = 0;
    for await (const page of pages) {
      let csv = '';
      let json = '';
      for (const row of page) {
        const out = toJsonRow(row, plan.columns, plan.urlColumns);
        csv += csvLine(out, plan.columns);
        json += (rows === 0 ? '\n' : ',\n') + JSON.stringify(out);
        rows += 1;
      }
      await write(csv);
      await spoolWrite(json);
    }
    await spoolWrite(rows === 0 ? ']\n' : '\n]\n');
    spool.end();
    await spoolClosed;
    return rows;
  } catch (err) {
    spool.destroy();
    throw err;
  }
}

/** A stored object path is only ever the tenant's own, and never steps out of it. */
export function isTenantStoragePath(tenantId: string, path: string): boolean {
  if (!path.startsWith(`${tenantId}/`) || path.length === tenantId.length + 1) return false;
  const segments = path.slice(tenantId.length + 1).split('/');
  return (
    !path.includes('\\') &&
    segments.every((s) => s !== '' && s !== '.' && s !== '..' && !/[\0%]/.test(s))
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
  lines.push('an entity hold the same rows.');
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
  lines.push('');
  lines.push('Checking the archive');
  lines.push('--------------------');
  lines.push(
    'manifest.json lists the sha256 of every file. On Linux or macOS: sha256sum data/leads.csv'
  );
  lines.push('On Windows (PowerShell): Get-FileHash data\\leads.csv -Algorithm SHA256');
  lines.push('The sha256 of the whole ZIP is shown on the export request and in the email.');
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
  writer: ArchiveWriter;
  files: ManifestFile[];
  entities: WorkspaceExportManifest['entities'];
  warnings: string[];
  skippedFiles: WorkspaceExportManifest['skippedFiles'];
  track(info: ArchiveEntryInfo, extra: Omit<ManifestFile, 'bytes' | 'sha256'>): void;
}

/** One entity: its CSV, then its JSON, each from its own keyset read. */
async function writeEntityFiles(
  run: ExportRun,
  plan: Plan,
  ctx: { db: ExportDb; tenantId: string; now: Date; pageSize: number; spoolBase: string }
): Promise<void> {
  let rows = 0;
  const csvPath = `data/${plan.name}.csv`;
  const jsonPath = `data/${plan.name}.json`;
  const spoolPath = `${ctx.spoolBase}.${plan.name}.json.spool`;
  try {
    const csv = await run.writer.addGenerated(csvPath, async (w) => {
      rows = await writeCsvAndSpoolJson(
        w,
        spoolPath,
        readPages(ctx.db, plan, ctx.tenantId, ctx.now, ctx.pageSize),
        plan
      );
    });
    run.track(csv, { path: csvPath, kind: 'csv', entity: plan.name, rows });
    const json = await run.writer.addStream(jsonPath, createReadStream(spoolPath));
    run.track(json, { path: jsonPath, kind: 'json', entity: plan.name, rows });
  } finally {
    await rm(spoolPath, { force: true });
  }
  run.entities[plan.name] = { rows, description: plan.description };
}

/** The tenant's own objects from each bucket, streamed into files/<bucket>/. */
async function copyStoredFiles(
  run: ExportRun,
  storage: ExportFileStorage,
  buckets: readonly string[],
  tenantId: string
): Promise<void> {
  for (const bucket of buckets) {
    // A listing error is not swallowed: an export that silently lacks a bucket's files is
    // worse than a failed job that BullMQ retries. A bucket that does not exist lists empty.
    for await (const obj of storage.listFiles(bucket, tenantId)) {
      if (!isTenantStoragePath(tenantId, obj.path)) {
        run.skippedFiles.push({
          bucket,
          path: obj.path,
          reason: 'path outside the workspace folder',
        });
        continue;
      }
      let stream: Readable;
      try {
        stream = await storage.openFile(bucket, obj.path);
      } catch (err) {
        // The object is gone or unreadable: say so in the README and manifest, keep going.
        const reason = err instanceof Error ? err.message : String(err);
        run.skippedFiles.push({ bucket, path: obj.path, reason: reason.slice(0, 200) });
        continue;
      }
      const entryName = `files/${bucket}/${obj.path.slice(tenantId.length + 1)}`;
      // An error while streaming corrupts the archive entry, so it fails the whole export.
      run.track(await run.writer.addStream(entryName, stream), {
        path: entryName,
        kind: 'stored-file',
      });
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
  const buckets = opts.buckets ?? DEFAULT_EXPORT_FILE_BUCKETS;

  const tenant = await db.tenant.findFirst({
    where: { id: tenantId },
    select: Object.fromEntries(TENANT_COLUMNS.map((c) => [c, true])),
  });
  if (!tenant || tenant.id !== tenantId) throw new Error(`Workspace ${tenantId} not found`);

  const plans = buildPlans();
  const writer = new ArchiveWriter(outputPath);
  const run: ExportRun = {
    writer,
    files: [],
    entities: {},
    warnings: [],
    skippedFiles: [],
    track(info, extra) {
      this.files.push({ ...extra, bytes: info.bytes, sha256: info.sha256 });
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
      });
    }
    if (opts.files) await copyStoredFiles(run, opts.files, buckets, tenantId);

    const manifest: WorkspaceExportManifest = {
      format: EXPORT_FORMAT,
      version: EXPORT_FORMAT_VERSION,
      requestId: opts.requestId ?? null,
      workspace: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      generatedAt: generatedAt.toISOString(),
      entities: run.entities,
      files: run.files,
      skippedFiles: run.skippedFiles,
      warnings: run.warnings,
    };
    const readme = renderReadme(manifest, plans);
    const readmeInfo = await writer.addGenerated('README.txt', (w) => w(readme));
    manifest.files.unshift({ ...readmeInfo, path: 'README.txt', kind: 'readme' });
    await writer.addGenerated('manifest.json', (w) => w(JSON.stringify(manifest, null, 2) + '\n'));

    const { bytes, sha256 } = await writer.finalize();
    const rowCounts: Record<string, number> = {};
    for (const [name, e] of Object.entries(run.entities)) rowCounts[name] = e.rows;
    return {
      archivePath: outputPath,
      archiveBytes: bytes,
      archiveSha256: sha256,
      manifest,
      rowCounts,
      storedFileCount: run.files.filter((f) => f.kind === 'stored-file').length,
    };
  } catch (err) {
    writer.abort();
    throw err;
  }
}

/** sha256 of a string, hex (used by tests and callers that verify the manifest). */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
