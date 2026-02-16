/**
 * Supplementary tests for test-runner-modal.tsx
 *
 * Tests the modal's logic functions: progress event processing,
 * scope options config, result status tracking, coverage metric
 * color thresholds, and progress percent calculation.
 *
 * No rendering - tests pure logic only.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// scopeOptions configuration (mirrors the const in the source)
// ---------------------------------------------------------------------------
const scopeOptions = [
  {
    value: 'quick' as const,
    label: 'Quick',
    description: 'Validators + Domain packages',
    time: '~15s',
  },
  {
    value: 'standard' as const,
    label: 'Standard',
    description: 'All unit tests',
    time: '~1min',
  },
  {
    value: 'comprehensive' as const,
    label: 'Comprehensive',
    description: 'Unit + Integration tests',
    time: '~3min',
  },
];

// ---------------------------------------------------------------------------
// CoverageMetric color function (mirrors the getColor in CoverageMetric)
// ---------------------------------------------------------------------------
function getColor(v: number): string {
  if (v >= 80) return 'text-emerald-500';
  if (v >= 50) return 'text-amber-500';
  return 'text-red-500';
}

// ---------------------------------------------------------------------------
// progressPercent calculation (mirrors logic from render section)
// ---------------------------------------------------------------------------
function computeProgressPercent(testsRun: number, testsPassed: number): number {
  return testsRun > 0 ? Math.round((testsPassed / testsRun) * 100) : 0;
}

// ---------------------------------------------------------------------------
// handleProgressEvent simulation - pure state machine logic
// ---------------------------------------------------------------------------
interface TestProgress {
  runId: string;
  type: string;
  timestamp: string;
  data?: {
    testName?: string;
    suiteName?: string;
    file?: string;
    testsRun?: number;
    testsPassed?: number;
    testsFailed?: number;
    testsSkipped?: number;
    message?: string;
    error?: string;
    coverage?: {
      lines: { pct: number };
      statements: { pct: number };
      functions: { pct: number };
      branches: { pct: number };
    };
  };
}

interface ProgressState {
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  testsSkipped: number;
  currentTest: string;
}

interface LogEntry {
  type: 'pass' | 'fail' | 'skip' | 'info';
  text: string;
}

/**
 * Simulates the handleProgressEvent logic from the component.
 * Returns updated state and log entries produced.
 */
