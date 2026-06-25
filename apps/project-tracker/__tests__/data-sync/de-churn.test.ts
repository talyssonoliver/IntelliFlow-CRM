/**
 * Regression tests for the sprint-metrics write cascade (ADR-066).
 *
 * Before the fix, a sync over the per-task JSON tree rewrote every file on every
 * run — `writeJsonFile` always wrote, and `applyDependencySatisfied` re-stamped
 * `verified_at = new Date()` each time. A one-line CSV change produced a
 * hundreds-of-files diff and amplified PR merge conflicts. These tests lock in
 * the two de-churn levers:
 *   1. writeJsonFile is skip-if-unchanged (byte-identical content → no write).
 *   2. updateIndividualTaskFile is idempotent for an unchanged task (no churn),
 *      yet still re-stamps verified_at when the dependency state actually changes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeJsonFile, writeJsonFileStable } from '../../lib/data-sync/file-io';
import {
  updateIndividualTaskFile,
  buildIndividualTaskFile,
} from '../../lib/data-sync/task-json-updater';
import type { TaskRecord } from '../../lib/data-sync/types';

let workDir: string;

// A timestamp safely in the past so "was the file rewritten?" is observable:
// skip-if-unchanged leaves mtime untouched; a real write bumps it to ~now.
const PAST = new Date('2020-01-01T00:00:00.000Z');
const backdate = (path: string) => utimesSync(path, PAST, PAST);
const mtimeMs = (path: string) => statSync(path).mtimeMs;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'dechurn-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('writeJsonFile — skip-if-unchanged (ADR-066)', () => {
  it('does not rewrite the file when serialized content is identical', () => {
    const file = join(workDir, 'sample.json');
    const data = { a: 1, nested: { b: [2, 3] } };

    writeJsonFile(file, data);
    backdate(file);
    const before = mtimeMs(file);

    writeJsonFile(file, { a: 1, nested: { b: [2, 3] } }); // identical content

    expect(mtimeMs(file)).toBe(before); // untouched → no write happened
  });

  it('writes when content differs', () => {
    const file = join(workDir, 'sample.json');
    writeJsonFile(file, { a: 1 });
    backdate(file);
    const before = mtimeMs(file);

    writeJsonFile(file, { a: 2 });

    expect(mtimeMs(file)).toBeGreaterThan(before);
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ a: 2 });
  });

  it('emits a trailing newline (formatting contract preserved)', () => {
    const file = join(workDir, 'sample.json');
    writeJsonFile(file, { a: 1 });
    expect(readFileSync(file, 'utf-8').endsWith('}\n')).toBe(true);
  });
});

describe('writeJsonFileStable — carry forward volatile keys (ADR-066)', () => {
  it('preserves the prior volatile value when every other field is unchanged', () => {
    const file = join(workDir, 'graph.json');
    writeJsonFile(file, { last_updated: '2025-01-01T00:00:00.000Z', nodes: { a: 1 } });
    backdate(file);
    const before = mtimeMs(file);

    // Same payload, fresh stamp — should be treated as a no-op.
    writeJsonFileStable(file, { last_updated: '2026-06-14T12:00:00.000Z', nodes: { a: 1 } }, [
      'last_updated',
    ]);

    const out = JSON.parse(readFileSync(file, 'utf-8'));
    expect(out.last_updated).toBe('2025-01-01T00:00:00.000Z'); // carried forward
    expect(mtimeMs(file)).toBe(before); // and not rewritten
  });

  it('writes (and keeps the new stamp) when a non-volatile field changes', () => {
    const file = join(workDir, 'graph.json');
    writeJsonFile(file, { last_updated: '2025-01-01T00:00:00.000Z', nodes: { a: 1 } });
    backdate(file);

    writeJsonFileStable(file, { last_updated: '2026-06-14T12:00:00.000Z', nodes: { a: 2 } }, [
      'last_updated',
    ]);

    const out = JSON.parse(readFileSync(file, 'utf-8'));
    expect(out.last_updated).toBe('2026-06-14T12:00:00.000Z'); // refreshed
    expect(out.nodes).toEqual({ a: 2 });
  });

  it('writes a fresh file (with its stamp) when none exists yet', () => {
    const file = join(workDir, 'new.json');
    writeJsonFileStable(file, { last_updated: '2026-06-14T12:00:00.000Z', nodes: {} }, [
      'last_updated',
    ]);
    expect(JSON.parse(readFileSync(file, 'utf-8')).last_updated).toBe('2026-06-14T12:00:00.000Z');
  });
});

describe('updateIndividualTaskFile — idempotent for an unchanged task (ADR-066)', () => {
  // Minimal but realistic DONE task: completed_at already set (so completion
  // timestamps don't re-derive), one satisfied dependency, validations present.
  const seedTaskFile = (): string => {
    const sprintDir = join(workDir, 'sprint-0', 'phase-1');
    mkdirSync(sprintDir, { recursive: true });
    const file = join(sprintDir, 'SAMPLE-001.json');
    writeJsonFile(file, {
      task_id: 'SAMPLE-001',
      status: 'DONE',
      description: 'Sample task',
      started_at: '2025-12-01T00:00:00.000Z',
      completed_at: '2025-12-01T00:15:00.000Z',
      target_duration_minutes: 15,
      actual_duration_minutes: 15,
      dependencies: {
        required: ['DEP-1'],
        all_satisfied: true,
        verified_at: '2025-12-01T00:00:00.000Z',
      },
      dependencies_resolved: ['DEP-1'],
      artifacts: { expected: [], created: [], missing: [] },
      validations: [{ name: 'x', passed: true, exit_code: 0 }],
    });
    return file;
  };

  const task: TaskRecord = {
    'Task ID': 'SAMPLE-001',
    Status: 'Completed',
    Description: 'Sample task',
    Dependencies: 'DEP-1',
  };
  const depDone: TaskRecord = { 'Task ID': 'DEP-1', Status: 'Completed' };
  const depPending: TaskRecord = { 'Task ID': 'DEP-1', Status: 'In Progress' };

  it('produces no file change on a second identical sync', () => {
    const file = seedTaskFile();

    updateIndividualTaskFile(task, workDir, [task, depDone], 0);
    const first = readFileSync(file, 'utf-8');
    backdate(file);
    const before = mtimeMs(file);

    updateIndividualTaskFile(task, workDir, [task, depDone], 0);

    expect(readFileSync(file, 'utf-8')).toBe(first); // byte-identical
    expect(mtimeMs(file)).toBe(before); // and not rewritten
  });

  it('keeps verified_at stable across syncs when dependency state is unchanged', () => {
    const file = seedTaskFile();

    updateIndividualTaskFile(task, workDir, [task, depDone], 0);
    const a = JSON.parse(readFileSync(file, 'utf-8')).dependencies.verified_at;
    updateIndividualTaskFile(task, workDir, [task, depDone], 0);
    const b = JSON.parse(readFileSync(file, 'utf-8')).dependencies.verified_at;

    expect(b).toBe(a);
  });

  it('still re-stamps verified_at when the dependency state actually changes', () => {
    const file = seedTaskFile();

    updateIndividualTaskFile(task, workDir, [task, depDone], 0);
    const satisfied = JSON.parse(readFileSync(file, 'utf-8'));
    expect(satisfied.dependencies.all_satisfied).toBe(true);

    updateIndividualTaskFile(task, workDir, [task, depPending], 0);
    const changed = JSON.parse(readFileSync(file, 'utf-8'));

    expect(changed.dependencies.all_satisfied).toBe(false);
    expect(changed.dependencies.verified_at).not.toBe(satisfied.dependencies.verified_at);
  });
});

describe('buildIndividualTaskFile — rebuild from CSV + task-tracking (ADR-067 Phase 2)', () => {
  const task: TaskRecord = {
    'Task ID': 'SAMPLE-002',
    Status: 'Completed',
    Description: 'Phase 2 sample',
    Section: 'Core',
    Owner: 'Backend',
    Dependencies: 'DEP-1',
  };
  const depDone: TaskRecord = { 'Task ID': 'DEP-1', Status: 'Completed' };

  // findRepoRoot() walks up for a `.git` marker; create one so it resolves to the temp dir
  // (otherwise it would escape to the real repo root and read the real .specify).
  const seedTaskTracking = (sprint: number): string => {
    mkdirSync(join(workDir, '.git'), { recursive: true });
    const ttDir = join(
      workDir,
      '.specify',
      'sprints',
      `sprint-${sprint}`,
      'attestations',
      'SAMPLE-002'
    );
    mkdirSync(ttDir, { recursive: true });
    writeJsonFile(join(ttDir, 'task-tracking.json'), {
      task_id: 'SAMPLE-002',
      started_at: '2026-01-01T00:00:00.000Z',
      status_history: [{ status: 'In Progress', at: '2026-01-01T00:00:00.000Z' }],
      target_duration_minutes: 30,
      dependencies_meta: { verified_at: '2026-01-01T00:00:00.000Z' },
      kpis: { cov: { target: '90%', actual: '92%', met: true } },
    });
    return join(workDir, 'metrics', `sprint-${sprint}`, 'SAMPLE-002.json');
  };

  it('merges CSV-derived fields over the verbatim operational content from task-tracking', () => {
    const out = seedTaskTracking(0);
    buildIndividualTaskFile(task, join(workDir, 'metrics'), [task, depDone], 0);

    const json = JSON.parse(readFileSync(out, 'utf-8'));
    // CSV-derived (authoritative)
    expect(json.status).toBe('DONE');
    expect(json.description).toBe('Phase 2 sample');
    expect(json.dependencies.required).toEqual(['DEP-1']);
    expect(json.dependencies.all_satisfied).toBe(true);
    expect(json.dependencies_resolved).toEqual(['DEP-1']);
    // operational/evidence (verbatim from task-tracking)
    expect(json.started_at).toBe('2026-01-01T00:00:00.000Z');
    expect(json.target_duration_minutes).toBe(30);
    expect(json.kpis.cov.actual).toBe('92%');
    expect(json.dependencies.verified_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('falls back to the record sprint when the CSV sprint has no record (misfiled task)', () => {
    const out = seedTaskTracking(7); // record lives under sprint-7 only
    // pass a different sprintNum (5) with no record there — must fall back to the record's sprint (7)
    buildIndividualTaskFile(task, join(workDir, 'metrics'), [task, depDone], 5);
    expect(JSON.parse(readFileSync(out, 'utf-8')).sprint).toBe('sprint-7');
  });

  it('prefers the CSV Target Sprint record when the task exists in two sprint dirs', () => {
    mkdirSync(join(workDir, '.git'), { recursive: true });
    // Same task_id with records in BOTH sprint-6 (CSV) and sprint-14 (stale dup) — distinguishable.
    for (const [sprint, marker] of [
      [6, 'csv-sprint-record'],
      [14, 'other-sprint-record'],
    ] as const) {
      const d = join(
        workDir,
        '.specify',
        'sprints',
        `sprint-${sprint}`,
        'attestations',
        'SAMPLE-002'
      );
      mkdirSync(d, { recursive: true });
      writeJsonFile(join(d, 'task-tracking.json'), {
        task_id: 'SAMPLE-002',
        notes: marker,
        status_history: [],
      });
    }
    // CSV Target Sprint = 6 must win regardless of readdirSync order ('sprint-14' < 'sprint-6').
    buildIndividualTaskFile(task, join(workDir, 'metrics'), [task, depDone], 6);
    const out = JSON.parse(
      readFileSync(join(workDir, 'metrics', 'sprint-6', 'SAMPLE-002.json'), 'utf-8')
    );
    expect(out.sprint).toBe('sprint-6');
    expect(out.notes).toBe('csv-sprint-record');
  });

  it('lets a VALID record win over a corrupt sibling in another sprint (fallback scan)', () => {
    mkdirSync(join(workDir, '.git'), { recursive: true });
    // CSV sprint (0) has no record; a corrupt copy sits at sprint-3 (scanned first), valid at sprint-9.
    const corruptDir = join(
      workDir,
      '.specify',
      'sprints',
      'sprint-3',
      'attestations',
      'SAMPLE-002'
    );
    const validDir = join(workDir, '.specify', 'sprints', 'sprint-9', 'attestations', 'SAMPLE-002');
    mkdirSync(corruptDir, { recursive: true });
    mkdirSync(validDir, { recursive: true });
    writeFileSync(join(corruptDir, 'task-tracking.json'), '{ broken json ');
    writeJsonFile(join(validDir, 'task-tracking.json'), { task_id: 'SAMPLE-002', notes: 'valid' });

    buildIndividualTaskFile(task, join(workDir, 'metrics'), [task, depDone], 0);
    const json = JSON.parse(
      readFileSync(join(workDir, 'metrics', 'sprint-9', 'SAMPLE-002.json'), 'utf-8')
    );
    expect(json.notes).toBe('valid'); // the corrupt sibling did not mask the valid record
  });

  it('collapses a pre-existing legacy phase-* duplicate to exactly one flat file', () => {
    const out = seedTaskTracking(0);
    // simulate a leftover legacy copy from the old tracked tree
    const phaseDir = join(workDir, 'metrics', 'sprint-0', 'phase-1');
    mkdirSync(phaseDir, { recursive: true });
    writeJsonFile(join(phaseDir, 'SAMPLE-002.json'), { task_id: 'SAMPLE-002', stale: true });

    buildIndividualTaskFile(task, join(workDir, 'metrics'), [task, depDone], 0);

    expect(existsSync(out)).toBe(true); // flat file written
    expect(existsSync(join(phaseDir, 'SAMPLE-002.json'))).toBe(false); // legacy duplicate removed
  });

  it('throws "not found" for a backlog task with no task-tracking record', () => {
    mkdirSync(join(workDir, '.git'), { recursive: true });
    const backlog: TaskRecord = { 'Task ID': 'NOPE-001', Status: 'Backlog' };
    expect(() => buildIndividualTaskFile(backlog, join(workDir, 'metrics'), [backlog], 0)).toThrow(
      /not found/
    );
  });

  it('never lets a stale CSV-derived key in task-tracking clobber the CSV source of truth', () => {
    mkdirSync(join(workDir, '.git'), { recursive: true });
    const ttDir = join(workDir, '.specify', 'sprints', 'sprint-0', 'attestations', 'SAMPLE-002');
    mkdirSync(ttDir, { recursive: true });
    // A task-tracking.json that wrongly retained CSV-derived fields (stale / hand-edited).
    writeJsonFile(join(ttDir, 'task-tracking.json'), {
      task_id: 'SAMPLE-002',
      status: 'BLOCKED', // stale — CSV says Completed
      section: 'WrongSection', // stale — CSV says Core
      owner: 'WrongOwner',
      dependencies: { required: ['STALE'], all_satisfied: false }, // stale
      dependencies_resolved: ['STALE'],
      notes: 'keep me', // operational — must survive
    });

    buildIndividualTaskFile(task, join(workDir, 'metrics'), [task, depDone], 0);
    const json = JSON.parse(
      readFileSync(join(workDir, 'metrics', 'sprint-0', 'SAMPLE-002.json'), 'utf-8')
    );
    // CSV wins for every authoritative field
    expect(json.status).toBe('DONE');
    expect(json.section).toBe('Core');
    expect(json.owner).toBe('Backend');
    expect(json.dependencies.required).toEqual(['DEP-1']);
    expect(json.dependencies.all_satisfied).toBe(true);
    expect(json.dependencies_resolved).toEqual(['DEP-1']);
    // operational field still overlaid
    expect(json.notes).toBe('keep me');
  });

  it('SURFACES a corrupt task-tracking record instead of silently dropping the task', () => {
    // A present-but-unparseable record must not be misread as "no record" (which the orchestrator
    // would swallow as a backlog task, dropping a task that has canonical evidence).
    mkdirSync(join(workDir, '.git'), { recursive: true });
    const ttDir = join(workDir, '.specify', 'sprints', 'sprint-0', 'attestations', 'SAMPLE-002');
    mkdirSync(ttDir, { recursive: true });
    writeFileSync(join(ttDir, 'task-tracking.json'), '{ this is : not valid json ');

    let thrown: Error | undefined;
    try {
      buildIndividualTaskFile(task, join(workDir, 'metrics'), [task, depDone], 0);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toMatch(/unparseable/);
    expect(thrown!.message).not.toMatch(/not found/); // must NOT be misclassified as absent
  });
});
