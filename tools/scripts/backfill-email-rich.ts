/**
 * Backfill of rich email content for mail logged before Aurora kept it. Operator-run, never over
 * HTTP, dry run by default.
 *
 * For a tenant's email records (optionally one lead's), where the provider still has the message:
 * - `sentAt`: set from the provider's own date (Graph receivedDateTime, Gmail internalDate) where
 *   it is null, which received mail synced before 26/11/2026 all are. Where the provider cannot
 *   be asked (Zoho, a mailbox that is gone) a mail the sync logged keeps the date it stored as
 *   `createdAt`, which is that same provider date.
 * - `bodyHtml`: the provider's HTML body, sanitised exactly as the sync sanitises it. For mail
 *   the COA sent through Resend (provider RESEND), the original HTML is read from Resend's
 *   get-email API (`GET /emails/{id}` returns `html`), which needs RESEND_API_KEY.
 * - attachment METADATA (name, size, type, provider locator) in email_attachments. The files are
 *   never downloaded or stored: they are fetched on demand when a user opens them.
 *
 * A record the provider no longer has is reported and left as it is. A record already complete is
 * skipped, so a second run changes nothing.
 *
 * A dry run reads the providers (read-only requests) and prints what it would write; `--no-provider`
 * makes it offline (only the date fallback is then possible). `--apply` writes.
 *
 * Usage (from the repo root), against a LOCAL database unless the owner says otherwise:
 *   DATABASE_URL=<aurora url> pnpm tsx tools/scripts/backfill-email-rich.ts \
 *     --tenant <tenantId> [--lead <leadId>] [--limit 200] [--no-provider] [--apply]
 * Provider access comes from the mailboxes' stored connections (EMAIL_OAUTH_* client settings as in
 * the API) and RESEND_API_KEY for the Resend mail. Production needs the owner's yes and
 * ALLOW_PROD_DB_OPS=1; this script is never run against production by an agent.
 */

import { OperatorError, argValue, assertMayWrite, describeTarget } from './lib/partner-trust';

export interface AttachmentMetaLike {
  providerAttachmentId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  contentId: string | null;
  isInline: boolean;
}

/** The part of an email record the backfill decides on. */
export interface BackfillRecord {
  id: string;
  tenantId: string;
  provider: string | null;
  providerMessageId: string | null;
  mailboxId: string | null;
  sentAt: Date | null;
  createdAt: Date;
  hasHtml: boolean;
  attachmentCount: number;
  metadata: unknown;
}

export interface FetchedMail {
  receivedAt: Date | null;
  html: string | null;
  attachments: AttachmentMetaLike[];
}

/** 'gone': the provider no longer has it. 'skipped': this kind of record cannot be asked. */
export type FetchResult = FetchedMail | 'gone' | 'skipped';

export interface BackfillSource {
  fetch(record: BackfillRecord): Promise<FetchResult>;
}

export interface BackfillChange {
  id: string;
  tenantId: string;
  sentAt?: Date;
  bodyHtml?: string;
  attachments: Array<Record<string, unknown>>;
}

export interface BackfillDb {
  loadRecords(args: {
    tenantId: string;
    leadId?: string;
    limit: number;
  }): Promise<BackfillRecord[]>;
  apply(change: BackfillChange): Promise<void>;
}

export interface BackfillOptions {
  tenantId: string;
  leadId?: string;
  limit: number;
  apply: boolean;
  /** Offline: nothing is asked of any provider. */
  noProvider: boolean;
  target: { host: string; local: boolean };
}

export interface BackfillDeps {
  /** The sync's own sanitiser (apps/api/src/modules/email/email-html-sanitizer.ts). */
  sanitize(html: string | null): string | null;
  /** The attachment rows the sync writes (metadata only, fileUrl ''). */
  attachmentRows(
    emailId: string,
    tenantId: string,
    attachments: readonly AttachmentMetaLike[]
  ): Array<Record<string, unknown>>;
}

export interface BackfillResult {
  scanned: number;
  complete: number;
  datesFromProvider: number;
  datesFromRecord: number;
  htmlFilled: number;
  attachmentRowsAdded: number;
  providerGone: number;
  resendHtmlRecovered: number;
  resendHtmlNotRecoverable: number;
  failed: number;
  lines: string[];
}

