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
  const headingRe = /^(#{1,6})\s+(.+?)\s*$/;
  let sectionLevel = null; // the `##`-count of the opening heading
  const captured = [];
  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      const level = m[1].length;
      const title = m[2].toLowerCase();
      if (title.includes('plan-reviewer') || title.includes('plan reviewer')) {
        sectionLevel = level;
        continue;
      }
      // Close the section only when we hit another heading at <= the opening
      // level. Nested subsections (### / ####) remain inside the signoff.
      if (sectionLevel != null && level <= sectionLevel) {
        sectionLevel = null;
      }
    }
    if (sectionLevel != null) captured.push(line);
  }
  return captured.join('\n');
}

/**
 * True if the plan introduces a new App Router `page.tsx` file. The section
 * heading conventions vary across sprints ("Files to Create", "CREATE (N
 * files)", "## File Plan"), so we look for any `apps/web/src/app/**/page.tsx`
 * path mention anywhere in the plan.
 */
function planCreatesAppRouterPage(content) {
  // Match any mention of apps/web/src/app/.../page.tsx anywhere in the plan.
  // Path-segment chars allow any non-whitespace; suffix is the literal
  // /page.tsx. Built via RegExp constructor to avoid literal-backtick issues
  // in char classes.
  const re = new RegExp('apps/web/src/app/\\S+/page\\.tsx');
  return re.test(content);
}

/**
 * Enforce Category Y (UI Reachability) presence in the sign-off section.
 *
 * Accepted shapes:
 *   markdown-table row starting with pipe-Y-pipe
 *   bulleted list items - (Y) UI Reachability or - Y. UI Reachability
 *   bold variants like **Y.** or **(Y)**
 *
 * Rejected:
 *   Y row mislabelled as Internal-vs-Shared, Shared Component Reuse, or DRY
 *   No Y row at all
 *   Catch-all ranges like R-GG PASS or X-Z PASS that hide Y inside
 */
function checkCategoryYRow(signoff) {
  if (!signoff) {
    return 'Plan has no Plan-Reviewer sign-off section — cannot verify Category Y.';
  }

  // Catch-all range detection: block if `Y` appears only inside a multi-
  // category range marker such as `R–GG`, `R-GG`, `X..Z`.
  const rangeRe =
    /\b([A-Z]{1,2})\s*[-–…\u2013\u2014]+\s*([A-Z]{1,2})\b[^\n]{0,40}(?:PASS|OK|APPROVED)/gi;
  let m;
  const ranges = [];
  while ((m = rangeRe.exec(signoff)) !== null) {
    const from = m[1];
    const to = m[2];
    // Only treat as a real range if `from` <= `to` alphabetically and they
    // differ. Letter compare on the two-char labels.
    if (from !== to && from.length <= 2 && to.length <= 2) ranges.push([from, to, m[0]]);
  }
  function yCoveredByRange() {
    for (const [from, to] of ranges) {
      const f = labelOrd(from);
      const t = labelOrd(to);
      const y = labelOrd('Y');
      if (f != null && t != null && f <= y && y <= t) return true;
    }
    return false;
  }

  // Scan line-by-line for a category-Y marker. Accepted shapes:
  //   - markdown table row:      `| Y | <label> | …`
  //   - bulleted list item:      `- (Y) UI Reachability: …`
  //                              `- Y. UI Reachability — PASS`
  //                              `- **Y.** UI Reachability`
  //   - heading-ish bold bullet: `**(Y) UI Reachability:** PASS`
  // Reject matches where the "Y" is part of a longer token like `YES`,
  // `AA`, `IFC-Y`, etc. — `\bY\b` after the label prefix handles that.
  const yLines = [];
  for (const raw of signoff.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    // Table row starting with `| Y |` or `| Y. |`.
    if (/^\|\s*Y\b/i.test(line)) {
      yLines.push(line);
      continue;
    }
    // Bulleted / non-table forms — strip leading list markers and bold,
    // then look for an opening `Y` token.
    //   `- (Y) …`    → after strip: `(Y) …`
    //   `- Y. …`     → after strip: `Y. …`
    //   `- **Y** …`  → after strip: `Y** …`   (good enough for the check)
    //   `**Y.** …`   → after strip: `Y.** …`
    const stripped = line
      .replace(/^[-*+]\s+/, '') // list marker
      .replace(/^\*\*|\*\*$/g, '') // stray bold markers
      .replace(/^\(/, '') // leading `(`
      .trim();
    if (/^Y\b[.:\s)]/i.test(stripped)) {
      yLines.push(line);
    }
  }

  const yTextJoined = yLines.join('\n').toLowerCase();

  const hasReachabilityLabel =
    /ui[\s-]*reachability|reachability|navigation[\s-]*wiring|sidebar[\s-]*reach/i.test(
      yTextJoined
    );
  const hasMislabel =
    /internal[\s-]*vs[\s-]*shared|shared[\s-]*component[\s-]*reuse|\bdry\b/i.test(yTextJoined);

  if (yLines.length === 0) {
    if (yCoveredByRange()) {
      return (
        'Plan-Reviewer sign-off uses a catch-all category range (e.g. "R–GG: PASS") ' +
        'that hides Y inside a summary. Category Y must appear on its own row with a ' +
        'UI Reachability label and concrete evidence.'
      );
    }
    return 'Plan-Reviewer sign-off has NO row labelled "Y" at all.';
  }

  if (hasMislabel && !hasReachabilityLabel) {
    return (
      `Plan-Reviewer sign-off has a "Y" row but it is mislabelled as a DRY / shared-` +
      `component / internal-vs-shared check (that's category X, items 77–80). ` +
      `Relabel the reachability row as "Y. UI Reachability" and add an X row if ` +
      `DRY was also reviewed.`
    );
  }

  if (!hasReachabilityLabel) {
    return (
      'Plan-Reviewer sign-off has a "Y" row but its label does not mention ' +
      '"UI Reachability" / "reachability" / "navigation wiring". Rewrite the ' +
      'row so the label is unambiguous.'
    );
  }

  return null; // PASS
}

