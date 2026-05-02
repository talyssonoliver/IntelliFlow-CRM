/**
 * One-time backfill: re-save existing ChainVersion and WebhookEndpoint rows
 * so the Prisma field-encryption extension transparently encrypts them.
 *
 * Safety:
 *   - Reads rows in cursor-paginated batches of 100
 *   - Re-saves each row via prisma.chainVersion.update / prisma.webhookEndpoint.update
 *     which triggers the fieldEncryptionExtension to encrypt on write
 *   - Idempotent: already-encrypted rows are decrypted on read, then re-encrypted
 *     on write — net effect is a no-op for already-encrypted rows
 *   - Dry-run mode: pass --dry-run to count rows without writing
 *
 * Usage:
 *   PRISMA_FIELD_ENCRYPTION_KEY=<key> pnpm tsx tools/scripts/encrypt-existing-prompts.ts
 *   PRISMA_FIELD_ENCRYPTION_KEY=<key> pnpm tsx tools/scripts/encrypt-existing-prompts.ts --dry-run
 *
 * Run AFTER prisma migrate deploy, BEFORE deploying the new application code to
 * production. See docs/ops/runbooks/prompt-encryption-key-rotation.md for the
 * full operator runbook.
 *
 * Rollback: if the application code needs to be reverted, run
 *   tools/scripts/decrypt-existing-prompts.ts (symmetric inverse of this script)
 *   before removing PRISMA_FIELD_ENCRYPTION_KEY from env.
 */

import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  fieldEncryptionExtension,
  deriveKey,
  isEncrypted,
} from '../../packages/db/src/field-encryption';

const isDryRun = process.argv.includes('--dry-run');
const BATCH_SIZE = 100;

if (!process.env['PRISMA_FIELD_ENCRYPTION_KEY']) {
  console.error(
    '[encrypt-existing-prompts] ERROR: PRISMA_FIELD_ENCRYPTION_KEY is not set.\n' +
      '  Run: PRISMA_FIELD_ENCRYPTION_KEY=<key> pnpm tsx tools/scripts/encrypt-existing-prompts.ts'
  );
  process.exit(1);
}

