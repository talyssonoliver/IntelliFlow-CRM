/**
 * Tests for scripts/lib/carry-scope.mjs: which of main's changes stop a
 * pre-ship attestation being carried to a rebased head.
 */
import { describe, it, expect } from 'vitest';

import {
  ROOT,
  affectedPackages,
  carryBlockers,
  filesToRead,
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
    'tools/report/make.ts':
      "import { helper } from './helper.js';\nimport cfg from './cfg.json';\n",
    'tools/report/helper.js': "import { z } from 'zod';\nexport const helper = 1;\n",
    'tools/report/lazy.ts': "const m = await import('./helper.js');\n",
    'scripts/__tests__/plan.test.ts': "import { plan } from '../lib/plan.mjs';\n",
    // Unchanged on both sides, but it imports one file from each.
    'tools/both.test.ts':
      "import { shared } from './shared/index';\nvi.mock('./alone/one.mjs');\nimport { two } from './alone/two.mjs';\n",
    'tools/alone/one.mjs': 'export const one = 1;\n',
    'tools/alone/two.mjs': 'export const two = 2;\n',
    'tools/alone/three.mjs': 'export const three = 3;\n',
    'tools/loader/plugins.mjs': 'export const load = (name) => import(name);\n',
    'tools/loader/use.mjs':
      "import { load } from './plugins.mjs';\nimport { four } from '../alone/four.mjs';\n",
    'tools/alone/four.mjs': 'export const four = 4;\n',
    'tools/loader/templ.mjs': "const x = await import(`./${'a'}.mjs`);\n",
    'tools/loader/broken.mjs': "import { gone } from './gone.mjs';\n",
    'tools/alone/five.mjs': "import './../loader/templ.mjs';\n",
    'tools/alone/six.mjs': "import '../loader/broken.mjs';\n",
  };
  const root = {
    files: [
      ...Object.keys(tree),
      'tools/report/cfg.json',
      '.github/workflows/ci.yml',
      'scripts/data/table.json',
    ],
    read: (f: string) => tree[f] ?? null,
  };
  const block = (prFiles: string[], mainFiles: string[], r = root) =>
    carryBlockers({ prFiles, mainFiles, graph, root: r });

  it('carries when nothing imports both files and neither reaches an unknown load', () => {
    expect(block(['scripts/lib/scope.mjs'], ['tools/report/make.ts'])).toEqual([]);
    expect(block(['tools/alone/three.mjs'], ['tools/alone/two.mjs'])).toEqual([]);
  });

  it('blocks main code that imports a PR file, through a re-export', () => {
    expect(block(['scripts/lib/scope.mjs'], ['scripts/pre-ship.mjs'])).toEqual([
      {
        file: 'scripts/pre-ship.mjs',
        why: 'scripts/pre-ship.mjs imports the other (with scripts/lib/scope.mjs, which the PR changes)',
      },
    ]);
  });

  it('blocks main code that a PR file reaches, through a path mention and a require', () => {
    expect(block(['scripts/pre-ship.mjs'], ['tools/shared/index.ts'])).toEqual([
      {
        file: 'tools/shared/index.ts',
        why: 'scripts/pre-ship.mjs imports the other (with scripts/pre-ship.mjs, which the PR changes)',
      },
    ]);
  });

  it('blocks two files that an unchanged third file imports, mocks included', () => {
    expect(block(['tools/alone/two.mjs'], ['tools/alone/one.mjs'])).toEqual([
      {
        file: 'tools/alone/one.mjs',
        why: 'tools/both.test.ts imports both (with tools/alone/two.mjs, which the PR changes)',
      },
    ]);
  });

  it('blocks a main test that imports the PR file, and a literal dynamic import', () => {
    expect(block(['scripts/lib/plan.mjs'], ['scripts/__tests__/plan.test.ts'])).toHaveLength(1);
    expect(block(['tools/report/helper.js'], ['tools/report/lazy.ts'])).toHaveLength(1);
  });

  it('treats a computed load, a template path and an unresolved import as connected', () => {
    const cannot = (x: string) => `${x} has an import that cannot be followed`;
    expect(block(['tools/alone/three.mjs'], ['tools/alone/four.mjs'])[0].why).toBe(
      `${cannot('tools/loader/plugins.mjs')} (with tools/alone/three.mjs, which the PR changes)`
    );
    expect(block(['tools/alone/three.mjs'], ['tools/alone/five.mjs'])[0].why).toContain(
      cannot('tools/loader/templ.mjs')
    );
    expect(block(['tools/alone/three.mjs'], ['tools/alone/six.mjs'])[0].why).toContain(
      cannot('tools/loader/broken.mjs')
    );
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

  it('blocks when a file cannot be read', () => {
    const blind = {
      files: root.files,
      read: (f: string) => (f === 'tools/report/make.ts' ? null : (tree[f] ?? null)),
    };
    expect(block(['scripts/lib/scope.mjs'], ['tools/report/make.ts'], blind)).toEqual([
      {
        file: 'tools/report/make.ts',
        why: 'tools/report/make.ts has an import that cannot be followed (with scripts/lib/scope.mjs, which the PR changes)',
      },
    ]);
  });

  it('still blocks global-impact files and leaves package files to the package rule', () => {
    expect(block(['scripts/lib/scope.mjs'], ['pnpm-lock.yaml', 'apps/web/src/x.tsx'])).toEqual([
      { file: 'pnpm-lock.yaml', why: 'global-impact file' },
    ]);
  });
});

