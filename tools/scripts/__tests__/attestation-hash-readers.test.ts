/**
 * Every reader and writer of attestation `artifact_hashes` values must treat
 * `sha256:<hex>` and the legacy bare `<hex>` the same, and must still refuse a
 * digest that does not match the file.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enrichFromAttestationFile } from '../../../apps/project-tracker/lib/artifact-registry';
import { main as formatMain } from '../format-attestation-hashes';
import { generateAttestation } from '../lib/sprint-audit/attestation-generator';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const REPORT_DIR = 'artifacts/lighthouse';

// The two .mjs scripts have no type declarations, so load them by a computed
// specifier and give the functions the shape the tests rely on.
const AUDIT_SCRIPT = '../audit-task-branch-correspondence.mjs';
const LIGHTHOUSE_SCRIPT = '../exec-preflight/check-lighthouse-evidence.mjs';
const { bareDigest } = (await import(/* @vite-ignore */ AUDIT_SCRIPT)) as {
  bareDigest: (value: unknown) => unknown;
};
const { reportHashMatchesArtifacts } = (await import(/* @vite-ignore */ LIGHTHOUSE_SCRIPT)) as {
  reportHashMatchesArtifacts: (reportPath: string, attestation: unknown) => boolean;
};

describe('attestation hash readers and writers', () => {
  let root: string;
  let cwd: string;

  beforeEach(() => {
    cwd = process.cwd();
    root = mkdtempSync(join(tmpdir(), 'att-hash-'));
  });

  afterEach(() => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  describe('audit-task-branch-correspondence bareDigest', () => {
    it('strips the prefix and leaves bare digests and non-strings alone', () => {
      const digest = sha('a');
      expect(bareDigest(`sha256:${digest}`)).toBe(digest);
      expect(bareDigest(digest)).toBe(digest);
      expect(bareDigest('pending_verification')).toBe('pending_verification');
      expect(bareDigest(undefined)).toBeUndefined();
    });

    it('does not turn a wrong digest into a matching one', () => {
      expect(bareDigest(`sha256:${sha('a')}`)).not.toBe(sha('b'));
    });
  });

  describe('check-lighthouse-evidence reportHashMatchesArtifacts', () => {
    // The script resolves paths against process.cwd() at import, so the report
    // lives under the real repo cwd and is removed afterwards.
    const reportAbs = resolve(process.cwd(), REPORT_DIR, `.hash-test-${process.pid}.json`);
    const rel = relative(process.cwd(), reportAbs).replaceAll('\\', '/');
    const digest = () => sha(readFileSync(reportAbs, 'utf8'));

    beforeEach(() => {
      mkdirSync(join(process.cwd(), REPORT_DIR), { recursive: true });
      writeFileSync(reportAbs, '{"categories":{}}');
    });
    afterEach(() => rmSync(reportAbs, { force: true }));

    it('accepts the prefixed and the bare spelling of the real digest', () => {
      expect(reportHashMatchesArtifacts(reportAbs, { artifact_hashes: { [rel]: digest() } })).toBe(
        true
      );
      expect(
        reportHashMatchesArtifacts(reportAbs, { artifact_hashes: { [rel]: `sha256:${digest()}` } })
      ).toBe(true);
    });

    it('rejects a wrong digest in either spelling, a missing entry and a non-map', () => {
      const wrong = sha('something else');
      expect(reportHashMatchesArtifacts(reportAbs, { artifact_hashes: { [rel]: wrong } })).toBe(
        false
      );
      expect(
        reportHashMatchesArtifacts(reportAbs, { artifact_hashes: { [rel]: `sha256:${wrong}` } })
      ).toBe(false);
      expect(reportHashMatchesArtifacts(reportAbs, { artifact_hashes: {} })).toBe(false);
      expect(reportHashMatchesArtifacts(reportAbs, { artifact_hashes: 'x' })).toBe(false);
    });
  });

  describe('artifact-registry enrichFromAttestationFile', () => {
    it('trusts both spellings, skips placeholders and malformed values', () => {
      const file = join(root, 'attestation.json');
      writeFileSync(
        file,
        JSON.stringify({
          artifact_hashes: {
            'a/prefixed.ts': `sha256:${sha('a')}`,
            'b/bare.ts': sha('b'),
            'c/placeholder.ts': 'pending_verification',
            'd/short.ts': 'sha256:abc',
          },
        })
      );
      const taskMap = {};
      enrichFromAttestationFile(taskMap, 'T-1', file);
      expect(
        (taskMap as Record<string, { expectedArtifacts: string[] }>)['T-1'].expectedArtifacts
      ).toEqual(['a/prefixed.ts', 'b/bare.ts']);
    });
  });

  describe('sprint-audit generateAttestation', () => {
    it('writes found artifacts as sha256:<hex> and drops the rest', () => {
      const digest = sha('x');
      const findings = {
        artifacts: [
          { path: 'a.ts', sha256: digest, status: 'found' },
          { path: 'b.ts', sha256: sha('y'), status: 'missing' },
        ],
        validations: [],
        kpis: [],
        placeholders: [],
        dependencies: { attestationsFound: [], missing: [] },
        definitionOfDone: { details: [] },
        hasWaiver: false,
        waiverExpired: false,
        debtAllowed: false,
      };
      const att = generateAttestation('T-1', findings as never);
      expect(att.artifact_hashes).toEqual({ 'a.ts': `sha256:${digest}` });
    });
  });

  describe('generate-missing-attestations', () => {
    it('writes context-ack artifact hashes as sha256:<hex> and keeps placeholders', async () => {
      const digest = sha('z');
      mkdirSync(join(root, 'artifacts', 'attestations', 'T-9'), { recursive: true });
      mkdirSync(join(root, 'artifacts'), { recursive: true });
      writeFileSync(join(root, 'artifacts', 'missing-attestations.json'), JSON.stringify(['T-9']));
      writeFileSync(
        join(root, 'artifacts', 'attestations', 'T-9', 'context_ack.json'),
        JSON.stringify({
          task_id: 'T-9',
          artifacts: {
            created: [{ path: 'one.ts', sha256: digest }, { path: 'two.ts' }],
          },
        })
      );
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      process.chdir(root);
      vi.resetModules();
      await import('../generate-missing-attestations');

      const written = join(root, '.specify', 'sprints', 'sprint-0', 'attestations', 'T-9');
      const att = JSON.parse(readFileSync(join(written, 'attestation.json'), 'utf8'));
      expect(att.artifact_hashes).toEqual({
        'one.ts': `sha256:${digest}`,
        'two.ts': 'pending_verification',
      });
    });
  });

  describe('format-attestation-hashes CLI', () => {
    const digest = sha('doc');
    const write = (name: string, hashes: Record<string, string>) => {
      const file = join(root, name);
      writeFileSync(file, `${JSON.stringify({ artifact_hashes: hashes }, null, 2)}\n`);
      return file;
    };
    const quiet = () => vi.spyOn(console, 'log').mockImplementation(() => undefined);

    it('rewrites a bare digest, then reports the file as already converted', () => {
      const file = write('a.json', { 'docs/SecretField.md': digest });
      quiet();
      expect(formatMain([file], root)).toBe(0);
      expect(JSON.parse(readFileSync(file, 'utf8')).artifact_hashes).toEqual({
        'docs/SecretField.md': `sha256:${digest}`,
      });
      expect(formatMain(['--check', file], root)).toBe(0);
    });

    it('--check fails while a bare digest remains and does not write', () => {
      const file = write('b.json', { 'docs/x.md': digest });
      quiet();
      expect(formatMain(['--check', file], root)).toBe(1);
      expect(JSON.parse(readFileSync(file, 'utf8')).artifact_hashes['docs/x.md']).toBe(digest);
    });

    it('--verify passes for the real digest in either spelling and fails on a wrong one or a missing file', () => {
      mkdirSync(join(root, 'docs'));
      writeFileSync(join(root, 'docs', 'real.md'), 'doc');
      const good = write('c.json', { 'docs/real.md': digest });
      const wrong = write('d.json', { 'docs/real.md': sha('not the file') });
      const missing = write('e.json', { 'docs/gone.md': digest });
      quiet();
      expect(formatMain(['--verify', good], root)).toBe(0);
      expect(formatMain(['--verify', good], root)).toBe(0); // already prefixed
      expect(formatMain(['--verify', wrong], root)).toBe(1);
      expect(formatMain(['--verify', missing], root)).toBe(1);
    });

    it('prints usage and exits 2 without files', () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(formatMain([], root)).toBe(2);
    });
  });
});
