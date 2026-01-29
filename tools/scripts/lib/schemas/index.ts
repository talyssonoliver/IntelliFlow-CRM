/**
 * Schema Definitions Index
 *
 * Central export point for all Zod schema definitions.
 * Import from this file for convenient access to all schemas.
 *
 * Example:
 *   import { attestationSchema, taskStatusObjectSchema } from './lib/schemas';
 */

// Vulnerability Baseline
export {
  vulnerabilityBaselineSchema,
  vulnerabilitySchema,
  severitySchema,
  scanResultSchema,
  type VulnerabilityBaseline,
  type Vulnerability,
  type Severity,
  type ScanResult,
} from './vulnerability-baseline.schema';

// Attestation
export {
  attestationSchema,
  verdictSchema,
  schemaVersionSchema,
  validationResultSchema,
  gateResultSchema,
  kpiResultSchema,
  contextAcknowledgmentSchema,
  evidenceSummarySchema,
  dodItemSchema,
  manualVerificationSchema,
  environmentSchema,
  type Attestation,
  type Verdict,
  type SchemaVersion,
  type ValidationResult,
  type GateResult,
  type KpiResult,
} from './attestation.schema';

// Task Status
export {
  taskStatusObjectSchema,
  taskStatusSchema,
  taskDependenciesSchema,
  statusHistoryEntrySchema,
  executionSchema,
  artifactsSchema,
  artifactEntrySchema,
  artifactItemSchema,
  validationEntrySchema,
  kpiEntrySchema,
  blockerEntrySchema,
  type TaskStatusObject,
  type TaskStatus,
  type TaskDependencies,
  type StatusHistoryEntry,
  type Execution,
  type Artifacts,
  type ValidationEntry,
  type KpiEntry,
  type BlockerEntry,
} from './task-status.schema';

// Phase Summary
export {
  phaseSummarySchema,
  streamStatusSchema,
  streamSchema,
  aggregatedMetricsSchema,
  phaseKpiSchema,
  type PhaseSummary,
  type StreamStatus,
  type Stream,
  type AggregatedMetrics,
  type PhaseKpi,
} from './phase-summary.schema';

// Sprint Summary
export {
  sprintSummarySchema,
  phaseStatusSchema,
  kpiStatusSchema,
  sprintPhaseSchema,
  taskSummarySchema,
  kpiSummaryEntrySchema,
  sprintBlockerSchema,
  type SprintSummary,
  type PhaseStatus,
  type KpiStatus,
  type SprintPhase,
  type TaskSummary,
  type KpiSummaryEntry,
  type SprintBlocker,
} from './sprint-summary.schema';

// Task Registry
export {
  taskRegistrySchema,
  sprintEntrySchema,
  registryTaskStatusSchema,
  tasksByStatusSchema,
  taskDetailSchema,
  type TaskRegistry,
  type SprintEntry,
  type RegistryTaskStatus,
  type TasksByStatus,
  type TaskDetail,
} from './task-registry.schema';

// Dependency Graph
export {
  dependencyGraphSchema,
  nodeStatusSchema,
  dependencyTypeSchema,
  graphNodeSchema,
  criticalPathSchema,
  crossSprintDependencySchema,
  dependencyViolationSchema,
  type DependencyGraph,
  type NodeStatus,
  type DependencyType,
  type GraphNode,
  type CriticalPath,
  type CrossSprintDependency,
  type DependencyViolation,
} from './dependency-graph.schema';

// KPI Definitions
export {
  kpiDefinitionsSchema,
  kpiUnitSchema,
  kpiDefinitionSchema,
  kpiCategorySchema,
  measurementScheduleSchema,
  type KpiDefinitions,
  type KpiUnit,
  type KpiDefinition,
  type KpiCategory,
  type MeasurementSchedule,
} from './kpi-definitions.schema';

// Traceability
export {
  traceabilitySchema,
  capabilitySchema,
  coverageSummarySchema,
  type Traceability,
  type Capability,
  type CoverageSummary,
} from './traceability.schema';

// Extracted Text
export {
  extractedTextSchema,
  documentFormatSchema,
  ocrEngineSchema,
  extractedTextMetadataSchema,
  provenanceSchema,
  qualityMetricsSchema,
  type ExtractedText,
  type DocumentFormat,
  type OcrEngine,
  type ExtractedTextMetadata,
  type Provenance,
  type QualityMetrics,
} from './extracted-text.schema';

// Analytics Event
export {
  analyticsEventSchema,
  environmentSchema as analyticsEnvironmentSchema,
  eventContextSchema,
  type AnalyticsEvent,
  type Environment as AnalyticsEnvironment,
  type EventContext,
} from './analytics-event.schema';

// Benchmark
export {
  benchmarkSchema,
  benchmarkStatusSchema,
  benchmarkResultSchema,
  modelBenchmarkSchema,
  performanceBudgetSchema,
  taskContextSchema,
  benchmarkEnvironmentSchema,
  benchmarkResultsSchema,
  kpiValidationSchema,
  benchmarkReferencesSchema,
  type Benchmark,
  type BenchmarkResult,
  type ModelBenchmark,
  type PerformanceBudget,
  type BenchmarkStatus,
} from './benchmark.schema';
