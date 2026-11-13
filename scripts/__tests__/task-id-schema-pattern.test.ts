/**
 * The task_id pattern in the metrics schemas must accept every real task ID.
 *
 * It was ^[A-Z]+-[A-Z0-9-]+$, which rejected every remediation sub-row
 * (ENG-OPS-002.R03, ENG-OPS-003.Gap12-E2EAPIServerHarness) and A11Y-REVIEW-001,
 * so their attestations could never validate (found 2026-11-12). This test
 * reads the pattern from each schema file, so a regression in any of them fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_DIR = path.join(ROOT, 'apps/project-tracker/docs/metrics/schemas');

/** [schema file, JSON path to the task-id property's pattern]. */
const SCHEMAS: Array<[string, string[]]> = [
  ['attestation.schema.json', ['properties', 'task_id', 'pattern']],
  ['task-status.schema.json', ['properties', 'task_id', 'pattern']],
  ['task-tracking.schema.json', ['properties', 'task_id', 'pattern']],
];

function patternOf(file: string, at: string[]): RegExp {
  let node: unknown = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8'));
  for (const key of at) node = (node as Record<string, unknown>)[key];
  expect(typeof node).toBe('string');
  return new RegExp(node as string);
}

function csvTaskIds(): string[] {
  const csv = fs.readFileSync(
    path.join(ROOT, 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'),
    'utf8'
  );
  // The Task ID is the first field of each record and never needs quoting.
  return csv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => /^([A-Za-z0-9.-]+),/.exec(line)?.[1])
    .filter((id): id is string => Boolean(id));
}

function attestationDirs(): string[] {
  const sprints = path.join(ROOT, '.specify/sprints');
  return fs
    .readdirSync(sprints)
    .map((s) => path.join(sprints, s, 'attestations'))
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()))
    .map((e) => e.name);
}

describe.each(SCHEMAS)('%s task_id pattern', (file, at) => {
  const pattern = patternOf(file, at);

  it('accepts every Task ID in Sprint_plan.csv', () => {
    const ids = csvTaskIds();
    expect(ids.length).toBeGreaterThan(500);
    expect(ids.filter((id) => !pattern.test(id))).toEqual([]);
  });

  it('accepts every attestation folder name', () => {
    expect(attestationDirs().filter((id) => !pattern.test(id))).toEqual([]);
  });

  it.each([
    'ENG-OPS-002.R03',
    'ENG-OPS-002.R16',
    'ENG-OPS-003.Gap12-E2EAPIServerHarness',
    'A11Y-REVIEW-001',
    'IFC-001',
    'ENV-002-AI',
  ])('accepts %s', (id) => {
    expect(pattern.test(id)).toBe(true);
  });

  it.each([
    'eng-ops-002',
    'ENG',
    'ENG-OPS-002.',
    'ENG-OPS-002..R1',
    'ENG-OPS-002.R03 ',
    '1ENG-001',
    'ENG-OPS-002/R03',
  ])('rejects %j', (id) => {
    expect(pattern.test(id)).toBe(false);
  });
});

describe('R-row attestations validate on task_id', () => {
  const pattern = patternOf('attestation.schema.json', ['properties', 'task_id', 'pattern']);

  it.each(['ENG-OPS-002.R03', 'ENG-OPS-002.R13', 'ENG-OPS-002.R16'])('%s', (id) => {
    const file = path.join(ROOT, '.specify/sprints/sprint-19/attestations', id, 'attestation.json');
    const att = JSON.parse(fs.readFileSync(file, 'utf8')) as { task_id: string };
    expect(att.task_id).toBe(id);
    expect(pattern.test(att.task_id)).toBe(true);
  });
});
