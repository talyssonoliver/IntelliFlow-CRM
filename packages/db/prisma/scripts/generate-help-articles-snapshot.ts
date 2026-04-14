/**
 * Snapshots `apps/web/src/lib/support/help-articles.ts` into
 * `packages/db/prisma/data/help-articles.snapshot.json`.
 *
 * This snapshot is consumed by `seed-help-articles.ts`. A direct
 * cross-workspace import of the apps/web file is rejected by
 * `packages/db/tsconfig.json` (rootDir constraint), so the snapshot
 * is our stable boundary.
 *
 * Modes:
 *   (default)  regenerate the snapshot file from current source
 *   --check    compare current source against committed snapshot;
 *              exit 1 if they differ (CI drift guard)
 *
 * Usage:
 *   pnpm --filter @intelliflow/db run db:snapshot:help-articles
 *   pnpm --filter @intelliflow/db run db:snapshot:help-articles:check
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HELP_ARTICLES } from '../../../../apps/web/src/lib/support/help-articles';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', 'data', 'help-articles.snapshot.json');
const checkMode = process.argv.includes('--check');

function serialize(articles: unknown) {
  return (
    JSON.stringify(
      {
        source: 'apps/web/src/lib/support/help-articles.ts',
        articles,
      },
      null,
      2
    ) + '\n'
  );
}

function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

// NOTE: `generatedAt` is intentionally excluded from the snapshot body so
// that the hash is deterministic — otherwise every regeneration would
// appear as a diff even when the article content is identical.
const nextBody = serialize(DEFAULT_HELP_ARTICLES);
const nextHash = sha256(nextBody);

if (checkMode) {
  if (!existsSync(outPath)) {
    console.error(`❌ Snapshot missing at ${outPath}. Run db:snapshot:help-articles to create it.`);
    process.exit(1);
  }
  const currentBody = readFileSync(outPath, 'utf8');
  const currentHash = sha256(currentBody);
  if (currentHash !== nextHash) {
    console.error(
      `❌ Snapshot drift detected. apps/web source and committed snapshot disagree.\n   Expected hash: ${nextHash}\n   Actual hash:   ${currentHash}\n   Run: pnpm --filter @intelliflow/db run db:snapshot:help-articles`
    );
    process.exit(1);
  }
  console.log(
    `✅ Snapshot in sync with source (${DEFAULT_HELP_ARTICLES.length} articles, sha256 ${nextHash.slice(0, 12)}...)`
  );
  process.exit(0);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, nextBody, 'utf8');
console.log(
  `✅ Wrote ${DEFAULT_HELP_ARTICLES.length} articles to ${outPath} (sha256 ${nextHash.slice(0, 12)}...)`
);
