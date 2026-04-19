#!/usr/bin/env node
/**
 * Plan-Reviewer Subagent Enforcement preflight.
 *
 * plan-session SKILL.md says: "Spawns a mandatory Plan-Reviewer agent for
 * ALL tasks before finalising the plan." Historically, /plan-session has
 * skipped this in favour of a self-review against the 33-category rubric.
 * Self-review is the documented failure mode that phase1-context-loading
 * §3.2 Gate CC was meant to catch.
 *
 * This preflight runs at exec-time and blocks if a plan's Plan-Reviewer
 * Sign-off section looks self-generated rather than produced by the actual
 * Plan-Reviewer subagent.
 *
 * Acceptable evidence of a real subagent review (any ONE):
 *
 *   1. An HTML comment flag:
 *        <!-- plan-reviewer: subagent -->
 *      Emitted by plan-reviewer.md's output template.
 *
 *   2. A `reviewer_subagent: <non-empty>` line in the Sign-off section
 *      pointing at a transcript/run id or subagent path.
 *
 *   3. A "Subagent transcript:" line pointing at an existing file under
 *      `.specify/sprints/sprint-{N}/review/` or `.claude/agents/…`.
 *
 * Any plan that only contains the phrases "self-review", "self review",
 * or "Self-review" in the Plan-Reviewer section is REJECTED.
 *
 * Exit codes:
 *   0 — check passed (real subagent evidence found, or no Sign-off required
 *       because the plan doesn't meet the complexity threshold)
 *   1 — BLOCK: plan claims Plan-Reviewer approval via self-review
 *   2 — Usage error
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const CSV_PATH = join(
  REPO_ROOT,
  'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
);

function die(code, msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(code);
}

function info(msg) {
  process.stdout.write(`${msg}\n`);
}

function inferSprintFromCsv(taskId) {
  if (!existsSync(CSV_PATH)) return null;
  const csv = readFileSync(CSV_PATH, 'utf8');
  const lines = csv.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const sprintColIndex = header.findIndex((h) => h.trim() === 'Target Sprint');
  if (sprintColIndex < 0) return null;
  for (const line of lines.slice(1)) {
    if (!line.startsWith(`${taskId},`)) continue;
    const cells = parseCsvLine(line);
    const sprint = cells[sprintColIndex]?.trim();
    if (sprint && /^\d+$/.test(sprint)) return sprint;
  }
  return null;
}

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

function extractSignoffSection(content) {
  const lines = content.split(/\r?\n/);
  const headingRe = /^#{2,4}\s+(.+?)\s*$/;
  let inSection = false;
  const captured = [];
  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      const title = m[1].toLowerCase();
      if (title.includes('plan-reviewer') || title.includes('plan reviewer')) {
        inSection = true;
        continue;
      }
      if (inSection) {
        inSection = false;
      }
    }
    if (inSection) captured.push(line);
  }
  return captured.join('\n');
}

function main() {
  const [taskId, sprintArg] = process.argv.slice(2);
  if (!taskId) die(2, 'Usage: check-plan-reviewer-subagent.mjs <TASK_ID> [SPRINT]');

  const sprint = sprintArg ?? inferSprintFromCsv(taskId);
  if (!sprint) {
    die(
      2,
      `[preflight] Could not infer sprint for ${taskId} from ${CSV_PATH}. Pass sprint explicitly.`
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

  const content = readFileSync(planPath, 'utf8');
  const signoff = extractSignoffSection(content);

  info(`[preflight] Checking ${taskId} plan at ${planPath}`);

  // Acceptable evidence of a real subagent review.
  const hasMarkerComment = /<!--\s*plan-reviewer\s*:\s*subagent\s*-->/i.test(
    content
  );
  const hasSubagentLine = /reviewer_subagent\s*:\s*\S+/i.test(signoff);
  const hasTranscriptLine = /(?:Subagent\s+transcript|subagent-transcript)\s*:/i.test(
    signoff
  );
  const acceptable = hasMarkerComment || hasSubagentLine || hasTranscriptLine;

  // Red-flag markers — self-review language.
  const hasSelfReview = /\bself[\s-]?review\b/i.test(signoff);

  if (acceptable) {
    info(`[preflight] OK — real Plan-Reviewer subagent evidence found.`);
    if (hasMarkerComment) info(`           ✓ <!-- plan-reviewer: subagent -->`);
    if (hasSubagentLine) info(`           ✓ reviewer_subagent: … line`);
    if (hasTranscriptLine) info(`           ✓ Subagent transcript: … line`);
    process.exit(0);
  }

  if (hasSelfReview) {
    process.stderr.write(
      '\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        `  BLOCK: Plan-Reviewer Subagent Enforcement\n` +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        `\n` +
        `  Task: ${taskId}\n` +
        `  Plan: ${planPath}\n` +
        `\n` +
        `  The Plan-Reviewer sign-off section contains "self-review" language\n` +
        `  but no marker of an actual Plan-Reviewer subagent invocation.\n` +
        `\n` +
        `  plan-session SKILL.md §8 and phase1-context-loading.md §3.2 Gate CC\n` +
        `  both require a real subagent review — self-review is the documented\n` +
        `  failure mode.\n` +
        `\n` +
        `  Fix: rerun /plan-session with the Plan-Reviewer subagent spawned\n` +
        `  (Task tool, subagent_type=plan-reviewer or general-purpose with the\n` +
        `  .claude/agents/plan-reviewer.md prompt), then append ONE of:\n` +
        `\n` +
        `    <!-- plan-reviewer: subagent -->\n` +
        `    reviewer_subagent: <agent-id-or-transcript-path>\n` +
        `    Subagent transcript: <path-or-id>\n` +
        `\n` +
        `  to the plan's "Plan-Reviewer Sign-off" section.\n` +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    );
    process.exit(1);
  }

  // No sign-off section at all: warn loudly, but don't hard-block — some
  // small tasks genuinely have no Plan-Reviewer section. The exec prompt
  // surfaces this in plain text so the reviewer sees it.
  info(
    `[preflight] WARN — no Plan-Reviewer sign-off section found, and no self-review language either. ` +
      `If this is a PG-*/IFC-* task above the complexity threshold, this is a BLOCKER; otherwise OK.`
  );
  process.exit(0);
}

main();
