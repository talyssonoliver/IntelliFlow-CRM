/**
 * Test Runner Module
 *
 * Real-time test execution system for the governance dashboard.
 * Provides vitest process spawning with live progress streaming.
 */

// Types
export type {
  TestRunConfig,
  TestRunState,
  TestRunProgress,
  TestResult,
  TestSuiteResult,
  CoverageMetrics,
  TestScope,
  TestSuite,
  TestRunStatus,
  ActiveTestRun,
} from './types';

// Events
export { testRunnerEvents } from './events';

// Spawner
export {
  startTestRun,
  cancelTestRun,
  getRunState,
  getActiveRuns,
  getScopeDescription,
} from './spawner';

// Parser
export { parseVitestLine, parseVitestOutput, parseCoverageSummary } from './parser';
