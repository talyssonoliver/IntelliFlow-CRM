import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { artifactExists, findMissingArtifacts, trackedEvidence } from '../artifact-presence';

const REPO_ROOT = resolve(__dirname, '../../../..');
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'presence-'));
  mkdirSync(join(root, '.specify/sprints'), { recursive: true });
  copyFileSync(
    join(REPO_ROOT, '.specify/sprints/.gitignore'),
    join(root, '.specify/sprints/.gitignore')
  );
  mkdirSync(join(root, 'apps/api/src'), { recursive: true });
  writeFileSync(join(root, 'apps/api/src/router.ts'), 'export {};\n');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('findMissingArtifacts (Plan-vs-Code Mismatches)', () => {
  it('reports a missing code file with its prefix', async () => {
    const missing = await findMissingArtifacts(
      ['apps/api/src/router.ts', 'apps/api/src/gone.ts'],
      'EVIDENCE:',
      root
    );
    expect(missing).toEqual(['EVIDENCE:apps/api/src/gone.ts']);
  });

  it('reports a missing attestation.json, which git tracks', async () => {
    const p = '.specify/sprints/sprint-18/attestations/PG-1/attestation.json';
    expect(await findMissingArtifacts([p], '', root)).toEqual([p]);
  });

  it('skips spec, plan and context_ack paths the repo leaves untracked by design', async () => {
    const missing = await findMissingArtifacts(
      [
        '.specify/sprints/sprint-18/specifications/PG-1-spec.md',
        '.specify/sprints/sprint-18/planning/PG-1-plan.md',
        '.specify/sprints/sprint-18/attestations/PG-1/context_ack.json',
      ],
      'SPEC:',
      root
    );
    expect(missing).toEqual([]);
  });
});

describe('trackedEvidence', () => {
  it('never counts a gitignored path as evidence, even when a local copy exists', async () => {
    const p = '.specify/sprints/sprint-6/planning/PG-1-plan.md';
    mkdirSync(join(root, '.specify/sprints/sprint-6/planning'), { recursive: true });
    writeFileSync(join(root, p), '# plan');
    expect(await trackedEvidence([p], root)).toEqual([]);
    expect(await findMissingArtifacts([p], 'PLAN:', root)).toEqual([]);
  });

  it('returns the tracked artifacts that exist', async () => {
    expect(await trackedEvidence(['apps/api/src/router.ts', 'apps/api/src/gone.ts'], root)).toEqual(
      ['apps/api/src/router.ts']
    );
  });
});

describe('artifactExists with a glob', () => {
  it('counts a code glob as present when its directory exists', async () => {
    expect(await artifactExists('apps/api/src/**', root)).toBe(true);
    expect(await artifactExists('apps/api/src/*.ts', root)).toBe(true);
  });

  it('reports a code glob whose directory is gone as missing', async () => {
    expect(await findMissingArtifacts(['apps/worker/src/**'], 'ARTIFACT:', root)).toEqual([
      'ARTIFACT:apps/worker/src/**',
    ]);
    expect(await trackedEvidence(['apps/worker/src/**'], root)).toEqual([]);
  });

  it('never treats a bare glob with no directory as evidence', async () => {
    expect(await artifactExists('**/*.ts', root)).toBe(false);
    expect(await artifactExists('/**', root)).toBe(false);
  });
});
