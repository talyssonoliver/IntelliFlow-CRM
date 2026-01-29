/**
 * Data Synchronization Module
 *
 * Single Source of Truth: Sprint_plan.csv
 * Automatically updates all derived files
 *
 * Refactored from monolithic data-sync.ts into modular components.
 */

// Main orchestration
export { syncAllMetrics, syncMetricsFromCSV, formatSyncResult } from './orchestrator';

// Types
export type {
  SyncResult,
  ValidationResult,
  DependencyNode,
  CrossSprintDep,
  CriticalPath,
  TaskRecord,
  SafeUpdateResult,
} from './types';

// Validation
export { validateMetricsConsistency } from './validation';

// File I/O utilities
export {
  readJsonTolerant,
  writeJsonFile,
  findRepoRoot,
  findTaskFile,
  findAllTaskJsons,
} from './file-io';

// CSV mapping utilities
export {
  mapCsvStatusToRegistry,
  mapCsvStatusToIndividual,
  mapCsvStatusToGraph,
  parseDependencies,
  parseArtifacts,
} from './csv-mapping';

// JSON generators
export { updateSprintPlanJson, updateTaskRegistry } from './json-generators';

// Task JSON operations
export { updateIndividualTaskFile, generateDefaultValidations } from './task-json-updater';

// Summary generators
export { updatePhaseSummaries, updateSprintSummaryGeneric } from './summary-generators';

// Dependency graph
export {
  updateDependencyGraph,
  computeParallelGroups,
  computeCriticalPaths,
  detectDependencyViolations,
} from './dependency-graph';

// PMBOK Schedule sync
export {
  syncScheduleData,
  getScheduleSummary,
  type ScheduleSyncResult,
} from './schedule-sync';
