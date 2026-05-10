#!/usr/bin/env node
/**
 * Gate 4b — Worktree Landed.
 *
 * Verifies that the current worktree branch has:
 *   1. No uncommitted edits (clean working tree)
 *   2. A branch name matching the `agent/<TASK_ID>` pattern
 *   3. At least one commit beyond origin/main
 *   4. Been pushed to the remote (branch exists on origin and is up-to-date)
 *
 * Without this gate, `/exec` can stamp `verdict: COMPLETE` against work that
 * only exists in the worktree and never lands on main. This caused IFC-227,
 * IFC-031, PG-053, and PG-054 to be stamped COMPLETE and then silently lost.
 *
 * Exit codes:
 *   0 — all checks pass (worktree work is committed and pushed)
 *   1 — BLOCK: at least one check failed
 *   2 — Usage error
 *
 * Usage:
 *   node tools/scripts/exec-preflight/check-worktree-landed.mjs <TASK_ID> <SPRINT>
 */

import { execSync } from 'node:child_process';

const RUNBOOK = 'docs/runbooks/gate-4b-recovery.md';
const BRANCH_PATTERN = /^agent\/[A-Z]+-\d+(-.+)?$/;

function die(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function info(message) {
  process.stdout.write(`${message}\n`);
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
  } catch (err) {
    return { error: true, message: err.message, stdout: err.stdout?.trim() ?? '', stderr: err.stderr?.trim() ?? '' };
  }
}

function main() {
  const [taskId, sprint] = process.argv.slice(2);
  if (!taskId || !sprint) {
    die(2, 'Usage: check-worktree-landed.mjs <TASK_ID> <SPRINT>');
  }

  info(`[gate-4b] Checking worktree-landed state for ${taskId} (sprint ${sprint})`);

  let blocked = false;

  // ── Check 1: Clean working tree ──────────────────────────────────────────
  const statusOutput = run('git status --porcelain');
  if (typeof statusOutput === 'object' && statusOutput.error) {
    die(2, `[gate-4b] ERROR: Could not run git status: ${statusOutput.message}`);
  }
  if (statusOutput.length > 0) {
    info(
      `BLOCK: [gate-4b] Uncommitted edits present. Commit your work first. See ${RUNBOOK}`
    );
    blocked = true;
  } else {
    info(`PASS: [gate-4b] Working tree is clean.`);
  }

  // ── Check 2: Branch name pattern ─────────────────────────────────────────
  const branchName = run('git rev-parse --abbrev-ref HEAD');
  if (typeof branchName === 'object' && branchName.error) {
    die(2, `[gate-4b] ERROR: Could not determine current branch: ${branchName.message}`);
  }
  if (!BRANCH_PATTERN.test(branchName)) {
    info(
      `BLOCK: [gate-4b] Branch ${branchName} does not match \`agent/<TASK_ID>\` pattern`
    );
    blocked = true;
  } else {
    info(`PASS: [gate-4b] Branch name "${branchName}" matches agent/<TASK_ID> pattern.`);
  }

  // ── Check 3: Commits beyond origin/main ────────────────────────────────
  const aheadOfMaster = run('git rev-list --count origin/main..HEAD');
  if (typeof aheadOfMaster === 'object' && aheadOfMaster.error) {
    // origin/main may not be fetched yet — treat as 0
    info(
      `BLOCK: [gate-4b] Branch has zero commits beyond origin/main. See ${RUNBOOK}`
    );
    blocked = true;
  } else {
    const count = parseInt(aheadOfMaster, 10);
    if (Number.isNaN(count) || count === 0) {
      info(
        `BLOCK: [gate-4b] Branch has zero commits beyond origin/main. See ${RUNBOOK}`
      );
      blocked = true;
    } else {
      info(`PASS: [gate-4b] Branch is ${count} commit(s) ahead of origin/main.`);
    }
  }

  // ── Check 4: Branch pushed to remote ─────────────────────────────────────
  // Fetch quietly so remote refs are up to date.
  const fetchResult = run('git fetch --quiet');
  if (typeof fetchResult === 'object' && fetchResult.error) {
    // Non-fatal — remote may be unreachable in offline CI. Skip check 4.
    info(`PASS: [gate-4b] git fetch failed (offline?); skipping remote push check.`);
  } else {
    // Count commits that are on HEAD but not on origin/<branch>.
    // If origin/<branch> does not exist at all, rev-list will error → treat as 0 pushed.
    const remoteBranch = `origin/${branchName}`;
    const behindRemote = run(`git rev-list --count HEAD..${remoteBranch}`);
    const aheadRemote = run(`git rev-list --count ${remoteBranch}..HEAD`);

    if (typeof aheadRemote === 'object' && aheadRemote.error) {
      // remote branch does not exist
      info(
        `BLOCK: [gate-4b] Branch not yet pushed. Run: \`git push -u origin ${branchName} --force-with-lease\``
      );
      blocked = true;
    } else {
      const aheadCount = parseInt(aheadRemote, 10);
      if (!Number.isNaN(aheadCount) && aheadCount > 0) {
        info(
          `BLOCK: [gate-4b] Branch not yet pushed. Run: \`git push -u origin ${branchName} --force-with-lease\``
        );
        blocked = true;
      } else {
        info(`PASS: [gate-4b] Branch is pushed to ${remoteBranch}.`);
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  if (blocked) {
    process.stderr.write(
      '\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        `  BLOCK: Gate 4b — Worktree Landed\n` +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        `\n` +
        `  Task: ${taskId}  Sprint: ${sprint}\n` +
        `\n` +
        `  One or more checks above failed. The worktree work has NOT landed\n` +
        `  on the remote branch yet. Marking the task COMPLETE at this stage\n` +
        `  would stamp a verdict against state that can be silently lost.\n` +
        `\n` +
        `  IFC-227, IFC-031, PG-053, and PG-054 were all stamped COMPLETE\n` +
        `  against worktree-only state. Three of them were permanently lost.\n` +
        `\n` +
        `  Recovery steps and waiver procedure: ${RUNBOOK}\n` +
        '\n' +
        `  Source: .claude/skills/exec/references/phase4-completion-gates.md Gate 4b\n` +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    );
    process.exit(1);
  }

  info(`\n[gate-4b] PASS — worktree work is committed and pushed. Safe to proceed.`);
  process.exit(0);
}

main();
