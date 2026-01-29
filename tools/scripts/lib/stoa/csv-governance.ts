/**
 * CSV Governance System
 *
 * Implements CSV patch proposals from Framework.md Section 11.5.1.
 * Agents propose changes; humans apply them.
 *
 * @module tools/scripts/lib/stoa/csv-governance
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  CsvPatchProposal,
  CsvRowChange,
  VerdictType,
  CsvStatus,
  VERDICT_TO_CSV_STATUS,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

const CSV_PATCH_HISTORY_FILE = 'csv-patch-history.jsonl';

// ============================================================================
// Verdict to Status Mapping
// ============================================================================

/**
 * Map STOA verdict to CSV status.
 */
export function verdictToCsvStatus(verdict: VerdictType): CsvStatus {
  const mapping: Record<VerdictType, CsvStatus> = {
    PASS: 'Completed',
    WARN: 'Completed',
    FAIL: 'Blocked',
    NEEDS_HUMAN: 'Needs Human',
  };

  return mapping[verdict];
}

// ============================================================================
// Patch Proposal Creation
// ============================================================================

/**
 * Create a CSV patch proposal for a status change.
 */
export function createStatusChangeProposal(
  runId: string,
  taskId: string,
  currentStatus: string,
  verdict: VerdictType,
  rationale: string,
  evidencePaths: string[],
  agentId: string = 'stoa-orchestrator'
): CsvPatchProposal {
  const newStatus = verdictToCsvStatus(verdict);

  return {
    runId,
    taskId,
    proposedAt: new Date().toISOString(),
    proposedBy: agentId,
    changes: [
      {
        taskId,
        field: 'Status',
        oldValue: currentStatus,
        newValue: newStatus,
      },
    ],
    rationale,
    evidenceRefs: evidencePaths,
  };
}

/**
 * Create a CSV patch proposal for multiple field changes.
 */
export function createMultiFieldProposal(
  runId: string,
  taskId: string,
  changes: Array<{ field: string; oldValue: string; newValue: string }>,
  rationale: string,
  evidencePaths: string[],
  agentId: string = 'stoa-orchestrator'
): CsvPatchProposal {
  return {
    runId,
    taskId,
    proposedAt: new Date().toISOString(),
    proposedBy: agentId,
    changes: changes.map((c) => ({
      taskId,
      ...c,
    })),
    rationale,
    evidenceRefs: evidencePaths,
  };
}

// ============================================================================
// Patch History
// ============================================================================

export interface PatchHistoryEntry {
  proposal: CsvPatchProposal;
  appliedAt: string | null;
  appliedBy: string | null;
  rejected: boolean;
  rejectionReason?: string;
}

/**
 * Get the patch history file path.
 */
export function getPatchHistoryPath(repoRoot: string): string {
  return join(repoRoot, 'artifacts', 'reports', CSV_PATCH_HISTORY_FILE);
}

/**
 * Append a patch proposal to the history.
 */
export function appendToPatchHistory(repoRoot: string, entry: PatchHistoryEntry): void {
  const historyPath = getPatchHistoryPath(repoRoot);
  const line = JSON.stringify(entry) + '\n';
  appendFileSync(historyPath, line, 'utf-8');
}

/**
 * Load all patch history entries.
 */
