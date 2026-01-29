/**
 * Centralized path construction for .specify/sprints/sprint-{N}/ structure
 *
 * All task artifacts are organized by sprint number under .specify/sprints/.
 * Files use {TASK_ID}- prefix for self-identification.
 *
 * .specify/
 * ├── sprints/
 * │   └── sprint-{N}/
 * │       ├── _summary.json
 * │       ├── specifications/
 * │       │   └── {TASK_ID}-spec.md
 * │       ├── planning/
 * │       │   └── {TASK_ID}-plan.md
 * │       ├── context/
 * │       │   └── {TASK_ID}/
 * │       │       ├── {TASK_ID}-hydrated-context.md
 * │       │       ├── {TASK_ID}-hydrated-context.json
 * │       │       ├── {TASK_ID}-agent-selection.json
 * │       │       └── {TASK_ID}-plan-session.json
 * │       ├── attestations/
 * │       │   └── {TASK_ID}/
 * │       │       ├── {TASK_ID}-context_ack.json
 * │       │       ├── {TASK_ID}-context_pack.md
 * │       │       ├── {TASK_ID}-context_pack.manifest.json
 * │       │       ├── {TASK_ID}-attestation.json
 * │       │       └── {TASK_ID}-validation.json
 * │       ├── coverage/
 * │       └── evidence/
 * │           └── {TASK_ID}/
 * │               ├── gates/
 * │               ├── stoa-verdicts/
 * │               ├── {TASK_ID}-summary.json
 * │               ├── {TASK_ID}-summary.md
 * │               └── {TASK_ID}-evidence-hashes.txt
 * └── memory/
 *     └── constitution.md
 */

import { join } from 'node:path';

// ============================================================================
// Sprint-based directory structure (NEW - Unified Structure)
// ============================================================================

/**
 * Get the sprint directory for a given sprint number
 */
