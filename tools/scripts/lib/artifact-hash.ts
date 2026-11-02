/**
 * Representation of a hash in attestation `artifact_hashes`.
 *
 * Values are written as `sha256:<64 hex>`. The digest itself is unchanged and
 * still verifiable against the file's bytes; only its spelling differs. A bare
 * 64-hex value is read by GitGuardian's "Generic High Entropy Secret" detector
 * as a secret whenever the KEY (a file path) contains auth/secret/token/
 * credential, for example `components/SecretField.tsx` or
 * `oauth/callback/page.tsx` (IntelliFlow-CRM incident 2026-10-22). The prefix
 * puts a `:` inside the value, which is outside that detector's value charset.
 *
 * Readers accept both spellings, so attestations written before this change
 * stay valid.
 */

export const ARTIFACT_HASH_PREFIX = 'sha256:';

const BARE_SHA256 = /^[a-f0-9]{64}$/;

/** Either spelling: `sha256:<64 hex>` (current) or `<64 hex>` (legacy). */
export const ARTIFACT_HASH_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/;

/** The 64-hex digest inside an artifact hash value, or null if it is neither spelling. */
export function parseArtifactHash(value: unknown): string | null {
  if (typeof value !== 'string' || !ARTIFACT_HASH_PATTERN.test(value)) return null;
  return value.startsWith(ARTIFACT_HASH_PREFIX) ? value.slice(ARTIFACT_HASH_PREFIX.length) : value;
}

export function isArtifactHash(value: unknown): value is string {
  return parseArtifactHash(value) !== null;
}

/** `sha256:<hex>` for a SHA-256 digest; throws on anything else rather than inventing evidence. */
export function formatArtifactHash(hex: string): string {
  const digest = parseArtifactHash(hex);
  if (digest === null) {
    throw new Error('formatArtifactHash: not a SHA-256 digest');
  }
  return `${ARTIFACT_HASH_PREFIX}${digest}`;
}

/** The prefixed spelling of a bare digest; any other value (placeholder, already prefixed) is returned as is. */
export function prefixArtifactHash(value: string): string {
  return BARE_SHA256.test(value) ? `${ARTIFACT_HASH_PREFIX}${value}` : value;
}

/**
 * Rewrites every legacy bare digest in an `artifact_hashes` map to the prefixed
 * spelling, keeping keys and order. Values that are not a digest (placeholders
 * such as `pending_verification`) are left exactly as they were, so a gate that
 * rejects them still does. Returns the number of values changed.
 */
export function prefixArtifactHashes(hashes: Record<string, unknown>): number {
  let changed = 0;
  for (const [path, value] of Object.entries(hashes)) {
    if (typeof value === 'string' && BARE_SHA256.test(value)) {
      hashes[path] = `${ARTIFACT_HASH_PREFIX}${value}`;
      changed++;
    }
  }
  return changed;
}

/** path -> bare digest for every entry whose value is a digest in either spelling. */
export function digestsByPath(hashes: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, value] of Object.entries(hashes ?? {})) {
    const digest = parseArtifactHash(value);
    if (digest !== null) out[path] = digest;
  }
  return out;
}

const ARTIFACT_HASHES_BLOCK = /("artifact_hashes"\s*:\s*\{)([\s\S]*?)(\n[ \t]*\})/;
const BARE_ENTRY = /("(?:[^"\\]|\\.)*"\s*:\s*")([a-f0-9]{64})(")/g;

export interface RewriteResult {
  text: string;
  /** Number of values that changed from bare hex to `sha256:<hex>`. */
  changed: number;
}

/**
 * Rewrites the `artifact_hashes` block of an attestation file as text, so
 * everything else in the file (indentation, key order, other hashes such as
 * `files_read[].sha256`, which stay bare) is byte-identical.
 *
 * Lossless by construction: the file is parsed before and after, and the result
 * is refused unless every path and every digest is the same in both. A caller
 * can therefore never lose or alter a hash through this function.
 */
export function rewriteArtifactHashesText(original: string): RewriteResult {
  const block = ARTIFACT_HASHES_BLOCK.exec(original);
  if (!block) return { text: original, changed: 0 };

  let changed = 0;
  const body = block[2].replace(BARE_ENTRY, (_m, head: string, hex: string, tail: string) => {
    changed++;
    return `${head}${ARTIFACT_HASH_PREFIX}${hex}${tail}`;
  });
  if (changed === 0) return { text: original, changed: 0 };

  const text = original.replace(ARTIFACT_HASHES_BLOCK, () => `${block[1]}${body}${block[3]}`);

  const before = digestsByPath(JSON.parse(original).artifact_hashes);
  const after = digestsByPath(JSON.parse(text).artifact_hashes);
  const same =
    Object.keys(before).length === Object.keys(after).length &&
    Object.entries(before).every(([path, digest]) => after[path] === digest);
  if (!same) {
    throw new Error('rewriteArtifactHashesText: the rewrite would change a path or a digest');
  }
  return { text, changed };
}
