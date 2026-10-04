/**
 * Tests for scripts/docker/verify-workspace-runtime.mjs — the API image's check
 * that every @intelliflow package it imports at runtime is present and built
 * (the #742 partner-sdk packaging failure). Fixtures are throwaway directory
 * trees shaped like the image: an app dir whose node_modules links to packages.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  verify,
  declaredEntries,
  importedWorkspacePackages,
  importedWorkspaceSpecifiers,
  subpathTargets,
} from '../docker/verify-workspace-runtime.mjs';

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../docker/verify-workspace-runtime.mjs'
);

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function put(file: string, body: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

/** Link `<fromDir>/node_modules/<name>` to `<target>` (a junction on Windows). */
function link(fromDir: string, name: string, target: string) {
  const at = path.join(fromDir, 'node_modules', name);
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(target, at, 'junction');
}

/**
 * app imports @intelliflow/a; a imports @intelliflow/b. `built` controls whether
 * b's dist exists, `linkB` whether a can resolve b at all.
 */
function fixture({ built = true, linkB = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-ws-'));
  roots.push(root);
  const app = path.join(root, 'apps/api');
  const a = path.join(root, 'packages/a');
  const b = path.join(root, 'packages/b');

  put(path.join(app, 'dist/main.js'), `import { a } from "@intelliflow/a";\nconsole.log(a);\n`);
  put(
    path.join(a, 'package.json'),
    JSON.stringify({ name: '@intelliflow/a', main: './dist/index.js' })
  );
  put(path.join(a, 'dist/index.js'), `export * from '@intelliflow/b';\n`);
  put(
    path.join(b, 'package.json'),
    JSON.stringify({
      name: '@intelliflow/b',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          import: './dist/index.mjs',
          require: './dist/index.cjs',
        },
      },
    })
  );
  if (built) {
    put(path.join(b, 'dist/index.mjs'), 'export const b = 1;\n');
    put(path.join(b, 'dist/index.cjs'), 'exports.b = 1;\n');
  }
  link(app, '@intelliflow/a', a);
  if (linkB) link(a, '@intelliflow/b', b);
  return { root, app, dist: path.join(app, 'dist') };
}

describe('importedWorkspacePackages', () => {
  it('finds static, dynamic, require and re-export specifiers, including subpaths', () => {
    const src = [
      `import x from "@intelliflow/one";`,
      `const y = await import('@intelliflow/two');`,
      `const z = require("@intelliflow/three/sub/path");`,
      `export * from '@intelliflow/four';`,
      `import other from "lodash";`,
    ].join('\n');
    expect([...importedWorkspacePackages(src)].sort()).toEqual([
      '@intelliflow/four',
      '@intelliflow/one',
      '@intelliflow/three',
      '@intelliflow/two',
    ]);
  });
});

describe('declaredEntries', () => {
  it('collects every runtime condition and ignores type declarations', () => {
    expect(
      declaredEntries({
        main: './dist/index.cjs',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            import: './dist/index.mjs',
            require: './dist/index.cjs',
          },
          './package.json': './package.json',
        },
      }).sort()
    ).toEqual(['./dist/index.cjs', './dist/index.mjs']);
  });

  it('accepts a string exports field', () => {
    expect(declaredEntries({ exports: './dist/index.js' })).toEqual(['./dist/index.js']);
  });
});

describe('verify', () => {
  it('passes when the whole runtime closure resolves and is built', () => {
    const { app, dist } = fixture();
    const r = verify(app, dist);
    expect(r.problems).toEqual([]);
    expect(r.checked).toEqual(['@intelliflow/a', '@intelliflow/b']);
  });

  it('reports a transitive package whose build output is missing (the #742 shape)', () => {
    const { app, dist } = fixture({ built: false });
    const r = verify(app, dist);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/@intelliflow\/b: entry file\(s\) missing/);
  });

  it('reports a package the importer cannot resolve at all', () => {
    const { app, dist } = fixture({ linkB: false });
    const r = verify(app, dist);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/@intelliflow\/b: not resolvable/);
  });
});

