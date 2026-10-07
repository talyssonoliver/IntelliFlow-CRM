import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  classifyCompletion,
  collectFindings,
  parseArtifacts,
  verifyArtifacts,
} from '../detect-phantom-completions.js';

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

  it('fails a task whose only evidence is a gitignored path (review repro)', () => {
    const r = classifyCompletion(
      task('DELIVERY:.specify/sprints/sprint-6/execution/X/never-produced.md'),
      root
    );
    expect(r.verified).toBeNull();
    expect(r.phantom?.issues[0]).toContain('No tracked evidence');
  });

  it('does not accept a local copy of a gitignored file as proof', () => {
    const p = '.specify/sprints/sprint-6/planning/PG-1-plan.md';
    mkdirSync(join(root, '.specify/sprints/sprint-6/planning'), { recursive: true });
    writeFileSync(join(root, p), '# plan');
    const r = classifyCompletion(task(`PLAN:${p}`), root);
    expect(r.phantom?.issues[0]).toContain('No tracked evidence');
  });

  it('still flags a missing .tsx (review: keep)', () => {
    const r = classifyCompletion(task('ARTIFACT:apps/web/src/missing.tsx'), root);
    expect(r.phantom?.missingArtifacts).toEqual(['apps/web/src/missing.tsx']);
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

describe('fail-closed defaults', () => {
  it('treats a task with no artifact, description or DoD columns as having no evidence', () => {
    const r = classifyCompletion({ 'Task ID': 'PG-2' }, root);
    expect(r.verified).toBeNull();
    expect(r.phantom).toMatchObject({ taskId: 'PG-2', description: '' });
    expect(r.phantom?.issues[0]).toContain('No tracked evidence');
  });

  it('skips a bare word that is neither a prefixed entry nor a path', () => {
    expect(parseArtifacts('manual review;apps/web/src/page.tsx')).toEqual([
      'apps/web/src/page.tsx',
    ]);
  });

  it('resolves artifacts against the current checkout when no root is given', () => {
    expect(verifyArtifacts('ARTIFACT:package.json;ARTIFACT:no/such/file.ts')).toEqual({
      exists: ['package.json'],
      missing: ['no/such/file.ts'],
      untrackedByDesign: [],
    });
    expect(classifyCompletion(task('ARTIFACT:package.json')).verified).not.toBeNull();
  });
});

describe('collectFindings', () => {
  const writePlan = (rows: string[]) => {
    const dir = join(root, 'apps/project-tracker/docs/metrics/_global');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'Sprint_plan.csv'), ['Task ID,Target Sprint', ...rows].join('\n'));
  };
  const attest = (sprint: number, id: string) => {
    const dir = join(root, `.specify/sprints/sprint-${sprint}/attestations/${id}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'attestation.json'), '{}');
  };
  const row = (
    id: string,
    artifacts: string,
    dod = 'page.tsx renders; verified by: pnpm test'
  ) => ({
    ...task(artifacts, dod),
    'Task ID': id,
  });

  it('sorts every completed task into verified or phantom, with its side reports', () => {
    writePlan(['PHX-OK,3', 'PHX-GONE,3', 'PHX-SPEC,3']);
    const f = collectFindings(
      [
        row('PHX-OK', 'ARTIFACT:apps/web/src/page.tsx', 'Lighthouse >=90'),
        row('PHX-GONE', 'ARTIFACT:apps/web/src/gone.tsx'),
        row('PHX-SPEC', 'SPEC:.specify/sprints/sprint-3/specifications/PHX-SPEC-spec.md'),
      ],
      root
    );
    expect(f.verified.map((v) => v.task_id)).toEqual(['PHX-OK']);
    expect(f.phantoms.map((p) => [p.taskId, p.issues[0]])).toEqual([
      ['PHX-GONE', 'Missing 1 artifact(s)'],
      ['PHX-SPEC', 'No tracked evidence: every artifact is untracked by design or absent'],
    ]);
    expect(f.untracked).toEqual([
      {
        task_id: 'PHX-SPEC',
        paths: ['.specify/sprints/sprint-3/specifications/PHX-SPEC-spec.md'],
      },
    ]);
    expect(f.dodWarnings).toEqual([
      { task_id: 'PHX-OK', issues: ['DOD has no artifact reference'] },
    ]);
    expect(f.sprintMismatches).toEqual([]);
  });

  it('reports an attestation filed under a different sprint than the plan says', () => {
    writePlan(['PHX-MOVED,4', 'PHX-HOME,5']);
    attest(2, 'PHX-MOVED');
    attest(5, 'PHX-HOME');
    const f = collectFindings(
      [
        row('PHX-MOVED', 'ARTIFACT:apps/web/src/page.tsx'),
        row('PHX-HOME', 'ARTIFACT:apps/web/src/page.tsx'),
      ],
      root
    );
    expect(f.sprintMismatches).toEqual([
      { task_id: 'PHX-MOVED', description: 'A page', expected_sprint: 4, found_dir: 'sprint-2' },
    ]);
  });

  it('still classifies a task the plan does not list', () => {
    writePlan(['PHX-OTHER,1']);
    const f = collectFindings([row('PHX-UNLISTED', 'ARTIFACT:apps/web/src/gone.tsx')], root);
    expect(f.sprintMismatches).toEqual([]);
    expect(f.phantoms.map((p) => p.taskId)).toEqual(['PHX-UNLISTED']);
  });
});
