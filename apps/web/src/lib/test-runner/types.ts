/**
 * Test Runner Types
 *
 * TypeScript interfaces for the real-time test execution system.
 */

export type TestScope = 'quick' | 'standard' | 'comprehensive';
export type TestSuite = 'unit' | 'integration' | 'all';
export type TestRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TestRunConfig {
  runId: string;
  scope: TestScope;
  suites?: TestSuite[];
  patterns?: string[]; // File patterns to include
  coverage: boolean;
  timeout?: number; // milliseconds, default 5 minutes
}

export interface TestResult {
  name: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: {
    message: string;
    stack?: string;
    expected?: string;
    actual?: string;
  };
}

export interface TestSuiteResult {
  name: string;
  file: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

export interface CoverageMetrics {
  lines: { total: number; covered: number; pct: number };
  statements: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
}

export interface TestRunProgress {
  runId: string;
  type:
    | 'start'
    | 'test_start'
    | 'test_pass'
    | 'test_fail'
    | 'test_skip'
    | 'suite_start'
    | 'suite_complete'
    | 'coverage_start'
    | 'coverage_complete'
    | 'stdout'
    | 'stderr'
    | 'complete'
    | 'error'
    | 'ping';
  timestamp: string;
  data?: {
    testName?: string;
    suiteName?: string;
    file?: string;
    duration?: number;
    error?: string;
    testsRun?: number;
    testsPassed?: number;
    testsFailed?: number;
    testsSkipped?: number;
    coverage?: CoverageMetrics;
    message?: string;
    passed?: boolean; // Whether suite/test passed
  };
}

export interface TestRunState {
  runId: string;
  config: TestRunConfig;
  status: TestRunStatus;
  startedAt: string;
  completedAt?: string;
  progress: {
    testsTotal: number;
    testsRun: number;
    testsPassed: number;
    testsFailed: number;
    testsSkipped: number;
    currentFile?: string;
    currentTest?: string;
  };
  results: TestSuiteResult[];
  coverage?: CoverageMetrics;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface ActiveTestRun {
  runId: string;
  status: TestRunStatus;
  startedAt: string;
  progress: {
    testsRun: number;
    testsPassed: number;
    testsFailed: number;
  };
}
