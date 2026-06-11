#!/usr/bin/env node
/**
 * Plan-Reviewer Subagent Enforcement preflight.
 *
 * plan-session SKILL.md says: "Spawns a mandatory Plan-Reviewer agent for
 * ALL tasks before finalising the plan." Historically /plan-session has
 * skipped this in favour of a self-review against the 33-category rubric.
 * Self-review is the documented failure mode that phase1-context-loading
 * section 3.2 Gate CC was meant to catch.
 *
 * This preflight runs at exec-time and blocks if a plan's Plan-Reviewer
 * Sign-off section looks self-generated rather than produced by the actual
 * Plan-Reviewer subagent.
 *
 * It additionally enforces Category Y (UI Reachability) for PG and IFC
 * tasks that create any apps/web/src/app page.tsx (PG-180 lesson,
 * 2026-04-20). A missing, catch-all, or mislabelled Y row BLOCKS.
 *
 * Acceptable evidence of a real subagent review (any ONE):
 *
 *   1. An HTML comment flag: plan-reviewer: subagent (emitted by the
 *      plan-reviewer.md output template).
 *   2. A reviewer_subagent line in the Sign-off section pointing at a
 *      transcript or subagent path.
 *   3. A Subagent transcript: line pointing at a file.
 *
 * Exit codes:
 *   0 - check passed
 *   1 - BLOCK: self-review, missing subagent markers on a UI task, or
 *       Category Y missing / mislabelled / hidden in a catch-all range
 *   2 - Usage error
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const CSV_PATH = join(
  REPO_ROOT,
  'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
);

function die(code, msg) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

function info(msg) {
  process.stdout.write(msg + '\n');
}

function inferSprintFromCsv(taskId) {
  if (!existsSync(CSV_PATH)) return null;
  const csv = readFileSync(CSV_PATH, 'utf8');
  const lines = csv.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const sprintColIndex = header.findIndex((h) => h.trim() === 'Target Sprint');
  if (sprintColIndex < 0) return null;
  for (const line of lines.slice(1)) {
    if (!line.startsWith(taskId + ',')) continue;
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

// Extract the Plan-Reviewer Sign-off section. The section is bounded by the
// opening heading (any level) and the next heading at the same level or
// higher. Nested subsections stay inside.
function extractSignoffSection(content) {
  const lines = content.split(/\r?\n/);
  const headingRe = /^(#{1,6})[ \t]+([^ \t\n\r][^\n\r]{0,198}[^ \t\n\r]|[^ \t\n\r])$/;
  let sectionLevel = null;
  const captured = [];
  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      const level = m[1].length;
      const title = m[2].toLowerCase();
      // Open the section the first time we see the heading. Do NOT re-open
      // on nested "Plan-Reviewer" subheadings — those are part of the
      // section we already opened (e.g. PG-184 has both
      // `## Plan-Reviewer Sign-off` and `### Real Plan-Reviewer subagent
      // verdict`, and we need BOTH included).
      if (
        sectionLevel == null &&
        (title.includes('plan-reviewer') || title.includes('plan reviewer'))
      ) {
        sectionLevel = level;
        continue;
      }
      if (sectionLevel != null && level <= sectionLevel) {
        sectionLevel = null;
      }
    }
    if (sectionLevel != null) captured.push(line);
  }
  return captured.join('\n');
}

// True if the plan introduces any App Router page.tsx. Section heading
// conventions vary across sprints (Files to Create, CREATE (N files), File
// Plan), so we look for any apps/web/src/app/... /page.tsx path anywhere.
function planCreatesAppRouterPage(content) {
  const re = new RegExp('apps/web/src/app/\\S+/page\\.tsx');
  return re.test(content);
}

// Convert a 1- or 2-letter plan-reviewer category label to an integer that
// preserves the documented A..Z, AA..GG ordering. Returns null for
// malformed inputs.
function labelOrd(label) {
  if (!/^[A-Z]{1,2}$/.test(label)) return null;
  if (label.length === 1) return label.charCodeAt(0) - 'A'.charCodeAt(0);
  const a = label.charCodeAt(0) - 'A'.charCodeAt(0);
  const b = label.charCodeAt(1) - 'A'.charCodeAt(0);
  return 26 + a * 26 + b;
}

// Enforce Category Y (UI Reachability) presence in the sign-off section.
// Returns null on PASS, or a short reason string on BLOCK.
//
// Accepted shapes for a Y row:
//   - markdown table row that starts with pipe-space-Y
//   - bulleted list item whose primary label is (Y), Y., or **Y.**
// Rejected:
//   - mislabelled rows ("Internal vs Shared", "Shared Component Reuse", DRY)
//   - missing Y entirely
//   - catch-all ranges like R-GG or X-Z PASS that hide Y inside a summary
function checkCategoryYRow(signoff) {
  if (!signoff) {
    return 'Plan has no Plan-Reviewer sign-off section — cannot verify Category Y.';
  }

  const rangeRe = /\b([A-Z]{1,2})\s*[-\u2013\u2014\u2026]+\s*([A-Z]{1,2})\b[^\n]{0,40}(?:PASS|OK|APPROVED)/gi;
  const ranges = [];
  let rm;
  while ((rm = rangeRe.exec(signoff)) !== null) {
    const from = rm[1];
    const to = rm[2];
    if (from !== to && from.length <= 2 && to.length <= 2) ranges.push([from, to]);
  }
  function yCoveredByRange() {
    const y = labelOrd('Y');
    for (const [from, to] of ranges) {
      const f = labelOrd(from);
      const t = labelOrd(to);
      if (f != null && t != null && f <= y && y <= t) return true;
    }
    return false;
  }

  const yLines = [];
  for (const raw of signoff.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\|\s*Y\b/i.test(line)) {
      yLines.push(line);
      continue;
    }
    const stripped = line
      .replace(/^[-*+]\s+/, '')
      .replace(/^\*\*|\*\*$/g, '')
      .replace(/^\(/, '')
      .trim();
    if (/^Y\b[.:\s)]/i.test(stripped)) {
      yLines.push(line);
    }
  }

  const yTextJoined = yLines.join('\n').toLowerCase();
  const hasReachabilityLabel =
    /ui[\s-]*reachability|reachability|navigation[\s-]*wiring|sidebar[\s-]*reach/i.test(yTextJoined);
  const hasMislabel =
    /internal[\s-]*vs[\s-]*shared|shared[\s-]*component[\s-]*reuse|\bdry\b/i.test(yTextJoined);

  if (yLines.length === 0) {
    if (yCoveredByRange()) {
      return (
        'Plan-Reviewer sign-off uses a catch-all category range ' +
        '(e.g. "R-GG: PASS") that hides Y inside a summary. Category Y ' +
        'must appear on its own row with a UI Reachability label and ' +
        'concrete evidence.'
      );
    }
    return 'Plan-Reviewer sign-off has NO row labelled "Y" at all.';
  }

  if (hasMislabel && !hasReachabilityLabel) {
    return (
      'Plan-Reviewer sign-off has a "Y" row but it is mislabelled as a ' +
      'DRY / shared-component / internal-vs-shared check — that is ' +
      'category X (items 77-80). Relabel the reachability row as ' +
      '"Y. UI Reachability" and add a separate X row if DRY was also reviewed.'
    );
  }

  if (!hasReachabilityLabel) {
    return (
      'Plan-Reviewer sign-off has a "Y" row but its label does not mention ' +
      '"UI Reachability" / "reachability" / "navigation wiring". Rewrite ' +
      'the row so the label is unambiguous.'
    );
  }

  return null;
}

function main() {
  const [taskId, sprintArg] = process.argv.slice(2);
  if (!taskId) die(2, 'Usage: check-plan-reviewer-subagent.mjs <TASK_ID> [SPRINT]');

  const sprint = sprintArg ?? inferSprintFromCsv(taskId);
  if (!sprint) {
    die(
      2,
      '[preflight] Could not infer sprint for ' + taskId + ' from ' + CSV_PATH + '. Pass sprint explicitly.'
    );
  }

  const planPath = join(
    REPO_ROOT,
    '.specify',
    'sprints',
    'sprint-' + sprint,
    'planning',
    taskId + '-plan.md'
  );

  if (!existsSync(planPath)) {
    die(2, '[preflight] Plan file not found: ' + planPath);
  }

  const content = readFileSync(planPath, 'utf8');
  const signoff = extractSignoffSection(content);

  info('[preflight] Checking ' + taskId + ' plan at ' + planPath);

  const hasMarkerComment = /<!--\s*plan-reviewer\s*:\s*subagent\s*-->/i.test(content);
  const hasSubagentLine = /reviewer_subagent\s*:\s*\S+/i.test(signoff);
  const hasTranscriptLine = /(?:Subagent\s+transcript|subagent-transcript)\s*:/i.test(signoff);
  const acceptable = hasMarkerComment || hasSubagentLine || hasTranscriptLine;
  const hasSelfReview = /\bself[\s-]?review\b/i.test(signoff);

  const isUITask = /^(PG|IFC)-/.test(taskId);
  const planCreatesPage = planCreatesAppRouterPage(content);

  if (acceptable) {
    info('[preflight] OK — real Plan-Reviewer subagent evidence found.');
    if (hasMarkerComment) info('           ✓ <!-- plan-reviewer: subagent -->');
    if (hasSubagentLine) info('           ✓ reviewer_subagent: … line');
    if (hasTranscriptLine) info('           ✓ Subagent transcript: … line');

    if (isUITask && planCreatesPage) {
      const yFinding = checkCategoryYRow(signoff);
      info(
        '[preflight] Category Y check: ' +
          (yFinding ? 'BLOCK — ' + yFinding : 'PASS — UI Reachability row found')
      );
      if (yFinding) {
        process.stderr.write(
          '\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
            '  BLOCK: Plan-Reviewer Category Y (UI Reachability)\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
            '\n' +
            '  Task: ' + taskId + '\n' +
            '  Plan: ' + planPath + '\n' +
            '\n' +
            '  ' + yFinding + '\n' +
            '\n' +
            '  plan-reviewer.md category Y (items 81-85b) enforces this for\n' +
            '  every PG-/IFC- UI task that creates a page.tsx. The Y row\n' +
            '  MUST be labelled exactly "UI Reachability" — not "Internal vs\n' +
            '  Shared Pattern" (that is X), not "Shared component reuse /\n' +
            '  DRY" (also X). Catch-all ranges like "R-GG: PASS" do NOT\n' +
            '  satisfy this gate. Rerun the plan-reviewer subagent and\n' +
            '  append a concrete Y row citing the sidebar config path or\n' +
            '  parent-link file:line that proves the route is reachable.\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
        );
        process.exit(1);
      }
    }

    process.exit(0);
  }

  if (hasSelfReview) {
    process.stderr.write(
      '\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '  BLOCK: Plan-Reviewer Subagent Enforcement\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '\n' +
        '  Task: ' + taskId + '\n' +
        '  Plan: ' + planPath + '\n' +
        '\n' +
        '  The Plan-Reviewer sign-off section contains "self-review"\n' +
        '  language but no marker of an actual Plan-Reviewer subagent.\n' +
        '\n' +
        '  Fix: rerun /plan-session with the Plan-Reviewer subagent and\n' +
        '  append ONE of the following lines to the "Plan-Reviewer\n' +
        '  Sign-off" section:\n' +
        '\n' +
        '    <!-- plan-reviewer: subagent -->\n' +
        '    reviewer_subagent: <agent-id-or-transcript-path>\n' +
        '    Subagent transcript: <path-or-id>\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    );
    process.exit(1);
  }

  // No subagent markers + no self-review language. For UI tasks that create
  // a page.tsx, absence of markers is itself a BLOCK — PG-057 slipped
  // through because its Sign-off section claimed approval without any
  // subagent evidence and without using the literal phrase "self-review".
  if (isUITask && planCreatesPage) {
    process.stderr.write(
      '\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '  BLOCK: Plan-Reviewer subagent evidence missing (UI task)\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '\n' +
        '  Task: ' + taskId + '\n' +
        '  Plan: ' + planPath + '\n' +
        '\n' +
        '  This task creates a page.tsx, so a real Plan-Reviewer subagent\n' +
        '  review is MANDATORY (plan-session SKILL.md + plan-reviewer\n' +
        '  category Y). No subagent markers were found:\n' +
        '\n' +
        '    Expected ONE of:\n' +
        '      <!-- plan-reviewer: subagent -->\n' +
        '      reviewer_subagent: <agent-id-or-transcript-path>\n' +
        '      Subagent transcript: <path>\n' +
        '\n' +
        '  PG-057 passed this gate before this guard was tightened because\n' +
        '  its sign-off section claimed approval without invoking the\n' +
        '  subagent. Do not repeat the pattern.\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    );
    process.exit(1);
  }

  info(
    '[preflight] WARN — no Plan-Reviewer sign-off section found, and no ' +
      'self-review language either. Task is not a UI page task, so proceeding as OK.'
  );
  process.exit(0);
}

main();
