/**
 * Centralized path construction for .specify/{TASK_ID}/ structure
 *
 * All task artifacts are organized under a single task directory.
 * All files are prefixed with {TASK_ID}- for self-identification.
 *
 * .specify/{TASK_ID}/
 * ├── context/
 * │   ├── {TASK_ID}-hydrated-context.md
 * │   ├── {TASK_ID}-hydrated-context.json
 * │   ├── {TASK_ID}-agent-selection.json
 * │   └── {TASK_ID}-plan-session.json
 * ├── specifications/
 * │   ├── {TASK_ID}-spec.md
 * │   └── {TASK_ID}-discussion.md
 * ├── planning/
 * │   └── {TASK_ID}-plan.md
 * ├── attestations/
 * │   ├── {TASK_ID}-context_ack.json
 * │   ├── {TASK_ID}-context_pack.md
 * │   ├── {TASK_ID}-context_pack.manifest.json
 * │   ├── {TASK_ID}-attestation.json
 * │   └── {TASK_ID}-validation.json
 * └── evidence/
 *     ├── gates/
 *     ├── stoa-verdicts/
 *     ├── {TASK_ID}-summary.json
 *     ├── {TASK_ID}-summary.md
 *     └── {TASK_ID}-evidence-hashes.txt
 */

import { join } from 'node:path';

/**
 * Get the root task directory
 */
export function getTaskDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId);
}

/**
 * Get the context directory for a task
 * Contains: hydrated-context.md, hydrated-context.json, agent-selection.json, plan-session.json
 */
export function getContextDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'context');
}

/**
 * Get the specifications directory for a task
 * Contains: {TASK_ID}-spec.md, {TASK_ID}-discussion.md
 */
export function getSpecificationsDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'specifications');
}

/**
 * Get the planning directory for a task
 * Contains: {TASK_ID}-plan.md
 */
export function getPlanningDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'planning');
}

/**
 * Get the attestations directory for a task
 * Contains: {TASK_ID}-context_ack.json, {TASK_ID}-context_pack.md, etc.
 */
export function getAttestationsDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'attestations');
}

/**
 * Get the evidence directory for a task
 * Contains: gates/, stoa-verdicts/, {TASK_ID}-summary.json, etc.
 */
export function getEvidenceDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'evidence');
}

// ============================================================================
// Specific file paths (all prefixed with {TASK_ID}-)
// ============================================================================

/**
 * Get path to the specification file
 */
export function getSpecPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'specifications', `${taskId}-spec.md`);
}

/**
 * Get path to the discussion log file
 */
export function getDiscussionPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'specifications', `${taskId}-discussion.md`);
}

/**
 * Get path to the plan file
 */
export function getPlanPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'planning', `${taskId}-plan.md`);
}

/**
 * Get path to the hydrated context markdown file
 */
export function getHydratedContextMdPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'context', `${taskId}-hydrated-context.md`);
}

/**
 * Get path to the hydrated context JSON file
 */
export function getHydratedContextJsonPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'context', `${taskId}-hydrated-context.json`);
}

/**
 * Get path to the agent selection file
 */
export function getAgentSelectionPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'context', `${taskId}-agent-selection.json`);
}

/**
 * Get path to the plan session file
 */
export function getPlanSessionPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'context', `${taskId}-plan-session.json`);
}

/**
 * Get path to the context acknowledgment file
 */
export function getContextAckPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'attestations', `${taskId}-context_ack.json`);
}

/**
 * Get path to the context pack markdown file
 */
export function getContextPackMdPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'attestations', `${taskId}-context_pack.md`);
}

/**
 * Get path to the context pack manifest file
 */
export function getContextPackManifestPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'attestations', `${taskId}-context_pack.manifest.json`);
}

/**
 * Get path to the attestation file
 */
export function getAttestationPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'attestations', `${taskId}-attestation.json`);
}

/**
 * Get path to the evidence summary JSON file
 */
export function getEvidenceSummaryJsonPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'evidence', `${taskId}-summary.json`);
}

/**
 * Get path to the evidence summary markdown file
 */
export function getEvidenceSummaryMdPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'evidence', `${taskId}-summary.md`);
}

/**
 * Get path to the evidence hashes file
 */
export function getEvidenceHashesPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'evidence', `${taskId}-evidence-hashes.txt`);
}

/**
 * Get path to the gates subdirectory
 */
export function getGatesDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'evidence', 'gates');
}

/**
 * Get path to the STOA verdicts subdirectory
 */
export function getStoaVerdictsDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, taskId, 'evidence', 'stoa-verdicts');
}

// ============================================================================
// Legacy path helpers (for backward compatibility during migration)
// ============================================================================

/**
 * Get legacy spec path (old structure)
 */
export function getLegacySpecPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, 'specifications', `${taskId}-spec.md`);
}

/**
 * Get legacy spec path (even older structure without suffix)
 */
export function getLegacySpecPathOld(specifyDir: string, taskId: string): string {
  return join(specifyDir, 'specifications', `${taskId}.md`);
}

/**
 * Get legacy plan path (old structure)
 */
export function getLegacyPlanPath(specifyDir: string, taskId: string): string {
  return join(specifyDir, 'planning', `${taskId}-plan.md`);
}

/**
 * Get legacy plan path (even older structure without suffix)
 */
export function getLegacyPlanPathOld(specifyDir: string, taskId: string): string {
  return join(specifyDir, 'planning', `${taskId}.md`);
}

/**
 * Get legacy context directory (old structure)
 */
export function getLegacyContextDir(specifyDir: string, taskId: string): string {
  return join(specifyDir, 'context', taskId);
}

/**
 * Get legacy attestations directory (old location in artifacts/)
 */
export function getLegacyAttestationsDir(repoRoot: string, taskId: string): string {
  return join(repoRoot, 'artifacts', 'attestations', taskId);
}

/**
 * Get legacy evidence directory (old system-audit location)
 */
export function getLegacyEvidenceDir(repoRoot: string, runId: string): string {
  return join(repoRoot, 'artifacts', 'reports', 'system-audit', runId);
}
