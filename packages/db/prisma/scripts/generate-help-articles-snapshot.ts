/**
 * One-shot generator that snapshots `apps/web/src/lib/support/help-articles.ts`
 * into `packages/db/prisma/data/help-articles.snapshot.json`.
 *
 * This snapshot is consumed by `seed-help-articles.ts` as a cross-workspace
 * import of the apps/web file is rejected by `packages/db/tsconfig.json`
 * (rootDir constraint). Re-run this script whenever the authoritative
 * `DEFAULT_HELP_ARTICLES` source changes.
 *
 * Usage:
 *   pnpm --filter @intelliflow/db run db:snapshot:help-articles
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HELP_ARTICLES } from '../../../../apps/web/src/lib/support/help-articles';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', 'data', 'help-articles.snapshot.json');

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'apps/web/src/lib/support/help-articles.ts',
      articles: DEFAULT_HELP_ARTICLES,
    },
    null,
    2,
  ),
  'utf8',
);

console.log(`✅ Wrote ${DEFAULT_HELP_ARTICLES.length} articles to ${outPath}`);
