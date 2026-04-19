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

async function main(): Promise<void> {
  const adapter = new PrismaPg({
    connectionString: process.env['DATABASE_URL']!,
  });
  const base = new PrismaClient({ adapter });
  const key = deriveKey(process.env['PRISMA_FIELD_ENCRYPTION_KEY']!);
  const prisma = base.$extends(fieldEncryptionExtension({ key }));

  console.log(`[encrypt-existing-prompts] Starting backfill${isDryRun ? ' (DRY RUN)' : ''}...`);

  // -------------------------------------------------------------------------
  // Backfill ChainVersion rows
  // -------------------------------------------------------------------------
  let chainVersionCursor: string | undefined;
  let totalVersions = 0;
  let versionErrors = 0;
  let versionSkipped = 0;

  do {
    const rows = await prisma.chainVersion.findMany({
      take: BATCH_SIZE,
      ...(chainVersionCursor ? { skip: 1, cursor: { id: chainVersionCursor } } : {}),
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    if (rows.length === 0) break;
    chainVersionCursor = rows[rows.length - 1]!.id;

    if (!isDryRun) {
      for (const row of rows) {
        try {
          // Raw read via the UN-extended client to see on-disk ciphertext.
          // If BOTH target fields are already `v1:…`, skip the row entirely.
          const rawRows = await base.$queryRaw<
            Array<{ prompt: string | null; systemPrompt: string | null }>
          >`SELECT prompt, "systemPrompt" FROM chain_versions WHERE id = ${row.id}`;
          const raw = rawRows[0];
          const promptEncrypted = raw?.prompt == null || isEncrypted(raw.prompt);
          const systemPromptEncrypted = raw?.systemPrompt == null || isEncrypted(raw.systemPrompt);
          if (promptEncrypted && systemPromptEncrypted) {
            versionSkipped++;
            continue;
          }

          // Read via extended client (decrypts anything already encrypted) and
          // re-save — the extension encrypts on write.
          const full = await prisma.chainVersion.findUniqueOrThrow({
            where: { id: row.id },
            select: { id: true, prompt: true, systemPrompt: true },
          });
          await prisma.chainVersion.update({
            where: { id: row.id },
            data: { prompt: full.prompt, systemPrompt: full.systemPrompt },
          });
        } catch (err) {
          versionErrors++;
          console.error(`[encrypt-existing-prompts] Error on ChainVersion ${row.id}:`, err);
        }
      }
    }

    totalVersions += rows.length;
    process.stdout.write(
      `\r[encrypt-existing-prompts] ChainVersion: ${totalVersions} rows processed (${versionSkipped} already encrypted)...`
    );
  } while (true);

  console.log(
    `\n[encrypt-existing-prompts] ChainVersion complete: ${totalVersions} rows, ${versionErrors} errors.`
  );

  // -------------------------------------------------------------------------
  // Backfill WebhookEndpoint rows
  // -------------------------------------------------------------------------
  let webhookCursor: string | undefined;
  let totalWebhooks = 0;
  let webhookErrors = 0;
  let webhookSkipped = 0;

  do {
    const rows = await prisma.webhookEndpoint.findMany({
      take: BATCH_SIZE,
      ...(webhookCursor ? { skip: 1, cursor: { id: webhookCursor } } : {}),
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    if (rows.length === 0) break;
    webhookCursor = rows[rows.length - 1]!.id;

    if (!isDryRun) {
      for (const row of rows) {
        try {
          // Raw read via the UN-extended client to see on-disk ciphertext.
          // Skip rows whose secret is already `v1:…` (or null).
          const rawRows = await base.$queryRaw<
            Array<{ secret: string | null }>
          >`SELECT secret FROM webhook_endpoints WHERE id = ${row.id}`;
          const raw = rawRows[0];
          if (raw?.secret == null || isEncrypted(raw.secret)) {
            webhookSkipped++;
            continue;
          }

          const full = await prisma.webhookEndpoint.findUniqueOrThrow({
            where: { id: row.id },
            select: { id: true, secret: true },
          });
          // Only update rows that have a secret (null passes through unmodified)
          if (full.secret !== null) {
            await prisma.webhookEndpoint.update({
              where: { id: row.id },
              data: { secret: full.secret },
            });
          }
        } catch (err) {
          webhookErrors++;
          console.error(`[encrypt-existing-prompts] Error on WebhookEndpoint ${row.id}:`, err);
        }
      }
    }

    totalWebhooks += rows.length;
    process.stdout.write(
      `\r[encrypt-existing-prompts] WebhookEndpoint: ${totalWebhooks} rows processed (${webhookSkipped} already encrypted)...`
    );
  } while (true);

  console.log(
    `\n[encrypt-existing-prompts] WebhookEndpoint complete: ${totalWebhooks} rows, ${webhookErrors} errors.`
  );

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n[encrypt-existing-prompts] ===== SUMMARY =====');
  console.log(`  ChainVersion rows processed    : ${totalVersions}`);
  console.log(`  ChainVersion rows skipped      : ${versionSkipped} (already encrypted)`);
  console.log(`  ChainVersion errors            : ${versionErrors}`);
  console.log(`  WebhookEndpoint rows processed : ${totalWebhooks}`);
  console.log(`  WebhookEndpoint rows skipped   : ${webhookSkipped} (already encrypted)`);
  console.log(`  WebhookEndpoint errors         : ${webhookErrors}`);
  if (isDryRun) {
    console.log('  Mode: DRY RUN — no writes performed.');
  } else {
    console.log('  Mode: LIVE — all rows encrypted.');
  }

  const totalErrors = versionErrors + webhookErrors;
  if (totalErrors > 0) {
    const errorRate = totalErrors / (totalVersions + totalWebhooks);
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
