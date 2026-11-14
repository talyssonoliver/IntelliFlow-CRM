import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateCurrentStateReport, writeSprintSummaries } from '../current-state-report';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectTrackerRoot = join(__dirname, '..', '..');
const repoRoot = join(projectTrackerRoot, '..', '..', '..');

describe('generateCurrentStateReport', () => {
  it('builds a markdown and JSON report from live sprint evidence', () => {
    const metricsDir = join(projectTrackerRoot, 'docs', 'metrics');
    const specifySprintsDir = join(repoRoot, '.specify', 'sprints');

    const result = generateCurrentStateReport(metricsDir, specifySprintsDir, repoRoot);
    const countedStatuses =
      result.data.overview.completedTasks +
      result.data.overview.backlogTasks +
      result.data.overview.blockedTasks +
      result.data.overview.inProgressTasks +
      result.data.overview.otherTasks;

    expect(result.markdown).toContain('# Current State Report');
    expect(result.data.overview.totalTasks).toBeGreaterThan(0);
    expect(result.data.overview.totalTasks).toBe(countedStatuses);
    expect(result.data.sprints.length).toBeGreaterThan(0);
    expect(result.data.sprints.some((sprint) => sprint.sprint === 13)).toBe(true);
    expect(result.data.currentState.readyToStart.length).toBeGreaterThan(0);
  });
});

describe('writeSprintSummaries', () => {
  it('writes one _summary.json per sprint with the report counts', () => {
    const metricsDir = join(projectTrackerRoot, 'docs', 'metrics');
    const specifySprintsDir = join(repoRoot, '.specify', 'sprints');
    const { data } = generateCurrentStateReport(metricsDir, specifySprintsDir, repoRoot);

    const out = mkdtempSync(join(tmpdir(), 'sprint-summaries-'));
    try {
      const written = writeSprintSummaries(data, out);
      expect(written).toHaveLength(data.sprints.length);

      const sprint = data.sprints[0];
      const summary = JSON.parse(
        readFileSync(join(out, `sprint-${sprint.sprint}`, '_summary.json'), 'utf-8')
      );
      expect(summary).toMatchObject({
        sprint: `sprint-${sprint.sprint}`,
        name: sprint.name,
        generated_at: data.generatedAt,
        task_summary: {
          total: sprint.totalTasks,
          completed: sprint.completedTasks,
          backlog: sprint.backlogTasks,
          blocked: sprint.blockedTasks,
          attested_completed: sprint.attestedCompletedTasks,
        },
      });
      expect(summary.tasks).toHaveLength(sprint.tasks.length);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('creates a missing sprint directory and writes nothing for an empty report', () => {
    const out = mkdtempSync(join(tmpdir(), 'sprint-summaries-'));
    try {
      const metricsDir = join(projectTrackerRoot, 'docs', 'metrics');
      const specifySprintsDir = join(repoRoot, '.specify', 'sprints');
      const { data } = generateCurrentStateReport(metricsDir, specifySprintsDir, repoRoot);
      expect(writeSprintSummaries({ ...data, sprints: [] }, out)).toEqual([]);
      const one = { ...data, sprints: [{ ...data.sprints[0], sprint: 987 }] };
      const [path] = writeSprintSummaries(one, out);
      expect(existsSync(path)).toBe(true);
      expect(path).toContain('sprint-987');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
