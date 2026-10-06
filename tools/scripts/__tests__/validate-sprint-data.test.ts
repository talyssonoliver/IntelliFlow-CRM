/**
 * validate-sprint-data — attestation verdict vs CSV status, and the
 * _summary.json count check.
 *
 * A task that was attested COMPLETE and later reopened carries an
 * INCOMPLETE/PARTIAL verdict. That only says "not done", so it must agree with
 * any CSV status except Completed.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkJsonStatusConsistency,
  indexTaskJsonFiles,
  validateSprintCounts,
} from '../validate-sprint-data.js';
import type { SprintTask } from '../lib/validation-utils.js';

function task(id: string, status: string, sprint = '9'): SprintTask {
  return { 'Task ID': id, Status: status, 'Target Sprint': sprint } as unknown as SprintTask;
}

describe('validate-sprint-data', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vsd-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function attestation(taskId: string, verdict: string): string {
    const file = join(dir, `${taskId}.json`);
    writeFileSync(file, JSON.stringify({ task_id: taskId, verdict }));
    return file;
  }

  describe('attestation verdicts', () => {
    it('maps COMPLETE to DONE and INCOMPLETE/PARTIAL to not-done', () => {
      const index = indexTaskJsonFiles([
        attestation('T-1', 'COMPLETE'),
        attestation('T-2', 'PARTIAL'),
        attestation('T-3', 'INCOMPLETE'),
        attestation('T-4', 'BLOCKED'),
      ]);
      expect(index.byId.get('T-1')?.status).toBe('DONE');
      expect(index.byId.get('T-2')?.status).toBe('NOT_DONE');
      expect(index.byId.get('T-3')?.status).toBe('NOT_DONE');
      expect(index.byId.get('T-4')?.status).toBe('BLOCKED');
    });

    it('accepts a reopened (PARTIAL/INCOMPLETE) task as In Progress or Backlog', () => {
      const index = indexTaskJsonFiles([
        attestation('T-1', 'PARTIAL'),
        attestation('T-2', 'INCOMPLETE'),
      ]);
      const result = checkJsonStatusConsistency(
        [task('T-1', 'In Progress'), task('T-2', 'Backlog')],
        index
      );
      expect(result.severity).toBe('PASS');
    });

    it('still flags a Completed task whose attestation is not COMPLETE', () => {
      const index = indexTaskJsonFiles([attestation('T-1', 'INCOMPLETE')]);
      const result = checkJsonStatusConsistency([task('T-1', 'Completed')], index);
      expect(result.severity).toBe('WARN');
      expect(result.details?.[0]).toContain('T-1');
    });

    it('still flags a COMPLETE attestation on a task the CSV reopened', () => {
      const index = indexTaskJsonFiles([attestation('T-1', 'COMPLETE')]);
      const result = checkJsonStatusConsistency([task('T-1', 'In Progress')], index);
      expect(result.severity).toBe('WARN');
    });
  });

  describe('_summary.json counts', () => {
    function summary(counts: { total: number; done: number; in_progress: number }): void {
      mkdirSync(join(dir, 'sprint-9'), { recursive: true });
      writeFileSync(
        join(dir, 'sprint-9', '_summary.json'),
        JSON.stringify({ task_summary: counts })
      );
    }

    const tasks = [task('T-1', 'Completed'), task('T-2', 'In Progress'), task('T-3', 'Backlog')];

    it('passes when the summary matches the CSV', () => {
      summary({ total: 3, done: 1, in_progress: 1 });
      const [result] = validateSprintCounts(tasks, dir, '9');
      expect(result.severity).toBe('PASS');
    });

    it('lists each count that differs', () => {
      summary({ total: 4, done: 1, in_progress: 0 });
      const [result] = validateSprintCounts(tasks, dir, '9');
      expect(result.severity).toBe('WARN');
      expect(result.details).toEqual([
        'total: summary=4 vs csv=3',
        'in_progress: summary=0 vs csv=1',
      ]);
    });
  });
});