const MAIL_PROVIDERS = new Set(['GMAIL', 'MICROSOFT', 'ZOHO']);

function sourceOf(metadata: unknown): string | null {
  const source = (metadata as { source?: unknown } | null)?.source;
  return typeof source === 'string' ? source : null;
}

function newResult(): BackfillResult {
  return {
    scanned: 0,
    complete: 0,
    datesFromProvider: 0,
    datesFromRecord: 0,
    htmlFilled: 0,
    attachmentRowsAdded: 0,
    providerGone: 0,
    resendHtmlRecovered: 0,
    resendHtmlNotRecoverable: 0,
    failed: 0,
    lines: [],
  };
}

/** What one record still lacks. */
interface Needs {
  date: boolean;
  html: boolean;
  attachments: boolean;
  isResend: boolean;
}

function needsOf(record: BackfillRecord): Needs {
  const isResend = record.provider === 'RESEND';
  const isMail = record.provider !== null && MAIL_PROVIDERS.has(record.provider);
  return {
    date: record.sentAt === null,
    html: !record.hasHtml && (isMail || isResend),
    attachments: isMail && record.attachmentCount === 0,
    isResend,
  };
}

/** The change a fetched mail makes to one record, counting what it fills. */
function changeFromFetched(
  record: BackfillRecord,
  needs: Needs,
  fetched: FetchedMail,
  deps: BackfillDeps,
  result: BackfillResult
): BackfillChange {
  const change: BackfillChange = { id: record.id, tenantId: record.tenantId, attachments: [] };
  if (needs.date && fetched.receivedAt) {
    change.sentAt = fetched.receivedAt;
    result.datesFromProvider += 1;
  }
  const html = needs.html ? deps.sanitize(fetched.html) : null;
  if (html) {
    change.bodyHtml = html;
    result.htmlFilled += 1;
    if (needs.isResend) result.resendHtmlRecovered += 1;
  } else if (needs.html && needs.isResend) {
    result.resendHtmlNotRecoverable += 1;
  }
  if (needs.attachments && fetched.attachments.length > 0) {
    change.attachments = deps.attachmentRows(record.id, record.tenantId, fetched.attachments);
    result.attachmentRowsAdded += change.attachments.length;
  }
  return change;
}

/** Asks the provider for one record; null when the read failed (reported, record left alone). */
async function fetchFor(
  record: BackfillRecord,
  source: BackfillSource | null,
  options: BackfillOptions,
  result: BackfillResult
): Promise<FetchResult | null> {
  if (!source || options.noProvider || !record.providerMessageId) return 'skipped';
  try {
    return await source.fetch(record);
  } catch (error) {
    result.failed += 1;
    result.lines.push(`  ${record.id}: provider read failed (${errorLabel(error)}); left as it is`);
    return null;
  }
}

function isEmpty(change: BackfillChange): boolean {
  return (
    change.sentAt === undefined && change.bodyHtml === undefined && change.attachments.length === 0
  );
}

/** The change one record needs; null when it is complete or its provider read failed. */
async function changeFor(
  record: BackfillRecord,
  source: BackfillSource | null,
  deps: BackfillDeps,
  options: BackfillOptions,
  result: BackfillResult
): Promise<BackfillChange | null> {
  const needs = needsOf(record);
  if (!needs.date && !needs.html && !needs.attachments) {
    result.complete += 1;
    return null;
  }
  const fetched = await fetchFor(record, source, options, result);
  if (fetched === null) return null;
  let change: BackfillChange = { id: record.id, tenantId: record.tenantId, attachments: [] };
  if (fetched === 'gone') result.providerGone += 1;
  if (fetched === 'gone' || fetched === 'skipped') {
    if (needs.html && needs.isResend) result.resendHtmlNotRecoverable += 1;
  } else {
    change = changeFromFetched(record, needs, fetched, deps, result);
  }
  // The provider could not give a date: a mail the sync logged keeps the date it stored.
  if (needs.date && !change.sentAt && sourceOf(record.metadata) === 'outlook-sync') {
    change.sentAt = record.createdAt;
    result.datesFromRecord += 1;
  }
  return change;
}