describe('carryBlockers: the web app by its import graph', () => {
  const tree: Record<string, string> = {
    'apps/web/tsconfig.json': JSON.stringify({
      compilerOptions: {
        paths: { '@/*': ['./src/*'], '@intelliflow/ui': ['../../packages/ui/src'] },
      },
    }),
    'apps/web/src/app/leads/page.tsx': "import { LeadTable } from '@/components/lead-table';\n",
    'apps/web/src/app/leads/layout.tsx': 'export default function Layout() {}\n',
    'apps/web/src/components/lead-table.tsx':
      "import { fmt } from '../lib/fmt';\nimport { Button } from '@intelliflow/ui';\nimport './lead-table.css';\n",
    'apps/web/src/lib/fmt.ts': 'export const fmt = 1;\n',
    'apps/web/src/app/deals/page.tsx': "import { DealBoard } from '@/components/deal-board';\n",
    'apps/web/src/components/deal-board.tsx': 'export const DealBoard = 1;\n',
    'apps/web/src/components/a.tsx': 'export const A = 1;\n',
    'apps/web/src/components/b.tsx': 'export const B = 1;\n',
    'apps/web/src/components/__tests__/ab.test.tsx':
      "import { A } from '../a';\nimport { B } from '@/components/b';\n",
    'apps/web/src/app/settings/page.tsx': 'const load = (name) => import(name);\n',
    'apps/web/next.config.js': 'module.exports = {};\n',
    'apps/web/src/types/global.d.ts': 'declare const x: number;\n',
  };
  const files = [
    ...Object.keys(tree),
    'apps/web/src/components/lead-table.css',
    'apps/web/public/logo.svg',
  ];
  const root = { files, read: (f: string) => tree[f] ?? null };
  const block = (prFiles: string[], mainFiles: string[], r = root) =>
    carryBlockers({ prFiles, mainFiles, graph, root: r });

  it('carries past a web file nothing links to the PR, CSS imports included', () => {
    expect(
      block(
        ['apps/web/src/app/deals/page.tsx'],
        [
          'apps/web/src/components/lead-table.tsx',
          'apps/web/src/components/lead-table.css',
          'apps/web/src/lib/fmt.ts',
        ]
      )
    ).toEqual([]);
  });

  it('blocks a page that reaches the PR file, through an alias and a relative import', () => {
    expect(block(['apps/web/src/lib/fmt.ts'], ['apps/web/src/app/leads/page.tsx'])).toEqual([
      {
        file: 'apps/web/src/app/leads/page.tsx',
        why: 'apps/web/src/app/leads/page.tsx imports the other (with apps/web/src/lib/fmt.ts, which the PR changes)',
      },
    ]);
    expect(
      block(['apps/web/src/components/deal-board.tsx'], ['apps/web/src/app/deals/page.tsx'])
    ).toHaveLength(1);
  });

  it('blocks two components one test imports', () => {
    expect(block(['apps/web/src/components/b.tsx'], ['apps/web/src/components/a.tsx'])[0].why).toBe(
      'apps/web/src/components/__tests__/ab.test.tsx imports both (with apps/web/src/components/b.tsx, which the PR changes)'
    );
  });

  it('blocks a route wrapper over the PR page, either way round', () => {
    expect(
      block(['apps/web/src/app/leads/page.tsx'], ['apps/web/src/app/leads/layout.tsx'])[0].why
    ).toBe("apps/web/src/app/leads/layout.tsx wraps apps/web/src/app/leads/page.tsx's route");
    expect(
      block(['apps/web/src/app/leads/layout.tsx'], ['apps/web/src/app/leads/page.tsx'])
    ).toHaveLength(1);
    expect(
      block(['apps/web/src/app/deals/page.tsx'], ['apps/web/src/app/leads/layout.tsx'])
    ).toEqual([]);
  });

  it('blocks app-wide files and files it cannot trace', () => {
    const pr = ['apps/web/src/app/deals/page.tsx'];
    expect(block(pr, ['apps/web/next.config.js'])[0].why).toMatch(
      /next\.config\.js reaches every page/
    );
    expect(block(pr, ['apps/web/src/types/global.d.ts'])[0].why).toMatch(/reaches every page/);
    expect(block(pr, ['apps/web/public/logo.svg'])[0].why).toMatch(
      /cannot trace what loads apps\/web\/public\/logo\.svg/
    );
    expect(block(['apps/web/next.config.js'], ['apps/web/src/lib/fmt.ts'])).toHaveLength(1);
  });

  it('blocks a page with a computed load', () => {
    expect(
      block(['apps/web/src/app/deals/page.tsx'], ['apps/web/src/app/settings/page.tsx'])[0].why
    ).toMatch(/settings\/page\.tsx has an import that cannot be followed/);
  });

  it('keeps the package rule when the PR also changes a package the app depends on', () => {
    expect(
      block(
        ['apps/web/src/app/deals/page.tsx', 'packages/ui/src/button.tsx'],
        ['apps/web/src/lib/fmt.ts']
      )
    ).toEqual([{ file: 'apps/web/src/lib/fmt.ts', why: "in web, within the PR's affected scope" }]);
  });

  it('keeps the package rule when the app tsconfig cannot be read', () => {
    const blind = {
      files,
      read: (f: string) => (f.endsWith('tsconfig.json') ? '{oops' : (tree[f] ?? null)),
    };
    expect(block(['apps/web/src/app/deals/page.tsx'], ['apps/web/src/lib/fmt.ts'], blind)).toEqual([
      { file: 'apps/web/src/lib/fmt.ts', why: "in web, within the PR's affected scope" },
    ]);
  });

  it('reads root code, web code and the web tsconfig, nothing else', () => {
    expect(
      filesToRead([
        'scripts/a.mjs',
        'apps/web/src/a.tsx',
        'apps/web/tsconfig.json',
        'apps/web/src/a.css',
        'apps/api/src/b.ts',
        'docs/x.md',
      ])
    ).toEqual(['scripts/a.mjs', 'apps/web/src/a.tsx', 'apps/web/tsconfig.json']);
  });
});
