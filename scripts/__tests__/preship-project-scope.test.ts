/**
 * scripts/lib/preship-project-scope.mjs: a package-local config change runs
 * only the vitest projects it can reach, not the whole suite.
 */
import { describe, it, expect } from 'vitest';
import {
  loadProjectMap,
  localImpact,
  parseProjectList,
  projectNames,
  projectOf,
  unitTestRuns,
  withoutInertLists,
} from '../lib/preship-project-scope.mjs';
import { classifyChangedFiles } from '../lib/preship-test-scope.mjs';

// A small monorepo: api (with a setup file the root project also loads), web,
// domain (which api depends on), and a test-only project with no package.json.
const files: Record<string, string> = {
  'vitest.config.ts': [
    'export default defineConfig({',
    '  test: {',
    '    projects: [',
    "      'apps/api/vitest.config.ts',",
    "      'apps/web/vitest.config.ts',",
    "      'packages/domain/vitest.config.ts',",
    "      'tests/architecture/vitest.config.ts',",
    '      {',
    "        test: { name: 'root', setupFiles: ['./apps/api/src/test/setup.ts'] },",
    '      },',
    "      { test: { name: 'integration' } },",
    '    ],',
    '    coverage: {',
    '      exclude: [',
    "        'apps/web/vitest.setup.ts',",
    "        'apps/web/vitest.config.ts',",
    '      ],',
    '    },',
    '  },',
    '});',
  ].join('\n'),
  'apps/api/vitest.config.ts': "test: { name: 'api', setupFiles: ['./src/test/setup.ts'] }",
  'apps/web/vitest.config.ts': "test: { name: 'web', setupFiles: ['./vitest.setup.ts'] }",
  'packages/domain/vitest.config.ts': "test: { name: 'domain' }",
  'tests/architecture/vitest.config.ts': "test: { name: 'architecture' }",
  'apps/api/package.json': JSON.stringify({
    name: '@x/api',
    dependencies: { '@x/domain': 'workspace:*' },
  }),
  'apps/web/package.json': JSON.stringify({ name: '@x/web', devDependencies: { '@x/api': '*' } }),
  'packages/domain/package.json': JSON.stringify({ name: '@x/domain' }),
};
const read = (p: string) => {
  if (!(p in files)) throw new Error(`ENOENT ${p}`);
  return files[p];
};
const map = loadProjectMap('/repo', read)!;

describe('loadProjectMap', () => {
  it('reads each listed project, its name and its workspace dependencies', () => {
    expect(map.projects.map((p) => `${p.name}@${p.dir}`)).toEqual([
      'api@apps/api',
      'web@apps/web',
      'domain@packages/domain',
      'architecture@tests/architecture',
    ]);
    expect(map.rootInline).toEqual(['root', 'integration']);
    expect(map.packages.get('apps/api')).toEqual({ name: '@x/api', deps: ['@x/domain'] });
    expect(map.packages.has('tests/architecture')).toBe(false);
    expect(projectNames(map)).toEqual([
      'api',
      'architecture',
      'domain',
      'integration',
      'root',
      'web',
    ]);
  });

  it('is null when the root config, a listed config or a project name is missing', () => {
    expect(
      loadProjectMap('/repo', () => {
        throw new Error('nope');
      })
    ).toBeNull();
    const noApi = (p: string) => (p === 'apps/api/vitest.config.ts' ? read('nope') : read(p));
    expect(loadProjectMap('/repo', noApi)).toBeNull();
    const nameless = (p: string) => (p === 'apps/web/vitest.config.ts' ? 'test: {}' : read(p));
    expect(loadProjectMap('/repo', nameless)).toBeNull();
    expect(
      loadProjectMap('/repo', (p) => (p === 'vitest.config.ts' ? 'nothing here' : read(p)))
    ).toBeNull();
  });
});

