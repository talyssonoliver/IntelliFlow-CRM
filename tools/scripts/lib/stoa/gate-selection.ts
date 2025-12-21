/**
 * Gate Selection Algorithm
 *
 * Implements the deterministic gate selection algorithm from Framework.md Section 5.1.2.
 * Gates are selected based on:
 * 1. Baseline (Tier 1 required tools)
 * 2. STOA-specific add-ons based on derived supporting STOAs
 *
 * @module tools/scripts/lib/stoa/gate-selection
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import type { AuditMatrix, AuditMatrixTool, GateSelectionResult, StoaRole, Task } from './types.js';

// ============================================================================
// STOA to Tool Owner Mapping
// ============================================================================

/**
 * Maps STOA roles to audit-matrix owner field values.
 * This allows looking up which tools belong to which STOA.
 */
const STOA_OWNER_MAPPING: Record<StoaRole, string[]> = {
  Foundation: ['Tech Lead', 'DevOps Engineer'],
  Domain: ['Frontend Dev', 'Backend Dev'],
  Intelligence: ['AI Specialist'],
  Security: ['Security'],
  Quality: ['QA Lead', 'Performance Engineer'],
  Automation: ['Architecture'],
};

// ============================================================================
// Audit Matrix Loading
// ============================================================================

/**
 * Load and parse the audit-matrix.yml file.
 */
export function loadAuditMatrix(repoRoot: string): AuditMatrix {
  const matrixPath = join(repoRoot, 'audit-matrix.yml');

  if (!existsSync(matrixPath)) {
    throw new Error(`Audit matrix not found at: ${matrixPath}`);
  }

  const content = readFileSync(matrixPath, 'utf-8');
  const parsed = load(content) as AuditMatrix;

  if (!parsed || !Array.isArray(parsed.tools)) {
    throw new Error('Invalid audit-matrix.yml: missing tools array');
  }

  return parsed;
}

/**
 * Get a tool by its ID from the audit matrix.
 */
export function getToolById(matrix: AuditMatrix, toolId: string): AuditMatrixTool | undefined {
  return matrix.tools.find((t) => t.id === toolId);
}

// ============================================================================
// Tool Availability Checking
// ============================================================================

/**
 * Check if a tool can run (command exists, env vars present, etc.)
 * This is a basic check - actual availability may depend on installation.
 */
export function canToolRun(tool: AuditMatrixTool): boolean {
  // No command means it's a CI-only workflow
  if (!tool.command) {
    return false;
  }

  // Check required environment variables
  if (tool.requires_env && tool.requires_env.length > 0) {
    const missingEnv = tool.requires_env.filter((v) => !process.env[v]);
    if (missingEnv.length > 0) {
      return false;
    }
  }

  return true;
}

/**
 * Get the reason why a tool cannot run.
 */
export function getToolUnavailabilityReason(tool: AuditMatrixTool): string | null {
  if (!tool.command) {
    return 'no command defined (CI workflow only)';
  }

  if (tool.requires_env && tool.requires_env.length > 0) {
    const missingEnv = tool.requires_env.filter((v) => !process.env[v]);
    if (missingEnv.length > 0) {
      return `missing env vars: ${missingEnv.join(', ')}`;
    }
  }

  return null;
}

// ============================================================================
// STOA Gate Mapping
// ============================================================================

/**
 * Get required tool IDs for a specific STOA based on audit-matrix owner field.
 */
export function getStoaRequiredToolIds(stoa: StoaRole, matrix: AuditMatrix): string[] {
  const ownerValues = STOA_OWNER_MAPPING[stoa] || [];

  return matrix.tools
    .filter((t) => {
      // Check if tool's owner matches STOA mapping
      const ownerMatch = ownerValues.some((owner) => t.owner === owner);

      // Check if tool explicitly declares this STOA
      const stoaMatch = t.stoas?.includes(stoa);

      return ownerMatch || stoaMatch;
    })
    .map((t) => t.id);
}

/**
 * Get all baseline gates (Tier 1 + required).
 */
export function getBaselineGates(matrix: AuditMatrix): AuditMatrixTool[] {
  return matrix.tools.filter((t) => t.tier === 1 && t.required === true);
}

// ============================================================================
// Gate Selection Algorithm
// ============================================================================

/**
 * Select gates to execute based on task and derived STOAs.
 *
 * Algorithm (from Framework.md 5.1.2):
 * 1. Baseline = Tier 1 tools marked as required
 * 2. STOA add-ons from derived STOAs
 * 3. Union of baseline + STOA add-ons
 * 4. Classify into execute/waiverRequired/skipped
 */
export function selectGates(
  task: Task,
  matrix: AuditMatrix,
  derivedStoas: StoaRole[]
): GateSelectionResult {
  // Step 1: Baseline = Tier 1 tools marked as required
  const baseline = getBaselineGates(matrix);

  // Step 2: STOA add-ons from derived STOAs
  const stoaAddons = derivedStoas.flatMap((stoa) => getStoaRequiredToolIds(stoa, matrix));

  // Step 3: Union of baseline + STOA add-ons
  const selectedIds = new Set<string>();
  baseline.forEach((t) => selectedIds.add(t.id));
  stoaAddons.forEach((id) => selectedIds.add(id));

  // Step 4: Classify each selected gate
  const execute: string[] = [];
  const waiverRequired: string[] = [];
  const skipped: string[] = [];

  for (const toolId of selectedIds) {
    const tool = getToolById(matrix, toolId);

    if (!tool) {
      // Tool ID from STOA mapping doesn't exist in matrix
      skipped.push(toolId);
      continue;
    }

    if (tool.enabled && canToolRun(tool)) {
      execute.push(toolId);
    } else if (tool.required) {
      // Required but cannot run - needs waiver
      waiverRequired.push(toolId);
    } else {
      // Optional and cannot run - just skip
      skipped.push(toolId);
    }
  }

  return {
    execute: execute.sort(),
    waiverRequired: waiverRequired.sort(),
    skipped: skipped.sort(),
  };
}

// ============================================================================
// Gate Selection Validation
// ============================================================================

/**
 * Validate that gate selection covers all required baseline gates.
 */
export function validateGateSelection(
  result: GateSelectionResult,
  matrix: AuditMatrix
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check that execute + waiverRequired covers all baseline required gates
  const baseline = getBaselineGates(matrix);
  const covered = new Set([...result.execute, ...result.waiverRequired]);

  for (const tool of baseline) {
    if (!covered.has(tool.id) && !result.skipped.includes(tool.id)) {
      issues.push(`Required baseline gate '${tool.id}' is not covered`);
    }
  }

  // Check that all waiver-required tools are actually required
  for (const toolId of result.waiverRequired) {
    const tool = getToolById(matrix, toolId);
    if (tool && !tool.required) {
      issues.push(`Tool '${toolId}' in waiverRequired but not marked as required`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// ============================================================================
// Gate Ordering
// ============================================================================

/**
 * Sort gates by their order field (if present) for execution.
 */
export function orderGatesForExecution(gateIds: string[], matrix: AuditMatrix): string[] {
  return gateIds.slice().sort((a, b) => {
    const toolA = getToolById(matrix, a);
    const toolB = getToolById(matrix, b);

    const orderA = toolA?.order ?? 999;
    const orderB = toolB?.order ?? 999;

    return orderA - orderB;
  });
}
