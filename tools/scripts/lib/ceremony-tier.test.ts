/**
 * Ceremony Tier Detector tests — issue #579.
 *
 * Fixtures are modeled directly on the real Sprint_plan.csv rows the issue
 * cites: PG-178 (the original, full-ceremony module-settings task) and its
 * template-following children PG-182/183/184/185 (see
 * `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`). Every test
 * exercises `resolveCeremonyTier`/`classifyCeremonyTierHeuristic` through
 * its public surface only — no reaching into private state.
 *
 * @module tools/scripts/lib/ceremony-tier.test
 */
import { describe, it, expect } from 'vitest';
import {
  classifyCeremonyTierHeuristic,
  resolveCeremonyTier,
  parseDependencyIds,
  parseEstimateHours,
  referencesExistingPattern,
  isCompletedStatus,
  TEMPLATE_FOLLOWING_LANES,
  MAX_LIGHT_DEPENDENCIES,
  MAX_LIGHT_ESTIMATE_HOURS,
  type TierOverride,
} from './ceremony-tier';
import type { SprintTask } from './validation-utils';

/** Minimal valid SprintTask — tests override only the fields they need. */
function makeTask(overrides: Partial<SprintTask> = {}): SprintTask {
  return {
    'Task ID': 'PG-900',
    Status: 'Backlog',
    Description: 'A task',
    'Target Sprint': '18',
    Section: 'Settings',
    Owner: 'Frontend Dev (STOA-Foundation)',
    Dependencies: '',
    'Definition of Done': '',
    'Estimate (O/M/P)': '120/240/480',
    ...overrides,
  };
}

const NO_DEPENDENCY_STATUSES = new Map<string, string>();

describe('parseDependencyIds', () => {
  it('splits, trims, and drops empty entries', () => {
    expect(parseDependencyIds('PG-178, PG-182 ,PG-183')).toEqual(['PG-178', 'PG-182', 'PG-183']);
  });

  it('returns [] for undefined/empty input', () => {
    expect(parseDependencyIds(undefined)).toEqual([]);
    expect(parseDependencyIds('')).toEqual([]);
  });
});

describe('parseEstimateHours', () => {
  it('converts the most-likely (M) minute value to hours', () => {
    expect(parseEstimateHours('120/240/480')).toBe(4);
    expect(parseEstimateHours('240/480/960')).toBe(8);
  });

  it('returns null for missing, malformed, or non-positive estimates', () => {
    expect(parseEstimateHours(undefined)).toBeNull();
    expect(parseEstimateHours('')).toBeNull();
    expect(parseEstimateHours('240/480')).toBeNull(); // only 2 parts
    expect(parseEstimateHours('240/480/960/1')).toBeNull(); // 4 parts
    expect(parseEstimateHours('240/abc/960')).toBeNull(); // non-numeric M
    expect(parseEstimateHours('240/0/960')).toBeNull(); // zero M
    expect(parseEstimateHours('240/-10/960')).toBeNull(); // negative M
  });
});

describe('referencesExistingPattern', () => {
  it('matches known keywords case-insensitively', () => {
    expect(referencesExistingPattern('follows settings/account PATTERN')).toBe(true);
    expect(referencesExistingPattern('MUST follow docs/planning/module-settings-playbook.md')).toBe(
      true
    );
    expect(referencesExistingPattern('mirror contact-automation.ts')).toBe(true);
  });

  it('joins multiple text fields before matching', () => {
    expect(
      referencesExistingPattern('a new settings page', undefined, 'uses the shared playbook')
    ).toBe(true);
  });

  it('returns false when no keyword is present', () => {
    expect(referencesExistingPattern('a brand new architectural change')).toBe(false);
    expect(referencesExistingPattern(undefined, '')).toBe(false);
  });
});

describe('isCompletedStatus', () => {
  it('treats Completed/Done (any case) as completed', () => {
    expect(isCompletedStatus('Completed')).toBe(true);
    expect(isCompletedStatus('completed')).toBe(true);
    expect(isCompletedStatus('DONE')).toBe(true);
  });

  it('treats everything else, including undefined, as not completed', () => {
    expect(isCompletedStatus('Backlog')).toBe(false);
    expect(isCompletedStatus('In Progress')).toBe(false);
    expect(isCompletedStatus(undefined)).toBe(false);
  });
});

