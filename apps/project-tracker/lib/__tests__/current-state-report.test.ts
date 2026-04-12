import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generateCurrentStateReport } from '../current-state-report';

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
      result.data.overview.inProgressTasks;

    expect(result.markdown).toContain('# Current State Report');
    expect(result.data.overview.totalTasks).toBeGreaterThan(0);
    expect(result.data.overview.totalTasks).toBe(countedStatuses);
    expect(result.data.sprints.length).toBeGreaterThan(0);
    expect(result.data.sprints.some((sprint) => sprint.sprint === 13)).toBe(true);
    expect(result.data.currentState.readyToStart.length).toBeGreaterThan(0);
  });
});
