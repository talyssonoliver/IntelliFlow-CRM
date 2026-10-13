/**
 * migrate-legacy-routing-rules.ts (#770)
 *
 * RoutingRule.conditions used to be written as a keyed object —
 * `{ score: { operator: 'gte', value: 90 } }`, with `score`/`source` field
 * names and `gte`/`lt` operators — instead of the array shape
 * `[{ field, operator, value }]` that createRoutingRuleSchema, the routing
 * API and LeadRoutingService all use. The seed was fixed to write the array
 * shape (see packages/db/prisma/seed.ts), but any row written by the OLD seed
 * or created before that fix still holds the legacy shape in the database.
 *
 * LeadRoutingService.findMatchingRuleInTx now skips a non-array `conditions`
 * value defensively (it no longer crashes routing for the tenant), but a
 * skipped rule still never matches, so a legacy row is effectively dead until
 * converted.
 *
 * This script only touches `conditions`. It does NOT guess a conversion for
 * `actions` — the issue documents the legacy CONDITIONS shape precisely
 * (score/source, gte/lt) but gives no equivalent example for actions, and a
 * wrong guess there could silently misroute a lead to the wrong person. Rows
 * whose `actions` is not an array are only counted and reported so a human
 * can look at them; this script never rewrites `actions`.
 *
 * Field mapping:  score  -> leadScore
 *                 source -> leadSource
 *                 (anything already a canonical field name passes through)
 * `estimatedValue` is deliberately NOT mapped: the engine compares it in cents,
 * the legacy shape never documented it, and a legacy threshold may be in
 * dollars. Converting it unscaled would silently shift the threshold 100x, so
 * such rows are reported as "unmapped" for a human.
 *
 * Priority direction (separate, opt-in): the engine evaluates priority DESC
 * (higher first). Rules saved through the OLD editor (0 = top) or the OLD seed
 * (0 = first) now display reversed. `--flip-priorities --tenant <id>` mirrors
 * a tenant's priorities (p -> max + min - p). It is NOT idempotent (applying
 * twice restores the old order), so it requires an explicit tenant and must be
 * run once per affected tenant only.
 *
 * Operator mapping (inclusive thresholds, matching the seed's own fix):
 *                 gte N -> greater_than (N - 1)
 *                 lt  N -> less_than N
 *                 eq  V -> equals V
 *                 (any other operator is left unconverted and reported — see
 *                 "unmapped" below — rather than guessed at)
 *
 * Safety (ADR-069 Class B — backfill/row rewrite on existing data):
 *   - Tenant-scoped: every row is read AND written with its own tenantId;
 *     nothing is ever looked up or copied across tenants, and `--tenant`
 *     narrows to one tenant for a cautious first run.
 *   - Dry-run by default. Pass --apply to write.
 *   - Idempotent: a row already in array shape is left alone (re-running
 *     after a partial apply is safe).
 *   - This script prepares the migration; it does not decide to run itself
 *     against production. Per the owner's standing rule, nobody runs a
 *     database write against production from here without the owner's
 *     explicit go — count first (`--dry-run`, the default), show the owner
 *     the count for the environment in question, then only `--apply` once
 *     authorized, against the test DB or production as directed.
 *
 * Usage:
 *   DATABASE_URL=<test db> pnpm tsx tools/scripts/migrate-legacy-routing-rules.ts
 *   DATABASE_URL=<test db> pnpm tsx tools/scripts/migrate-legacy-routing-rules.ts --apply
 *   DATABASE_URL=<test db> pnpm tsx tools/scripts/migrate-legacy-routing-rules.ts --tenant <tenantId> --apply
 */

import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const BATCH_SIZE = 100;

export interface ParsedArgs {
  isApply: boolean;
  tenantFilter: string | undefined;
  flipPriorities: boolean;
}

/** Parses `--apply` and `--tenant <id>` out of an argv array (e.g. `process.argv`). */
export function parseArgs(argv: string[]): ParsedArgs {
  const isApply = argv.includes('--apply');
  const tenantArgIndex = argv.indexOf('--tenant');
  const tenantFilter =
    tenantArgIndex !== -1 && argv[tenantArgIndex + 1] ? argv[tenantArgIndex + 1] : undefined;
  const flipPriorities = argv.includes('--flip-priorities');
  return { isApply, tenantFilter, flipPriorities };
}

