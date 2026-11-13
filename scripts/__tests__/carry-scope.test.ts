/**
 * Tests for scripts/lib/carry-scope.mjs: which of main's changes stop a
 * pre-ship attestation being carried to a rebased head.
 */
import { describe, it, expect } from 'vitest';

import {
  ROOT,
  affectedPackages,
  carryBlockers,
  packageOf,
  workspaceGraph,
} from '../lib/carry-scope.mjs';

const manifest = (path: string, pkg: unknown) => ({ path, json: JSON.stringify(pkg) });

// web -> ui -> domain ; api -> domain ; tools stands alone.
const graph = workspaceGraph([
  manifest('package.json', { name: 'monorepo-root', dependencies: { ui: 'workspace:*' } }),
  manifest('apps/web/package.json', {
    name: 'web',
    dependencies: { ui: 'workspace:*', react: '19' },
  }),
  manifest('packages/ui/package.json', { name: 'ui', peerDependencies: { domain: 'workspace:*' } }),
  manifest('packages/domain/package.json', { name: 'domain' }),
  manifest('apps/api/package.json', { name: 'api', devDependencies: { domain: 'workspace:*' } }),
  manifest('tools/x/package.json', { name: 'tools-x' }),
  manifest('apps/web/e2e/package.json', { name: 'web-e2e' }),
  { path: 'broken/package.json', json: '{not json' },
  manifest('nameless/package.json', { private: true }),
]);

describe('workspaceGraph', () => {
  it('maps package dirs to names and keeps only workspace dependencies', () => {
    expect(graph.dirs.get('apps/web')).toBe('web');
    expect([...graph.deps.get('web')!]).toEqual(['ui']); // react is not a workspace package
    expect([...graph.deps.get('ui')!]).toEqual(['domain']); // peer deps count
    expect([...graph.deps.get('api')!]).toEqual(['domain']); // dev deps count
  });

  it('skips the root manifest, unparsable manifests and nameless ones', () => {
    expect([...graph.dirs.values()]).not.toContain('monorepo-root');
    expect(graph.dirs.has('broken')).toBe(false);
    expect(graph.dirs.has('nameless')).toBe(false);
  });
});

describe('packageOf', () => {
  it('picks the deepest package and falls back to the repo root', () => {
    expect(packageOf('apps/web/src/page.tsx', graph.dirs)).toBe('web');
    expect(packageOf('apps/web/e2e/login.spec.ts', graph.dirs)).toBe('web-e2e');
    expect(packageOf('apps\\web\\src\\x.ts', graph.dirs)).toBe('web');
    expect(packageOf('scripts/pre-ship.mjs', graph.dirs)).toBe(ROOT);
    expect(packageOf('apps/webby/x.ts', graph.dirs)).toBe(ROOT); // prefix, not a dir match
  });
});

describe('affectedPackages', () => {
  it('includes what the touched packages depend on and what depends on them, transitively', () => {
    expect([...affectedPackages(['packages/ui/src/button.tsx'], graph)].sort()).toEqual(
      ['domain', 'ui', 'web'].sort()
    );
    expect([...affectedPackages(['packages/domain/src/lead.ts'], graph)].sort()).toEqual(
      ['api', 'domain', 'ui', 'web'].sort()
    );
    expect([...affectedPackages(['tools/x/run.ts'], graph)]).toEqual(['tools-x']);
  });
});

describe('carryBlockers', () => {
  const prFiles = ['apps/web/src/page.tsx'];

  it('allows main changes outside the scope and inert files anywhere', () => {
    expect(
      carryBlockers({
        prFiles,
        mainFiles: ['apps/api/src/router.ts', 'tools/x/run.ts', 'docs/a.md', 'apps/web/README.md'],
        graph,
      })
    ).toEqual([]);
  });

  it('blocks global-impact files, in-scope packages and shared repo-root files', () => {
    const blockers = carryBlockers({
      prFiles: [...prFiles, 'scripts/mine.mjs'],
      mainFiles: [
        'pnpm-lock.yaml',
        'apps/api/package.json',
        'packages/domain/src/lead.ts',
        'apps/web/src/other.tsx',
        'scripts/other.mjs',
      ],
      graph,
    });
    expect(blockers).toEqual([
      { file: 'pnpm-lock.yaml', why: 'global-impact file' },
      { file: 'apps/api/package.json', why: 'global-impact file' },
      { file: 'packages/domain/src/lead.ts', why: "in domain, within the PR's affected scope" },
      { file: 'apps/web/src/other.tsx', why: "in web, within the PR's affected scope" },
      { file: 'scripts/other.mjs', why: 'repo-root file, and the PR touches the root too' },
    ]);
  });

  it('does not block a repo-root change when the PR stays inside packages', () => {
    expect(carryBlockers({ prFiles, mainFiles: ['scripts/other.mjs'], graph })).toEqual([]);
  });
});