export function getSprintDir(specifyDir: string, sprintNumber: number): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`);
}

/**
 * Get the sprint summary file path
 */
export function getSprintSummaryPath(specifyDir: string, sprintNumber: number): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, '_summary.json');
}

/**
 * Get the context directory for a task within its sprint
 * Contains: hydrated-context.md, hydrated-context.json, agent-selection.json, plan-session.json
 */
export function getContextDir(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'context', taskId);
}

/**
 * Get the specifications directory for a sprint
 * Contains: {TASK_ID}-spec.md files
 */
export function getSpecificationsDir(specifyDir: string, sprintNumber: number): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'specifications');
}

/**
 * Get the planning directory for a sprint
 * Contains: {TASK_ID}-plan.md files
 */
export function getPlanningDir(specifyDir: string, sprintNumber: number): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'planning');
}

/**
 * Get the attestations directory for a task within its sprint
 * Contains: {TASK_ID}-context_ack.json, {TASK_ID}-context_pack.md, etc.
 */
export function getAttestationsDir(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'attestations', taskId);
}

/**
 * Get the evidence directory for a task within its sprint
 * Contains: gates/, stoa-verdicts/, {TASK_ID}-summary.json, etc.
 */
export function getEvidenceDir(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'evidence', taskId);
}

/**
 * Get the coverage directory for a sprint
 */
export function getCoverageDir(specifyDir: string, sprintNumber: number): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'coverage');
}

/**
 * Get the memory directory (agent constitution, shared across sprints)
 */
export function getMemoryDir(specifyDir: string): string {
  return join(specifyDir, 'memory');
}

/**
 * Get the constitution file path
 */
export function getConstitutionPath(specifyDir: string): string {
  return join(specifyDir, 'memory', 'constitution.md');
}

// ============================================================================
// Specific file paths (all organized by sprint)
// ============================================================================

/**
 * Get path to the specification file
 */
export function getSpecPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'specifications', `${taskId}-spec.md`);
}

/**
 * Get path to the discussion log file
 */
export function getDiscussionPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'specifications', `${taskId}-discussion.md`);
}

/**
 * Get path to the plan file
 */
export function getPlanPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'planning', `${taskId}-plan.md`);
}

/**
 * Get path to the hydrated context markdown file
 */
export function getHydratedContextMdPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'context', taskId, `${taskId}-hydrated-context.md`);
}

/**
 * Get path to the hydrated context JSON file
 */
export function getHydratedContextJsonPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'context', taskId, `${taskId}-hydrated-context.json`);
}

/**
 * Get path to the agent selection file
 */
export function getAgentSelectionPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'context', taskId, `${taskId}-agent-selection.json`);
}

/**
 * Get path to the plan session file
 */
export function getPlanSessionPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'context', taskId, `${taskId}-plan-session.json`);
}

/**
 * Get path to the context acknowledgment file
 */
export function getContextAckPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'attestations', taskId, `${taskId}-context_ack.json`);
}

/**
 * Get path to the context pack markdown file
 */
export function getContextPackMdPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'attestations', taskId, `${taskId}-context_pack.md`);
}

/**
 * Get path to the context pack manifest file
 */
export function getContextPackManifestPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'attestations', taskId, `${taskId}-context_pack.manifest.json`);
}

/**
 * Get path to the attestation file
 */
export function getAttestationPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'attestations', taskId, `${taskId}-attestation.json`);
}

/**
 * Get path to the validation file
 */
export function getValidationPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'attestations', taskId, `${taskId}-validation.json`);
}

/**
 * Get path to the evidence summary JSON file
 */
export function getEvidenceSummaryJsonPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'evidence', taskId, `${taskId}-summary.json`);
}

/**
 * Get path to the evidence summary markdown file
 */
export function getEvidenceSummaryMdPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'evidence', taskId, `${taskId}-summary.md`);
}

/**
 * Get path to the evidence hashes file
 */
export function getEvidenceHashesPath(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'evidence', taskId, `${taskId}-evidence-hashes.txt`);
}

/**
 * Get path to the gates subdirectory
 */
export function getGatesDir(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'evidence', taskId, 'gates');
}

/**
 * Get path to the STOA verdicts subdirectory
 */
export function getStoaVerdictsDir(specifyDir: string, sprintNumber: number, taskId: string): string {
  return join(specifyDir, 'sprints', `sprint-${sprintNumber}`, 'evidence', taskId, 'stoa-verdicts');
}

// ============================================================================
// Legacy path helpers (for backward compatibility during migration)
// These will be removed after migration is complete
// ============================================================================

/**
 * @deprecated Use getSprintDir + task paths instead
 * Get the root task directory (old task-based structure)
 */
export function getTaskDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId);
}

/**
 * @deprecated Use getContextDir with sprint parameter instead
 * Get legacy context directory (old structure)
 */
export function getLegacyContextDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'context');
}

/**
 * @deprecated Use getSpecificationsDir with sprint parameter instead
 * Get legacy specifications directory (old structure)
 */
export function getLegacySpecificationsDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'specifications');
}

/**
 * @deprecated Use getPlanningDir with sprint parameter instead
 * Get legacy planning directory (old structure)
 */
export function getLegacyPlanningDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'planning');
}

/**
 * @deprecated Use getAttestationsDir with sprint parameter instead
 * Get legacy attestations directory (old structure)
 */
export function getLegacyAttestationsTaskDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'attestations');
}

/**
 * @deprecated Use getEvidenceDir with sprint parameter instead
 * Get legacy evidence directory (old structure)
 */
export function getLegacyEvidenceTaskDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'evidence');
}

/**
 * @deprecated Use getSpecPath with sprint parameter instead
 * Get legacy spec path (old flat structure)
 */
export function getLegacySpecPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, 'specifications', `${taskId}-spec.md`);
}

/**
 * @deprecated Use getSpecPath with sprint parameter instead
 * Get legacy spec path (even older structure without suffix)
 */
export function getLegacySpecPathOld(specifyDir: string, taskId: string): string {
  return join(specifyDir, 'specifications', `${taskId}.md`);
}

/**
 * @deprecated Use getPlanPath with sprint parameter instead
 * Get legacy plan path (old flat structure)
 */
export function getLegacyPlanPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, 'planning', `${taskId}-plan.md`);
}

/**
 * @deprecated Use getPlanPath with sprint parameter instead
 * Get legacy plan path (even older structure without suffix)
 */
export function getLegacyPlanPathOld(specifyDir: string, taskId: string): string {
  return join(specifyDir, 'planning', `${taskId}.md`);
}

/**
 * @deprecated Use getAttestationsDir with sprint parameter instead
 * Get legacy attestations directory (old location in artifacts/)
 */
export function getLegacyAttestationsDir(repoRoot: string, taskId: string): string {
  return join(repoRoot, 'artifacts', 'attestations', taskId);
}

/**
 * @deprecated Use getEvidenceDir with sprint parameter instead
 * Get legacy evidence directory (old system-audit location)
 */
export function getLegacyEvidenceDir(repoRoot: string, runId: string): string {
  return join(repoRoot, 'artifacts', 'reports', 'system-audit', runId);
}

/**
 * @deprecated Use getContextDir with sprint parameter instead
 * Get old flat context directory
 */
export function getLegacyFlatContextDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, 'context', taskId);
}
