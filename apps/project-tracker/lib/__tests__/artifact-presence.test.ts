import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findMissingArtifacts } from '../artifact-presence';

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