export async function backfillEmailRich(
  db: BackfillDb,
  source: BackfillSource | null,
  deps: BackfillDeps,
  options: BackfillOptions
): Promise<BackfillResult> {
  if (options.apply) assertMayWrite(options.target);
  const result = newResult();
  const records = await db.loadRecords({
    tenantId: options.tenantId,
    leadId: options.leadId,
    limit: options.limit,
  });
  for (const record of records) {
    result.scanned += 1;
    const change = await changeFor(record, source, deps, options, result);
    if (change && !isEmpty(change) && options.apply) await db.apply(change);
  }
  result.lines = summaryLines(result, options);
  return result;
}

function summaryLines(result: BackfillResult, options: BackfillOptions): string[] {
  const where = options.target.local ? ' (local)' : ' (NOT local)';
  const lead = options.leadId ? ` (lead ${options.leadId})` : '';
  const verb = options.apply ? 'written' : 'to write';
  return [
    `target database: ${options.target.host}${where}`,
    `records read: ${result.scanned}${lead}`,
    `already complete: ${result.complete}`,
    `sentAt from the provider: ${result.datesFromProvider}; from the stored sync date: ${result.datesFromRecord}`,
    `HTML bodies ${verb}: ${result.htmlFilled}`,
    `attachment metadata rows ${verb}: ${result.attachmentRowsAdded} (no file is downloaded)`,
    `Resend mail: HTML recovered ${result.resendHtmlRecovered}, not recoverable ${result.resendHtmlNotRecoverable}`,
    `provider no longer has the message: ${result.providerGone}; read failures: ${result.failed}`,
    ...result.lines,
    options.apply ? 'Applied.' : 'Dry run: nothing written. Re-run with --apply.',
  ];
}

function errorLabel(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'error';
}

export interface MainDeps {
  createDb(url: string, apply: boolean): Promise<BackfillDb & { close(): Promise<void> }>;
  createSource(
    env: Readonly<Record<string, string | undefined>>,
    db: BackfillDb
  ): Promise<BackfillSource>;
  loadHelpers(): Promise<BackfillDeps>;
  log(line: string): void;
  error(line: string): void;
}

const USAGE =
  'Usage: DATABASE_URL=<aurora url> pnpm tsx tools/scripts/backfill-email-rich.ts ' +
  '--tenant <tenantId> [--lead <leadId>] [--limit 200] [--no-provider] [--apply]';

export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  deps: MainDeps = realDeps()
): Promise<number> {
  const tenantId = argValue(argv, 'tenant');
  const databaseUrl = env['DATABASE_URL'];
  if (!tenantId || !databaseUrl) {
    deps.error(USAGE);
    return 1;
  }
  const limit = Number(argValue(argv, 'limit') ?? '200');
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
    deps.error('--limit must be a whole number from 1 to 5000.');
    return 1;
  }
  const apply = argv.includes('--apply');
  const noProvider = argv.includes('--no-provider');
  const db = await deps.createDb(databaseUrl, apply);
  try {
    const helpers = await deps.loadHelpers();
    const source = noProvider ? null : await deps.createSource(env, db);
    const result = await backfillEmailRich(db, source, helpers, {
      tenantId,
      leadId: argValue(argv, 'lead'),
      limit,
      apply,
      noProvider,
      target: describeTarget(databaseUrl),
    });
    for (const line of result.lines) deps.log(line);
    return 0;
  } catch (err) {
    deps.error(err instanceof Error ? err.message : String(err));
    return err instanceof OperatorError ? 1 : 2;
  } finally {
    await db.close();
  }
}

/** The real database, provider access and helpers (loaded lazily, so the tests never need them). */
function realDeps(): MainDeps {
  return {
    createDb: async () => {
      const { createBackfillDb } = await import('./lib/email-backfill-runtime');
      return createBackfillDb();
    },
    createSource: async (env, db) => {
      const { createBackfillSource } = await import('./lib/email-backfill-runtime');
      return createBackfillSource(env, db);
    },
    loadHelpers: async () => {
      const { loadBackfillHelpers } = await import('./lib/email-backfill-runtime');
      return loadBackfillHelpers();
    },
    log: console.log,
    error: console.error,
  };
}

if (/backfill-email-rich\.[cm]?[jt]s$/.test(process.argv[1] ?? '')) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
