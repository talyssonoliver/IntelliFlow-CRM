import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { classifyCompletion, parseArtifacts } from '../detect-phantom-completions.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'phantom-'));
  mkdirSync(join(root, '.specify/sprints'), { recursive: true });
  copyFileSync(
    join(process.cwd(), '.specify/sprints/.gitignore'),
    join(root, '.specify/sprints/.gitignore')
  );
  mkdirSync(join(root, 'apps/web/src'), { recursive: true });
  writeFileSync(join(root, 'apps/web/src/page.tsx'), 'export default 1;\n');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const task = (artifacts: string, dod = 'Page renders; verified by: pnpm test') => ({
  'Task ID': 'PG-1',
  Description: 'A page',
  'Definition of Done': dod,
  'Artifacts To Track': artifacts,
});

describe('classifyCompletion', () => {
  it('verifies a task whose tracked artifacts all exist', () => {
    const r = classifyCompletion(task('ARTIFACT:apps/web/src/page.tsx'), root);
    expect(r.phantom).toBeNull();
    expect(r.verified?.artifacts_verified).toEqual(['apps/web/src/page.tsx']);
  });

  it('flags a missing code artifact as a phantom completion', () => {
    const r = classifyCompletion(
      task('ARTIFACT:apps/web/src/page.tsx;ARTIFACT:apps/web/src/gone.tsx'),
      root
    );
    expect(r.phantom?.missingArtifacts).toEqual(['apps/web/src/gone.tsx']);
    expect(r.verified).toBeNull();
  });

  it('still flags a missing canonical attestation.json, which git does track', () => {
    const r = classifyCompletion(
      task('EVIDENCE:.specify/sprints/sprint-16/attestations/PG-1/attestation.json'),
      root
    );
    expect(r.phantom?.missingArtifacts).toEqual([
      '.specify/sprints/sprint-16/attestations/PG-1/attestation.json',
    ]);
  });

  it('does not count spec, plan and context_ack files the repo deliberately leaves untracked', () => {
    const r = classifyCompletion(
      task(
        [
          'ARTIFACT:apps/web/src/page.tsx',
          'SPEC:.specify/sprints/sprint-6/specifications/PG-1-spec.md',
          'PLAN:.specify/sprints/sprint-6/planning/PG-1-plan.md',
          'EVIDENCE:.specify/sprints/sprint-6/attestations/PG-1/context_ack.json',
        ].join(';')
      ),
      root
    );
    expect(r.phantom).toBeNull();
    expect(r.untrackedByDesign).toHaveLength(3);
  });

  it('reports DoD wording separately and never makes a task phantom over it', () => {
    const r = classifyCompletion(
      task(
        'ARTIFACT:apps/web/src/page.tsx',
        'Response <500ms, Lighthouse >=90; verified by: pnpm test'
      ),
      root
    );
    expect(r.dodWarnings).toEqual(['DOD has no artifact reference']);
    expect(r.phantom).toBeNull();
  });
});

describe('parseArtifacts', () => {
  it('reads every path prefix the CSV uses, not only ARTIFACT/EVIDENCE/SPEC/PLAN', () => {
    expect(
      parseArtifacts(
        'ATTESTATION:.specify/a/attestation.json;CONTEXT:.specify/c.md;DELIVERY:.specify/d.md'
      )
    ).toEqual(['.specify/a/attestation.json', '.specify/c.md', '.specify/d.md']);
  });

  it('skips command and metadata prefixes instead of treating them as paths', () => {
    expect(parseArtifacts('VALIDATE:pnpm --filter web test;GATE:lighthouse>=0.9')).toEqual([]);
  });

  it('still reads an unprefixed path', () => {
    expect(parseArtifacts('apps/web/src/page.tsx')).toEqual(['apps/web/src/page.tsx']);
  });
});