/**
 * Convert a 1- or 2-letter plan-reviewer category label to an integer that
 * preserves the documented A..Z, AA..GG ordering. Returns `null` for
 * malformed inputs.
 */
function labelOrd(label) {
  if (!/^[A-Z]{1,2}$/.test(label)) return null;
  if (label.length === 1) return label.charCodeAt(0) - 'A'.charCodeAt(0); // 0..25
  const a = label.charCodeAt(0) - 'A'.charCodeAt(0);
  const b = label.charCodeAt(1) - 'A'.charCodeAt(0);
  return 26 + a * 26 + b; // AA=26, AB=27, ... GG=26 + 6*26 + 6 = 188
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

    // ── Category Y enforcement (Guard 2 — PG-180 lesson, 2026-04-20) ──
    // PG-* and IFC-* UI tasks that create a page.tsx MUST have an explicit
    // `Y` row labelled "UI Reachability" in the reviewer's verdict table.
    // PG-185 / PG-189 mislabelled Y as "Shared component reuse" (which is
    // category X). PG-180 omitted Y entirely — the page shipped unreachable.
    const isUITask = /^(PG|IFC)-/.test(taskId);
    const planCreatesPage = planCreatesAppRouterPage(content);
    if (isUITask && planCreatesPage) {
      const yFinding = checkCategoryYRow(signoff);
      info(
        `[preflight] Category Y check: ` +
          (yFinding ? `BLOCK — ${yFinding}` : 'PASS — explicit UI Reachability row found')
      );
      if (yFinding) {
        process.stderr.write(
          '\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
            `  BLOCK: Plan-Reviewer Category Y (UI Reachability)\n` +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
            `\n` +
            `  Task: ${taskId}\n` +
            `  Plan: ${planPath}\n` +
            `\n` +
            `  ${yFinding}\n` +
            `\n` +
            `  plan-reviewer.md category Y (items 81–85b) enforces this for\n` +
            `  every PG-*/IFC-* UI task that creates a page.tsx. The Y row\n` +
            `  MUST be labelled exactly "UI Reachability" — not "Internal vs\n` +
            `  Shared Pattern" (that's X), not "Shared component reuse / DRY"\n` +
            `  (also X). Catch-all ranges like "R–GG: PASS" do NOT satisfy\n` +
            `  this gate. Rerun the plan-reviewer subagent and append a\n` +
            `  concrete Y row citing the sidebar config path or parent-link\n` +
            `  file:line that proves the route is reachable.\n` +
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

  // No subagent markers + no self-review language. For PG-*/IFC-* tasks that
  // create a page.tsx, absence of subagent markers is itself a BLOCK — PG-057
  // slipped through because its Plan-Reviewer section claimed approval
  // without any subagent evidence and without using the literal phrase
  // "self-review". Catch that here.
  const isUITask = /^(PG|IFC)-/.test(taskId);
  const planCreatesPage = planCreatesAppRouterPage(content);
  if (isUITask && planCreatesPage) {
    process.stderr.write(
      '\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        `  BLOCK: Plan-Reviewer subagent evidence missing (UI task)\n` +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        `\n` +
        `  Task: ${taskId}\n` +
        `  Plan: ${planPath}\n` +
        `\n` +
        `  This task creates a page.tsx, so a real Plan-Reviewer subagent\n` +
        `  review is MANDATORY (plan-session SKILL.md §8 + plan-reviewer\n` +
        `  category Y). No subagent markers were found:\n` +
        `\n` +
        `    Expected ONE of:\n` +
        `      <!-- plan-reviewer: subagent -->\n` +
        `      reviewer_subagent: <agent-id-or-transcript-path>\n` +
        `      Subagent transcript: <path>\n` +
        `\n` +
        `  PG-057 passed this gate before this guard was tightened because\n` +
        `  its sign-off section claimed approval without invoking the\n` +
        `  subagent. Don't repeat the pattern.\n` +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    );
    process.exit(1);
  }

  info(
    `[preflight] WARN — no Plan-Reviewer sign-off section found, and no self-review language either. ` +
      `Task is not a UI page task, so proceeding as OK. If this task does more than trivial changes, escalate.`
  );
  process.exit(0);
}

main();
