import { readFileSync, writeFileSync } from 'node:fs';

const edits = [
  ['.specify/sprints/sprint-14/planning/IFC-086-plan.md',
   'packages/application/src/usecases/chain-version/ChainVersionService.ts',
   'packages/application/src/services/ChainVersionService.ts'],
  ['.specify/sprints/sprint-5/planning/PG-133-plan.md',
   'apps/web/src/components/contacts/__tests__/contact-test-utils.ts',
   'apps/web/src/components/contacts/__tests__/contact-test-utils.tsx'],
  ['.specify/sprints/sprint-16/planning/PG-178-plan.md',
   'packages/db/prisma/migrations/20260311_lead_settings/migration.sql',
   'packages/db/prisma/_archived_migrations/20260311_lead_settings/migration.sql'],
  ['.specify/sprints/sprint-17/planning/IFC-298-plan.md',
   'packages/db/prisma/migrations/20260311000000_add_help_article_models/migration.sql',
   'packages/db/prisma/_archived_migrations/20260311000000_add_help_article_models/migration.sql'],
];

for (const [p, oldS, newS] of edits) {
  let c = readFileSync(p, 'utf8');
  const parts = c.split(oldS);
  const count = parts.length - 1;
  if (count > 0) {
    writeFileSync(p, parts.join(newS), 'utf8');
    console.log(`OK   ${p} — ${count} replacement(s)`);
  } else {
    console.log(`NOOP ${p}`);
  }
}
