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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFileHasher } from './lib/evidence-hash.js';
import { digestsByPath, rewriteArtifactHashesText } from './lib/artifact-hash.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function main(argv: string[]): number {
  const check = argv.includes('--check');
  const verify = argv.includes('--verify');
  const files = argv.filter((a) => !a.startsWith('--'));
  if (files.length === 0) {
    console.error('usage: format-attestation-hashes.ts [--check|--verify] <attestation.json>...');
    return 2;
  }

  const hashFile = createFileHasher(REPO_ROOT);
  let failed = false;

  for (const file of files) {
    const original = readFileSync(file, 'utf8');
    const { text, changed } = rewriteArtifactHashesText(original);

    if (check) {
      if (changed > 0) {
        console.log(`${file}: ${changed} bare digest(s) remain`);
        failed = true;
      }
    } else if (changed > 0) {
      writeFileSync(file, text);
      console.log(`${file}: ${changed} digest(s) rewritten to sha256:<hex>`);
    } else {
      console.log(`${file}: already in sha256:<hex> form`);
    }

    if (verify) {
      const entries = Object.entries(digestsByPath(JSON.parse(text).artifact_hashes));
      let bad = 0;
      for (const [path, digest] of entries) {
        const actual = hashFile(path);
        if (actual !== digest) {
          bad++;
          console.log(`${file}: ${actual === null ? 'MISSING' : 'MISMATCH'} ${path}`);
        }
      }
      console.log(`${file}: verified ${entries.length - bad}/${entries.length} against the tree`);
      if (bad > 0) failed = true;
    }
  }
  return failed ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