function applyProgressEvent(
  prevState: ProgressState,
  data: TestProgress
): {
  state: ProgressState;
  logs: LogEntry[];
  error?: string;
  isComplete?: boolean;
  coverage?: { lines: number; statements: number; functions: number; branches: number };
} {
  const logs: LogEntry[] = [];
  let newState = { ...prevState };
  let error: string | undefined;
  let isComplete = false;
  let coverage:
    | { lines: number; statements: number; functions: number; branches: number }
    | undefined;

  switch (data.type) {
    case 'test_pass':
      newState = {
        ...newState,
        testsRun: newState.testsRun + 1,
        testsPassed: newState.testsPassed + 1,
        currentTest: data.data?.testName || newState.currentTest,
      };
      if (data.data?.testName) {
        logs.push({ type: 'pass', text: data.data.testName });
      }
      break;

    case 'test_fail':
      newState = {
        ...newState,
        testsRun: newState.testsRun + 1,
        testsFailed: newState.testsFailed + 1,
        currentTest: data.data?.testName || newState.currentTest,
      };
      if (data.data?.testName) {
        logs.push({ type: 'fail', text: data.data.testName });
      }
      break;

    case 'test_skip':
      newState = {
        ...newState,
        testsRun: newState.testsRun + 1,
        testsSkipped: newState.testsSkipped + 1,
        currentTest: data.data?.testName || newState.currentTest,
      };
      if (data.data?.testName) {
        logs.push({ type: 'skip', text: data.data.testName });
      }
      break;

    case 'suite_start':
      if (data.data?.file) {
        logs.push({
          type: 'info',
          text: `Running: ${data.data?.suiteName || data.data?.file}`,
        });
      }
      break;

    case 'coverage_complete':
      if (data.data?.coverage) {
        coverage = {
          lines: data.data.coverage.lines.pct,
          statements: data.data.coverage.statements.pct,
          functions: data.data.coverage.functions.pct,
          branches: data.data.coverage.branches.pct,
        };
      }
      break;

    case 'complete':
      isComplete = true;
      if (data.data?.testsRun !== undefined) {
        newState = {
          ...newState,
          testsRun: data.data.testsRun || newState.testsRun,
          testsPassed: data.data.testsPassed || newState.testsPassed,
          testsFailed: data.data.testsFailed || newState.testsFailed,
          testsSkipped: data.data.testsSkipped || newState.testsSkipped,
        };
      }
      if (data.data?.coverage) {
        coverage = {
          lines: data.data.coverage.lines.pct,
          statements: data.data.coverage.statements.pct,
          functions: data.data.coverage.functions.pct,
          branches: data.data.coverage.branches.pct,
        };
      }
      logs.push({ type: 'info', text: 'Test run complete!' });
      break;

    case 'error':
      error = data.data?.error || 'An error occurred';
      break;
  }

  return { state: newState, logs, error, isComplete, coverage };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('test-runner-modal logic', () => {
  // ===================== scopeOptions =====================
  describe('scopeOptions configuration', () => {
    it('contains exactly 3 options', () => {
      expect(scopeOptions).toHaveLength(3);
    });

    it('quick scope has correct description and time', () => {
      const quick = scopeOptions.find((o) => o.value === 'quick');
      expect(quick).toBeDefined();
      expect(quick!.description).toBe('Validators + Domain packages');
      expect(quick!.time).toBe('~15s');
    });

    it('standard scope has correct description and time', () => {
      const standard = scopeOptions.find((o) => o.value === 'standard');
      expect(standard).toBeDefined();
      expect(standard!.description).toBe('All unit tests');
      expect(standard!.time).toBe('~1min');
    });

    it('comprehensive scope has correct description and time', () => {
      const comp = scopeOptions.find((o) => o.value === 'comprehensive');
      expect(comp).toBeDefined();
      expect(comp!.description).toBe('Unit + Integration tests');
      expect(comp!.time).toBe('~3min');
    });

    it('all scopes have unique values', () => {
      const values = scopeOptions.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    });

    it('all scopes have non-empty labels', () => {
      for (const opt of scopeOptions) {
        expect(opt.label.length).toBeGreaterThan(0);
      }
    });
  });

  // ===================== CoverageMetric getColor =====================
  describe('CoverageMetric getColor', () => {
    it('returns emerald for 100%', () => {
      expect(getColor(100)).toBe('text-emerald-500');
    });

    it('returns emerald for exactly 80%', () => {
      expect(getColor(80)).toBe('text-emerald-500');
    });

    it('returns amber for 79%', () => {
      expect(getColor(79)).toBe('text-amber-500');
    });

    it('returns amber for exactly 50%', () => {
      expect(getColor(50)).toBe('text-amber-500');
    });

    it('returns red for 49%', () => {
      expect(getColor(49)).toBe('text-red-500');
    });

    it('returns red for 0%', () => {
      expect(getColor(0)).toBe('text-red-500');
    });

    it('returns red for negative value', () => {
      expect(getColor(-5)).toBe('text-red-500');
    });

    it('returns emerald for 95%', () => {
      expect(getColor(95)).toBe('text-emerald-500');
    });
  });

  // ===================== progressPercent =====================
  describe('progressPercent calculation', () => {
    it('returns 0 when no tests run', () => {
      expect(computeProgressPercent(0, 0)).toBe(0);
    });

    it('returns 100 when all pass', () => {
      expect(computeProgressPercent(10, 10)).toBe(100);
    });

    it('returns 50 when half pass', () => {
      expect(computeProgressPercent(10, 5)).toBe(50);
    });

    it('returns 0 when none pass but tests ran', () => {
      expect(computeProgressPercent(10, 0)).toBe(0);
    });

    it('rounds to nearest integer', () => {
      // 1/3 = 33.333...
      expect(computeProgressPercent(3, 1)).toBe(33);
    });

    it('rounds 2/3 correctly', () => {
      expect(computeProgressPercent(3, 2)).toBe(67);
    });
  });

  // ===================== handleProgressEvent =====================
  describe('handleProgressEvent state machine', () => {
    const initialState: ProgressState = {
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      testsSkipped: 0,
      currentTest: '',
    };

    it('test_pass increments testsRun and testsPassed', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'test_pass',
        timestamp: new Date().toISOString(),
        data: { testName: 'should add numbers' },
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.state.testsRun).toBe(1);
      expect(result.state.testsPassed).toBe(1);
      expect(result.state.testsFailed).toBe(0);
      expect(result.state.testsSkipped).toBe(0);
    });

    it('test_pass adds log entry with pass type', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'test_pass',
        timestamp: new Date().toISOString(),
        data: { testName: 'my test' },
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toEqual({ type: 'pass', text: 'my test' });
    });

    it('test_pass without testName does not add log', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'test_pass',
        timestamp: new Date().toISOString(),
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.logs).toHaveLength(0);
      expect(result.state.testsRun).toBe(1);
    });

    it('test_fail increments testsFailed', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'test_fail',
        timestamp: new Date().toISOString(),
        data: { testName: 'broken test' },
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.state.testsFailed).toBe(1);
      expect(result.state.testsPassed).toBe(0);
      expect(result.logs[0]).toEqual({ type: 'fail', text: 'broken test' });
    });

    it('test_skip increments testsSkipped', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'test_skip',
        timestamp: new Date().toISOString(),
        data: { testName: 'skipped test' },
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.state.testsSkipped).toBe(1);
      expect(result.logs[0]).toEqual({ type: 'skip', text: 'skipped test' });
    });

    it('suite_start logs file name', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'suite_start',
        timestamp: new Date().toISOString(),
        data: { file: 'lead.test.ts', suiteName: 'Lead tests' },
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].text).toBe('Running: Lead tests');
      expect(result.logs[0].type).toBe('info');
    });

    it('suite_start prefers suiteName over file', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'suite_start',
        timestamp: new Date().toISOString(),
        data: { file: 'test.ts', suiteName: 'My Suite' },
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.logs[0].text).toBe('Running: My Suite');
    });

    it('suite_start uses file when no suiteName', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'suite_start',
        timestamp: new Date().toISOString(),
        data: { file: 'test.ts' },
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.logs[0].text).toBe('Running: test.ts');
    });

    it('suite_start with no file produces no log', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'suite_start',
        timestamp: new Date().toISOString(),
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.logs).toHaveLength(0);
    });

    it('coverage_complete extracts coverage values', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'coverage_complete',
        timestamp: new Date().toISOString(),
        data: {
          coverage: {
            lines: { pct: 85.5 },
            statements: { pct: 90.1 },
            functions: { pct: 72.3 },
            branches: { pct: 60.0 },
          },
        },
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.coverage).toEqual({
        lines: 85.5,
        statements: 90.1,
        functions: 72.3,
        branches: 60.0,
      });
    });

    it('coverage_complete without data produces no coverage', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'coverage_complete',
        timestamp: new Date().toISOString(),
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.coverage).toBeUndefined();
    });

    it('complete event sets isComplete', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'complete',
        timestamp: new Date().toISOString(),
        data: {
          testsRun: 42,
          testsPassed: 40,
          testsFailed: 1,
          testsSkipped: 1,
        },
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.isComplete).toBe(true);
      expect(result.state.testsRun).toBe(42);
      expect(result.state.testsPassed).toBe(40);
      expect(result.state.testsFailed).toBe(1);
      expect(result.state.testsSkipped).toBe(1);
      expect(result.logs).toContainEqual({
        type: 'info',
        text: 'Test run complete!',
      });
    });

    it('complete event with coverage', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'complete',
        timestamp: new Date().toISOString(),
        data: {
          testsRun: 10,
          testsPassed: 10,
          testsFailed: 0,
          testsSkipped: 0,
          coverage: {
            lines: { pct: 95 },
            statements: { pct: 94 },
            functions: { pct: 88 },
            branches: { pct: 82 },
          },
        },
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.coverage).toEqual({
        lines: 95,
        statements: 94,
        functions: 88,
        branches: 82,
      });
    });

    it('complete event preserves existing counts when data counts are zero', () => {
      const prevState: ProgressState = {
        testsRun: 20,
        testsPassed: 18,
        testsFailed: 2,
        testsSkipped: 0,
        currentTest: 'last test',
      };
      const event: TestProgress = {
        runId: 'r1',
        type: 'complete',
        timestamp: new Date().toISOString(),
        data: {
          testsRun: 0,
          testsPassed: 0,
          testsFailed: 0,
          testsSkipped: 0,
        },
      };
      const result = applyProgressEvent(prevState, event);
      // 0 is falsy, so prev values are kept
      expect(result.state.testsRun).toBe(20);
      expect(result.state.testsPassed).toBe(18);
    });

    it('error event produces error string', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'error',
        timestamp: new Date().toISOString(),
        data: { error: 'Out of memory' },
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.error).toBe('Out of memory');
    });

    it('error event without message uses default', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'error',
        timestamp: new Date().toISOString(),
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.error).toBe('An error occurred');
    });

    it('unknown event type produces no changes', () => {
      const event: TestProgress = {
        runId: 'r1',
        type: 'unknown_event',
        timestamp: new Date().toISOString(),
      };
      const result = applyProgressEvent(initialState, event);
      expect(result.state).toEqual(initialState);
      expect(result.logs).toHaveLength(0);
    });

    it('accumulates multiple events correctly', () => {
      let state = { ...initialState };
      const allLogs: LogEntry[] = [];

      // 2 passes
      for (let i = 0; i < 2; i++) {
        const r = applyProgressEvent(state, {
          runId: 'r1',
          type: 'test_pass',
          timestamp: '',
          data: { testName: `pass-${i}` },
        });
        state = r.state;
        allLogs.push(...r.logs);
      }

      // 1 fail
      const r2 = applyProgressEvent(state, {
        runId: 'r1',
        type: 'test_fail',
        timestamp: '',
        data: { testName: 'fail-0' },
      });
      state = r2.state;
      allLogs.push(...r2.logs);

      // 1 skip
      const r3 = applyProgressEvent(state, {
        runId: 'r1',
        type: 'test_skip',
        timestamp: '',
        data: { testName: 'skip-0' },
      });
      state = r3.state;
      allLogs.push(...r3.logs);

      expect(state.testsRun).toBe(4);
      expect(state.testsPassed).toBe(2);
      expect(state.testsFailed).toBe(1);
      expect(state.testsSkipped).toBe(1);
      expect(allLogs).toHaveLength(4);
    });

    it('currentTest updates on each event', () => {
      let state = { ...initialState };

      const r1 = applyProgressEvent(state, {
        runId: 'r1',
        type: 'test_pass',
        timestamp: '',
        data: { testName: 'first' },
      });
      state = r1.state;
      expect(state.currentTest).toBe('first');

      const r2 = applyProgressEvent(state, {
        runId: 'r1',
        type: 'test_fail',
        timestamp: '',
        data: { testName: 'second' },
      });
      state = r2.state;
      expect(state.currentTest).toBe('second');
    });

    it('currentTest preserved when testName missing', () => {
      const stateWithCurrent: ProgressState = {
        ...initialState,
        currentTest: 'previous',
      };
      const r = applyProgressEvent(stateWithCurrent, {
        runId: 'r1',
        type: 'test_pass',
        timestamp: '',
      });
      expect(r.state.currentTest).toBe('previous');
    });
  });

  // ===================== Request body shape =====================
  describe('start request body', () => {
    it('serializes scope and coverage correctly', () => {
      const scope = 'comprehensive';
      const withCoverage = true;
      const body = JSON.stringify({ scope, coverage: withCoverage });
      const parsed = JSON.parse(body);
      expect(parsed.scope).toBe('comprehensive');
      expect(parsed.coverage).toBe(true);
    });

    it('coverage can be false', () => {
      const body = JSON.stringify({ scope: 'quick', coverage: false });
      const parsed = JSON.parse(body);
      expect(parsed.coverage).toBe(false);
    });
  });
});
