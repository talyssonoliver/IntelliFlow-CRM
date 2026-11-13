/**
 * Test files that no vitest project collects never run, and report nothing (#1216 item 2: about
 * 190 tests in 30 files had sat uncollected). scripts/check-test-collection.mjs compares every
 * tracked test file with what `vitest list --filesOnly` collects; the logic lives here so it can
 * be tested in-process.
 *
 * A file may stay uncollected only when tools/scripts/test-collection.allowlist.json names it
 * (or a `dir/**` pattern covering it) with a reason and a reference: an issue (`#123`) or the
 * repo file that runs it instead (for example playwright.config.ts).
 */

/** Tracked test files: *.test.* and *.spec.* sources. */
export const TEST_FILE = /\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs)$/;

/** Repo-relative, forward-slash path. */
export function toRepoPath(file, repoRoot) {
  const normalise = (p) => p.replaceAll('\\', '/');
  const root = normalise(repoRoot).replace(/\/$/, '');
  const full = normalise(file);
  const lowerRoot = root.toLowerCase();
  return full.toLowerCase().startsWith(lowerRoot + '/') ? full.slice(root.length + 1) : full;
}

/** True when `file` matches an allowlist path: exact, or `dir/**` for everything under dir. */
export function matchesAllowlistPath(file, pattern) {
  if (pattern.endsWith('/**')) return file.startsWith(pattern.slice(0, -2));
  return file === pattern;
}

/**
 * Problems in the allowlist itself: an entry without a path, a reason or a reference, or whose
 * reference is neither an issue (#123) nor an existing repo file.
 */
export function allowlistProblems(entries, fileExists) {
  const problems = [];
  entries.forEach((entry, index) => {
    const label = entry?.path ?? `entry ${index}`;
    if (!entry?.path) problems.push(`${label}: no path`);
    if (!entry?.reason?.trim()) problems.push(`${label}: no reason`);
    const ref = entry?.ref?.trim();
    if (!ref) problems.push(`${label}: no ref (an issue like #123, or the file that runs it)`);
    else if (!/^#\d+$/.test(ref) && !fileExists(ref)) {
      problems.push(`${label}: ref ${ref} is neither an issue (#123) nor an existing file`);
    }
  });
  return problems;
}

/**
 * Compares the tracked test files with the collected ones.
 * - `uncollected`: tracked, not collected, and not allowlisted (the gate fails on these).
 * - `stale`: allowlist entries that match no uncollected file (now collected, or deleted),
 *   so the list cannot keep excusing files that no longer need it.
 */
export function compareCollection({ trackedFiles, collectedFiles, allowlist }) {
  const collected = new Set(collectedFiles);
  const notCollected = trackedFiles.filter((f) => TEST_FILE.test(f) && !collected.has(f));
  const used = new Set();
  const uncollected = [];
  for (const file of notCollected) {
    const entry = allowlist.find((e) => matchesAllowlistPath(file, e.path));
    if (entry) used.add(entry.path);
    else uncollected.push(file);
  }
  const stale = allowlist.filter((e) => !used.has(e.path)).map((e) => e.path);
  return { uncollected, stale, allowlisted: notCollected.length - uncollected.length };
}
