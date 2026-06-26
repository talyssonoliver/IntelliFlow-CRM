#!/usr/bin/env node
/**
 * sync-control-plane.mjs — the ONLY sanctioned way to fast-forward a control-plane
 * branch to its origin upstream, autonomously (no human in the loop).
 *
 * Why this exists: `.claude/hooks/git-destructive-guard.mjs` blocks raw
 * `git reset --hard` (it can silently discard work). But the orchestrator fleet
 * must keep its control plane even with `origin/main` between merges WITHOUT a
 * human running the reset each time. This script is the auditable, allowlisted
 * tool that performs ONLY the provably-safe form of that operation:
 *
 *   - It resets the branch to `origin/<branch>` ONLY when the local branch is an
 *     ANCESTOR of the upstream (a pure fast-forward). If the local branch has any
 *     commit not on the upstream (divergence), it ABORTS — no committed work can
 *     ever be lost. That case needs a human.
 *   - Uncommitted changes to TRACKED files (e.g. the pre-Phase-2 metrics churn)
 *     are discarded by the reset — that is the point of a control-plane sync — but
 *     they are LISTED first, and the pre-reset SHA is printed so the reflog can
 *     recover anything unexpected (`git reset --hard <printed-sha>`).
 *
 * The guard hook allowlists THIS script path only; raw `git reset --hard` stays
 * blocked everywhere else. Keep the two in sync.
 *
 * Usage:
 *   node tools/scripts/sync-control-plane.mjs [--branch main] [--repo <path>] [--apply]
 *
 *   --branch <name>  branch to sync (default: the repo's current branch)
 *   --repo <path>    operate on another working tree (default: cwd) — used to sync
 *                    the main control plane from a clean worktree during bootstrap
 *   --apply          actually reset; without it, this is a DRY RUN that only reports
 *
 * Exit codes:
 *   0 — in sync already, or sync applied/previewed successfully
 *   2 — DIVERGENCE: local has commits not on the upstream; refused (needs a human)
 *   1 — usage / git error
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (n) => args.includes(`--${n}`);

const REPO = flag('repo') || process.cwd();
const APPLY = has('apply');

function git(...a) {
  return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim();
}
function gitSafe(...a) {
  try {
    return { ok: true, out: git(...a) };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || e.message || '') };
  }
}

let currentBranch;
try {
  currentBranch = git('rev-parse', '--abbrev-ref', 'HEAD');
} catch (e) {
  process.stderr.write(`[sync-control-plane] not a git repo at ${REPO}: ${e.message}\n`);
  process.exit(1);
}
// `git reset --hard` always acts on the CHECKED-OUT branch. If --branch is given,
// it is an assertion — refuse if it doesn't match HEAD, so we can never reset the
// wrong branch.
const wantBranch = flag('branch');
if (wantBranch && wantBranch !== currentBranch) {
  process.stderr.write(
    `[sync-control-plane] REFUSED: --branch ${wantBranch} but ${REPO} is on ${currentBranch}. ` +
      `This tool resets the CHECKED-OUT branch; check out ${wantBranch} (or point --repo at a ` +
      `worktree on it) first.\n`
  );
  process.exit(2);
}
const BRANCH = currentBranch;
const UPSTREAM = `origin/${BRANCH}`;

process.stdout.write(`[sync-control-plane] repo=${REPO} branch=${BRANCH} upstream=${UPSTREAM} ${APPLY ? '(APPLY)' : '(dry-run)'}\n`);

// 1. Fetch the upstream.
const fetched = gitSafe('fetch', 'origin', BRANCH);
if (!fetched.ok) {
  process.stderr.write(`[sync-control-plane] git fetch failed:\n${fetched.out}\n`);
  process.exit(1);
}

// 2. Resolve local + upstream SHAs.
const local = git('rev-parse', BRANCH);
const remoteRes = gitSafe('rev-parse', UPSTREAM);
if (!remoteRes.ok) {
  process.stderr.write(`[sync-control-plane] no upstream ${UPSTREAM}:\n${remoteRes.out}\n`);
  process.exit(1);
}
const remote = remoteRes.out;

if (local === remote) {
  process.stdout.write(`[sync-control-plane] already in sync at ${local.slice(0, 9)} — nothing to do.\n`);
  process.exit(0);
}

// 3. SAFETY: refuse unless local is a strict ANCESTOR of the upstream (pure fast-forward).
//    `merge-base --is-ancestor A B` exits 0 iff A is an ancestor of B.
const isAncestor = gitSafe('merge-base', '--is-ancestor', local, remote).ok;
if (!isAncestor) {
  const ahead = gitSafe('rev-list', '--count', `${remote}..${local}`).out || '?';
  process.stderr.write(
    `[sync-control-plane] REFUSED: ${BRANCH} has ${ahead} commit(s) not on ${UPSTREAM} ` +
      `(divergence). A fast-forward reset would discard them. Resolve this manually ` +
      `(rebase/merge/push) — this tool only fast-forwards.\n`
  );
  process.exit(2);
}

const behind = gitSafe('rev-list', '--count', `${local}..${remote}`).out || '?';
process.stdout.write(`[sync-control-plane] ${BRANCH} is ${behind} commit(s) behind ${UPSTREAM} (clean fast-forward).\n`);

// 4. List uncommitted TRACKED changes that the reset will discard (informational).
const dirty = git('status', '--porcelain', '--untracked-files=no')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);
if (dirty.length) {
  process.stdout.write(
    `[sync-control-plane] ${dirty.length} uncommitted tracked change(s) will be discarded by the sync. ` +
      `Pre-reset SHA ${local.slice(0, 9)} stays in the reflog if recovery is needed:\n`
  );
  for (const d of dirty.slice(0, 12)) process.stdout.write(`    ${d}\n`);
  if (dirty.length > 12) process.stdout.write(`    … and ${dirty.length - 12} more\n`);
}

// 5. Apply (or preview).
if (!APPLY) {
  process.stdout.write(
    `[sync-control-plane] DRY RUN — would run: git reset --hard ${UPSTREAM}. Re-run with --apply.\n`
  );
  process.exit(0);
}

const reset = gitSafe('reset', '--hard', UPSTREAM);
if (!reset.ok) {
  process.stderr.write(`[sync-control-plane] reset failed:\n${reset.out}\n`);
  process.exit(1);
}
process.stdout.write(`[sync-control-plane] DONE — ${BRANCH} now at ${remote.slice(0, 9)} (== ${UPSTREAM}).\n`);
process.exit(0);
