/**
 * Evidence hashes for attestation migration.
 *
 * A hash is evidence only if it was computed from the file's bytes. The old
 * migration "fixed" invalid hashes by hashing the string `placeholder:<path>`,
 * which yields a valid-looking SHA-256 that proves nothing. These helpers only
 * ever record a real hash of a file that exists; otherwise they drop or null
 * the entry and say why.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SHA256_RE = /^[a-f0-9]{64}$/;

/** Returns the hash of a repo-relative file, or null if it does not exist. */
export type FileHasher = (repoPath: string) => string | null;

export function createFileHasher(repoRoot: string): FileHasher {
  return (repoPath) => {
    const abs = join(repoRoot, repoPath);
    if (!existsSync(abs) || !statSync(abs).isFile()) return null;
    return createHash('sha256').update(readFileSync(abs)).digest('hex');
  };
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_RE.test(value);
}

/**
 * artifact_hashes: { path: hash }. An invalid hash is replaced by the file's
 * real hash; if the file does not exist the entry is removed.
 */
export function fixArtifactHashes(
  data: Record<string, unknown>,
  changes: string[],
  hashFile: FileHasher
): boolean {
  const hashes = data.artifact_hashes as Record<string, unknown> | undefined;
  if (!hashes) return false;
  let modified = false;
  for (const [path, hash] of Object.entries(hashes)) {
    if (isSha256(hash)) continue;
    const real = hashFile(path);
    if (real) {
      hashes[path] = real;
      changes.push(`artifact_hashes[${path}]: replaced "${String(hash)}" with the file's hash`);
    } else {
      delete hashes[path];
      changes.push(
        `artifact_hashes[${path}]: removed "${String(hash)}" (file not found, no real hash)`
      );
    }
    modified = true;
  }
  return modified;
}

/**
 * context_acknowledgment.files_read records what was read, and when. A hash
 * taken now would claim today's bytes were read then, so an entry without a
 * recorded hash is dropped rather than back-filled.
 */
export function fixFilesRead(data: Record<string, unknown>, changes: string[]): boolean {
  const ack = data.context_acknowledgment as Record<string, unknown> | undefined;
  if (!ack || !Array.isArray(ack.files_read)) return false;
  const kept: unknown[] = [];
  for (const entry of ack.files_read as unknown[]) {
    const path = typeof entry === 'string' ? entry : (entry as Record<string, unknown>)?.path;
    const hash = typeof entry === 'string' ? undefined : (entry as Record<string, unknown>)?.sha256;
    if (isSha256(hash)) {
      kept.push(entry);
    } else {
      changes.push(`files_read[${String(path)}]: dropped (no hash was recorded when it was read)`);
    }
  }
  if (kept.length === ack.files_read.length) return false;
  ack.files_read = kept;
  return true;
}

/** Hash for an artifacts.created entry: the file's real hash, or null. */
export function artifactHashOrNull(
  path: unknown,
  changes: string[],
  index: number,
  hashFile: FileHasher
): string | null {
  const real = typeof path === 'string' ? hashFile(path) : null;
  changes.push(
    real
      ? `artifacts.created[${index}].sha256: set from the file`
      : `artifacts.created[${index}].sha256: null (file not found, no real hash)`
  );
  return real;
}
