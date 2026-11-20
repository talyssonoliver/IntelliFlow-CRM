/**
 * MVP-011: put the COA outreach emails on the leads they were sent to. Operator-run, never over HTTP.
 *
 * The COA app sends its outreach through Resend, so those mails never pass through a connected
 * mailbox and the mailbox sync cannot see them: a lead's Emails tab shows only what Aurora itself
 * sent or synced. This reads the COA database (SELECT only) for sent email drafts and records each
 * one as a Sent email on the Aurora lead it went to, with a timeline entry, so the lead shows the
 * whole thread with the replies the mailbox sync logs.
 *
 * - Matching: the draft's lead in COA has email contact methods (the primary first); the first one
 *   that is a lead (else a contact) of the tenant in Aurora is the recipient. No match, nothing
 *   written. An address with an active processing restriction is skipped.
 * - Idempotent: a draft is keyed by its Resend message id (provider RESEND, providerMessageId),
 *   so a second run, or a run after the mailbox sync logged the same mail, writes nothing twice.
 * - Opens: the COA database records no opens (its Resend webhook only logs them), so an imported
 *   send carries no tracking and does not count in the lead's Open Rate (that counts tracked
 *   sends only). If a COA row ever carries `openedAt`, it is kept as opened.
 *
 * Dry run by default: prints what would be written. `--apply` writes.
 *
 * Usage (from the repo root):
 *   DATABASE_URL=<aurora url> COA_DATABASE_URL=<coa url> pnpm tsx tools/scripts/import-coa-sends.ts \
 *     --tenant <tenantId> --from <sender address> [--email <recipient>] [--apply]
 *
 * Aurora's database must be local, unless the operator points DATABASE_URL elsewhere on purpose and
 * sets ALLOW_PROD_DB_OPS=1 (owner yes required for production). The COA database is only read.
 */

import { OperatorError, argValue, assertMayWrite, describeTarget } from './lib/partner-trust';

/** One sent email draft as the COA database holds it. */
export interface CoaSend {
  id: string;
  subject: string | null;
  body: string;
  sentAt: Date;
  /** Resend's id for the send. */
  messageId: string;
  status: 'SENT' | 'BOUNCED';
  sequenceNo: number;
  /** When the draft last changed: for a bounced one, when the bounce was recorded. */
  updatedAt: Date;
  /** The lead's email contact methods in COA, the primary first, lower-cased. */
  recipients: string[];
  openedAt?: Date | null;
}

/** Where the sends come from (the COA database; a fake in the tests). */
export interface CoaSource {
  loadSends(onlyEmail?: string): Promise<CoaSend[]>;
}

type Where = { tenantId: string; email: { equals: string; mode: 'insensitive' } };