describe('CLI', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

  it('exits 0 on a complete image', () => {
    const { app, dist } = fixture();
    const r = run(app, dist);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('all 2 workspace import(s) resolve and are built');
  });

  it('exits 1 and names the missing package', () => {
    const { app, dist } = fixture({ built: false });
    const r = run(app, dist);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('@intelliflow/b');
  });

  it('exits 1 when the dist directory holds no build output', () => {
    const { app } = fixture();
    const r = run(app, path.join(app, 'nothing-here'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('nothing was built');
  });

  it('exits 2 on a usage error', () => {
    expect(run().status).toBe(2);
  });
});

// ─── subpath imports (Copilot review on #754) ─────────────────────────────
// The API imports subpaths such as @intelliflow/validators/required-url. Their
// export entries resolve separately from the root, so a root that exists says
// nothing about them.

/** app imports @intelliflow/c (root) and @intelliflow/c/<subpath>. */
function subpathFixture({
  exportsMap = {
    '.': { import: './dist/index.mjs' },
    './required-url': { import: './dist/required-url.mjs' },
    './queues/*': { import: './dist/queues/*.mjs' },
  } as Record<string, unknown> | null,
  subpath = 'required-url',
  files = ['dist/index.mjs', 'dist/required-url.mjs'],
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-ws-sub-'));
  roots.push(root);
  const app = path.join(root, 'apps/api');
  const c = path.join(root, 'packages/c');
  put(
    path.join(app, 'dist/main.js'),
    `import { c } from "@intelliflow/c";\nimport { u } from "@intelliflow/c/${subpath}";\n`
  );
  put(
    path.join(c, 'package.json'),
    JSON.stringify(
      exportsMap
        ? { name: '@intelliflow/c', exports: exportsMap }
        : { name: '@intelliflow/c', main: './dist/index.mjs' }
    )
  );
  for (const f of files) put(path.join(c, f), 'export const x = 1;\n');
  link(app, '@intelliflow/c', c);
  return { app, dist: path.join(app, 'dist') };
}

describe('verify — subpath imports', () => {
  it('checks the subpath entry, not just the root', () => {
    const { app, dist } = subpathFixture();
    const r = verify(app, dist);
    expect(r.problems).toEqual([]);
    expect(r.checked).toEqual(['@intelliflow/c', '@intelliflow/c/required-url']);
  });

  it('reports a missing subpath entry even when the root entry is intact', () => {
    const { app, dist } = subpathFixture({ files: ['dist/index.mjs'] });
    const r = verify(app, dist);
    expect(r.checked).toEqual(['@intelliflow/c']);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/@intelliflow\/c\/required-url: entry file\(s\) missing/);
  });

  it('reports a subpath the exports map does not export', () => {
    const { app, dist } = subpathFixture({ subpath: 'not-exported' });
    const r = verify(app, dist);
    expect(r.problems[0]).toMatch(/c\/not-exported: subpath is not in the package's exports map/);
  });

  it('resolves ./* export patterns and checks the substituted file', () => {
    const ok = subpathFixture({
      subpath: 'queues/types',
      files: ['dist/index.mjs', 'dist/queues/types.mjs'],
    });
    expect(verify(ok.app, ok.dist).problems).toEqual([]);
    const bad = subpathFixture({ subpath: 'queues/types', files: ['dist/index.mjs'] });
    expect(verify(bad.app, bad.dist).problems[0]).toMatch(/dist\/queues\/types\.mjs/);
  });

  it('without an exports map, resolves the subpath as a file like Node does', () => {
    const ok = subpathFixture({
      exportsMap: null,
      subpath: 'seed-ids',
      files: ['dist/index.mjs', 'seed-ids.js'],
    });
    expect(verify(ok.app, ok.dist).problems).toEqual([]);
    const bad = subpathFixture({
      exportsMap: null,
      subpath: 'seed-ids',
      files: ['dist/index.mjs'],
    });
    expect(verify(bad.app, bad.dist).problems[0]).toMatch(/c\/seed-ids: no file for this subpath/);
  });
});

describe('subpathTargets', () => {
  it('returns null without an exports map and [] for a conditions-only map', () => {
    expect(subpathTargets({ main: './x.js' }, 'a')).toBeNull();
    expect(subpathTargets({ exports: { import: './x.mjs' } }, 'a')).toEqual([]);
  });
});

describe('importedWorkspaceSpecifiers', () => {
  it('keeps the subpath of each import', () => {
    const src = `import a from "@intelliflow/v/required-url";\nimport b from '@intelliflow/v';`;
    expect(importedWorkspaceSpecifiers(src)).toEqual([
      { name: '@intelliflow/v', subpath: 'required-url' },
      { name: '@intelliflow/v', subpath: '' },
    ]);
  });
});

describe('importedWorkspaceSpecifiers — side-effect imports (code review on #754)', () => {
  it('catches bare and minified side-effect imports', () => {
    const src = `import "@intelliflow/obs/instrument";\nimport"@intelliflow/reg";`;
    expect(importedWorkspaceSpecifiers(src)).toEqual([
      { name: '@intelliflow/obs', subpath: 'instrument' },
      { name: '@intelliflow/reg', subpath: '' },
    ]);
  });

  it('verify() fails an image whose only reference is a side-effect import of an unbuilt package', () => {
    const { app, dist } = fixture({ built: false });
    // Replace the static import with a bare side-effect import of b via a.
    fs.writeFileSync(path.join(app, 'dist/main.js'), `import "@intelliflow/a";\n`);
    const r = verify(app, dist);
    expect(r.problems.some((p) => p.includes('@intelliflow/b'))).toBe(true);
  });
});

describe('round-2 review regressions', () => {
  it('sees an import with a comment inside the parentheses', () => {
    const src = `await import(/* webpackIgnore: true */ '@intelliflow/partner-sdk');`;
    expect(importedWorkspaceSpecifiers(src)).toEqual([
      { name: '@intelliflow/partner-sdk', subpath: '' },
    ]);
  });

  it('ignores an import inside a single-line block comment', () => {
    expect(importedWorkspaceSpecifiers(`/* require("@intelliflow/old") */ const x = 1;`)).toEqual(
      []
    );
  });

  it("does not lose an import that follows a '/*' inside a string", () => {
    const src = `const glob = "apps/*/dist";
import { s } from "@intelliflow/partner-sdk";
const y = "*/";`;
    expect(importedWorkspaceSpecifiers(src)).toEqual([
      { name: '@intelliflow/partner-sdk', subpath: '' },
    ]);
  });

  it("sees esbuild's __require(...)", () => {
    expect(importedWorkspaceSpecifiers(`var x = __require("@intelliflow/db");`)).toEqual([
      { name: '@intelliflow/db', subpath: '' },
    ]);
  });

  it('only requires targets behind runtime conditions', () => {
    expect(
      declaredEntries({
        exports: {
          '.': {
            types: './dist/index.d.ts',
            browser: './dist/browser.js',
            development: './src/index.ts',
            import: './dist/index.mjs',
            require: './dist/index.cjs',
          },
        },
      }).sort()
    ).toEqual(['./dist/index.cjs', './dist/index.mjs']);
  });
});

describe('round-3 review regressions', () => {
  it('requires a node-addons target, which Node can select at runtime', () => {
    expect(
      declaredEntries({
        exports: { '.': { 'node-addons': './dist/native.js', default: './dist/fallback.js' } },
      }).sort()
    ).toEqual(['./dist/fallback.js', './dist/native.js']);
  });

  it('follows imports inside a TypeScript runtime entry (tsx images)', () => {
    const { app, dist } = fixture({ built: false });
    // a's entry becomes TypeScript; its import of unbuilt b must still be found.
    const aDir = fs.realpathSync(path.join(app, 'node_modules/@intelliflow/a'));
    fs.writeFileSync(
      path.join(aDir, 'package.json'),
      JSON.stringify({ name: '@intelliflow/a', main: './src/index.ts' })
    );
    put(path.join(aDir, 'src/index.ts'), `export * from '@intelliflow/b';\n`);
    const r = verify(app, dist);
    expect(r.problems.some((p) => p.includes('@intelliflow/b'))).toBe(true);
  });
});

describe('round-4 review regressions', () => {
  it('ignores whole-line // comments', () => {
    expect(
      importedWorkspaceSpecifiers(`  // require("@intelliflow/missing")\nconst x = 1;`)
    ).toEqual([]);
  });

  it('a package whose entry is at its root is scanned shallowly, without tests', () => {
    const { app, dist } = fixture();
    const aDir = fs.realpathSync(path.join(app, 'node_modules/@intelliflow/a'));
    fs.writeFileSync(
      path.join(aDir, 'package.json'),
      JSON.stringify({ name: '@intelliflow/a', main: './index.js' })
    );
    put(path.join(aDir, 'index.js'), `export * from '@intelliflow/b';\n`);
    // Never loaded at runtime: a nested tool script and a root-level test.
    put(path.join(aDir, 'scripts/seed.js'), `import "@intelliflow/never-built";\n`);
    put(path.join(aDir, 'a.test.js'), `import "@intelliflow/test-only";\n`);
    const r = verify(app, dist);
    expect(r.problems).toEqual([]);
    expect(r.checked).toEqual(['@intelliflow/a', '@intelliflow/b']);
  });
});

describe('round-6 review regressions', () => {
  it.each([
    `import(/** webpackChunkName: "x" */ '@intelliflow/foo')`,
    `import(/* a */ /* b */ '@intelliflow/foo')`,
  ])('sees an import with comments inside the parentheses: %s', (src) => {
    expect(importedWorkspaceSpecifiers(src)).toEqual([{ name: '@intelliflow/foo', subpath: '' }]);
  });

  it('ignores JSDoc example imports in TypeScript sources', () => {
    const src = `/**\n * @example\n * import { x } from '@intelliflow/observability';\n */\nexport const y = 1;`;
    expect(importedWorkspaceSpecifiers(src)).toEqual([]);
  });
});

describe('round-6 adversarial regressions', () => {
  it('sees an import whose comment spans several lines inside import(...)', () => {
    const src = `await import(/* webpackIgnore: true\n * keep external\n */ '@intelliflow/partner-sdk');`;
    expect(importedWorkspaceSpecifiers(src)).toEqual([
      { name: '@intelliflow/partner-sdk', subpath: '' },
    ]);
  });

  it('sees require() with a line comment before the string', () => {
    const src = `const x = require(\n  // why\n  '@intelliflow/db/seed-ids'\n);`;
    expect(importedWorkspaceSpecifiers(src)).toEqual([
      { name: '@intelliflow/db', subpath: 'seed-ids' },
    ]);
  });
});
