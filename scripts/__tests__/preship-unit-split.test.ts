/**
 * The pre-ship `unit-tests` step runs only UNIT_ONLY_PROJECTS when `coverage`
 * will run, because scripts/run-coverage.js already runs (and fails the gate
 * on) every other unit project. That is only safe while the two lists together
 * cover every project `test:unit` runs. This guards both directions:
 *
 *   - every unit project is run by one of them (nothing silently dropped), and
 *   - no project is run by both, and every name listed is a real project (a
 *     renamed project must not leave a dead entry that hides a gap).
 *
 * Read from source text, because importing pre-ship.mjs would run the gate.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Project names of the root vitest workspace that `test:unit` runs. */
function unitProjects(): string[] {
  const config = read('vitest.config.ts');
  const block = config.slice(config.indexOf('projects: ['));
  const names: string[] = [];
  for (const m of block.matchAll(/'([^']+\/vitest\.config\.ts)'/g)) {
    const sub = read(m[1]!);
    const name = /name:\s*'([^']+)'/.exec(sub)?.[1];
    if (name) names.push(name);
  }
  for (const m of block.matchAll(/name:\s*'([^']+)'/g)) names.push(m[1]!);
  // `test:unit` is `vitest run --project=!integration`.
  return [...new Set(names)].filter((n) => n !== 'integration');
}

function coverageProjects(): string[] {
  const src = read('scripts/run-coverage.js');
  const start = src.indexOf('const PROJECTS = [');
  const list = start === -1 ? '' : src.slice(start, src.indexOf('];', start));
  return list
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith("'") && line.endsWith("',"))
    .map((line) => line.slice(1, -2));
}

function unitOnlyProjects(): string[] {
  const src = read('scripts/pre-ship.mjs');
  const list = /UNIT_ONLY_PROJECTS = \[([^\]]*)\]/.exec(src)?.[1] ?? '';
  return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

describe('pre-ship unit-tests / coverage split', () => {
  const unit = unitProjects();
  const coverage = coverageProjects();
  const unitOnly = unitOnlyProjects();

  it('reads non-empty lists (the parsers still match the sources)', () => {
    expect(unit.length).toBeGreaterThan(10);
    expect(coverage.length).toBeGreaterThan(10);
    expect(unitOnly.length).toBeGreaterThan(0);
  });

  it('runs every unit project in either coverage or unit-tests', () => {
    const covered = new Set([...coverage, ...unitOnly]);
    expect(unit.filter((p) => !covered.has(p))).toEqual([]);
  });

  it('never runs a project in both', () => {
    expect(unitOnly.filter((p) => coverage.includes(p))).toEqual([]);
  });

  it('lists only real unit projects in UNIT_ONLY_PROJECTS', () => {
    expect(unitOnly.filter((p) => !unit.includes(p))).toEqual([]);
  });
});
