/**
 * Waiver Governance System
 *
 * Implements waiver handling from Framework.md Section 5.5.
 * When a required tool cannot run, a waiver must be created and approved.
 *
 * @module tools/scripts/lib/stoa/waiver
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { WaiverRecord, WaiverReason, AuditMatrixTool } from './types.js';
import { getToolUnavailabilityReason } from './gate-selection.js';

// ============================================================================
// Constants
// ============================================================================

const MAX_WAIVER_DAYS = 30;
const WAIVER_FILE_NAME = 'waivers.json';

// ============================================================================
// Waiver Creation
// ============================================================================

/**
 * Determine the appropriate waiver reason based on tool state.
 */
export function determineWaiverReason(
  tool: AuditMatrixTool
): { reason: WaiverReason; details: string } {
  // Check for missing env vars first
  if (tool.requires_env && tool.requires_env.length > 0) {
    const missingEnv = tool.requires_env.filter((v) => !process.env[v]);
    if (missingEnv.length > 0) {
      return {
        reason: 'env_var_missing',
        details: `Missing environment variables: ${missingEnv.join(', ')}`,
      };
    }
  }

  // Check if tool is not enabled
  if (!tool.enabled) {
    return {
      reason: 'infrastructure_not_ready',
      details: 'Tool is disabled in audit-matrix.yml',
    };
  }

  // Check if no command is defined (CI-only)
  if (!tool.command) {
    return {
      reason: 'tool_not_installed',
      details: 'Tool has no local command (CI workflow only)',
    };
  }

  // Default to not installed
  return {
    reason: 'tool_not_installed',
    details: getToolUnavailabilityReason(tool) || 'Unknown reason',
  };
}

/**
 * Create a waiver record for a required tool that cannot run.
 * The waiver is created with approved: false (requires human approval).
 */
export function createWaiverRecord(
  toolId: string,
  tool: AuditMatrixTool,
  runId: string
): WaiverRecord {
  const { reason, details } = determineWaiverReason(tool);

  // Calculate expiry (30 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + MAX_WAIVER_DAYS);

  return {
    toolId,
    reason,
    owner: 'pending', // Requires human to claim ownership
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    approved: false, // Requires human approval
    strictModeBehavior: 'FAIL', // Default to FAIL in strict mode
    justification: details,
  };
}

// ============================================================================
// Waiver Validation
// ============================================================================

/**
 * Check if a waiver is still valid (not expired).
 */
export function isWaiverValid(waiver: WaiverRecord): boolean {
  if (!waiver.expiresAt) {
    // Permanent waiver
    return true;
  }

  const expiryDate = new Date(waiver.expiresAt);
  return expiryDate > new Date();
}

/**
 * Check if a waiver is approved and valid.
 */
export function isWaiverEffective(waiver: WaiverRecord): boolean {
  return waiver.approved && isWaiverValid(waiver);
}

/**
 * Get the status of a waiver for reporting.
 */
export function getWaiverStatus(
  waiver: WaiverRecord
): 'approved_valid' | 'approved_expired' | 'pending_approval' {
  if (!waiver.approved) {
    return 'pending_approval';
  }

  if (!isWaiverValid(waiver)) {
    return 'approved_expired';
  }

  return 'approved_valid';
}

// ============================================================================
// Waiver Behavior in Strict Mode
// ============================================================================

export type WaiverStrictModeBehavior = 'PASS' | 'WARN' | 'FAIL';

/**
 * Determine behavior for a waiver in strict mode.
 *
 * From Framework.md 5.5.3:
 * - approved: true → WARN (tool skipped, logged)
 * - approved: false → FAIL
 * - Expired → FAIL
 */
export function getStrictModeBehavior(
  waiver: WaiverRecord,
  strictMode: boolean
): WaiverStrictModeBehavior {
  const status = getWaiverStatus(waiver);

  if (status === 'approved_valid') {
    // In strict mode, even approved waivers produce WARN
    return strictMode ? 'WARN' : 'PASS';
  }

  // Pending or expired waivers
  if (strictMode) {
    return 'FAIL';
  }

  return 'WARN';
}

