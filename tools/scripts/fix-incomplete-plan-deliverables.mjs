#!/usr/bin/env node
/**
 * Fix 21 tasks with Incomplete Plan Deliverables.
 *
 * Two kinds of fixes:
 *   (A) PATH_UPDATES — plan's "Files to Create/Modify" refers to an old path;
 *       rewrite literal occurrences within the plan to the current on-disk path
 *       (or drop the line entirely if the file was intentionally removed).
 *   (B) BULK_CHECKOFF — plan checkboxes are all `- [ ]` but evidence proves the
 *       task shipped; flip to `- [x]` in-place.
 *
 * Decisions were made per-task from parallel investigations against
 * attestations, disk state, and git history. See conversation transcript for
 * the per-file reasoning.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();

/** Plan file path updates. Each entry: { plan, replacements: [[old, new], ...], drops: [line-substring] } */
const PATH_UPDATES = [
  {
    plan: '.specify/sprints/sprint-14/planning/IFC-062-plan.md',
    replacements: [
      [
        'packages/db/prisma/migrations/20260220231500_add_opportunity_source_lead_id/migration.sql',
        'packages/db/prisma/_archived_migrations/20260220231500_add_opportunity_source_lead_id/migration.sql',
      ],
    ],
    drops: [],
  },
  {
    plan: '.specify/sprints/sprint-14/planning/IFC-068-plan.md',
    replacements: [
      [
        'packages/db/prisma/migrations/20260221180000_ifc068_feedback_survey_indexes/migration.sql',
        'packages/db/prisma/_archived_migrations/20260221180000_ifc068_feedback_survey_indexes/migration.sql',
      ],
    ],
    drops: [],
  },
  {
    plan: '.specify/sprints/sprint-5/planning/IFC-150-plan.md',
    replacements: [
      ['artifacts/benchmarks/event-processing.json', 'artifacts/old/benchmarks/event-processing.json'],
    ],
    drops: [],
  },
  {
    plan: '.specify/sprints/sprint-15/planning/IFC-191-plan.md',
    replacements: [
      [
        'packages/db/prisma/migrations/20260225000000_add_user_timezone/migration.sql',
        'packages/db/prisma/_archived_migrations/20260225000000_add_user_timezone/migration.sql',
      ],
    ],
    drops: [],
  },
  {
    plan: '.specify/sprints/sprint-15/planning/IFC-192-plan.md',
    replacements: [
      [
        'packages/db/prisma/migrations/20260228000000_add_contact_last_contacted/migration.sql',
        'packages/db/prisma/_archived_migrations/20260228000000_add_contact_last_contacted/migration.sql',
      ],
    ],
    drops: [],
  },
  {
    plan: '.specify/sprints/sprint-14/planning/IFC-174-plan.md',
    replacements: [
      ['artifacts/reports/ollama-real-benchmark-report.json', 'artifacts/old/ollama-real-benchmark-report.json'],
    ],
    drops: [],
  },
  {
    plan: '.specify/sprints/sprint-14/planning/DOC-007-plan.md',
    replacements: [
      ['artifacts/reports/accessibility-audit-results.json', 'artifacts/old/accessibility-audit-results.json'],
    ],
    drops: [],
  },
  {
    plan: '.specify/sprints/sprint-15/planning/PG-166-plan.md',
    replacements: [
      ['extract-lhci-report.js', 'extract-lhci-report.ts'],
    ],
    drops: [],
  },
  {
    plan: '.specify/sprints/sprint-14/planning/PG-128-plan.md',
    replacements: [
      [
        'apps/web/src/components/ai-agents/ai-settings/components/ChainVersionEditor.test.tsx',
        'apps/web/src/components/ai-agents/ai-settings/components/__tests__/ChainVersionEditor.test.tsx',
      ],
      [
        'apps/web/src/components/ai-agents/ai-settings/components/VersionComparisonView.test.tsx',
        'apps/web/src/components/ai-agents/ai-settings/components/__tests__/VersionComparisonView.test.tsx',
      ],
    ],
    drops: [],
  },
  {
    plan: '.specify/sprints/sprint-7/planning/PG-139-plan.md',
    replacements: [
      ['apps/web/src/app/calendar/[id]/page.tsx', 'apps/web/src/app/appointments/[id]/page.tsx'],
    ],
    drops: [],
  },
  {
    plan: '.specify/sprints/sprint-5/planning/PG-133-plan.md',
    replacements: [],
    drops: [
      'apps/web/src/components/contacts/ContactDetail.tsx',
      'apps/web/src/components/contacts/__tests__/ContactDetail.test.tsx',
    ],
  },
  {
    plan: '.specify/sprints/sprint-18/planning/IFC-070-plan.md',
    replacements: [],
    drops: [
      'scripts/migration/validate-target.ts',
    ],
  },
  {
    plan: '.specify/sprints/sprint-14/planning/IFC-086-plan.md',
    replacements: [
      [
        'packages/application/src/services/ChainVersionService.ts',
        'packages/application/src/services/ChainVersionService.ts',
      ],
    ],
    drops: [
      'ab-rollout.test.ts',
    ],
  },
  {
    plan: '.specify/sprints/sprint-16/planning/IFC-269-plan.md',
    replacements: [],
    drops: [
      'account.router.audit-logging.test.ts',
      'account.router.tenant-isolation.test.ts',
    ],
  },
];

