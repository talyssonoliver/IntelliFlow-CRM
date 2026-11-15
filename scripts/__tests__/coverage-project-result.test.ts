import { describe, it, expect } from 'vitest';
import { classifyProjectRun, describeProjectFailure } from '../lib/coverage-project-result.mjs';

const MIN = 60_000;
const base = { project: 'web', timedOut: false, timeoutMs: MIN };

describe('classifyProjectRun', () => {
  it('a run killed on timeout is a failure with no test count, even with a partial report', () => {
    const r = classifyProjectRun({
      ...base,
      code: 1,
      timedOut: true,
      timeoutMs: 30 * MIN,
      report: { numFailedTests: 0, numFailedTestSuites: 0 },
    });
    expect(r).toMatchObject({ testFailures: -1, thresholdBreach: false, timedOut: true });
  });

  it('a signal kill reports exit 1', () => {
    const r = classifyProjectRun({ ...base, code: null, timedOut: true, report: null });
    expect(r.code).toBe(1);
  });

  it('no report and a non-zero exit is an unknown failure, not a timeout', () => {
    const r = classifyProjectRun({ ...base, project: 'api', code: 1, report: null });
    expect(r).toMatchObject({ testFailures: -1, timedOut: false });
  });

  it('counts failed tests and suites; a clean report with exit 1 is a threshold breach', () => {
    const failed = classifyProjectRun({
      ...base,
      code: 1,
      report: { numFailedTests: 2, numFailedTestSuites: 1 },
    });
    expect(failed).toMatchObject({ testFailures: 3, thresholdBreach: false });
    const breach = classifyProjectRun({ ...base, code: 1, report: { numFailedTests: 0 } });
    expect(breach).toMatchObject({ testFailures: 0, thresholdBreach: true });
  });

  it('a clean exit is green', () => {
    const r = classifyProjectRun({ ...base, code: 0, report: { numFailedTests: 0 } });
    expect(r).toMatchObject({ testFailures: 0, thresholdBreach: false });
  });
});

describe('describeProjectFailure', () => {
  it('says a timed-out project timed out after N min, distinct from a crash', () => {
    const timedOut = classifyProjectRun({
      ...base,
      code: 1,
      timedOut: true,
      timeoutMs: 30 * MIN,
      report: null,
    });
    const text = describeProjectFailure(timedOut);
    expect(text).toBe('timed out after 30 min (killed)');
    expect(text).not.toMatch(/early crash/);
  });

  it('keeps the crash and failure wordings', () => {
    const crash = classifyProjectRun({ ...base, code: 1, report: null });
    expect(describeProjectFailure(crash)).toMatch(/early crash/);
    const failed = classifyProjectRun({ ...base, code: 1, report: { numFailedTests: 4 } });
    expect(describeProjectFailure(failed)).toBe('4 test failure(s), exit 1');
  });
});
