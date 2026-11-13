/**
 * outbox-dlq.ts — dead-letter triage for the domain-event outbox (IFC-151).
 *
 * The events worker dead-letters an event when its retries are used up, or at
 * once when a handler throws PoisonMessageError ("poison: ..." in lastError).
 * This lists them and puts chosen ones back in the outbox. A replayed event
 * keeps metadata.handledBy, so only the handlers that never succeeded run again.
 * Runbook: docs/operations/runbooks/dlq-triage.md.
 *
 *   list    read-only. Oldest first, no payloads (they may hold personal data).
 *   replay  dry run by default: prints what it would requeue. --apply requeues.
 *           Poison messages are skipped unless --include-poison: fix the handler
 *           or the data first, or they come straight back.
 *
 * Production: replay changes rows (ADR-069 ad-hoc production DML is the owner's).
 * Run the dry run, show the owner the ids, and apply only with the owner's yes.
 *
 * Usage:
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/outbox-dlq.ts list [--type lead.created] [--tenant <id>] [--limit 50]
 *   DATABASE_URL=<db> pnpm tsx tools/scripts/outbox-dlq.ts replay [--type x] [--tenant <id>] [--id <eventId>]... [--include-poison] [--apply]
 */

import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaOutboxRepository,
  type DeadLetterEntry,
} from '../../packages/adapters/src/repositories/PrismaOutboxRepository';

export interface DlqArgs {
  command: 'list' | 'replay';
  type?: string;
  tenant?: string;
  limit: number;
  ids: string[];
  includePoison: boolean;
  apply: boolean;
}

/** The repository calls the CLI uses (a fake in tests). */
export type DlqRepository = Pick<PrismaOutboxRepository, 'listDeadLetters' | 'requeueDeadLetter'>;

/** Options that take a value, and where each one goes. */
const VALUE_FLAGS: Record<string, (args: DlqArgs, value: string) => void> = {
  '--type': (args, v) => (args.type = v),
  '--tenant': (args, v) => (args.tenant = v),
  '--id': (args, v) => void args.ids.push(v),
  '--limit': (args, v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new Error('--limit must be a positive integer');
    args.limit = n;
  },
};
const BOOLEAN_FLAGS: Record<string, (args: DlqArgs) => void> = {
  '--include-poison': (args) => (args.includePoison = true),
  '--apply': (args) => (args.apply = true),
};

export function parseArgs(argv: string[]): DlqArgs {
  const [command, ...rest] = argv;
  if (command !== 'list' && command !== 'replay') {
    throw new Error('usage: outbox-dlq.ts <list|replay> [options] (see the file header)');
  }
  const args: DlqArgs = { command, limit: 50, ids: [], includePoison: false, apply: false };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]!;
    const setValue = VALUE_FLAGS[flag];
    const setBoolean = BOOLEAN_FLAGS[flag];
    if (setValue) {
      const value = rest[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
      setValue(args, value);
    } else if (setBoolean) {
      setBoolean(args);
    } else {
      throw new Error(`unknown option ${flag}`);
    }
  }
  if (args.command === 'list' && (args.apply || args.ids.length || args.includePoison)) {
    throw new Error('list is read-only: --apply, --id and --include-poison belong to replay');
  }
  return args;
}

export const isPoison = (entry: DeadLetterEntry) => (entry.lastError ?? '').startsWith('poison:');

const line = (e: DeadLetterEntry) =>
  `  ${e.id}  ${e.eventType}  tenant=${e.tenantId}  attempts=${e.retryCount}  ` +
  `at=${e.occurredAt.toISOString()}  ${isPoison(e) ? 'POISON ' : ''}${(e.lastError ?? '').slice(0, 160)}`;

type Log = (s: string) => void;

function list(chosen: DeadLetterEntry[], log: Log): number {
  log(`[outbox-dlq] ${chosen.length} dead letter(s)`);
  for (const e of chosen) log(line(e));
  return chosen.length;
}

/** The letters to replay; logs the ones skipped as poison. */
function replaySelection(chosen: DeadLetterEntry[], args: DlqArgs, log: Log): DeadLetterEntry[] {
  if (args.includePoison) return chosen;
  for (const e of chosen.filter(isPoison)) {
    log(`  skip ${e.id}: poison message (use --include-poison once fixed)`);
  }
  return chosen.filter((e) => !isPoison(e));
}

async function requeue(repo: DlqRepository, replay: DeadLetterEntry[], log: Log): Promise<number> {
  let requeued = 0;
  for (const e of replay) {
    // requeueDeadLetter changes the row only while it is still a dead letter.
    const changed = await repo.requeueDeadLetter(e.id);
    if (changed) requeued++;
    log(changed ? `  requeued ${e.id}` : `  skip ${e.id}: no longer a dead letter`);
  }
  log(`[outbox-dlq] requeued ${requeued} of ${replay.length}`);
  return requeued;
}

/** Runs the command; returns the number of events listed or requeued. */
export async function run(
  repo: DlqRepository,
  args: DlqArgs,
  log: Log = console.log
): Promise<number> {
  const letters = await repo.listDeadLetters({
    limit: args.limit,
    eventType: args.type,
    tenantId: args.tenant,
  });
  const chosen = args.ids.length ? letters.filter((e) => args.ids.includes(e.id)) : letters;
  if (args.command === 'list') return list(chosen, log);

  for (const id of args.ids.filter((id) => !letters.some((e) => e.id === id))) {
    log(`  skip ${id}: not a dead letter in this selection`);
  }
  const replay = replaySelection(chosen, args, log);
  log(
    `[outbox-dlq] replay mode=${args.apply ? 'APPLY' : 'DRY-RUN'} ` +
      `selected=${chosen.length} replay=${replay.length} poisonSkipped=${chosen.length - replay.length}`
  );
  if (args.apply) return requeue(repo, replay, log);
  for (const e of replay) log(`  would requeue ${line(e).trim()}`);
  return 0;
}

export async function main(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('[outbox-dlq] ERROR: DATABASE_URL is not set.');
    process.exit(1);
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
  });
  try {
    await run(new PrismaOutboxRepository(prisma as never), args);
  } finally {
    await prisma.$disconnect();
  }
}

// CLI entry point guard — importing this module (e.g. from a test) must not run main().
if (process.argv[1]?.endsWith('outbox-dlq.ts')) {
  main().catch((err) => {
    console.error('[outbox-dlq] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