/** The part of Aurora's database the import uses. */
export interface ImportDb {
  lead: { findFirst(args: { where: Where; select: { id: true } }): Promise<{ id: string } | null> };
  contact: {
    findFirst(args: { where: Where; select: { id: true } }): Promise<{ id: string } | null>;
  };
  processingRestriction: {
    findFirst(args: {
      where: { tenantId: string; subjectEmail: string; liftedAt: null };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  emailRecord: {
    findFirst(args: {
      where: { tenantId: string; provider: string; providerMessageId: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  $transaction<T>(work: (tx: ImportTx) => Promise<T>): Promise<T>;
}

export interface ImportTx {
  emailRecord: {
    create(args: { data: Record<string, unknown>; select: { id: true } }): Promise<{ id: string }>;
  };
  leadActivity: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

export interface ImportOptions {
  tenantId: string;
  /** The address the COA sends are from (shown as the sender on each record). */
  from: string;
  apply: boolean;
  target: { host: string; local: boolean };
  onlyEmail?: string;
}

export interface ImportResult {
  read: number;
  alreadyImported: number;
  unmatched: number;
  restricted: number;
  toCreate: number;
  created: number;
  lines: string[];
}

export const PROVIDER = 'RESEND';
const AUTHOR = 'COA outreach';

/** The email record and the timeline entry a COA send becomes. */
export function recordFor(
  send: CoaSend,
  party: { leadId: string | null; contactId: string | null; address: string },
  options: Pick<ImportOptions, 'tenantId' | 'from'>
): { record: Record<string, unknown>; activity: Record<string, unknown> | null } {
  const bounced = send.status === 'BOUNCED';
  const opened = !!send.openedAt;
  const subject = (send.subject ?? '').trim() || '(no subject)';
  const record = {
    subject,
    body: send.body,
    fromEmail: options.from,
    toEmail: party.address,
    status: bounced ? 'BOUNCED' : 'SENT',
    sentAt: send.sentAt,
    ...(bounced ? { bouncedAt: send.updatedAt } : {}),
    ...(opened ? { openedAt: send.openedAt, openCount: 1 } : {}),
    isRead: true,
    tenantId: options.tenantId,
    contactId: party.contactId,
    provider: PROVIDER,
    providerMessageId: send.messageId.slice(0, 255),
    createdAt: send.sentAt,
    metadata: {
      source: 'coa-import',
      folder: 'sentitems',
      direction: 'outbound',
      coaDraftId: send.id,
      sequenceNo: send.sequenceNo,
      ...(party.leadId ? { leadId: party.leadId } : {}),
    },
  };
  const activity = party.leadId
    ? {
        type: 'EMAIL',
        title: subject.slice(0, 200),
        timestamp: send.sentAt,
        userId: null,
        userName: AUTHOR,
        leadId: party.leadId,
        tenantId: options.tenantId,
        metadata: {
          source: 'coa-import',
          direction: 'outbound',
          from: options.from,
          ...(opened ? { opened: true, openCount: 1 } : {}),
        },
      }
    : null;
  return { record, activity };
}

/** The lead (else contact) of the tenant that one of the addresses belongs to. */
async function findParty(db: ImportDb, tenantId: string, addresses: readonly string[]) {
  for (const address of addresses) {
    const where: Where = { tenantId, email: { equals: address, mode: 'insensitive' } };
    const lead = await db.lead.findFirst({ where, select: { id: true } });
    if (lead) return { leadId: lead.id, contactId: null, address };
    const contact = await db.contact.findFirst({ where, select: { id: true } });
    if (contact) return { leadId: null, contactId: contact.id, address };
  }
  return null;
}

export async function importCoaSends(
  db: ImportDb,
  source: CoaSource,
  options: ImportOptions
): Promise<ImportResult> {
  const sends = await source.loadSends(options.onlyEmail?.toLowerCase());
  const result: ImportResult = {
    read: sends.length,
    alreadyImported: 0,
    unmatched: 0,
    restricted: 0,
    toCreate: 0,
    created: 0,
    lines: [],
  };
  if (options.apply) assertMayWrite(options.target);

  for (const send of sends) {
    const exists = await db.emailRecord.findFirst({
      where: {
        tenantId: options.tenantId,
        provider: PROVIDER,
        providerMessageId: send.messageId.slice(0, 255),
      },
      select: { id: true },
    });
    if (exists) {
      result.alreadyImported += 1;
      continue;
    }
    const party = await findParty(db, options.tenantId, send.recipients);
    if (!party) {
      result.unmatched += 1;
      continue;
    }
    const restriction = await db.processingRestriction.findFirst({
      where: { tenantId: options.tenantId, subjectEmail: party.address, liftedAt: null },
      select: { id: true },
    });
    if (restriction) {
      result.restricted += 1;
      continue;
    }
    result.toCreate += 1;
    if (!options.apply) continue;
    const { record, activity } = recordFor(send, party, options);
    await db.$transaction(async (tx) => {
      const created = await tx.emailRecord.create({ data: record, select: { id: true } });
      if (activity) {
        await tx.leadActivity.create({
          data: {
            ...activity,
            metadata: { ...(activity.metadata as object), emailRecordId: created.id },
          },
        });
      }
    });
    result.created += 1;
  }

  const filter = options.onlyEmail ? ' (only to ' + options.onlyEmail + ')' : '';
  result.lines = [
    `target database: ${options.target.host}${options.target.local ? ' (local)' : ' (NOT local)'}`,
    `COA sends read:  ${result.read}${filter}`,
    `already in Aurora: ${result.alreadyImported}`,
    `no matching lead or contact: ${result.unmatched}`,
    `skipped, processing restriction: ${result.restricted}`,
    options.apply
      ? `written: ${result.created} email records (with lead timeline entries)`
      : `would write: ${result.toCreate} email records. Dry run: nothing written. Re-run with --apply.`,
  ];
  return result;
}

/** What the COA read selects: sent email drafts with their lead's email addresses. SELECT only. */
export const COA_SENDS_SQL = `
  SELECT d.id, d.subject, d.body, d."sentAt", d."messageId", d.status::text AS status,
         d."sequenceNo", d."updatedAt",
         COALESCE(
           array_agg(lower(c.value) ORDER BY c."isPrimary" DESC, c."capturedAt")
             FILTER (WHERE c.value IS NOT NULL),
           '{}') AS recipients
  FROM "OutreachDraft" d
  JOIN "Lead" l ON l.id = d."leadId"
  LEFT JOIN "ContactMethod" c ON c."leadId" = l.id AND c.type::text = 'EMAIL'
  WHERE d.channel::text = 'EMAIL' AND d."sentAt" IS NOT NULL AND d."messageId" IS NOT NULL
    AND d."sentVia" = 'resend' AND d.status::text IN ('SENT', 'BOUNCED')
  GROUP BY d.id
  ORDER BY d."sentAt"`;

type CoaRow = Omit<CoaSend, 'status' | 'recipients'> & { status: string; recipients: string[] };

/** Maps the rows the COA query returns, keeping only a recipient filter's sends. */
export function sendsFromRows(rows: readonly CoaRow[], onlyEmail?: string): CoaSend[] {
  return rows
    .filter((row) => row.status === 'SENT' || row.status === 'BOUNCED')
    .map((row) => ({
      ...row,
      status: row.status as 'SENT' | 'BOUNCED',
      recipients: row.recipients ?? [],
    }))
    .filter((send) => !onlyEmail || send.recipients.includes(onlyEmail));
}

export interface MainDeps {
  createDb(url: string): Promise<ImportDb & { $disconnect(): Promise<void> }>;
  createSource(url: string): Promise<CoaSource & { close(): Promise<void> }>;
  log(line: string): void;
  error(line: string): void;
}

const USAGE =
  'Usage: DATABASE_URL=<aurora url> COA_DATABASE_URL=<coa url> pnpm tsx tools/scripts/import-coa-sends.ts ' +
  '--tenant <tenantId> --from <sender address> [--email <recipient>] [--apply]';

async function createPrismaDb(url: string) {
  const { PrismaClient } = await import('../../packages/db/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  return prisma as unknown as ImportDb & { $disconnect(): Promise<void> };
}

/** The COA database through a throwaway Prisma connection that only ever runs the SELECT above. */
async function createCoaSource(url: string) {
  const { PrismaClient } = await import('../../packages/db/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }) as any;
  return {
    async loadSends(onlyEmail?: string) {
      const rows = (await prisma.$transaction(async (tx: any) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        return tx.$queryRawUnsafe(COA_SENDS_SQL);
      })) as CoaRow[];
      return sendsFromRows(rows, onlyEmail);
    },
    close: () => prisma.$disconnect() as Promise<void>,
  };
}

/** Command-line entry. Returns the exit code instead of exiting, so it can be tested. */
export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  deps: MainDeps = {
    createDb: createPrismaDb,
    createSource: createCoaSource,
    log: console.log,
    error: console.error,
  }
): Promise<number> {
  const tenantId = argValue(argv, 'tenant');
  const from = argValue(argv, 'from');
  const databaseUrl = env['DATABASE_URL'];
  const coaUrl = env['COA_DATABASE_URL'];
  if (!tenantId || !from || !databaseUrl || !coaUrl) {
    deps.error(USAGE);
    return 1;
  }
  const db = await deps.createDb(databaseUrl);
  const source = await deps.createSource(coaUrl);
  try {
    const result = await importCoaSends(db, source, {
      tenantId,
      from,
      apply: argv.includes('--apply'),
      target: describeTarget(databaseUrl),
      onlyEmail: argValue(argv, 'email') ?? undefined,
    });
    for (const line of result.lines) deps.log(line);
    return 0;
  } catch (err) {
    deps.error(err instanceof Error ? err.message : String(err));
    return err instanceof OperatorError ? 1 : 2;
  } finally {
    await source.close();
    await db.$disconnect();
  }
}

if (/import-coa-sends\.[cm]?[jt]s$/.test(process.argv[1] ?? '')) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
