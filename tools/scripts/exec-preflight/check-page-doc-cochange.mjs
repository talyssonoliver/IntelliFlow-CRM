#!/usr/bin/env node
/**
 * Phase 1 §3.2 Page Documentation Co-Change preflight check.
 *
 * Fires when /exec loads a plan. Parses the plan's Files-to-Create and
 * Files-to-Modify lists. If ANY `page.tsx` appears in Files-to-Create,
 * ALL THREE of these documentation files MUST appear in Files-to-Modify:
 *
 *   - docs/design/PAGE_MAP_AND_FLOWS.md
 *   - docs/design/sitemap.md
 *   - docs/design/navigation-reachability-audit.md
 *
 * Exit codes:
 *   0 — check passed, safe to proceed with exec Phase 2
 *   1 — BLOCK: plan adds a page.tsx but omits a required doc file
 *   2 — Usage error (bad args, plan file missing)
 *
 * Source: .claude/skills/exec/references/phase1-context-loading.md §3.2
 * Root cause: plan-reviewer category CC bypassed + exec phase1 gate skipped.
 * Memory: feedback_exec_phase1_preflight.md (added 2026-04-15 after PG-184
 * self-audit).
 *
 * Usage:
 *   node tools/scripts/exec-preflight/check-page-doc-cochange.mjs <TASK_ID> [SPRINT]
 *
 *   TASK_ID   — e.g. PG-184 (required)
 *   SPRINT    — sprint number, inferred from CSV if omitted
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REQUIRED_DOCS = [
  'docs/design/PAGE_MAP_AND_FLOWS.md',
  'docs/design/sitemap.md',
  'docs/design/navigation-reachability-audit.md',
];

const REPO_ROOT = resolve(process.cwd());
const CSV_PATH = join(
  REPO_ROOT,
  'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
);

function die(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function info(message) {
  process.stdout.write(`${message}\n`);
}

function readPlan(taskId, sprintArg) {
  const sprint = sprintArg ?? inferSprintFromCsv(taskId);
  if (!sprint) {
    die(
      2,
      `[preflight] Could not infer sprint for ${taskId} from ${CSV_PATH}. ` +
        `Pass the sprint explicitly as the second argument.`
    );
  }

  const planPath = join(
    REPO_ROOT,
    '.specify',
    'sprints',
    `sprint-${sprint}`,
    'planning',
    `${taskId}-plan.md`
  );

  if (!existsSync(planPath)) {
    die(2, `[preflight] Plan file not found: ${planPath}`);
  }

  return { planPath, sprint, content: readFileSync(planPath, 'utf8') };
}

function inferSprintFromCsv(taskId) {
  if (!existsSync(CSV_PATH)) return null;
  const csv = readFileSync(CSV_PATH, 'utf8');
  const lines = csv.split(/\r?\n/);
  const header = lines[0].split(',');
  // Find Target Sprint column
  const sprintColIndex = header.findIndex((h) => h.trim() === 'Target Sprint');
  if (sprintColIndex < 0) return null;
  for (const line of lines.slice(1)) {
    // naive CSV split is fine here because we only need the first field;
    // for the sprint column we re-parse via a minimal CSV-aware splitter.
    if (!line.startsWith(`${taskId},`)) continue;
    const cells = parseCsvLine(line);
    const sprint = cells[sprintColIndex]?.trim();
    if (sprint && /^\d+$/.test(sprint)) return sprint;
  }
  return null;
}

// Minimal CSV line parser — handles quoted fields with embedded commas.
function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

/**
 * Extract the content of a section by heading. We match the heading (case-
 * insensitive, ignoring leading hash+space), then capture everything until
 * the next `##`/`###` heading or EOF.
 */
function extractSection(planContent, headingPatterns) {
  const lines = planContent.split(/\r?\n/);
  const headingRe = /^#{2,4}\s+(.+?)\s*$/;
  let inSection = false;
  const captured = [];

  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      const title = m[1].toLowerCase();
      const isTarget = headingPatterns.some((p) => title.includes(p));
      if (isTarget) {
        inSection = true;
        continue;
      }
      if (inSection) {
        // Next heading ends the section.
        inSection = false;
      }
    }
    if (inSection) captured.push(line);
  }
  return captured.join('\n');
}

function listFilePaths(sectionText) {
  // Pull out anything that looks like a repo-relative path. We accept:
  //   1. apps/foo/bar.tsx
  //   2. packages/foo/bar.ts
  //   3. docs/foo/bar.md
  //   4. .specify/... .claude/... etc.
  const found = new Set();
  const re =
    /(?:(?:apps|packages|docs|tools|\.specify|\.claude|\.github|\.agents)\/[^\s'"`\]\)]+)/g;
  let match;
  while ((match = re.exec(sectionText)) !== null) {
    // Strip trailing punctuation that isn't part of a path.
    const raw = match[0].replace(/[.,;:)\]`]+$/, '');
    found.add(raw);
  }
  return [...found];
}

function main() {
  const [taskId, sprintArg] = process.argv.slice(2);
  if (!taskId) {
    die(2, 'Usage: check-page-doc-cochange.mjs <TASK_ID> [SPRINT]');
  }

  const { planPath, sprint, content } = readPlan(taskId, sprintArg);

  info(`[preflight] Checking ${taskId} (sprint ${sprint}) — ${planPath}`);

  const createSection = extractSection(content, [
    'files to create',
    'create (',
  ]);
  const modifySection = extractSection(content, [
    'files to modify',
    'modify (',
  ]);

  const createFiles = listFilePaths(createSection);
  const modifyFiles = listFilePaths(modifySection);

  const createsPage = createFiles.some((f) => /\/page\.tsx$/.test(f));

  if (!createsPage) {
    info(
      `[preflight] OK — plan does not create any page.tsx; § 3.2 gate does not apply.`
    );
    process.exit(0);
  }

  info(
    `[preflight] Plan creates ${createFiles.filter((f) =>
      /\/page\.tsx$/.test(f)
    ).length} page.tsx file(s). Gate is active.`
  );

  const missing = [];
  for (const doc of REQUIRED_DOCS) {
    const isListed = modifyFiles.some((f) => f === doc || f.endsWith(doc));
    if (!isListed) missing.push(doc);
  }

  if (missing.length === 0) {
    info(
      `[preflight] OK — all three page-doc files are in "Files to Modify":`
    );
    for (const doc of REQUIRED_DOCS) info(`           ✓ ${doc}`);
    process.exit(0);
  }

  // Failure: format a clear, actionable error.
  process.stderr.write(
    '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      `  BLOCK: Phase 1 §3.2 Page Documentation Co-Change gate\n` +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      `\n` +
      `  Task: ${taskId}\n` +
      `  Plan: ${planPath}\n` +
      `\n` +
      `  The plan's "Files to Create" includes a page.tsx file.\n` +
      `  The following doc files MUST appear in "Files to Modify" but are\n` +
      `  missing:\n` +
      `\n`
  );
  for (const doc of missing) {
    process.stderr.write(`    ✗ ${doc}\n`);
  }
  process.stderr.write(
    `\n` +
      `  Fix: edit ${planPath} "Files to Modify" section to include each\n` +
      `  missing path, then rerun this preflight.\n` +
      `\n` +
      `  Source of gate: .claude/skills/exec/references/phase1-context-loading.md §3.2\n` +
      `  Root-cause memory: feedback_exec_phase1_preflight.md\n` +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  );
  process.exit(1);
}

main();
