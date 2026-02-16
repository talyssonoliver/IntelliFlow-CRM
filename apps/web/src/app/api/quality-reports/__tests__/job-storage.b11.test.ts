/**
 * Job Storage B11 Tests - covers all functions (0% coverage)
 *
 * Targets:
 * - getJob: returns job or undefined
 * - setJob: stores a job
 * - updateJobProgress: updates existing job, ignores non-existent
 * - deleteJob: deletes and returns boolean
 * - getAllJobs: returns all jobs
 * - cleanupOldJobs: cleans completed jobs older than threshold
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getJob,
  setJob,
  updateJobProgress,
  deleteJob,
  getAllJobs,
  cleanupOldJobs,
  type GenerationJob,
} from '../job-storage';

function makeJob(id: string, overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    id,
    reports: ['report-1'],
    status: 'pending',
    progress: 0,
    results: [],
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('job-storage', () => {
  beforeEach(() => {
    // Clean up all jobs between tests
    for (const job of getAllJobs()) {
      deleteJob(job.id);
    }
  });

  describe('getJob', () => {
    it('should return undefined for non-existent job', () => {
      expect(getJob('non-existent')).toBeUndefined();
    });

    it('should return stored job', () => {
      const job = makeJob('job-1');
      setJob(job);
      expect(getJob('job-1')).toEqual(job);
    });
  });

  describe('setJob', () => {
    it('should store a new job', () => {
      const job = makeJob('job-set');
      setJob(job);
      expect(getJob('job-set')).toEqual(job);
    });

    it('should overwrite existing job', () => {
      setJob(makeJob('job-overwrite', { status: 'pending' }));
      setJob(makeJob('job-overwrite', { status: 'running', progress: 50 }));

      const result = getJob('job-overwrite');
      expect(result?.status).toBe('running');
      expect(result?.progress).toBe(50);
    });
  });

  describe('updateJobProgress', () => {
    it('should update an existing job with partial data', () => {
      setJob(makeJob('job-update', { status: 'pending', progress: 0 }));

      updateJobProgress('job-update', {
        status: 'running',
        progress: 50,
        currentReport: 'report-1',
      });

      const updated = getJob('job-update');
      expect(updated?.status).toBe('running');
      expect(updated?.progress).toBe(50);
      expect(updated?.currentReport).toBe('report-1');
    });

    it('should do nothing for non-existent job', () => {
      updateJobProgress('non-existent', { status: 'running' });
      expect(getJob('non-existent')).toBeUndefined();
    });

    it('should preserve existing fields not in updates', () => {
      const job = makeJob('job-preserve', {
        status: 'running',
        progress: 25,
        currentReport: 'report-a',
      });
      setJob(job);

      updateJobProgress('job-preserve', { progress: 75 });

      const result = getJob('job-preserve');
      expect(result?.status).toBe('running');
      expect(result?.progress).toBe(75);
      expect(result?.currentReport).toBe('report-a');
    });
  });

  describe('deleteJob', () => {
    it('should delete existing job and return true', () => {
      setJob(makeJob('job-del'));
      expect(deleteJob('job-del')).toBe(true);
      expect(getJob('job-del')).toBeUndefined();
    });

    it('should return false for non-existent job', () => {
      expect(deleteJob('non-existent')).toBe(false);
    });
  });

  describe('getAllJobs', () => {
    it('should return empty array when no jobs exist', () => {
      expect(getAllJobs()).toEqual([]);
    });

    it('should return all stored jobs', () => {
      setJob(makeJob('job-a'));
      setJob(makeJob('job-b'));
      setJob(makeJob('job-c'));

      const all = getAllJobs();
      expect(all).toHaveLength(3);
      expect(all.map((j) => j.id).sort()).toEqual(['job-a', 'job-b', 'job-c']);
    });
  });

  describe('cleanupOldJobs', () => {
    it('should remove completed jobs older than threshold', () => {
      // Job completed 10 minutes ago
      const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      setJob(
        makeJob('old-job', {
          status: 'completed',
          completedAt: oldTime,
        })
      );

      // Job completed just now
      setJob(
        makeJob('new-job', {
          status: 'completed',
          completedAt: new Date().toISOString(),
        })
      );

      // Job still running (no completedAt)
      setJob(
        makeJob('running-job', {
          status: 'running',
        })
      );

      cleanupOldJobs(5); // 5 minutes

      expect(getJob('old-job')).toBeUndefined();
      expect(getJob('new-job')).toBeDefined();
      expect(getJob('running-job')).toBeDefined();
    });

    it('should use default maxAgeMinutes of 5', () => {
      // Job completed 6 minutes ago
      const oldTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      setJob(
        makeJob('default-old', {
          status: 'completed',
          completedAt: oldTime,
        })
      );

      cleanupOldJobs();

      expect(getJob('default-old')).toBeUndefined();
    });

    it('should not remove jobs without completedAt', () => {
      setJob(makeJob('no-completed', { status: 'failed' }));
      cleanupOldJobs(0);

      expect(getJob('no-completed')).toBeDefined();
    });
  });
});
