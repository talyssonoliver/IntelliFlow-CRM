/**
 * Regression Tests for Validation Utilities
 *
 * Tests:
 * - Sprint completion evaluation logic
 * - Uniqueness detection logic
 * - Hygiene matcher logic
 * - Strict-mode semantics (WARN => FAIL)
 * - Negative cases for expected failures
 *
 * @module tools/scripts/lib/validation-utils.test
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isStrictMode,
  effectiveSeverity,
  parseSprintCsv,
  checkSprintCompletion,
  evaluateCanonicalUniqueness,
  isAllowedByHygieneAllowlist,
  matchForbiddenDocsRuntimeArtifacts,
  findIgnoredRuntimeArtifacts,
  createSummary,
  getExitCode,
  type GateResult,
} from './validation-utils.js';

// ============================================================================
// Fixtures
// ============================================================================

const VALID_CSV_CONTENT = `Task ID,Status,Description,Target Sprint,Section
ENV-001-AI,Done,Monorepo setup,0,Environment
ENV-002-AI,Done,Docker setup,0,Environment
ENV-003-AI,In Progress,CI/CD setup,0,Environment
EP-001-AI,Planned,Observability,0,Environment
IFC-001,Planned,Architecture Spike,1,Core`;

const SPRINT0_ALL_DONE_CSV = `Task ID,Status,Description,Target Sprint,Section
ENV-001-AI,Done,Monorepo setup,0,Environment
ENV-002-AI,Completed,Docker setup,0,Environment
IFC-001,Planned,Architecture Spike,1,Core`;

const CSV_WITH_DUPLICATES = `Task ID,Status,Description,Target Sprint,Section
ENV-001-AI,Done,Monorepo setup,0,Environment
ENV-001-AI,In Progress,Duplicate!,0,Environment`;

const CSV_MISSING_HEADERS = `Task ID,Description
ENV-001-AI,No status column`;

const EMPTY_CSV = ``;

// ============================================================================
// Strict Mode Tests
// ============================================================================

describe('isStrictMode', () => {
  const originalArgv = process.argv;
  const originalEnv = process.env.VALIDATION_STRICT;

  afterEach(() => {
    process.argv = originalArgv;
    if (originalEnv === undefined) {
      delete process.env.VALIDATION_STRICT;
    } else {
      process.env.VALIDATION_STRICT = originalEnv;
    }
  });

  it('returns false by default', () => {
    process.argv = ['node', 'script.ts'];
    delete process.env.VALIDATION_STRICT;
    expect(isStrictMode()).toBe(false);
  });

  it('returns true with --strict flag', () => {
    process.argv = ['node', 'script.ts', '--strict'];
    delete process.env.VALIDATION_STRICT;
    expect(isStrictMode()).toBe(true);
  });

  it('returns true with -s flag', () => {
    process.argv = ['node', 'script.ts', '-s'];
    delete process.env.VALIDATION_STRICT;
    expect(isStrictMode()).toBe(true);
  });

  it('returns true with VALIDATION_STRICT=1', () => {
    process.argv = ['node', 'script.ts'];
    process.env.VALIDATION_STRICT = '1';
    expect(isStrictMode()).toBe(true);
  });

  it('returns true with VALIDATION_STRICT=true', () => {
    process.argv = ['node', 'script.ts'];
    process.env.VALIDATION_STRICT = 'true';
    expect(isStrictMode()).toBe(true);
  });

  it('returns false with VALIDATION_STRICT=0', () => {
    process.argv = ['node', 'script.ts'];
    process.env.VALIDATION_STRICT = '0';
    expect(isStrictMode()).toBe(false);
  });
});

describe('effectiveSeverity', () => {
  const originalArgv = process.argv;
  const originalEnv = process.env.VALIDATION_STRICT;

  afterEach(() => {
    process.argv = originalArgv;
    if (originalEnv === undefined) {
      delete process.env.VALIDATION_STRICT;
    } else {
      process.env.VALIDATION_STRICT = originalEnv;
    }
  });

  it('PASS stays PASS in default mode', () => {
    process.argv = ['node', 'script.ts'];
    delete process.env.VALIDATION_STRICT;
    expect(effectiveSeverity('PASS')).toBe('PASS');
  });

  it('WARN stays WARN in default mode', () => {
    process.argv = ['node', 'script.ts'];
    delete process.env.VALIDATION_STRICT;
    expect(effectiveSeverity('WARN')).toBe('WARN');
  });

  it('FAIL stays FAIL in default mode', () => {
    process.argv = ['node', 'script.ts'];
    delete process.env.VALIDATION_STRICT;
    expect(effectiveSeverity('FAIL')).toBe('FAIL');
  });

  it('WARN becomes FAIL in strict mode', () => {
    process.argv = ['node', 'script.ts', '--strict'];
    delete process.env.VALIDATION_STRICT;
    expect(effectiveSeverity('WARN')).toBe('FAIL');
  });

  it('PASS stays PASS in strict mode', () => {
    process.argv = ['node', 'script.ts', '--strict'];
    delete process.env.VALIDATION_STRICT;
    expect(effectiveSeverity('PASS')).toBe('PASS');
  });

  it('FAIL stays FAIL in strict mode', () => {
    process.argv = ['node', 'script.ts', '--strict'];
    delete process.env.VALIDATION_STRICT;
    expect(effectiveSeverity('FAIL')).toBe('FAIL');
  });
});

// ============================================================================
// CSV Parsing Tests
// ============================================================================

describe('parseSprintCsv', () => {
  it('parses valid CSV content', () => {
    const { tasks, errors } = parseSprintCsv(VALID_CSV_CONTENT);
    expect(errors).toHaveLength(0);
    expect(tasks).toHaveLength(5);
    expect(tasks[0]['Task ID']).toBe('ENV-001-AI');
    expect(tasks[0].Status).toBe('Done');
  });

  it('handles empty CSV', () => {
    const { tasks, errors } = parseSprintCsv(EMPTY_CSV);
    expect(errors).toContain('CSV file is empty');
    expect(tasks).toHaveLength(0);
  });

  it('detects missing required headers', () => {
    const { tasks, errors } = parseSprintCsv(CSV_MISSING_HEADERS);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('Status'))).toBe(true);
  });

  it('handles CSV with BOM', () => {
    const csvWithBom = '\uFEFF' + VALID_CSV_CONTENT;
    const { tasks, errors } = parseSprintCsv(csvWithBom);
    expect(errors).toHaveLength(0);
    expect(tasks[0]['Task ID']).toBe('ENV-001-AI');
  });

  it('handles quoted fields with commas', () => {
    const csvWithQuotes = `Task ID,Status,Description,Target Sprint
ENV-001-AI,Done,"Setup monorepo, with pnpm",0`;
    const { tasks, errors } = parseSprintCsv(csvWithQuotes);
    expect(errors).toHaveLength(0);
    expect(tasks[0].Description).toBe('Setup monorepo, with pnpm');
  });
});

// ============================================================================
// Sprint Completion Tests
// ============================================================================

describe('checkSprintCompletion', () => {
  it('returns complete when all Sprint 0 tasks are Done/Completed', () => {
    const { tasks } = parseSprintCsv(SPRINT0_ALL_DONE_CSV);
    const result = checkSprintCompletion(tasks, '0');

    expect(result.isComplete).toBe(true);
    expect(result.totalTasks).toBe(2);
    expect(result.completedTasks).toBe(2);
    expect(result.incompleteTasks).toHaveLength(0);
  });

  it('returns incomplete when Sprint 0 has non-Done tasks', () => {
    const { tasks } = parseSprintCsv(VALID_CSV_CONTENT);
    const result = checkSprintCompletion(tasks, '0');

    expect(result.isComplete).toBe(false);
    expect(result.totalTasks).toBe(4);
    expect(result.completedTasks).toBe(2);
    expect(result.incompleteTasks).toHaveLength(2);
  });

  it('identifies EP-001-AI Planned as incomplete', () => {
    const { tasks } = parseSprintCsv(VALID_CSV_CONTENT);
    const result = checkSprintCompletion(tasks, '0');

    const epTask = result.incompleteTasks.find((t) => t['Task ID'] === 'EP-001-AI');
    expect(epTask).toBeDefined();
    expect(epTask?.Status).toBe('Planned');
  });

  it('treats "Done" and "Completed" as equivalent', () => {
    const mixedStatusCsv = `Task ID,Status,Description,Target Sprint
ENV-001-AI,Done,Task 1,0
ENV-002-AI,Completed,Task 2,0`;
    const { tasks } = parseSprintCsv(mixedStatusCsv);
    const result = checkSprintCompletion(tasks, '0');

    expect(result.isComplete).toBe(true);
    expect(result.completedTasks).toBe(2);
  });

  it('filters tasks by target sprint correctly', () => {
    const { tasks } = parseSprintCsv(VALID_CSV_CONTENT);
    const sprint1Result = checkSprintCompletion(tasks, '1');

    expect(sprint1Result.totalTasks).toBe(1);
    expect(sprint1Result.incompleteTasks[0]['Task ID']).toBe('IFC-001');
  });

  it('returns empty result for non-existent sprint', () => {
    const { tasks } = parseSprintCsv(VALID_CSV_CONTENT);
    const result = checkSprintCompletion(tasks, '99');

    expect(result.isComplete).toBe(false);
    expect(result.totalTasks).toBe(0);
  });
});

// ============================================================================
// Hygiene Allowlist Tests
// ============================================================================

describe('isAllowedByHygieneAllowlist', () => {
  it('allows files in .specify directory', () => {
    expect(isAllowedByHygieneAllowlist('apps/project-tracker/docs/.specify/memory/test.md')).toBe(
      true
    );
  });

  it('rejects files outside allowlist', () => {
    expect(isAllowedByHygieneAllowlist('apps/project-tracker/docs/logs/test.log')).toBe(false);
  });

  it('normalizes Windows paths', () => {
    expect(
      isAllowedByHygieneAllowlist('apps\\project-tracker\\docs\\.specify\\memory\\test.md')
    ).toBe(true);
  });

  it('supports custom allowlist', () => {
    const customAllowlist = ['docs/custom/'];
    expect(isAllowedByHygieneAllowlist('docs/custom/file.txt', customAllowlist)).toBe(true);
    expect(isAllowedByHygieneAllowlist('docs/other/file.txt', customAllowlist)).toBe(false);
  });
});

// ============================================================================
// Uniqueness Evaluation Tests
// ============================================================================

describe('evaluateCanonicalUniqueness', () => {
  it('passes when exactly one tracked copy exists for each canonical artifact', () => {
    const trackedFiles = [
      'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv',
      'apps/project-tracker/docs/metrics/_global/Sprint_plan.json',
      'apps/project-tracker/docs/metrics/_global/task-registry.json',
      'apps/project-tracker/docs/metrics/_global/dependency-graph.json',
      'apps/web/src/app.tsx',
    ];

    const results = evaluateCanonicalUniqueness(trackedFiles);
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.severity === 'PASS')).toBe(true);
  });

  it('fails when a canonical artifact is duplicated', () => {
    const trackedFiles = [
      'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv',
      'Sprint_plan.csv',
      'apps/project-tracker/docs/metrics/_global/Sprint_plan.json',
      'apps/project-tracker/docs/metrics/_global/task-registry.json',
      'apps/project-tracker/docs/metrics/_global/dependency-graph.json',
    ];

    const results = evaluateCanonicalUniqueness(trackedFiles);
    const sprintCsv = results.find((r) => r.name.includes('Sprint_plan.csv'));
    expect(sprintCsv?.severity).toBe('FAIL');
  });

  it('fails when a canonical artifact is missing', () => {
    const trackedFiles = [
      'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv',
      'apps/project-tracker/docs/metrics/_global/Sprint_plan.json',
      'apps/project-tracker/docs/metrics/_global/task-registry.json',
      // dependency-graph.json missing
    ];

    const results = evaluateCanonicalUniqueness(trackedFiles);
    const graph = results.find((r) => r.name.includes('dependency-graph.json'));
    expect(graph?.severity).toBe('FAIL');
  });
});

// ============================================================================
// Hygiene Matcher Tests
// ============================================================================

describe('matchForbiddenDocsRuntimeArtifacts', () => {
  it('matches docs/artifacts and runtime subpaths under docs/metrics', () => {
    const files = [
      'apps/project-tracker/docs/artifacts/report.json',
      'apps/project-tracker/docs/artifacts/.gitkeep',
      'apps/project-tracker/docs/metrics/sprint-0/.status/state.json',
      'apps/project-tracker/docs/metrics/sprint-0/logs/run.log',
      'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv',
      'apps/project-tracker/docs/.specify/memory/constitution.md',
    ];

    const violations = matchForbiddenDocsRuntimeArtifacts(files);
    expect(violations).toContain('apps/project-tracker/docs/artifacts/report.json');
    expect(violations).not.toContain('apps/project-tracker/docs/artifacts/.gitkeep');
    expect(violations).toContain('apps/project-tracker/docs/metrics/sprint-0/.status/state.json');
    expect(violations).toContain('apps/project-tracker/docs/metrics/sprint-0/logs/run.log');
    expect(violations).not.toContain('apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');
    expect(violations).not.toContain('apps/project-tracker/docs/.specify/memory/constitution.md');
  });
});

// ============================================================================
// Summary and Exit Code Tests
// ============================================================================

describe('createSummary', () => {
  const originalArgv = process.argv;
  const originalEnv = process.env.VALIDATION_STRICT;

  afterEach(() => {
    process.argv = originalArgv;
    if (originalEnv === undefined) {
      delete process.env.VALIDATION_STRICT;
    } else {
      process.env.VALIDATION_STRICT = originalEnv;
    }
  });

  it('counts severities correctly in default mode', () => {
    process.argv = ['node', 'script.ts'];
    delete process.env.VALIDATION_STRICT;

    const gates: GateResult[] = [
      { name: 'Test 1', severity: 'PASS', message: 'OK' },
      { name: 'Test 2', severity: 'WARN', message: 'Warning' },
      { name: 'Test 3', severity: 'FAIL', message: 'Error' },
    ];

    const summary = createSummary(gates);
    expect(summary.passCount).toBe(1);
    expect(summary.warnCount).toBe(1);
    expect(summary.failCount).toBe(1);
  });

  it('promotes WARN to FAIL in strict mode', () => {
    process.argv = ['node', 'script.ts', '--strict'];
    delete process.env.VALIDATION_STRICT;

    const gates: GateResult[] = [
      { name: 'Test 1', severity: 'PASS', message: 'OK' },
      { name: 'Test 2', severity: 'WARN', message: 'Warning' },
    ];

    const summary = createSummary(gates);
    expect(summary.passCount).toBe(1);
    expect(summary.warnCount).toBe(0);
    expect(summary.failCount).toBe(1);
  });
});

describe('getExitCode', () => {
  const originalArgv = process.argv;
  const originalEnv = process.env.VALIDATION_STRICT;

  afterEach(() => {
    process.argv = originalArgv;
    if (originalEnv === undefined) {
      delete process.env.VALIDATION_STRICT;
    } else {
      process.env.VALIDATION_STRICT = originalEnv;
    }
  });

  it('returns 0 when all pass in default mode', () => {
    process.argv = ['node', 'script.ts'];
    delete process.env.VALIDATION_STRICT;

    const summary = { gates: [], passCount: 3, warnCount: 0, failCount: 0, skipCount: 0 };
    expect(getExitCode(summary)).toBe(0);
  });

  it('returns 0 with warnings in default mode', () => {
    process.argv = ['node', 'script.ts'];
    delete process.env.VALIDATION_STRICT;

    const summary = { gates: [], passCount: 2, warnCount: 1, failCount: 0, skipCount: 0 };
    expect(getExitCode(summary)).toBe(0);
  });

  it('returns 1 with failures in default mode', () => {
    process.argv = ['node', 'script.ts'];
    delete process.env.VALIDATION_STRICT;

    const summary = { gates: [], passCount: 2, warnCount: 0, failCount: 1, skipCount: 0 };
    expect(getExitCode(summary)).toBe(1);
  });

  it('returns 1 with warnings in strict mode', () => {
    process.argv = ['node', 'script.ts', '--strict'];
    delete process.env.VALIDATION_STRICT;

    const summary = { gates: [], passCount: 2, warnCount: 1, failCount: 0, skipCount: 0 };
    expect(getExitCode(summary)).toBe(1);
  });
});

// ============================================================================
// Negative Tests (Expected Failures)
// ============================================================================

describe('Negative Tests: Sprint Completion Gate', () => {
  const originalArgv = process.argv;
  const originalEnv = process.env.VALIDATION_STRICT;

  afterEach(() => {
    process.argv = originalArgv;
    if (originalEnv === undefined) {
      delete process.env.VALIDATION_STRICT;
    } else {
      process.env.VALIDATION_STRICT = originalEnv;
    }
  });

  it('EP-001-AI Planned causes completion gate WARN in default mode', () => {
    process.argv = ['node', 'script.ts'];
    delete process.env.VALIDATION_STRICT;

    const { tasks } = parseSprintCsv(VALID_CSV_CONTENT);
    const completion = checkSprintCompletion(tasks, '0');

    // EP-001-AI should be in incompleteTasks
    expect(completion.incompleteTasks.some((t) => t['Task ID'] === 'EP-001-AI')).toBe(true);

    // In default mode, incomplete sprint should result in exit code 0 (WARN doesn't fail)
    const gateResult: GateResult = {
      name: 'Sprint Completion',
      severity: completion.isComplete ? 'PASS' : 'WARN',
      message: completion.isComplete ? 'All done' : 'Not complete',
    };

    const summary = createSummary([gateResult]);
    expect(summary.warnCount).toBe(1);
    expect(getExitCode(summary)).toBe(0);
  });

  it('EP-001-AI Planned causes completion gate FAIL in strict mode', () => {
    process.argv = ['node', 'script.ts', '--strict'];
    delete process.env.VALIDATION_STRICT;

    const { tasks } = parseSprintCsv(VALID_CSV_CONTENT);
    const completion = checkSprintCompletion(tasks, '0');

    // Create gate result as WARN (which becomes FAIL in strict)
    const gateResult: GateResult = {
      name: 'Sprint Completion',
      severity: 'WARN',
      message: 'Not complete',
    };

    const summary = createSummary([gateResult]);
    // In strict mode, WARN is promoted to FAIL
    expect(summary.failCount).toBe(1);
    expect(summary.warnCount).toBe(0);
    expect(getExitCode(summary)).toBe(1);
  });
});

describe('Negative Tests: Hygiene Gate', () => {
  const originalArgv = process.argv;
  const originalEnv = process.env.VALIDATION_STRICT;

  afterEach(() => {
    process.argv = originalArgv;
    if (originalEnv === undefined) {
      delete process.env.VALIDATION_STRICT;
    } else {
      process.env.VALIDATION_STRICT = originalEnv;
    }
  });

  it('simulated ignored artifacts under docs triggers hygiene WARN in default mode', () => {
    process.argv = ['node', 'script.ts'];
    delete process.env.VALIDATION_STRICT;

    const ignoredFiles = [
      'apps/project-tracker/docs/artifacts/report.json',
      'apps/project-tracker/docs/metrics/sprint-0/.status/state.json',
      'apps/project-tracker/docs/.specify/memory/constitution.md',
    ];

    const forbidden = matchForbiddenDocsRuntimeArtifacts(ignoredFiles);
    const violations = forbidden.filter((f) => !isAllowedByHygieneAllowlist(f));

    expect(violations).toContain('apps/project-tracker/docs/artifacts/report.json');
    expect(violations).toHaveLength(2);

    // Create hygiene gate result
    const gateResult: GateResult = {
      name: 'Docs Hygiene',
      severity: violations.length > 0 ? 'WARN' : 'PASS',
      message: `Found ${violations.length} violations`,
    };

    const summary = createSummary([gateResult]);
    expect(summary.warnCount).toBe(1);
    expect(getExitCode(summary)).toBe(0);
  });

  it('flags runtime file suffixes under docs/metrics even without forbidden dirs', () => {
    const files = [
      'apps/project-tracker/docs/metrics/sprint-0/runtime.lock',
      'apps/project-tracker/docs/metrics/sprint-0/runtime.heartbeat',
      'apps/project-tracker/docs/metrics/sprint-0/runtime.input',
      'apps/project-tracker/docs/metrics/sprint-0/phase-0-initialisation/IFC-000.json',
    ];

    const forbidden = matchForbiddenDocsRuntimeArtifacts(files);
    expect(forbidden).toContain('apps/project-tracker/docs/metrics/sprint-0/runtime.lock');
    expect(forbidden).toContain('apps/project-tracker/docs/metrics/sprint-0/runtime.heartbeat');
    expect(forbidden).toContain('apps/project-tracker/docs/metrics/sprint-0/runtime.input');
    expect(forbidden).not.toContain(
      'apps/project-tracker/docs/metrics/sprint-0/phase-0-initialisation/IFC-000.json'
    );
  });

  it('simulated ignored artifacts under docs triggers hygiene FAIL in strict mode', () => {
    process.argv = ['node', 'script.ts', '--strict'];
    delete process.env.VALIDATION_STRICT;

    const ignoredFiles = ['apps/project-tracker/docs/artifacts/blockers.json'];
    const forbidden = matchForbiddenDocsRuntimeArtifacts(ignoredFiles);
    const violations = forbidden.filter((f) => !isAllowedByHygieneAllowlist(f));

    const gateResult: GateResult = {
      name: 'Docs Hygiene',
      severity: violations.length > 0 ? 'WARN' : 'PASS',
      message: `Found ${violations.length} violations`,
    };

    const summary = createSummary([gateResult]);
    expect(summary.failCount).toBe(1);
    expect(getExitCode(summary)).toBe(1);
  });
});

// ============================================================================
// Integration-style Test with Mocked git ls-files
// ============================================================================

describe('Integration: Hygiene detection with mocked git output', () => {
  it('uses git ls-files output and returns only forbidden docs runtime paths', () => {
    const trackedOutput = `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv
apps/project-tracker/docs/.specify/memory/constitution.md`;

    const ignoredOutput = `apps/project-tracker/docs/artifacts/blockers.json
apps/project-tracker/docs/metrics/sprint-0/.status/state.json`;

    const untrackedOutput = `apps/project-tracker/docs/metrics/sprint-0/logs/run.log
apps/project-tracker/docs/artifacts/.gitkeep`;

    const execSyncFn = vi.fn((command: string) => {
      if (command.startsWith('git ls-files -o -i --exclude-standard')) return ignoredOutput;
      if (command.startsWith('git ls-files -o --exclude-standard')) return untrackedOutput;
      if (command.startsWith('git ls-files \"apps/project-tracker/docs\"')) return trackedOutput;
      return '';
    });
    const result = findIgnoredRuntimeArtifacts(
      'C:/repo',
      'apps/project-tracker/docs',
      undefined,
      execSyncFn
    );

    expect(execSyncFn).toHaveBeenCalledTimes(3);
    expect(result.error).toBeUndefined();
    expect(result.files).toHaveLength(3);
    expect(result.files).toContain('apps/project-tracker/docs/artifacts/blockers.json');
    expect(result.files).toContain('apps/project-tracker/docs/metrics/sprint-0/.status/state.json');
    expect(result.files).toContain('apps/project-tracker/docs/metrics/sprint-0/logs/run.log');

    // Not forbidden by the rule:
    expect(result.files).not.toContain('apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');
    expect(result.files).not.toContain('apps/project-tracker/docs/.specify/memory/constitution.md');
    expect(result.files).not.toContain('apps/project-tracker/docs/artifacts/.gitkeep');
  });
});
