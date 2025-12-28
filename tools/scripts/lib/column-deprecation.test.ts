/**
 * Unit tests for column-deprecation.ts
 *
 * @module tools/scripts/lib/column-deprecation.test
 */

import { describe, it, expect } from 'vitest';
import {
  computeCrossQuarterDeps,
  generateCleanDependencies,
  checkCleanDependenciesDivergence,
  checkCrossQuarterDepsDivergence,
} from './column-deprecation.js';
import type { SprintTask } from './validation-utils.js';

describe('generateCleanDependencies', () => {
  it('returns empty string for empty input', () => {
    expect(generateCleanDependencies('')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(generateCleanDependencies(null as unknown as string)).toBe('');
    expect(generateCleanDependencies(undefined as unknown as string)).toBe('');
  });

  it('trims whitespace from dependencies', () => {
    expect(generateCleanDependencies(' IFC-001 , IFC-002 ')).toBe('IFC-001,IFC-002');
  });

  it('removes duplicates', () => {
    expect(generateCleanDependencies('IFC-001,IFC-002,IFC-001')).toBe('IFC-001,IFC-002');
  });

  it('sorts alphabetically', () => {
    expect(generateCleanDependencies('IFC-003,IFC-001,IFC-002')).toBe('IFC-001,IFC-002,IFC-003');
  });

  it('handles single dependency', () => {
    expect(generateCleanDependencies('IFC-001')).toBe('IFC-001');
  });

  it('removes empty entries', () => {
    expect(generateCleanDependencies('IFC-001,,IFC-002')).toBe('IFC-001,IFC-002');
    expect(generateCleanDependencies(',IFC-001,')).toBe('IFC-001');
  });
});

describe('computeCrossQuarterDeps', () => {
  const createTask = (taskId: string, sprint: string, deps: string): SprintTask => ({
    'Task ID': taskId,
    Status: 'Backlog',
    Description: 'Test task',
    'Target Sprint': sprint,
    Dependencies: deps,
  });

  it('returns false for no dependencies', () => {
    const task = createTask('T1', '0', '');
    expect(computeCrossQuarterDeps(task, [])).toBe(false);
  });

  it('returns false for same-quarter dependencies', () => {
    const task1 = createTask('T1', '5', 'T2');
    const task2 = createTask('T2', '6', '');
    // Sprints 5 and 6 are in quarter 1 (sprints 4-7)

    expect(computeCrossQuarterDeps(task1, [task1, task2])).toBe(false);
  });

  it('returns true for cross-quarter dependencies', () => {
    const task1 = createTask('T1', '5', 'T2');
    const task2 = createTask('T2', '0', '');
    // Sprint 5 is in quarter 1, Sprint 0 is in quarter 0

    expect(computeCrossQuarterDeps(task1, [task1, task2])).toBe(true);
  });

  it('handles invalid sprint numbers', () => {
    const task = createTask('T1', 'invalid', 'T2');
    expect(computeCrossQuarterDeps(task, [])).toBe(false);
  });

  it('handles missing dependency task', () => {
    const task1 = createTask('T1', '5', 'MISSING');
    expect(computeCrossQuarterDeps(task1, [task1])).toBe(false);
  });

  it('handles multiple dependencies with mixed quarters', () => {
    const task1 = createTask('T1', '5', 'T2,T3');
    const task2 = createTask('T2', '6', ''); // Same quarter
    const task3 = createTask('T3', '0', ''); // Different quarter

    expect(computeCrossQuarterDeps(task1, [task1, task2, task3])).toBe(true);
  });
});

describe('checkCleanDependenciesDivergence', () => {
  const createTask = (deps: string, cleanDeps: string): SprintTask => ({
    'Task ID': 'TEST',
    Status: 'Backlog',
    Description: 'Test',
    'Target Sprint': '0',
    Dependencies: deps,
    CleanDependencies: cleanDeps,
  });

  it('returns null when values match', () => {
    const task = createTask('IFC-001,IFC-002', 'IFC-001,IFC-002');
    expect(checkCleanDependenciesDivergence(task)).toBeNull();
  });

  it('returns null when both are empty', () => {
    const task = createTask('', '');
    expect(checkCleanDependenciesDivergence(task)).toBeNull();
  });

  it('returns warning when values diverge', () => {
    const task = createTask('IFC-001,IFC-002', 'IFC-002,IFC-001');
    const warning = checkCleanDependenciesDivergence(task);

    expect(warning).not.toBeNull();
    expect(warning?.column).toBe('CleanDependencies');
    expect(warning?.expectedValue).toBe('IFC-001,IFC-002');
  });

  it('returns warning when CSV has value but should be empty', () => {
    const task = createTask('', 'IFC-001');
    const warning = checkCleanDependenciesDivergence(task);

    expect(warning).not.toBeNull();
    expect(warning?.expectedValue).toBe('(empty)');
  });
});

describe('checkCrossQuarterDepsDivergence', () => {
  const createTask = (
    taskId: string,
    sprint: string,
    deps: string,
    crossQuarter: string
  ): SprintTask => ({
    'Task ID': taskId,
    Status: 'Backlog',
    Description: 'Test',
    'Target Sprint': sprint,
    Dependencies: deps,
    CrossQuarterDeps: crossQuarter,
  });

  it('returns null when computed value matches', () => {
    const task = createTask('T1', '5', 'T2', 'True');
    const dep = createTask('T2', '0', '', 'False'); // Different quarter

    const warning = checkCrossQuarterDepsDivergence(task, [task, dep]);
    expect(warning).toBeNull();
  });

  it('returns null when CSV is empty (no explicit value)', () => {
    const task = createTask('T1', '5', 'T2', '');
    const dep = createTask('T2', '6', '', '');

    const warning = checkCrossQuarterDepsDivergence(task, [task, dep]);
    expect(warning).toBeNull();
  });

  it('returns warning when values diverge', () => {
    const task = createTask('T1', '5', 'T2', 'False'); // Says False
    const dep = createTask('T2', '0', '', ''); // But dep is in different quarter

    const warning = checkCrossQuarterDepsDivergence(task, [task, dep]);

    expect(warning).not.toBeNull();
    expect(warning?.column).toBe('CrossQuarterDeps');
    expect(warning?.expectedValue).toBe('True');
    expect(warning?.actualValue).toBe('False');
  });

  it('handles case-insensitive comparison', () => {
    const task = createTask('T1', '5', 'T2', 'true');
    const dep = createTask('T2', '0', '', '');

    const warning = checkCrossQuarterDepsDivergence(task, [task, dep]);
    expect(warning).toBeNull();
  });
});
