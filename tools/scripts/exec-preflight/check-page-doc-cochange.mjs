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
    /(?:(?:apps|packages|docs|tools|\.specify|\.claude|\.github|\.agents)\/[^\s'"`[\]()]+)/g;
  let match;
  while ((match = re.exec(sectionText)) !== null) {
    // Strip trailing punctuation that isn't part of a path.
    const raw = match[0].replace(/[.,;:)\]`]+$/, '');
    found.add(raw);
  }
  return [...found];
}

/**
 * Semantic check on docs/design/navigation-reachability-audit.md.
 *
 * Returns `null` if the task's entry either (a) does not exist yet (the plan
 * is simply listing the doc for a future update — handled by other gates) or
 * (b) exists and does not use waiver language.
 *
 * Returns `{ reason, quote }` if the audit doc contains a task entry whose
 * reachability cell uses waiver phrases like "Direct URL only" / "deferred" /
 * "follow-up" / "sidebar…later" WITHOUT citing a concrete follow-up task ID.
 *
 * Heuristic only — false negatives are preferred over false positives:
 *   - We look for the task ID as a heading or inline mention.
 *   - We inspect the surrounding 15 lines for waiver phrases.
 *   - If any waiver phrase matches and no `[A-Z]+-\d+` task ID is nearby,
 *     we block. PG-180's entry is the canonical positive case.
 */
function checkReachabilityEntry(taskId) {
  const auditPath = join(REPO_ROOT, 'docs/design/navigation-reachability-audit.md');
  if (!existsSync(auditPath)) {
    // If the audit doc itself doesn't exist, the structural gate will have
    // already failed. Leave deeper signalling to that path.
    return null;
  }

  const content = readFileSync(auditPath, 'utf8');
  const lines = content.split(/\r?\n/);

  // Find the window of lines mentioning this task ID. The PG-180 entry looks
  // like `### New route introduced by PG-180` with the waiver text in a
  // table row below. We collect every line that mentions the task ID and
  // expand a ±15-line window around each hit, then unique-merge.
  const ranges = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(taskId)) {
      ranges.push([Math.max(0, i - 2), Math.min(lines.length, i + 15)]);
    }
  }
  if (ranges.length === 0) return null; // no entry yet — not this gate's job

  // Merge overlapping ranges.
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0].slice()];
  for (let r = 1; r < ranges.length; r++) {
    const last = merged[merged.length - 1];
    if (ranges[r][0] <= last[1]) last[1] = Math.max(last[1], ranges[r][1]);
    else merged.push(ranges[r].slice());
  }

  const WAIVER_PATTERNS = [
    /direct\s*URL\s*only/i,
    /\bdeferred\b(?![^\n]*(?:[A-Z]+-\d+|FOLLOWUP-))/i,
    /\bfollow-?up\s+(?:task|ticket)\b(?![^\n]*(?:[A-Z]+-\d+|FOLLOWUP-))/i,
    /\bsidebar\s+wiring[^\n]*(?:later|future|subsequent|deferred)(?![^\n]*(?:[A-Z]+-\d+|FOLLOWUP-))/i,
    /\bwired\s+later\b(?![^\n]*(?:[A-Z]+-\d+|FOLLOWUP-))/i,
  ];
  const TASK_ID_NEAR = /\b([A-Z]+-\d+(?:-[A-Z0-9]+)?)\b/g;

  for (const [start, end] of merged) {
    const window = lines.slice(start, end).join('\n');
    for (const pat of WAIVER_PATTERNS) {
      const m = pat.exec(window);
      if (!m) continue;
      // Check if a companion task ID is cited within the same window that
      // is NOT just the current task ID.
      const ids = new Set();
      let idMatch;
      while ((idMatch = TASK_ID_NEAR.exec(window)) !== null) ids.add(idMatch[1]);
      TASK_ID_NEAR.lastIndex = 0;
      ids.delete(taskId);
      const cited = [...ids].filter(
        (id) => id.startsWith('FOLLOWUP-') || /^(?:PG|IFC|ENV|AUTOMATION)-\d+/.test(id)
      );
      if (cited.length === 0) {
        const quote = m[0].replace(/\s+/g, ' ').trim().slice(0, 160);
        return {
          reason:
            `The audit entry for ${taskId} uses reachability-waiver language ` +
            `but does not cite a companion follow-up task ID.`,
          quote,
        };
      }
    }
  }

  return null;
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

  // ── Semantic reachability check (Guard 1 — PG-180 lesson, 2026-04-20) ──
  // The structural listing check above only confirms the three doc filenames
  // appear in Files-to-Modify. PG-180 passed that gate while shipping a page
  // whose navigation-reachability-audit.md entry literally said "Direct URL
  // only for sprint-18. Sidebar wiring…deferred to a follow-up navigation
  // task." Below we read the actual audit doc for this task's entry and BLOCK
  // if a waiver phrase appears without a concrete follow-up task ID.
  const reachabilityFinding = missing.length === 0
    ? checkReachabilityEntry(taskId)
    : null;

  if (missing.length === 0 && !reachabilityFinding) {
    info(
      `[preflight] OK — all three page-doc files are in "Files to Modify":`
    );
    for (const doc of REQUIRED_DOCS) info(`           ✓ ${doc}`);
    process.exit(0);
  }

  if (missing.length === 0 && reachabilityFinding) {
    process.stderr.write(
      '\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        `  BLOCK: navigation-reachability-audit.md semantic check\n` +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        `\n` +
        `  Task: ${taskId}\n` +
        `  Audit entry: docs/design/navigation-reachability-audit.md\n` +
        `\n` +
        `  ${reachabilityFinding.reason}\n` +
        `\n`
    );
    if (reachabilityFinding.quote) {
      process.stderr.write(`  Offending phrase:\n`);
      process.stderr.write(`    "${reachabilityFinding.quote}"\n\n`);
    }
    process.stderr.write(
      `  This is the PG-180 pattern: three doc filenames are listed in the\n` +
        `  plan, the audit doc is updated with "Direct URL only" or similar\n` +
        `  waiver language, and no follow-up task is filed — so the page\n` +
        `  ships unreachable. Spec-session Phase 0.92 exists to prevent this.\n` +
        `\n` +
        `  Fix options:\n` +
        `    (a) Wire the sidebar entry in this exec session. Update the\n` +
        `        audit doc to describe the sidebar config path (no waiver\n` +
        `        language), and add the wiring step to the plan.\n` +
        `    (b) File a concrete follow-up task (e.g. FOLLOWUP-${taskId}-NAV)\n` +
        `        in Sprint_plan.csv for the next sprint, then cite the task\n` +
        `        ID inside the audit-doc entry for ${taskId}.\n` +
        `\n` +
        `  Source of gate: .claude/skills/exec/references/phase1-context-loading.md §3.2\n` +
        `  Memory: feedback_ui_reachability_waiver_loophole.md (2026-04-20)\n` +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    );
    process.exit(1);
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