// ============================================================================
// Waiver File Operations
// ============================================================================

/**
 * Load existing waivers from a run's evidence bundle.
 */
export function loadWaivers(evidenceDir: string): WaiverRecord[] {
  const waiverPath = join(evidenceDir, WAIVER_FILE_NAME);

  if (!existsSync(waiverPath)) {
    return [];
  }

  try {
    const content = readFileSync(waiverPath, 'utf-8');
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as WaiverRecord[];
  } catch {
    return [];
  }
}

/**
 * Save waivers to a run's evidence bundle.
 */
export async function saveWaivers(
  evidenceDir: string,
  waivers: WaiverRecord[]
): Promise<void> {
  await mkdir(evidenceDir, { recursive: true });

  const waiverPath = join(evidenceDir, WAIVER_FILE_NAME);
  writeFileSync(waiverPath, JSON.stringify(waivers, null, 2), 'utf-8');
}

/**
 * Merge new waivers with existing ones.
 * New waivers for the same tool replace old ones.
 */
export function mergeWaivers(
  existing: WaiverRecord[],
  newWaivers: WaiverRecord[]
): WaiverRecord[] {
  const byToolId = new Map<string, WaiverRecord>();

  // Add existing waivers
  for (const waiver of existing) {
    byToolId.set(waiver.toolId, waiver);
  }

  // Add/replace with new waivers
  for (const waiver of newWaivers) {
    byToolId.set(waiver.toolId, waiver);
  }

  return Array.from(byToolId.values());
}

// ============================================================================
// Waiver Approval
// ============================================================================

/**
 * Approve a waiver (sets approved: true, assigns owner).
 */
export function approveWaiver(
  waiver: WaiverRecord,
  approver: string,
  newExpiry?: Date
): WaiverRecord {
  return {
    ...waiver,
    approved: true,
    owner: approver,
    expiresAt: newExpiry
      ? newExpiry.toISOString()
      : waiver.expiresAt,
    strictModeBehavior: 'WARN', // Approved waivers become WARN instead of FAIL
  };
}

/**
 * Renew an expired waiver with a new expiry date.
 */
export function renewWaiver(
  waiver: WaiverRecord,
  newExpiryDays: number = MAX_WAIVER_DAYS
): WaiverRecord {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + newExpiryDays);

  return {
    ...waiver,
    expiresAt: expiresAt.toISOString(),
    // Renewal resets approval
    approved: false,
    owner: 'pending',
  };
}

/**
 * Make a waiver permanent (no expiry).
 * Requires explicit justification.
 */
export function makeWaiverPermanent(
  waiver: WaiverRecord,
  justification: string
): WaiverRecord {
  return {
    ...waiver,
    expiresAt: null,
    justification: `${waiver.justification || ''}\nPermanent waiver: ${justification}`.trim(),
  };
}

// ============================================================================
// Waiver Summary
// ============================================================================

export interface WaiverSummary {
  total: number;
  approved: number;
  pending: number;
  expired: number;
  byReason: Record<WaiverReason, number>;
}

/**
 * Generate a summary of waiver states.
 */
export function summarizeWaivers(waivers: WaiverRecord[]): WaiverSummary {
  const summary: WaiverSummary = {
    total: waivers.length,
    approved: 0,
    pending: 0,
    expired: 0,
    byReason: {
      tool_not_installed: 0,
      env_var_missing: 0,
      known_false_positive: 0,
      deferred_to_sprint_N: 0,
      infrastructure_not_ready: 0,
    },
  };

  for (const waiver of waivers) {
    const status = getWaiverStatus(waiver);

    switch (status) {
      case 'approved_valid':
        summary.approved++;
        break;
      case 'approved_expired':
        summary.expired++;
        break;
      case 'pending_approval':
        summary.pending++;
        break;
    }

    summary.byReason[waiver.reason]++;
  }

  return summary;
}