interface LegacyCondition {
  operator: string;
  value: unknown;
}

const FIELD_ALIASES: Record<string, string> = {
  score: 'leadScore',
  source: 'leadSource',
  leadScore: 'leadScore',
  leadSource: 'leadSource',
  leadStatus: 'leadStatus',
  location: 'location',
  tags: 'tags',
};

/**
 * Converts one legacy keyed-object condition entry to the canonical array
 * shape, or returns null if the operator is not one this script knows how to
 * map (reported as "unmapped" rather than guessed).
 */
export function convertEntry(
  rawField: string,
  entry: LegacyCondition
): { field: string; operator: string; value: unknown } | null {
  const field = FIELD_ALIASES[rawField];
  if (!field) return null;

  switch (entry.operator) {
    case 'gte':
      return typeof entry.value === 'number'
        ? { field, operator: 'greater_than', value: entry.value - 1 }
        : null;
    case 'lt':
      return { field, operator: 'less_than', value: entry.value };
    case 'eq':
      return { field, operator: 'equals', value: entry.value };
    default:
      return null;
  }
}

export type Outcome = 'converted' | 'already-array' | 'unmapped' | 'malformed';

export function classifyAndConvert(conditions: unknown): {
  outcome: Outcome;
  converted?: unknown[];
} {
  if (Array.isArray(conditions)) return { outcome: 'already-array' };
  if (!conditions || typeof conditions !== 'object') return { outcome: 'malformed' };

  const entries = Object.entries(conditions as Record<string, unknown>);
  if (entries.length === 0) return { outcome: 'malformed' };

  const converted: unknown[] = [];
  for (const [rawField, rawEntry] of entries) {
    if (!rawEntry || typeof rawEntry !== 'object' || !('operator' in rawEntry)) {
      return { outcome: 'unmapped' };
    }
    const result = convertEntry(rawField, rawEntry as LegacyCondition);
    if (!result) return { outcome: 'unmapped' };
    converted.push(result);
  }
  return { outcome: 'converted', converted };
}

type Prisma = InstanceType<typeof PrismaClient>;
type RoutingRuleRow = Awaited<ReturnType<Prisma['routingRule']['findFirstOrThrow']>>;

export interface Totals {
  counts: Record<Outcome, number>;
  nonArrayActions: number;
}

export function logNonArrayActions(rule: RoutingRuleRow, totals: Totals): void {
  if (Array.isArray(rule.actions)) return;
  totals.nonArrayActions += 1;
  console.log(
    `[migrate-legacy-routing-rules] actions not an array, NOT converted (needs a human): ` +
      `rule=${rule.id} tenant=${rule.tenantId}`
  );
}

/** One row: classify its conditions, log the outcome, and write it when `isApply` is set. */
export async function processRow(
  prisma: Prisma,
  rule: RoutingRuleRow,
  totals: Totals,
  isApply: boolean
): Promise<void> {
  const { outcome, converted } = classifyAndConvert(rule.conditions);
  totals.counts[outcome] += 1;
  logNonArrayActions(rule, totals);

  if (outcome !== 'converted' || !converted) {
    if (outcome === 'unmapped' || outcome === 'malformed') {
      console.log(
        `[migrate-legacy-routing-rules] ${outcome}, NOT converted (needs a human): ` +
          `rule=${rule.id} tenant=${rule.tenantId}: ${JSON.stringify(rule.conditions)}`
      );
    }
    return;
  }

  console.log(
    `[migrate-legacy-routing-rules] ${isApply ? 'converting' : 'would convert'} ` +
      `rule=${rule.id} tenant=${rule.tenantId}: ${JSON.stringify(rule.conditions)} -> ${JSON.stringify(converted)}`
  );
  if (!isApply) return;

  // Write scoped to this row's own id AND tenantId — never another tenant's row.
  await prisma.routingRule.update({
    where: { id: rule.id, tenantId: rule.tenantId },
    data: { conditions: converted as never },
  });
}

