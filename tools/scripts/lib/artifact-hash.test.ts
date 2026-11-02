import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_HASH_PREFIX,
  digestsByPath,
  formatArtifactHash,
  isArtifactHash,
  parseArtifactHash,
  prefixArtifactHash,
  prefixArtifactHashes,
  rewriteArtifactHashesText,
} from './artifact-hash.js';
import { attestationSchema } from './schemas/attestation.schema.js';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

// Paths that GitGuardian flagged (incident 2026-10-22) plus the PG-208 case.
const SENSITIVE_PATHS = [
  'apps/web/src/app/email/email-settings/components/SecretField.tsx',
  'apps/web/src/app/email/oauth/callback/OAuthCallbackContent.tsx',
  'apps/web/src/app/tasks/(list)/automation/components/WebhookSecretDialog.tsx',
];

function attestationText(hashes: Record<string, string>, filesReadDigest: string): string {
  return `${JSON.stringify(
    {
      task_id: 'PG-000',
      context_acknowledgment: {
        files_read: [{ path: 'docs/spec.md', sha256: filesReadDigest }],
      },
      artifact_hashes: hashes,
      notes: 'kept',
    },
    null,
    2
  )}\n`;
}

describe('artifact-hash', () => {
  describe('parse / format', () => {
    it('reads both spellings and returns the bare digest', () => {
      const digest = sha('a');
      expect(parseArtifactHash(digest)).toBe(digest);
      expect(parseArtifactHash(`${ARTIFACT_HASH_PREFIX}${digest}`)).toBe(digest);
      expect(isArtifactHash(`${ARTIFACT_HASH_PREFIX}${digest}`)).toBe(true);
    });

    it('rejects anything that is not a SHA-256 digest', () => {
      for (const bad of [
        'verified',
        'pending_verification',
        '',
        sha('a').slice(1),
        sha('a').toUpperCase(),
        `sha1:${sha('a')}`,
        `${ARTIFACT_HASH_PREFIX}${ARTIFACT_HASH_PREFIX}${sha('a')}`,
        42,
        null,
      ]) {
        expect(parseArtifactHash(bad)).toBeNull();
        expect(isArtifactHash(bad)).toBe(false);
      }
    });

    it('formats a digest with the prefix and refuses to invent one', () => {
      const digest = sha('a');
      expect(formatArtifactHash(digest)).toBe(`${ARTIFACT_HASH_PREFIX}${digest}`);
      expect(formatArtifactHash(`${ARTIFACT_HASH_PREFIX}${digest}`)).toBe(
        `${ARTIFACT_HASH_PREFIX}${digest}`
      );
      expect(() => formatArtifactHash('verified')).toThrow();
    });

    it('prefixes a bare digest and leaves placeholders and prefixed values alone', () => {
      const digest = sha('a');
      expect(prefixArtifactHash(digest)).toBe(`${ARTIFACT_HASH_PREFIX}${digest}`);
      expect(prefixArtifactHash(`${ARTIFACT_HASH_PREFIX}${digest}`)).toBe(
        `${ARTIFACT_HASH_PREFIX}${digest}`
      );
      expect(prefixArtifactHash('pending_verification')).toBe('pending_verification');
    });
  });

  describe('prefixArtifactHashes / digestsByPath', () => {
    it('keeps keys and order, counts changes, and never touches a non-digest', () => {
      const a = sha('a');
      const b = sha('b');
      const map: Record<string, unknown> = {
        [SENSITIVE_PATHS[0]]: a,
        'docs/x.md': 'pending_verification',
        [SENSITIVE_PATHS[2]]: `${ARTIFACT_HASH_PREFIX}${b}`,
      };
      expect(prefixArtifactHashes(map)).toBe(1);
      expect(Object.keys(map)).toEqual([SENSITIVE_PATHS[0], 'docs/x.md', SENSITIVE_PATHS[2]]);
      expect(map[SENSITIVE_PATHS[0]]).toBe(`${ARTIFACT_HASH_PREFIX}${a}`);
      expect(map['docs/x.md']).toBe('pending_verification');
      expect(prefixArtifactHashes(map)).toBe(0);
    });

    it('lists bare digests for both spellings and skips placeholders', () => {
      const a = sha('a');
      const b = sha('b');
      expect(digestsByPath({ p: a, q: `${ARTIFACT_HASH_PREFIX}${b}`, r: 'verified' })).toEqual({
        p: a,
        q: b,
      });
      expect(digestsByPath(undefined)).toEqual({});
    });
  });

  describe('rewriteArtifactHashesText', () => {
    const digests = SENSITIVE_PATHS.map((p) => sha(p));
    const hashes = Object.fromEntries(SENSITIVE_PATHS.map((p, i) => [p, digests[i]]));
    const filesReadDigest = sha('spec');
    const original = attestationText(hashes, filesReadDigest);

    it('prefixes every artifact_hashes digest, including the ones with Secret/OAuth in the path', () => {
      const { text, changed } = rewriteArtifactHashesText(original);
      expect(changed).toBe(SENSITIVE_PATHS.length);
      const parsed = JSON.parse(text);
      for (const [i, path] of SENSITIVE_PATHS.entries()) {
        expect(parsed.artifact_hashes[path]).toBe(`${ARTIFACT_HASH_PREFIX}${digests[i]}`);
      }
    });

    it('leaves a bare 64-hex value nowhere in artifact_hashes', () => {
      const { text } = rewriteArtifactHashesText(original);
      for (const value of Object.values(
        JSON.parse(text).artifact_hashes as Record<string, string>
      )) {
        expect(value).not.toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('keeps the evidence verifiable: same paths, same digests', () => {
      const { text } = rewriteArtifactHashesText(original);
      expect(digestsByPath(JSON.parse(text).artifact_hashes)).toEqual(hashes);
    });

    it('changes nothing outside artifact_hashes, files_read digests included', () => {
      const { text } = rewriteArtifactHashesText(original);
      const before = JSON.parse(original);
      const after = JSON.parse(text);
      delete before.artifact_hashes;
      delete after.artifact_hashes;
      expect(after).toEqual(before);
      expect(after.context_acknowledgment.files_read[0].sha256).toBe(filesReadDigest);
      expect(text.split('\n').length).toBe(original.split('\n').length);
    });

    it('is idempotent and leaves a file with no artifact_hashes untouched', () => {
      const once = rewriteArtifactHashesText(original).text;
      expect(rewriteArtifactHashesText(once)).toEqual({ text: once, changed: 0 });
      const none = '{\n  "task_id": "PG-000"\n}\n';
      expect(rewriteArtifactHashesText(none)).toEqual({ text: none, changed: 0 });
    });

    it('leaves placeholder values exactly as they were', () => {
      const text = attestationText({ 'docs/x.md': 'pending_verification' }, filesReadDigest);
      expect(rewriteArtifactHashesText(text)).toEqual({ text, changed: 0 });
    });
  });

  describe('attestation schema', () => {
    const field = attestationSchema.shape.artifact_hashes;

    it('accepts the prefixed spelling and the legacy bare spelling', () => {
      const digest = sha('a');
      expect(field.safeParse({ p: `${ARTIFACT_HASH_PREFIX}${digest}` }).success).toBe(true);
      expect(field.safeParse({ p: digest }).success).toBe(true);
    });

    it('still rejects placeholders and malformed digests', () => {
      for (const bad of [
        'verified',
        'pending_verification',
        `${ARTIFACT_HASH_PREFIX}${sha('a').slice(1)}`,
        `sha512:${sha('a')}`,
      ]) {
        expect(field.safeParse({ p: bad }).success).toBe(false);
      }
    });
  });
});
