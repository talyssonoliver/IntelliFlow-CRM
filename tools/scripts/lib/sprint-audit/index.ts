/**
 * Sprint Completion Audit Module
 *
 * Exports all components for verifying sprint completion with
 * real implementations (no fake results or placeholders).
 *
 * @module tools/scripts/lib/sprint-audit
 */

// Types
export * from './types';

// Core components
export {
  runPlaceholderScan,
  scanForPlaceholders,
  scanFile,
  discoverFiles,
  filterFindingsByTaskArtifacts,
  groupByPattern,
  groupByFile,
  generatePlaceholderSummary,
  PLACEHOLDER_PATTERNS,
} from './placeholder-detector';

export {
  verifyArtifact,
  verifyTaskArtifacts,
  verifyMultipleTasksArtifacts,
  resolveArtifactPaths,
  parseArtifactSpec,
  generateArtifactSummary,
  extractArtifactHashes,
  allArtifactsValid,
  getCriticalArtifactIssues,
} from './artifact-verifier';

export {
  executeCommand,
  runTaskValidations,
  runMultipleTaskValidations,
  parseValidationCommands,
  generateValidationSummary,
  allValidationsPassed,
  getFailedValidations,
  createDryRunResult,
  dryRunTaskValidations,
} from './validation-runner';

export {
  parseKpi,
  parseKpis,
  measureKpi,
  verifyKpi,
  verifyTaskKpis,
  compareKpiValue,
  generateKpiSummary,
  getFailedKpis,
  getManualKpis,
} from './kpi-verifier';

// Main auditor
export {
  auditSprintCompletion,
  auditTask,
  loadSprintTasks,
  filterSprintTasks,
  filterCompletedTasks,
  verifyDependencies,
  verifyDefinitionOfDone,
} from './sprint-auditor';

// Report generation
export {
  getAuditOutputPaths,
  writeJsonReport,
  writeVerdictJson,
  writeMarkdownReport,
  writeArtifactHashes,
  writePlaceholderScan,
  writeAllReports,
  createLatestLink,
  generateMarkdownReport,
} from './report-generator';

// Attestation generation (integrates with attestation.schema.json)
export {
  generateAttestation,
  writeAttestation,
  readAttestation,
  listSprintAttestations,
  listAttestationHistory,
  generateSprintSummary,
  determineVerdict,
  getAttestationDir,
  getAttestationPath,
  type TaskAttestation,
  type AuditFindings,
  type SprintAttestationSummary,
  type AttestationVerdict,
} from './attestation-generator';

// Waiver checking (integrates with plan-overrides.yaml)
export {
  getWaiverStatus,
  getTaskOverride,
  loadPlanOverrides,
  isIssueCoveredByWaiver,
  getMultipleWaiverStatuses,
  getExpiringWaivers,
  getExpiredWaivers,
  getRequiredGates,
  getRequiredEvidence,
  getGateProfiles,
  type WaiverStatus,
  type Tier,
  type ExceptionPolicy,
  type TaskOverride,
  type PlanOverrides,
} from './waiver-checker';

// Action tracking (integrates with debt-ledger.yaml and review-queue.json)
export {
  createActionsFromAttestation,
  addToDebtLedger,
  addToReviewQueue,
  removeFromReviewQueue,
  loadDebtLedger,
  saveDebtLedger,
  loadReviewQueue,
  saveReviewQueue,
  getTaskActions,
  getDebtSummary,
  type ActionItem,
  type ActionSeverity,
  type ActionStatus,
  type ActionType,
  type DebtLedger,
  type ReviewQueueItem,
} from './action-tracker';