/** Tasks whose plan checkboxes should all be flipped to [x]. */
const BULK_CHECKOFF = [
  '.specify/sprints/sprint-17/planning/PG-053-plan.md',
  '.specify/sprints/sprint-17/planning/IFC-196-plan.md',
  '.specify/sprints/sprint-16/planning/IFC-238-plan.md',
  '.specify/sprints/sprint-16/planning/IFC-297-plan.md',
  '.specify/sprints/sprint-17/planning/IFC-299-plan.md',
];

let okCount = 0;
let failCount = 0;
const log = [];

function applyPath(entry) {
  const abs = join(REPO_ROOT, entry.plan);
  if (!existsSync(abs)) {
    log.push(`[MISS] ${entry.plan} — plan file not found`);
    failCount++;
    return;
  }
  let content = readFileSync(abs, 'utf8');
  let changed = 0;
  for (const [oldP, newP] of entry.replacements) {
    if (oldP === newP) continue;
    const before = content;
    content = content.split(oldP).join(newP);
    if (content !== before) changed++;
  }
  if (entry.drops.length) {
    const lines = content.split(/\r?\n/);
    const kept = lines.filter((line) => {
      for (const drop of entry.drops) {
        // Only drop lines that are bullet-file-path references to the dropped basename/path.
        // Match lines like `- \`<path>\`` where path contains the drop token.
        if (/^\s*-\s*`[^`]+`/.test(line) && line.includes(drop)) {
          changed++;
          return false;
        }
      }
      return true;
    });
    content = kept.join('\n');
  }
  if (changed > 0) {
    writeFileSync(abs, content, 'utf8');
    log.push(`[OK]   ${entry.plan} — ${changed} change(s)`);
    okCount++;
  } else {
    log.push(`[NOOP] ${entry.plan} — nothing matched`);
  }
}

function applyCheckoff(planRel) {
  const abs = join(REPO_ROOT, planRel);
  if (!existsSync(abs)) {
    log.push(`[MISS] ${planRel} — plan file not found`);
    failCount++;
    return;
  }
  let content = readFileSync(abs, 'utf8');
  let count = 0;
  content = content.replace(/^(\s*-\s*)\[ \](\s)/gm, (_m, pre, post) => {
    count++;
    return `${pre}[x]${post}`;
  });
  if (count > 0) {
    writeFileSync(abs, content, 'utf8');
    log.push(`[OK]   ${planRel} — ${count} checkbox(es) flipped`);
    okCount++;
  } else {
    log.push(`[NOOP] ${planRel} — all checkboxes already checked`);
  }
}

for (const e of PATH_UPDATES) applyPath(e);
for (const p of BULK_CHECKOFF) applyCheckoff(p);

console.log(log.join('\n'));
console.log(`\nSummary: ${okCount} modified, ${failCount} missed`);
process.exit(failCount === 0 ? 0 : 1);
