/**
 * Generated files that conflicted on nearly every merge of main: the API and
 * codebase inventory, and the split plan files.
 *
 * artifacts/benchmarks/baseline.json is rewritten from the router and codebase
 * inventories by the pre-commit hook, so two branches that both change the API
 * always edit the same lines, and a merge of main stopped on a conflict that
 * only regeneration can resolve. Its committed copy has readers (the inventory
 * drift workflows, the tracker's performance report, the web quality reports),
 * so it stays tracked.
 *
 * Instead:
 *   1. .gitattributes gives it the `ifc-regenerated` merge driver, which keeps
 *      this branch's side, so the merge never conflicts on it;
 *   2. the post-merge hook then regenerates it from the merged code and, when
 *      it changed, amends the merge commit, so the commit is never stale.
 *
 * A git merge driver lives in git config, not in the repository, so the
 * pre-commit hook and postinstall install it (installMergeDrivers). Without it,
 * git falls back to the normal text merge: a conflict, as before.
 */
import { spawnSync } from 'node:child_process';
import { runGit } from './preship-git.mjs';

export const DRIVER = 'ifc-regenerated';

/** Files that carry the driver and are regenerated after a merge. */
export const REGENERATED = [
  'artifacts/benchmarks/baseline.json',
  // The split plan files, generated from Sprint_plan.csv (which still merges as
  // text: it is the source of truth). Every PR that touches plan rows used to
  // collide on these.
  'apps/project-tracker/docs/metrics/_global/Sprint_plan_*.csv',
];

/** The commands that rewrite them (the same ones the pre-commit hook runs). */
export const REGENERATE_COMMANDS = [
  'npx tsx tools/scripts/sync-api-inventory.ts',
  'npx tsx tools/scripts/sync-codebase-inventory.ts',
  'npx tsx tools/scripts/split-sprint-plan.ts',
];

/**
 * Set the driver in git config when it is missing or different.
 * `driver = true` exits 0 and leaves %A (this branch's side) as the result.
 * @param {(args: string[]) => string | null} git
 * @returns {boolean} whether anything was written
 */
export function installMergeDrivers(git) {
  if (git(['config', '--get', `merge.${DRIVER}.driver`])?.trim() === 'true') return false;
  git(['config', `merge.${DRIVER}.name`, 'keep this side; regenerated after the merge']);
  git(['config', `merge.${DRIVER}.driver`, 'true']);
  return true;
}

/**
 * After a merge commit, regenerate the files and fold any change into it.
 * Runs from the post-merge hook, where git still holds the merge state, so the
 * state is dropped with `git merge --quit` (the merge commit already exists)
 * before amending.
 * @param {{
 *   git: (args: string[]) => string | null,
 *   regenerate: () => boolean,
 *   amend: () => boolean,
 *   log?: (s: string) => void,
 * }} io
 * @returns {'not-a-merge' | 'regenerate-failed' | 'unchanged' | 'amended' | 'amend-failed'}
 */
export function regenerateAfterMerge({ git, regenerate, amend, log = () => {} }) {
  if (git(['rev-parse', '-q', '--verify', 'HEAD^2']) === null) return 'not-a-merge';
  if (!regenerate()) {
    log('post-merge: could not regenerate the inventories; the next commit will.\n');
    return 'regenerate-failed';
  }
  const changed = REGENERATED.filter((f) => git(['diff', '--quiet', 'HEAD', '--', f]) === null);
  if (changed.length === 0) return 'unchanged';
  git(['merge', '--quit']);
  git(['add', '--', ...changed]);
  log(
    `post-merge: ${changed.join(', ')} regenerated from the merged code; amending the merge commit.\n`
  );
  if (amend()) return 'amended';
  log(`post-merge: the amend failed; ${changed.join(', ')} is staged. Commit it before pushing.\n`);
  return 'amend-failed';
}

/** Real io for the hook and the CLI. */
export function hookIo(cwd = process.cwd(), env = process.env, spawn = spawnSync) {
  const shell = process.platform === 'win32';
  return {
    git: (args) => runGit(args, cwd, env, spawn),
    regenerate: () =>
      REGENERATE_COMMANDS.every(
        (c) => spawn(c, { cwd, shell: true, stdio: 'inherit', env }).status === 0
      ),
    amend: () =>
      spawn('git', ['commit', '-q', '--amend', '--no-edit'], { cwd, stdio: 'inherit', shell })
        .status === 0,
    log: (s) => process.stderr.write(s),
  };
}
