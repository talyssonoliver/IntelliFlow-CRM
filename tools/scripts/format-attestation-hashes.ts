/**
 * Rewrites attestation `artifact_hashes` values from bare hex to `sha256:<hex>`.
 *
 * Why: a bare 64-hex digest next to a path such as `components/SecretField.tsx`
 * is flagged by GitGuardian ("Generic High Entropy Secret") and by the shared
 * gitleaks rule `sensitive-name-high-entropy`. The digest is unchanged; only its
 * spelling is. See tools/scripts/lib/artifact-hash.ts.
 *
 * Usage (from the repo root):
 *   tsx tools/scripts/format-attestation-hashes.ts <attestation.json>...         rewrite in place
 *   tsx tools/scripts/format-attestation-hashes.ts --check <attestation.json>... exit 1 if a bare digest remains
 *   tsx tools/scripts/format-attestation-hashes.ts --verify <attestation.json>...
 *       also re-hash every listed file from the working tree and exit 1 on any
 *       missing file or mismatch (read-only on the tree; run it after the rewrite
 *       to prove the evidence is intact)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFileHasher, type FileHasher } from './lib/evidence-hash.js';
import { digestsByPath, rewriteArtifactHashesText } from './lib/artifact-hash.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Rewrites (or, with --check, inspects) one file. Returns true when it should fail the run. */
function convert(file: string, text: string, changed: number, check: boolean): boolean {
  if (check) {
    if (changed === 0) return false;
    console.log(`${file}: ${changed} bare digest(s) remain`);
    return true;
  }
  if (changed === 0) {
    console.log(`${file}: already in sha256:<hex> form`);
    return false;
  }
  writeFileSync(file, text);
  console.log(`${file}: ${changed} digest(s) rewritten to sha256:<hex>`);
  return false;
}

/** Re-hashes every listed file from the tree. Returns true when any is missing or differs. */
function verifyAgainstTree(file: string, text: string, hashFile: FileHasher): boolean {
  const entries = Object.entries(digestsByPath(JSON.parse(text).artifact_hashes));
  let bad = 0;
  for (const [path, digest] of entries) {
    const actual = hashFile(path);
    if (actual === digest) continue;
    bad++;
    console.log(`${file}: ${actual === null ? 'MISSING' : 'MISMATCH'} ${path}`);
  }
  console.log(`${file}: verified ${entries.length - bad}/${entries.length} against the tree`);
  return bad > 0;
}

export function main(argv: string[], repoRoot: string = REPO_ROOT): number {
  const check = argv.includes('--check');
  const verify = argv.includes('--verify');
  const files = argv.filter((a) => !a.startsWith('--'));
  if (files.length === 0) {
    console.error('usage: format-attestation-hashes.ts [--check|--verify] <attestation.json>...');
    return 2;
  }

  const hashFile = createFileHasher(repoRoot);
  let failed = false;
  for (const file of files) {
    const { text, changed } = rewriteArtifactHashesText(readFileSync(file, 'utf8'));
    failed = convert(file, text, changed, check) || failed;
    if (verify) failed = verifyAgainstTree(file, text, hashFile) || failed;
  }
  return failed ? 1 : 0;
}

// Run only as a script, so main() can be imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