describe('localImpact', () => {
  it('runs only the owning project for its own setup and config', () => {
    expect(localImpact('apps/web/vitest.setup.ts', map)).toEqual(['web']);
    expect(localImpact('apps/web/vitest.config.ts', map)).toEqual(['web']);
    expect(localImpact('apps/web/src/__mocks__/next.ts', map)).toEqual(['web']);
    expect(localImpact('apps/web/tsconfig.json', map)).toEqual(['web']);
  });

  it('adds the root config inline projects when the root config loads the file', () => {
    expect(localImpact('apps/api/src/test/setup.ts', map)).toEqual(['api', 'integration', 'root']);
  });

  it('adds dependent projects for a package.json, transitively', () => {
    expect(localImpact('packages/domain/package.json', map)).toEqual(['api', 'domain', 'web']);
    expect(localImpact('apps/web/package.json', map)).toEqual(['web']);
  });

  it('keeps the Prisma schema, files outside every project and ordinary files global', () => {
    expect(localImpact('packages/domain/prisma/schema.prisma', map)).toBeNull();
    expect(localImpact('vitest.config.ts', map)).toBeNull();
    expect(localImpact('tsconfig.base.json', map)).toBeNull();
    expect(localImpact('apps/web/src/page.tsx', map)).toBeNull();
  });

  it('finds the deepest owning project', () => {
    expect(projectOf('apps/web/src/x.ts', map)?.name).toBe('web');
    expect(projectOf('scripts/x.mjs', map)).toBeNull();
  });
});

describe('withoutInertLists', () => {
  it('drops plain entries of exclude and projects lists and keeps everything else', () => {
    const text = [
      'exclude: [',
      "  'a.ts',",
      "  'b.ts', // why",
      ']',
      "setupFiles: ['./c.ts'],",
      'include: [',
      "  'd.ts',",
      ']',
    ].join('\n');
    const out = withoutInertLists(text);
    expect(out).not.toContain("'a.ts'");
    expect(out).toContain("'b.ts', // why"); // a comment keeps the line: err wide
    expect(out).toContain("'./c.ts'");
    expect(out).toContain("'d.ts'");
  });
});

describe('unitTestRuns', () => {
  const all = ['api', 'domain', 'integration', 'root', 'web'];

  it('runs nothing, everything or the related tests as before', () => {
    expect(unitTestRuns({ scope: 'none', files: [] }, all)).toEqual([]);
    expect(unitTestRuns({ scope: 'full', files: [] }, all)).toEqual([
      ['run', '--project=!integration'],
    ]);
    expect(unitTestRuns({ scope: 'related', files: ['a.ts'] }, all)).toEqual([
      ['related', '--run', '--passWithNoTests', '--project=!integration', 'a.ts'],
    ]);
  });

  it('runs the reached projects in full and the related tests in every other one', () => {
    expect(
      unitTestRuns(
        { scope: 'related', files: ['a.ts'], projects: ['api', 'integration', 'root'] },
        all
      )
    ).toEqual([
      ['run', '--project=api', '--project=root'],
      ['related', '--run', '--passWithNoTests', '--project=domain', '--project=web', 'a.ts'],
    ]);
  });

  it('skips the related run when no source changed', () => {
    expect(unitTestRuns({ scope: 'related', files: [], projects: ['web'] }, all)).toEqual([
      ['run', '--project=web'],
    ]);
  });
});

describe('parseProjectList', () => {
  it('reads a JSON array of names and ignores anything else', () => {
    expect(parseProjectList('["api","web"]')).toEqual(['api', 'web']);
    expect(parseProjectList('["api",3]')).toEqual(['api']);
    expect(parseProjectList('{}')).toEqual([]);
    expect(parseProjectList('not json')).toEqual([]);
    expect(parseProjectList(undefined)).toEqual([]);
  });
});

describe('classifyChangedFiles with a project map', () => {
  it('scopes a package-local setup change to its projects, plus related tests', () => {
    expect(classifyChangedFiles(['apps/api/src/test/setup.ts', 'apps/web/src/a.tsx'], map)).toEqual(
      {
        scope: 'related',
        reason:
          'apps/api/src/test/setup.ts changed — runs project(s) api, integration, root in full, plus the tests related to 2 changed source file(s)',
        files: ['apps/api/src/test/setup.ts', 'apps/web/src/a.tsx'],
        projects: ['api', 'integration', 'root'],
      }
    );
  });

  it('runs a reached project even when no source file changed', () => {
    const r = classifyChangedFiles(['apps/web/tsconfig.json'], map);
    expect(r).toMatchObject({ scope: 'related', files: [], projects: ['web'] });
  });

  it('still goes full for a global file, and without a map', () => {
    expect(classifyChangedFiles(['apps/web/vitest.setup.ts', 'pnpm-lock.yaml'], map).scope).toBe(
      'full'
    );
    expect(classifyChangedFiles(['apps/web/vitest.setup.ts'], null).scope).toBe('full');
  });
});