/**
 * Mirrors one tenant's rule priorities (p -> max + min - p) so rules saved
 * under the old "0 = top" convention keep their intended order under the
 * engine's priority DESC. Tenant-scoped on read and write. Returns the number
 * of rows whose priority changes.
 */
export async function flipTenantPriorities(
  prisma: Prisma,
  tenantId: string,
  isApply: boolean
): Promise<number> {
  const rules = await prisma.routingRule.findMany({
    where: { tenantId },
    select: { id: true, priority: true },
  });
  if (rules.length === 0) return 0;
  const priorities = rules.map((r) => r.priority);
  const sum = Math.max(...priorities) + Math.min(...priorities);
  let changed = 0;
  for (const rule of rules) {
    const next = sum - rule.priority;
    if (next === rule.priority) continue;
    changed += 1;
    console.log(
      `[migrate-legacy-routing-rules] ${isApply ? 'flipping' : 'would flip'} priority ` +
        `rule=${rule.id} tenant=${tenantId}: ${rule.priority} -> ${next}`
    );
    if (isApply) {
      await prisma.routingRule.update({
        where: { id: rule.id, tenantId },
        data: { priority: next },
      });
    }
  }
  return changed;
}

export async function fetchBatch(
  prisma: Prisma,
  cursor: string | undefined,
  tenantFilter: string | undefined
): Promise<RoutingRuleRow[]> {
  return prisma.routingRule.findMany({
    where: tenantFilter ? { tenantId: tenantFilter } : undefined,
    take: BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { id: 'asc' },
  });
}

async function runFlip(prisma: Prisma, tenantId: string, isApply: boolean): Promise<void> {
  const changed = await flipTenantPriorities(prisma, tenantId, isApply);
  console.log('[migrate-legacy-routing-rules] priorities flipped:', {
    changed,
    mode: isApply ? 'APPLY' : 'DRY-RUN',
  });
  await prisma.$disconnect();
}

export async function main(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('[migrate-legacy-routing-rules] ERROR: DATABASE_URL is not set.');
    process.exit(1);
    return;
  }
  const { isApply, tenantFilter, flipPriorities } = parseArgs(process.argv);

  if (flipPriorities && !tenantFilter) {
    console.error(
      '[migrate-legacy-routing-rules] ERROR: --flip-priorities requires --tenant <id> ' +
        '(it is not idempotent; run once per affected tenant).'
    );
    process.exit(1);
    return;
  }

  const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
  const prisma = new PrismaClient({ adapter });

  if (flipPriorities && tenantFilter) {
    await runFlip(prisma, tenantFilter, isApply);
    return;
  }

  console.log(
    `[migrate-legacy-routing-rules] mode=${isApply ? 'APPLY' : 'DRY-RUN'}` +
      (tenantFilter ? ` tenant=${tenantFilter}` : ' (all tenants)')
  );

  const totals: Totals = {
    counts: { converted: 0, 'already-array': 0, unmapped: 0, malformed: 0 },
    nonArrayActions: 0,
  };
  let cursor: string | undefined;

  for (;;) {
    const rules = await fetchBatch(prisma, cursor, tenantFilter);
    if (rules.length === 0) break;

    for (const rule of rules) {
      await processRow(prisma, rule, totals, isApply);
    }

    cursor = rules[rules.length - 1]!.id;
    if (rules.length < BATCH_SIZE) break;
  }

  console.log('[migrate-legacy-routing-rules] summary:', {
    ...totals.counts,
    nonArrayActions: totals.nonArrayActions,
    mode: isApply ? 'APPLY' : 'DRY-RUN',
  });

  await prisma.$disconnect();
}

// CLI entry point guard — importing this module (e.g. from a test) must not
// run main(), connect to a database, or call process.exit().
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('migrate-legacy-routing-rules.ts')
) {
  main().catch((err) => {
    console.error('[migrate-legacy-routing-rules] FAILED:', err);
    process.exit(1);
  });
}
