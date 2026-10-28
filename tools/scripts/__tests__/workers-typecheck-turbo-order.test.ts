import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #1048: the @intelliflow/workers aggregate typechecks its sub-workers through
// `pnpm --filter`, which turbo cannot see. Each one must therefore be listed
// as a `<pkg>#build` dependency in apps/workers/turbo.json; otherwise turbo
// runs the typecheck while @intelliflow/api is still emitting its .d.ts and
// combined-worker fails with TS7016 on @intelliflow/api/dist/background-jobs.js.

const root = join(__dirname, '..', '..', '..');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), 'utf8')) as T;

const workersPkg = readJson<{ scripts: Record<string, string> }>('apps/workers/package.json');
const workersTurbo = readJson<{ tasks: Record<string, { dependsOn?: string[] }> }>(
  'apps/workers/turbo.json'
);
const combinedPkg = readJson<{ dependencies?: Record<string, string> }>(
  'apps/workers/combined-worker/package.json'
);
const apiPkg = readJson<{
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}>('apps/api/package.json');

function filteredPackages(script: string): string[] {
  return [...script.matchAll(/--filter\s+(@intelliflow\/[\w-]+)/g)].map((m) => m[1]);
}

describe('@intelliflow/workers typecheck runs after the builds it reads (#1048)', () => {
  const typecheckScript = workersPkg.scripts['typecheck'] ?? '';
  const subWorkers = filteredPackages(typecheckScript);
  const dependsOn = workersTurbo.tasks['typecheck']?.dependsOn ?? [];

  it('typechecks the three sub-workers, combined-worker included', () => {
    expect(subWorkers).toEqual(
      expect.arrayContaining([
        '@intelliflow/events-worker',
        '@intelliflow/ingestion-worker',
        '@intelliflow/combined-worker',
      ])
    );
  });

  it.each(subWorkers)('waits for %s#build before typechecking it', (pkg) => {
    expect(dependsOn).toContain(`${pkg}#build`);
  });

  it('combined-worker declares @intelliflow/api, so its build waits for the api build', () => {
    expect(combinedPkg.dependencies?.['@intelliflow/api']).toBe('workspace:*');
  });

  it('the api depends on neither combined-worker nor the aggregate (no cycle)', () => {
    const apiDeps = Object.keys({ ...apiPkg.dependencies, ...apiPkg.devDependencies });
    expect(apiDeps).not.toContain('@intelliflow/combined-worker');
    expect(apiDeps).not.toContain('@intelliflow/workers');
  });
});
