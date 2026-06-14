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
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeJsonFile, writeJsonFileStable } from '../../lib/data-sync/file-io';
import { updateIndividualTaskFile } from '../../lib/data-sync/task-json-updater';
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