describe('classifyCeremonyTierHeuristic', () => {
  it('classifies LIGHT when all four conditions pass (PG-182-shaped: Foundation lane, 1 completed dep, pattern reference, 4h estimate)', () => {
    const task = makeTask({
      'Task ID': 'PG-182',
      Dependencies: 'PG-178',
      'Definition of Done':
        'Contact settings page ... uses in-module settings sidebar pattern; Lighthouse >=90',
      'Estimate (O/M/P)': '120/240/480', // M=240min=4h
    });
    const statuses = new Map([['PG-178', 'Completed']]);

    const result = classifyCeremonyTierHeuristic(task, statuses);

    expect(result.tier).toBe('light');
    expect(result.lane).toBe('Foundation');
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('classifies FULL when the lane is not template-following (e.g. an AI- task => Intelligence)', () => {
    const task = makeTask({
      'Task ID': 'AI-900',
      Description: 'embeddings scoring prompt tuning',
      Dependencies: '',
      'Definition of Done': 'follows the existing pattern',
      'Estimate (O/M/P)': '60/120/240',
    });

    const result = classifyCeremonyTierHeuristic(task, NO_DEPENDENCY_STATUSES);

    expect(result.lane).toBe('Intelligence');
    expect(result.tier).toBe('full');
    const laneCheck = result.checks.find((c) => c.id === 'lane');
    expect(laneCheck?.passed).toBe(false);
  });

  it('classifies FULL when there are more than MAX_LIGHT_DEPENDENCIES dependencies, even if all are completed', () => {
    const task = makeTask({
      Dependencies: 'PG-178,PG-182,PG-183', // 3 > MAX_LIGHT_DEPENDENCIES (2)
      'Definition of Done': 'follows the established pattern',
    });
    const statuses = new Map([
      ['PG-178', 'Completed'],
      ['PG-182', 'Completed'],
      ['PG-183', 'Completed'],
    ]);

    const result = classifyCeremonyTierHeuristic(task, statuses);

    expect(result.tier).toBe('full');
    const depCheck = result.checks.find((c) => c.id === 'dependencies');
    expect(depCheck?.passed).toBe(false);
    expect(depCheck?.detail).toContain('3 dependency');
  });

  it('classifies FULL when a dependency exists but is not yet completed (fails closed)', () => {
    const task = makeTask({
      Dependencies: 'PG-178',
      'Definition of Done': 'follows the established pattern',
    });
    const statuses = new Map([['PG-178', 'In Progress']]);

    const result = classifyCeremonyTierHeuristic(task, statuses);

    expect(result.tier).toBe('full');
    const depCheck = result.checks.find((c) => c.id === 'dependencies');
    expect(depCheck?.passed).toBe(false);
    expect(depCheck?.detail).toContain('PG-178');
  });

  it('classifies FULL when a dependency is unknown to the CSV (not found in statusByTaskId)', () => {
    const task = makeTask({ Dependencies: 'PG-999-GHOST' });

    const result = classifyCeremonyTierHeuristic(task, NO_DEPENDENCY_STATUSES);

    expect(result.tier).toBe('full');
  });

  it('classifies FULL when neither Description nor Definition of Done references a pattern', () => {
    const task = makeTask({
      Dependencies: '',
      Description: 'A brand new settings surface, no prior art',
      'Definition of Done': 'Renders correctly and saves',
    });

    const result = classifyCeremonyTierHeuristic(task, NO_DEPENDENCY_STATUSES);

    expect(result.tier).toBe('full');
    const patternCheck = result.checks.find((c) => c.id === 'pattern');
    expect(patternCheck?.passed).toBe(false);
  });

  it('classifies FULL when the most-likely estimate exceeds MAX_LIGHT_ESTIMATE_HOURS', () => {
    const task = makeTask({
      Dependencies: '',
      'Definition of Done': 'follows the existing pattern',
      'Estimate (O/M/P)': '240/480/960', // M=480min=8h > 6h
    });

    const result = classifyCeremonyTierHeuristic(task, NO_DEPENDENCY_STATUSES);

    expect(result.tier).toBe('full');
    const sizeCheck = result.checks.find((c) => c.id === 'size');
    expect(sizeCheck?.passed).toBe(false);
  });

  it('classifies FULL and fails closed when the estimate is missing/unparseable (never defaults to light)', () => {
    const task = makeTask({
      Dependencies: '',
      'Definition of Done': 'follows the existing pattern',
      'Estimate (O/M/P)': undefined,
    });

    const result = classifyCeremonyTierHeuristic(task, NO_DEPENDENCY_STATUSES);

    expect(result.tier).toBe('full');
    const sizeCheck = result.checks.find((c) => c.id === 'size');
    expect(sizeCheck?.passed).toBe(false);
  });

  it('accepts exactly MAX_LIGHT_DEPENDENCIES completed dependencies and exactly MAX_LIGHT_ESTIMATE_HOURS as passing (boundary)', () => {
    const task = makeTask({
      Dependencies: 'PG-178,PG-182', // exactly 2 == MAX_LIGHT_DEPENDENCIES
      'Definition of Done': 'follows the existing pattern',
      'Estimate (O/M/P)': `${MAX_LIGHT_ESTIMATE_HOURS * 30}/${MAX_LIGHT_ESTIMATE_HOURS * 60}/${MAX_LIGHT_ESTIMATE_HOURS * 120}`, // M == exactly 6h
    });
    const statuses = new Map([
      ['PG-178', 'Completed'],
      ['PG-182', 'Completed'],
    ]);

    const result = classifyCeremonyTierHeuristic(task, statuses);

    expect(parseDependencyIds(task.Dependencies)).toHaveLength(MAX_LIGHT_DEPENDENCIES);
    expect(result.tier).toBe('light');
  });

  it('template-following lanes are exactly Foundation and Domain', () => {
    expect(TEMPLATE_FOLLOWING_LANES.has('Foundation')).toBe(true);
    expect(TEMPLATE_FOLLOWING_LANES.has('Domain')).toBe(true);
    expect(TEMPLATE_FOLLOWING_LANES.has('Security')).toBe(false);
    expect(TEMPLATE_FOLLOWING_LANES.has('Quality')).toBe(false);
    expect(TEMPLATE_FOLLOWING_LANES.has('Intelligence')).toBe(false);
    expect(TEMPLATE_FOLLOWING_LANES.has('Automation')).toBe(false);
  });
});

describe('resolveCeremonyTier', () => {
  it('uses the heuristic when there is no override map', () => {
    const task = makeTask({
      Dependencies: 'PG-178',
      'Definition of Done': 'follows the existing pattern',
    });
    const statuses = new Map([['PG-178', 'Completed']]);

    const result = resolveCeremonyTier(task, statuses);

    expect(result.source).toBe('heuristic');
    expect(result.tier).toBe('light');
  });

  it('uses the heuristic when the override is "auto" or the task has no entry', () => {
    const task = makeTask({ 'Task ID': 'PG-901' });
    const overrides = new Map<string, TierOverride>([['PG-901', 'auto']]);

    const result = resolveCeremonyTier(task, NO_DEPENDENCY_STATUSES, overrides);

    expect(result.source).toBe('heuristic');
  });

  it('a "light" override forces LIGHT even when the heuristic would say FULL', () => {
    const task = makeTask({
      'Task ID': 'AI-901',
      Description: 'a genuinely novel AI task',
      'Definition of Done': 'no prior pattern',
    });
    const overrides = new Map<string, TierOverride>([['AI-901', 'light']]);

    const result = resolveCeremonyTier(task, NO_DEPENDENCY_STATUSES, overrides);

    expect(result.source).toBe('override');
    expect(result.tier).toBe('light');
    expect(result.checks).toEqual([]);
  });

  it('a "full" override forces FULL even when the heuristic would say LIGHT', () => {
    const task = makeTask({
      'Task ID': 'PG-902',
      Dependencies: 'PG-178',
      'Definition of Done': 'follows the existing pattern',
    });
    const overrides = new Map<string, TierOverride>([['PG-902', 'full']]);
    const statuses = new Map([['PG-178', 'Completed']]);

    const result = resolveCeremonyTier(task, statuses, overrides);

    expect(result.source).toBe('override');
    expect(result.tier).toBe('full');
  });
});
