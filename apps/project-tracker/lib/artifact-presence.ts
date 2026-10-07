import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { isUntrackedByDesign } from '../../../tools/scripts/lib/untracked-by-design';

export { isUntrackedByDesign };

/**
 * Does a tracked artifact exist under `root`? A glob counts as present when its
 * parent directory exists.
 */
export async function artifactExists(artifactPath: string, root: string): Promise<boolean> {
  try {
    if (artifactPath.includes('*')) {
      const parentDir = artifactPath.split('*')[0].replace(/\/{1,100}$/, '');
      if (!parentDir) return false;
      await access(join(root, parentDir));
      return true;
    }
    await access(join(root, artifactPath));
    return true;
  } catch {
    return false;
  }
}

/**
 * The artifacts that are missing, each with `prefix` prepended. Paths the repo
 * deliberately leaves untracked (spec/plan/context files under .specify/sprints,
 * see tools/scripts/lib/untracked-by-design.ts) are never reported: no checkout
 * has them, so their absence says nothing about whether the task was done.
 */
export async function findMissingArtifacts(
  paths: string[],
  prefix: string,
  root: string
): Promise<string[]> {
  const missing: string[] = [];
  for (const p of paths) {
    if (isUntrackedByDesign(p, root)) continue;
    if (await artifactExists(p, root)) continue;
    missing.push(prefix ? `${prefix}${p}` : p);
  }
  return missing;
}

/**
 * The tracked artifacts that exist: the only things that can prove a task was
 * done. A gitignored path never counts, even when a local copy exists, so a
 * task whose every artifact is untracked by design has no evidence at all.
 */
export async function trackedEvidence(paths: string[], root: string): Promise<string[]> {
  const found: string[] = [];
  for (const p of paths) {
    if (!isUntrackedByDesign(p, root) && (await artifactExists(p, root))) found.push(p);
  }
  return found;
}
