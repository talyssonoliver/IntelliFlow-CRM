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
    expect(r.stdout).toContain('all 2 workspace package(s) resolve and are built');
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
