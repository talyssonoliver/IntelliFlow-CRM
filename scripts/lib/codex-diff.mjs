/**
 * The diff the semantic review reads, collected so that a review can never pass on less than the
 * whole change.
 *
 * Found 2026-11-08 on #1272: on Windows the old call ran `git diff base...HEAD -- <every file>`
 * through cmd.exe, whose 8191-character line limit a 192-file PR (12,225 characters of paths)
 * exceeds. git failed, the prompt said "(no diff output)", the reviewer answered no findings, and
 * the gate counted that as PASS. The same call cut the diff at 50,000 characters, so a working call
 * still reviewed only the start of a large PR.
 *
 * Here git runs without a shell, file paths go in batches far below the Windows limit, a git
 * failure or a file with no diff throws, and a diff over the cap is split into chunks that are
 * each reviewed in full. A single hunk over the cap cannot be split, so it throws.
 */

/** Characters of diff in one review prompt. */
export const DIFF_CHUNK_CHARS = 50_000;

/**
 * Characters of file paths in one git call. CreateProcess allows 32,767 without a shell; this
 * leaves room for the other arguments and for paths that need quoting.
 */
export const PATH_BATCH_CHARS = 16_000;

export class DiffInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DiffInputError';
    this.code = code;
  }
}

/** Splits paths into batches whose summed length (plus one separator each) stays under the limit. */
export function batchPaths(files, limit = PATH_BATCH_CHARS) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const file of files) {
    const cost = file.length + 1;
    if (current.length > 0 && size + cost > limit) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += cost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Fixed options so the output parses the same whatever the user's git config says: no colour, no
 * external diff tool, a/ and b/ prefixes, and paths written as they are rather than octal-quoted.
 */
const DIFF_OPTIONS = ['--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'];

/** Runs `git diff` with no shell. A non-zero exit, a spawn error or a signal throws. */
function runGitDiff(spawn, diffArgs, repoRoot) {
  const args = ['-c', 'core.quotePath=false', 'diff', ...DIFF_OPTIONS, ...diffArgs];
  const r = spawn('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    cwd: repoRoot,
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.error || r.status !== 0) {
    const reason = r.error ? r.error.message : (r.stderr || '').trim() || `exit ${r.status}`;
    throw new DiffInputError('git-diff-failed', `git diff ${diffArgs[0]} failed: ${reason}`);
  }
  return r.stdout || '';
}

/**
 * Splits `git diff` output into one section per file, keyed by path. The path is taken from the
 * `+++ b/` line, or the `--- a/` line for a deletion, or the `diff --git` header when neither
 * exists (a rename or mode change with no content change).
 */
export function splitFileSections(diffText) {
  const sections = [];
  if (!diffText) return sections;
  const starts = [];
  const re = /^diff --git /gm;
  let m;
  while ((m = re.exec(diffText)) !== null) starts.push(m.index);
  for (let i = 0; i < starts.length; i++) {
    const text = diffText.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : diffText.length);
    sections.push({ file: sectionPath(text), text });
  }
  return sections;
}

function sectionPath(text) {
  const plus = /^\+\+\+ b\/(.+)$/m.exec(text);
  if (plus) return plus[1].trimEnd();
  const minus = /^--- a\/(.+)$/m.exec(text);
  if (minus) return minus[1].trimEnd();
  const rename = /^rename to (.+)$/m.exec(text);
  if (rename) return rename[1].trimEnd();
  const header = /^diff --git a\/(.+) b\/(.+)$/m.exec(text);
  return header ? header[2].trimEnd() : '';
}

/**
 * Collects the diff of every scoped file: committed changes against the base first, then staged
 * changes for files the committed diff does not cover (the gate's `--base=HEAD` self-test).
 * Throws when git fails, when nothing comes back, or when a scoped file has no section.
 */
export function collectScopedDiff({ baseRef, files, repoRoot, spawn }) {
  const wanted = new Set(files);
  const byFile = new Map();
  const take = (output) => {
    for (const s of splitFileSections(output)) {
      if (wanted.has(s.file) && !byFile.has(s.file)) byFile.set(s.file, s.text);
    }
  };
  for (const batch of batchPaths(files)) {
    take(runGitDiff(spawn, [`${baseRef}...HEAD`, '--', ...batch], repoRoot));
  }
  const notCommitted = files.filter((f) => !byFile.has(f));
  for (const batch of batchPaths(notCommitted)) {
    take(runGitDiff(spawn, ['--cached', '--', ...batch], repoRoot));
  }
  if (byFile.size === 0) {
    throw new DiffInputError(
      'empty-diff',
      `git returned no diff for ${files.length} scoped file(s) against ${baseRef}; ` +
        'nothing could be reviewed'
    );
  }
  const missing = files.filter((f) => !byFile.has(f));
  if (missing.length > 0) {
    throw new DiffInputError(
      'incomplete-diff',
      `git returned no diff for ${missing.length} of ${files.length} scoped file(s): ` +
        missing.slice(0, 10).join(', ') +
        (missing.length > 10 ? ', ...' : '')
    );
  }
  return files.map((file) => ({ file, text: byFile.get(file) }));
}

/** Splits one file's section at its hunks; each piece repeats the file header. */
function splitAtHunks(section, limit) {
  const first = section.text.search(/^@@ /m);
  if (first === -1) {
    throw new DiffInputError(
      'diff-over-cap',
      `${section.file}: ${section.text.length} characters of diff with no hunk to split at ` +
        `(cap ${limit})`
    );
  }
  const header = section.text.slice(0, first);
  const hunks = section.text.slice(first).split(/^(?=@@ )/m);
  const pieces = [];
  let body = '';
  for (const hunk of hunks) {
    if (header.length + hunk.length > limit) {
      throw new DiffInputError(
        'diff-over-cap',
        `${section.file}: one hunk is ${hunk.length} characters, over the ${limit}-character ` +
          'review cap; it cannot be reviewed whole'
      );
    }
    if (body && header.length + body.length + hunk.length > limit) {
      pieces.push({ file: section.file, text: header + body });
      body = '';
    }
    body += hunk;
  }
  if (body) pieces.push({ file: section.file, text: header + body });
  return pieces;
}

/**
 * Packs file sections into chunks of at most `limit` characters, in order. A file over the limit is
 * split at hunk boundaries. Every character of every section lands in exactly one chunk.
 */
export function chunkSections(sections, limit = DIFF_CHUNK_CHARS) {
  const chunks = [];
  let current = { files: [], text: '' };
  const flush = () => {
    if (current.text) chunks.push(current);
    current = { files: [], text: '' };
  };
  for (const section of sections) {
    const pieces = section.text.length > limit ? splitAtHunks(section, limit) : [section];
    for (const piece of pieces) {
      if (current.text && current.text.length + piece.text.length > limit) flush();
      current.text += piece.text;
      if (!current.files.includes(piece.file)) current.files.push(piece.file);
    }
  }
  flush();
  return chunks;
}