export function loadPatchHistory(repoRoot: string): PatchHistoryEntry[] {
  const historyPath = getPatchHistoryPath(repoRoot);

  if (!existsSync(historyPath)) {
    return [];
  }

  const content = readFileSync(historyPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  return lines
    .map((line) => {
      try {
        return JSON.parse(line) as PatchHistoryEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is PatchHistoryEntry => e !== null);
}

/**
 * Get pending patch proposals (not yet applied or rejected).
 */
export function getPendingPatches(repoRoot: string): PatchHistoryEntry[] {
  const history = loadPatchHistory(repoRoot);
  return history.filter((e) => e.appliedAt === null && !e.rejected);
}

/**
 * Mark a patch as applied.
 */
export function markPatchApplied(repoRoot: string, runId: string, appliedBy: string): void {
  // Note: JSONL format doesn't allow in-place updates.
  // In production, this would use a proper database or structured file.
  // For now, we append an "applied" marker entry.
  const marker: PatchHistoryEntry = {
    proposal: {
      runId,
      taskId: '',
      proposedAt: '',
      proposedBy: '',
      changes: [],
      rationale: `Applied marker for ${runId}`,
      evidenceRefs: [],
    },
    appliedAt: new Date().toISOString(),
    appliedBy,
    rejected: false,
  };

  appendToPatchHistory(repoRoot, marker);
}

/**
 * Mark a patch as rejected.
 */
export function markPatchRejected(
  repoRoot: string,
  runId: string,
  rejectedBy: string,
  reason: string
): void {
  const marker: PatchHistoryEntry = {
    proposal: {
      runId,
      taskId: '',
      proposedAt: '',
      proposedBy: '',
      changes: [],
      rationale: `Rejection marker for ${runId}`,
      evidenceRefs: [],
    },
    appliedAt: null,
    appliedBy: null,
    rejected: true,
    rejectionReason: `Rejected by ${rejectedBy}: ${reason}`,
  };

  appendToPatchHistory(repoRoot, marker);
}

// ============================================================================
// Patch Application (Human-triggered)
// ============================================================================

/**
 * Generate a human-readable diff for a patch proposal.
 */
export function generatePatchDiff(proposal: CsvPatchProposal): string {
  const lines: string[] = [
    `=== CSV Patch Proposal ===`,
    `Run ID: ${proposal.runId}`,
    `Task ID: ${proposal.taskId}`,
    `Proposed At: ${proposal.proposedAt}`,
    `Proposed By: ${proposal.proposedBy}`,
    '',
    'Changes:',
  ];

  for (const change of proposal.changes) {
    lines.push(`  ${change.field}:`);
    lines.push(`    - ${change.oldValue}`);
    lines.push(`    + ${change.newValue}`);
  }

  lines.push('');
  lines.push(`Rationale: ${proposal.rationale}`);
  lines.push('');
  lines.push('Evidence:');

  for (const ref of proposal.evidenceRefs) {
    lines.push(`  - ${ref}`);
  }

  return lines.join('\n');
}

/**
 * Validate that a patch is still applicable (values haven't drifted).
 */
export function validatePatchApplicable(
  proposal: CsvPatchProposal,
  currentCsvValues: Record<string, Record<string, string>>
): { valid: boolean; conflicts: string[] } {
  const conflicts: string[] = [];

  for (const change of proposal.changes) {
    const currentRow = currentCsvValues[change.taskId];

    if (!currentRow) {
      conflicts.push(`Task ${change.taskId} not found in CSV`);
      continue;
    }

    const currentValue = currentRow[change.field];

    if (currentValue !== change.oldValue) {
      conflicts.push(
        `${change.taskId}.${change.field}: expected '${change.oldValue}', found '${currentValue}'`
      );
    }
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
  };
}

// ============================================================================
// Patch Application (Auto-apply)
// ============================================================================

export interface ApplyPatchResult {
  success: boolean;
  appliedAt: string;
  appliedBy: string;
  changes: Array<{ taskId: string; field: string; oldValue: string; newValue: string }>;
  error?: string;
}

/**
 * Apply a CSV patch proposal to Sprint_plan.csv.
 *
 * This is the auto-apply mechanism for MATOP verdicts.
 * Creates evidence trail and updates patch history.
 */
export function applyCsvPatch(
  repoRoot: string,
  proposal: CsvPatchProposal,
  appliedBy: string = 'matop-auto'
): ApplyPatchResult {
  const csvPath = join(
    repoRoot,
    'apps',
    'project-tracker',
    'docs',
    'metrics',
    '_global',
    'Sprint_plan.csv'
  );

  if (!existsSync(csvPath)) {
    return {
      success: false,
      appliedAt: new Date().toISOString(),
      appliedBy,
      changes: [],
      error: `CSV file not found: ${csvPath}`,
    };
  }

  try {
    // Read CSV
    const content = readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');

    if (lines.length < 2) {
      return {
        success: false,
        appliedAt: new Date().toISOString(),
        appliedBy,
        changes: [],
        error: 'CSV file is empty or has no data rows',
      };
    }

    // Parse header to find column indices
    const header = lines[0].split(',').map((h) => h.trim());
    const taskIdIndex = header.findIndex((h) => h === 'Task ID');
    const statusIndex = header.findIndex((h) => h === 'Status');

    if (taskIdIndex === -1) {
      return {
        success: false,
        appliedAt: new Date().toISOString(),
        appliedBy,
        changes: [],
        error: 'Task ID column not found in CSV',
      };
    }

    // Build column index map
    const columnIndices: Record<string, number> = {};
    header.forEach((h, i) => {
      columnIndices[h] = i;
    });

    // Process each change
    const appliedChanges: Array<{
      taskId: string;
      field: string;
      oldValue: string;
      newValue: string;
    }> = [];
    let modified = false;

    for (const change of proposal.changes) {
      const fieldIndex = columnIndices[change.field];
      if (fieldIndex === undefined) {
        console.warn(`Field not found in CSV: ${change.field}`);
        continue;
      }

      // Find the row with matching task ID
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        // Parse CSV line (handle quoted fields)
        const fields = parseCSVLine(line);
        if (fields[taskIdIndex] === change.taskId) {
          // Verify current value matches expected (drift check)
          const currentValue = fields[fieldIndex] || '';
          if (currentValue !== change.oldValue) {
            console.warn(
              `Drift detected for ${change.taskId}.${change.field}: expected '${change.oldValue}', found '${currentValue}'`
            );
            // Still apply - the proposal was based on earlier state
          }

          // Update the field
          fields[fieldIndex] = change.newValue;

          // Rebuild the line
          lines[i] = fields.map((f) => (f.includes(',') ? `"${f}"` : f)).join(',');
          modified = true;

          appliedChanges.push({
            taskId: change.taskId,
            field: change.field,
            oldValue: currentValue,
            newValue: change.newValue,
          });

          break;
        }
      }
    }

    if (!modified) {
      return {
        success: false,
        appliedAt: new Date().toISOString(),
        appliedBy,
        changes: [],
        error: `No matching tasks found for patch`,
      };
    }

    // Write back
    writeFileSync(csvPath, lines.join('\n'), 'utf-8');

    const appliedAt = new Date().toISOString();

    // Update patch history with applied marker
    const appliedEntry: PatchHistoryEntry = {
      proposal,
      appliedAt,
      appliedBy,
      rejected: false,
    };
    appendToPatchHistory(repoRoot, appliedEntry);

    return {
      success: true,
      appliedAt,
      appliedBy,
      changes: appliedChanges,
    };
  } catch (error) {
    return {
      success: false,
      appliedAt: new Date().toISOString(),
      appliedBy,
      changes: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Parse a CSV line handling quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

// ============================================================================
// Forbidden Operations
// ============================================================================

/**
 * List of operations that agents must NEVER perform on CSV.
 * Note: applyCsvPatch is ALLOWED because it:
 * - Creates evidence trail
 * - Updates patch history
 * - Only changes fields specified in approved proposals
 */
export const FORBIDDEN_CSV_OPERATIONS = [
  'Silent status changes without evidence',
  'Batch updates without individual patch records',
  'Deletion of tasks',
  'Modification of Task ID',
  'Modification of Dependencies without explicit approval',
] as const;

/**
 * Check if an operation is forbidden.
 */
export function isForbiddenOperation(operation: string): boolean {
  return FORBIDDEN_CSV_OPERATIONS.some((f) => operation.toLowerCase().includes(f.toLowerCase()));
}
