/**
 * STOA Framework - Module Exports
 *
 * Central export point for all STOA framework modules.
 *
 * @module tools/scripts/lib/stoa
 */

// Types
export * from './types.js';

// Gate Selection
export {
  loadAuditMatrix,
  getToolById,
  canToolRun,
  getToolUnavailabilityReason,
  getStoaRequiredToolIds,
  getBaselineGates,
  selectGates,
  validateGateSelection,
  orderGatesForExecution,
} from './gate-selection.js';

// STOA Assignment
export {
  getLeadStoa,
  deriveSupportingStoas,
  assignStoas,
  getAllInvolvedStoas,
  applyOverrides,
  type StoaOverride,
} from './stoa-assignment.js';

// Waiver System
export {
  determineWaiverReason,
  createWaiverRecord,
  isWaiverValid,
  isWaiverEffective,
  getWaiverStatus,
  getStrictModeBehavior,
  loadWaivers,
  saveWaivers,
  mergeWaivers,
  approveWaiver,
  renewWaiver,
  makeWaiverPermanent,
  summarizeWaivers,
  type WaiverSummary,
} from './waiver.js';

// Evidence
export {
  generateRunId,
  sha256,
  sha256File,
  generateEvidenceHash,
  generateDirectoryHashes,
  getEvidenceDir,
  getGatesDir,
  getStoaVerdictsDir,
  getTaskUpdatesDir,
  ensureEvidenceDirs,
  writeGateSelection,
  writeEvidenceHashes,
  writeRunSummaryJson,
  writeRunSummaryMd,
  writeCsvPatchProposal,
  createEvidenceBundle,
  createRunSummary,
  writeRunSummary,
  verifyEvidenceIntegrity,
} from './evidence.js';

// Gate Runner
export {
  normalizeRepoPath,
  runGate,
  runGates,
  summarizeGateResults,
  allGatesPassed,
  verifyToolAvailable,
  verifyToolsAvailable,
  type GateRunnerOptions,
  type GateResultSummary,
} from './gate-runner.js';

// CSV Governance
export {
  verdictToCsvStatus,
  createStatusChangeProposal,
  createMultiFieldProposal,
  getPatchHistoryPath,
  appendToPatchHistory,
  loadPatchHistory,
  getPendingPatches,
  markPatchApplied,
  markPatchRejected,
  generatePatchDiff,
  validatePatchApplicable,
  FORBIDDEN_CSV_OPERATIONS,
  isForbiddenOperation,
  type PatchHistoryEntry,
} from './csv-governance.js';

// Verdict
export {
  createGateFailureFinding,
  createWaiverPendingFinding,
  createWaiverExpiredFinding,
  createInfoFinding,
  determineVerdict,
  generateStoaVerdict,
  writeStoaVerdict,
  aggregateVerdicts,
  aggregateFindings,
  generateCombinedRationale,
  determineSupportingSignOff,
  type SignOffDecision,
  type SignOffResult,
} from './verdict.js';

// Orchestrator
export {
  runPreflightChecks,
  loadTaskFromCsv,
  runStoaOrchestration,
  parseCliArgs,
  cli,
  type OrchestratorResult,
} from './orchestrator.js';

// Remediation
export {
  loadReviewQueue,
  saveReviewQueue,
  createReviewQueueItem,
  appendToReviewQueue,
  loadBlockers,
  saveBlockers,
  createBlockerRecord,
  addBlocker,
  resolveBlocker,
  generateHumanPacket,
  saveHumanPacket,
  loadDebtLedger,
  saveDebtLedger,
  createDebtEntry,
  appendToDebtLedger,
  processVerdictRemediation,
  generateRemediationReport,
  type ReviewQueueItem,
  type BlockerRecord,
  type HumanPacket,
  type DebtLedgerEntry,
  type RemediationResult,
} from './remediation.js';

// Attestation
export {
  loadAllTasks,
  loadSprintTasks,
  loadCompletedTasks,
  extractTaskContext,
  attestTask,
  attestSprint,
  generateAttestationMarkdown,
  saveAttestationReport,
  type TaskRecord,
  type TaskContext,
  type AttestationCriterion,
  type TaskAttestation,
  type SprintAttestationReport,
} from './attestation.js';

// Context Hydration
export {
  extractTaskMetadata,
  getFullTaskRecord,
  resolveDependencyArtifacts,
  scanCodebasePatterns,
  loadProjectKnowledge,
  hydrateContext,
  getContextDir,
  writeHydratedContext,
  loadHydratedContext,
  hasHydratedContext,
  generateContextMarkdown,
  hydrateContextCli,
} from './context-hydration.js';

// Agent Selection
export {
  AGENT_POOL,
  analyzeTaskDomain,
  selectAgents,
  writeAgentSelection,
} from './agent-selection.js';

// Spec Session
export {
  createSpecSession,
  getRoundType,
  getTopicForRound,
  buildAgentPrompt,
  addRoundToSession,
  checkConsensus,
  generateSpecification,
  writeSpecification,
  writeDiscussionLog,
} from './spec-session.js';

// Plan Session
export {
  createPlanSession,
  generatePlan,
  writePlan,
} from './plan-session.js';

// Paths
export {
  getSpecificationsDir,
  getContextDir as getContextDirPath,
  getSpecPath,
  getPlanPath,
  getDiscussionPath,
  getHydratedContextMdPath,
  getHydratedContextJsonPath,
  getAgentSelectionPath,
  getAttestationsDir,
  getEvidenceDir,
} from './paths.js';