if (!process.env['DATABASE_URL']) {
  console.error('[encrypt-existing-prompts] ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface BatchResult {
  total: number;
  skipped: number;
  errors: number;
}

type RowOutcome = 'ok' | 'skipped' | 'error';

function buildExtendedClient(base: PrismaClient, key: ReturnType<typeof deriveKey>): PrismaClient {
  return base.$extends(fieldEncryptionExtension({ key })) as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// Per-row processors
// ---------------------------------------------------------------------------

/**
 * Encrypts a single ChainVersion row in-place (no-op in dry-run mode).
 * Returns `'skipped'` when both fields are already encrypted, `'error'` on
 * failure, and `'ok'` on success.
 */
async function encryptOneChainVersion(
  rowId: string,
  base: PrismaClient,
  prisma: PrismaClient
): Promise<RowOutcome> {
  if (isDryRun) return 'ok';
  try {
    // Raw read via the UN-extended client to see on-disk ciphertext.
    // If BOTH target fields are already `v1:…`, skip the row entirely.
    const rawRows = await base.$queryRaw<
      Array<{ prompt: string | null; systemPrompt: string | null }>
    >`SELECT prompt, "systemPrompt" FROM chain_versions WHERE id = ${rowId}`;
    const raw = rawRows[0];
    const promptEncrypted = raw?.prompt == null || isEncrypted(raw.prompt);
    const systemPromptEncrypted = raw?.systemPrompt == null || isEncrypted(raw.systemPrompt);
    if (promptEncrypted && systemPromptEncrypted) return 'skipped';

    // Read via extended client (decrypts anything already encrypted) and
    // re-save — the extension encrypts on write.
    const full = await prisma.chainVersion.findUniqueOrThrow({
      where: { id: rowId },
      select: { id: true, prompt: true, systemPrompt: true },
    });
    await prisma.chainVersion.update({
      where: { id: rowId },
      data: { prompt: full.prompt, systemPrompt: full.systemPrompt },
    });
    return 'ok';
  } catch (err) {
    console.error(`[encrypt-existing-prompts] Error on ChainVersion ${rowId}:`, err);
    return 'error';
  }
}

/**
 * Encrypts a single WebhookEndpoint row in-place (no-op in dry-run mode).
 * Returns `'skipped'` when the secret is already encrypted or null, `'error'`
 * on failure, and `'ok'` on success.
 */
async function encryptOneWebhookSecret(
  rowId: string,
  base: PrismaClient,
  prisma: PrismaClient
): Promise<RowOutcome> {
  if (isDryRun) return 'ok';
  try {
    // Raw read via the UN-extended client to see on-disk ciphertext.
    // Skip rows whose secret is already `v1:…` (or null).
    const rawRows = await base.$queryRaw<
      Array<{ secret: string | null }>
    >`SELECT secret FROM webhook_endpoints WHERE id = ${rowId}`;
    const raw = rawRows[0];
    if (raw?.secret == null || isEncrypted(raw.secret)) return 'skipped';

    const full = await prisma.webhookEndpoint.findUniqueOrThrow({
      where: { id: rowId },
      select: { id: true, secret: true },
    });
    // Only update rows that have a secret (null passes through unmodified)
    if (full.secret !== null) {
      await prisma.webhookEndpoint.update({
        where: { id: rowId },
        data: { secret: full.secret },
      });
    }
    return 'ok';
  } catch (err) {
    console.error(`[encrypt-existing-prompts] Error on WebhookEndpoint ${rowId}:`, err);
    return 'error';
  }
}

// ---------------------------------------------------------------------------
// Batch accumulator
// ---------------------------------------------------------------------------

/**
 * Applies `processRow` to every id in `batch` and folds the results into
 * `accum`. Returns the updated accumulator.
 */
async function applyBatch(
  batch: Array<{ id: string }>,
  accum: BatchResult,
  processRow: (id: string) => Promise<RowOutcome>
): Promise<BatchResult> {
  for (const row of batch) {
    const outcome = await processRow(row.id);
    if (outcome === 'skipped') accum.skipped++;
    if (outcome === 'error') accum.errors++;
  }
  return accum;
}

// ---------------------------------------------------------------------------
// Batch processors (pagination shell only)
// ---------------------------------------------------------------------------

/**
 * Iterates all ChainVersion rows in cursor-paginated batches and encrypts
 * each row that is not already encrypted.
 */
async function encryptChainVersionPrompts(
  base: PrismaClient,
  prisma: PrismaClient,
  batchSize: number
): Promise<BatchResult> {
  let cursor: string | undefined;
  const result: BatchResult = { total: 0, skipped: 0, errors: 0 };
  let more = true;

  while (more) {
    const rows = await prisma.chainVersion.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;

    await applyBatch(rows, result, (id) => encryptOneChainVersion(id, base, prisma));

    result.total += rows.length;
    process.stdout.write(
      `\r[encrypt-existing-prompts] ChainVersion: ${result.total} rows processed (${result.skipped} already encrypted)...`
    );
    more = rows.length === batchSize;
  }

  return result;
}

/**
 * Iterates all WebhookEndpoint rows in cursor-paginated batches and encrypts
 * each row whose secret is not already encrypted.
 */
async function encryptWebhookSecrets(
  base: PrismaClient,
  prisma: PrismaClient,
  batchSize: number
): Promise<BatchResult> {
  let cursor: string | undefined;
  const result: BatchResult = { total: 0, skipped: 0, errors: 0 };
  let more = true;

  while (more) {
    const rows = await prisma.webhookEndpoint.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;

    await applyBatch(rows, result, (id) => encryptOneWebhookSecret(id, base, prisma));

    result.total += rows.length;
    process.stdout.write(
      `\r[encrypt-existing-prompts] WebhookEndpoint: ${result.total} rows processed (${result.skipped} already encrypted)...`
    );
    more = rows.length === batchSize;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const adapter = new PrismaPg({
    connectionString: process.env['DATABASE_URL']!,
  });
  const base = new PrismaClient({ adapter });
  const key = deriveKey(process.env['PRISMA_FIELD_ENCRYPTION_KEY']!);
  const prisma = buildExtendedClient(base, key);

  console.log(`[encrypt-existing-prompts] Starting backfill${isDryRun ? ' (DRY RUN)' : ''}...`);

  const chainResult = await encryptChainVersionPrompts(base, prisma, BATCH_SIZE);
  console.log(
    `\n[encrypt-existing-prompts] ChainVersion complete: ${chainResult.total} rows, ${chainResult.errors} errors.`
  );

  const webhookResult = await encryptWebhookSecrets(base, prisma, BATCH_SIZE);
  console.log(
    `\n[encrypt-existing-prompts] WebhookEndpoint complete: ${webhookResult.total} rows, ${webhookResult.errors} errors.`
  );

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n[encrypt-existing-prompts] ===== SUMMARY =====');
  console.log(`  ChainVersion rows processed    : ${chainResult.total}`);
  console.log(`  ChainVersion rows skipped      : ${chainResult.skipped} (already encrypted)`);
  console.log(`  ChainVersion errors            : ${chainResult.errors}`);
  console.log(`  WebhookEndpoint rows processed : ${webhookResult.total}`);
  console.log(`  WebhookEndpoint rows skipped   : ${webhookResult.skipped} (already encrypted)`);
  console.log(`  WebhookEndpoint errors         : ${webhookResult.errors}`);
  if (isDryRun) {
    console.log('  Mode: DRY RUN — no writes performed.');
  } else {
    console.log('  Mode: LIVE — all rows encrypted.');
  }

  const totalErrors = chainResult.errors + webhookResult.errors;
  if (totalErrors > 0) {
    const totalRows = chainResult.total + webhookResult.total;
    const errorRate = totalErrors / totalRows;
    if (errorRate > 0.01) {
      console.error(
        `\n[encrypt-existing-prompts] ALERT: Error rate ${(errorRate * 100).toFixed(1)}% exceeds 1% rollback threshold.`
      );
      console.error(
        '[encrypt-existing-prompts] Consider rolling back — see rollback plan in sprint-18-prompt-encryption.md §9.'
      );
      process.exit(1);
    }
  }

  await base.$disconnect();
}

main().catch((err) => {
  console.error('[encrypt-existing-prompts] Fatal error:', err);
  process.exit(1);
});
