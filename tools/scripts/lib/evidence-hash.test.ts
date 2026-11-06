import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  artifactHashOrNull,
  createFileHasher,
  fixArtifactHashes,
  fixFilesRead,
  isSha256,
  untrackedGeneratedPaths,
  type FileHasher,
} from './evidence-hash.js';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

describe('evidence-hash', () => {
  let root: string;
  let hashFile: FileHasher;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'evidence-hash-'));
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'docs', 'real.md'), 'real content');
    hashFile = createFileHasher(root);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('hashes the bytes of a file that exists, and returns null otherwise', () => {
    expect(hashFile('docs/real.md')).toBe(sha('real content'));
    expect(hashFile('docs/missing.md')).toBeNull();
    expect(hashFile('docs')).toBeNull();
  });

  it('never produces the old placeholder-derived hash', () => {
    const data = { artifact_hashes: { 'docs/real.md': 'verified' } };
    fixArtifactHashes(data, [], hashFile);
    expect(data.artifact_hashes['docs/real.md']).not.toBe(sha('placeholder:docs/real.md:verified'));
  });

  describe('output registered as untracked', () => {
    const data = () => ({ artifact_hashes: { 'artifacts/coverage/lcov.info': 'verified' } });
    const registered = (path: string) => path === 'artifacts/coverage/lcov.info';

    it('keeps the entry when the file is missing', () => {
      const entry = data();
      expect(fixArtifactHashes(entry, [], () => null, registered)).toBe(false);
      expect(entry).toEqual(data());
    });

    it('does not rewrite the entry with the bytes on disk today', () => {
      const entry = data();
      expect(fixArtifactHashes(entry, [], () => sha('today'), registered)).toBe(false);
      expect(entry).toEqual(data());
    });

    it('still removes a bad entry for any other missing file', () => {
      const entry = { artifact_hashes: { 'artifacts/other.json': 'verified' } };
      expect(fixArtifactHashes(entry, [], () => null, registered)).toBe(true);
      expect(entry.artifact_hashes).toEqual({});
    });

    it('reads only untracked entries from the registry', () => {
      const yaml = [
        'entries:',
        '  - path: a.json',
        '    outcome: untracked',
        '  - path: b.json',
        '    outcome: tracked',
      ].join('\n');
      expect([...untrackedGeneratedPaths(yaml)]).toEqual(['a.json']);
      expect(untrackedGeneratedPaths('').size).toBe(0);
    });
  });

  describe('fixArtifactHashes', () => {
    it('replaces an invalid hash with the real one and removes entries for missing files', () => {
      const valid = sha('kept');
      const data = {
        artifact_hashes: {
          'docs/real.md': 'verified-placeholder',
          'docs/missing.md': 'verified',
          'docs/other.md': valid,
        } as Record<string, string>,
      };
      const changes: string[] = [];
      expect(fixArtifactHashes(data, changes, hashFile)).toBe(true);
      expect(data.artifact_hashes).toEqual({
        'docs/real.md': `sha256:${sha('real content')}`,
        'docs/other.md': valid,
      });
      expect(changes.join('\n')).toContain('file not found, no real hash');
    });

    it('does nothing when every hash is already valid or there are none', () => {
      expect(fixArtifactHashes({ artifact_hashes: { a: sha('a') } }, [], hashFile)).toBe(false);
      expect(
        fixArtifactHashes({ artifact_hashes: { a: `sha256:${sha('a')}` } }, [], hashFile)
      ).toBe(false);
      expect(fixArtifactHashes({}, [], hashFile)).toBe(false);
    });
  });

  describe('fixFilesRead', () => {
    it('keeps entries with a recorded hash and drops the rest instead of back-filling', () => {
      const valid = sha('read then');
      const data = {
        context_acknowledgment: {
          files_read: [
            { path: 'docs/real.md', sha256: valid },
            { path: 'docs/real.md', sha256: 'verified-placeholder' },
            'docs/real.md',
          ] as unknown[],
        },
      };
      const changes: string[] = [];
      expect(fixFilesRead(data, changes)).toBe(true);
      expect(data.context_acknowledgment.files_read).toEqual([
        { path: 'docs/real.md', sha256: valid },
      ]);
      expect(changes).toHaveLength(2);
    });

    it('reports no change when nothing is dropped or there is no list', () => {
      const data = { context_acknowledgment: { files_read: [{ path: 'x', sha256: sha('x') }] } };
      expect(fixFilesRead(data, [])).toBe(false);
      expect(fixFilesRead({}, [])).toBe(false);
    });
  });

  describe('artifactHashOrNull', () => {
    it('returns the real hash or null, with a reason', () => {
      const changes: string[] = [];
      expect(artifactHashOrNull('docs/real.md', changes, 0, hashFile)).toBe(sha('real content'));
      expect(artifactHashOrNull('docs/missing.md', changes, 1, hashFile)).toBeNull();
      expect(artifactHashOrNull(undefined, changes, 2, hashFile)).toBeNull();
      expect(changes[1]).toContain('null (file not found');
    });
  });

  it('isSha256 accepts only 64 lowercase hex characters', () => {
    expect(isSha256(sha('x'))).toBe(true);
    expect(isSha256('verified-placeholder')).toBe(false);
    expect(isSha256(undefined)).toBe(false);
  });
});