describe('carryBlockers: repo-root files by their real dependencies', () => {
  // A small tree of root code: pre-ship spawns run-build by path and imports a
  // lib; a tools script imports its own helper; nothing links the two worlds.
  const tree: Record<string, string> = {
    'scripts/pre-ship.mjs':
      "import { plan } from './lib/plan.mjs';\nconst cmd = ['node', 'scripts/run-build.mjs'];\n",
    'scripts/lib/plan.mjs': "export { scope } from './scope';\n",
    'scripts/lib/scope.mjs': 'export const scope = 1;\n',
    'scripts/run-build.mjs': "const lib = require('../tools/shared/index');\n",
    'tools/shared/index.ts': 'export const shared = 1;\n',
    'tools/report/make.ts': "import { helper } from './helper.js';\n",
    'tools/report/helper.js': 'export const helper = 1;\n',
    'tools/report/lazy.ts': "const m = await import('./helper.js');\n",
    'scripts/__tests__/plan.test.ts': "import { plan } from '../lib/plan.mjs';\n",
  };
  const root = {
    files: [...Object.keys(tree), '.github/workflows/ci.yml', 'scripts/data/table.json'],
    read: (f: string) => tree[f] ?? null,
  };
  const block = (prFiles: string[], mainFiles: string[], r = root) =>
    carryBlockers({ prFiles, mainFiles, graph, root: r });

  it('carries when main changed root code the PR does not reach and that does not reach it', () => {
    expect(block(['scripts/lib/scope.mjs'], ['tools/report/make.ts'])).toEqual([]);
  });

  it('blocks main code that depends on a PR file, through a re-export', () => {
    expect(block(['scripts/lib/scope.mjs'], ['scripts/pre-ship.mjs'])).toEqual([
      {
        file: 'scripts/pre-ship.mjs',
        why: 'depends on scripts/lib/scope.mjs, which the PR changes',
      },
    ]);
  });

  it('blocks main code that a PR file depends on, through a path mention and a require', () => {
    expect(block(['scripts/pre-ship.mjs'], ['tools/shared/index.ts'])).toEqual([
      {
        file: 'tools/shared/index.ts',
        why: 'scripts/pre-ship.mjs, which the PR changes, depends on it',
      },
    ]);
  });

  it('blocks a main test that imports the PR file, and a dynamic import', () => {
    expect(block(['scripts/lib/plan.mjs'], ['scripts/__tests__/plan.test.ts'])).toHaveLength(1);
    expect(block(['tools/report/helper.js'], ['tools/report/lazy.ts'])).toHaveLength(1);
  });

  it('judges other root files by directory', () => {
    expect(block(['scripts/lib/scope.mjs'], ['.github/workflows/ci.yml'])).toEqual([]);
    expect(block(['scripts/lib/scope.mjs'], ['scripts/data/table.json'])).toEqual([
      {
        file: 'scripts/data/table.json',
        why: 'repo-root file in scripts/, which the PR also changes',
      },
    ]);
    expect(block(['scripts/data/table.json'], ['scripts/lib/scope.mjs'])).toEqual([
      { file: 'scripts/lib/scope.mjs', why: 'in scripts/, beside scripts/data/table.json' },
    ]);
  });

  it('blocks when a file on the way cannot be read', () => {
    const blind = {
      files: root.files,
      read: (f: string) => (f === 'tools/report/make.ts' ? null : (tree[f] ?? null)),
    };
    expect(block(['scripts/lib/scope.mjs'], ['tools/report/make.ts'], blind)).toEqual([
      { file: 'tools/report/make.ts', why: "cannot read tools/report/make.ts's dependencies" },
    ]);
  });

  it('still blocks global-impact files and leaves package files to the package rule', () => {
    expect(block(['scripts/lib/scope.mjs'], ['pnpm-lock.yaml', 'apps/web/src/x.tsx'])).toEqual([
      { file: 'pnpm-lock.yaml', why: 'global-impact file' },
    ]);
  });
});
