/**
 * STOA Verdict Generator
 *
 * Implements STOA verdict generation from Framework.md Section 2.2.
 * Each STOA produces a structured verdict file.
 *
 * @module tools/scripts/lib/stoa/verdict
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  StoaVerdict,
  StoaRole,
  VerdictType,
  Finding,
  FindingSeverity,
  GateExecutionResult,
  WaiverRecord,
  GateSelectionResult,
} from './types.js';
import { getStoaVerdictsDir } from './evidence.js';
import { summarizeGateResults } from './gate-runner.js';
import { summarizeWaivers, getWaiverStatus } from './waiver.js';

// ============================================================================
// Finding Creation
// ============================================================================

/**
 * Create a finding from a gate failure.
 */
export function createGateFailureFinding(
  gateResult: GateExecutionResult,
  severity: FindingSeverity = 'high'
): Finding {
  return {
    severity,
    source: gateResult.toolId,
    message: `Gate '${gateResult.toolId}' failed with exit code ${gateResult.exitCode}`,
    recommendation: `Review gate log at ${gateResult.logPath} and fix the underlying issue`,
  };
}

/**
 * Create a finding from a pending waiver.
 */
export function createWaiverPendingFinding(waiver: WaiverRecord): Finding {
  return {
    severity: 'medium',
    source: waiver.toolId,
    message: `Waiver for '${waiver.toolId}' is pending approval`,
    recommendation: `Human must approve waiver. Reason: ${waiver.justification || waiver.reason}`,
  };
}

/**
 * Create a finding from an expired waiver.
 */
export function createWaiverExpiredFinding(waiver: WaiverRecord): Finding {
  return {
    severity: 'high',
    source: waiver.toolId,
    message: `Waiver for '${waiver.toolId}' has expired`,
    recommendation: `Renew waiver or enable the tool. Expired at: ${waiver.expiresAt}`,
  };
}

/**
 * Create an informational finding.
 */
export function createInfoFinding(
  source: string,
  message: string,
  recommendation: string
): Finding {
  return {
    severity: 'info',
    source,
    message,
    recommendation,
  };
}

// ============================================================================
// Verdict Determination
// ============================================================================

/**
 * Determine verdict based on gate results and waivers.
 */
export function determineVerdict(
  gateResults: GateExecutionResult[],
  waivers: WaiverRecord[],
  strictMode: boolean
): { verdict: VerdictType; rationale: string } {
  const gatesSummary = summarizeGateResults(gateResults);
  const waiversSummary = summarizeWaivers(waivers);

  // Check for gate failures
  if (gatesSummary.failed > 0) {
    return {
      verdict: 'FAIL',
      rationale: `${gatesSummary.failed} gate(s) failed: ${gatesSummary.failedGates.join(', ')}`,
    };
  }

  // Check for timeouts
  if (gatesSummary.timedOut > 0) {
    return {
      verdict: 'FAIL',
      rationale: `${gatesSummary.timedOut} gate(s) timed out: ${gatesSummary.timedOutGates.join(', ')}`,
    };
  }

  // Check for pending waivers
  if (waiversSummary.pending > 0) {
    if (strictMode) {
      return {
        verdict: 'FAIL',
        rationale: `${waiversSummary.pending} waiver(s) pending approval (strict mode)`,
      };
    }
    return {
      verdict: 'WARN',
      rationale: `${waiversSummary.pending} waiver(s) pending approval`,
    };
  }

  // Check for expired waivers
  if (waiversSummary.expired > 0) {
    if (strictMode) {
      return {
        verdict: 'FAIL',
        rationale: `${waiversSummary.expired} waiver(s) expired (strict mode)`,
      };
    }
    return {
      verdict: 'WARN',
      rationale: `${waiversSummary.expired} waiver(s) expired`,
    };
  }

  // Check for approved waivers (still a concern, but not blocking)
  if (waiversSummary.approved > 0) {
    return {
      verdict: 'WARN',
      rationale: `All gates passed, but ${waiversSummary.approved} tool(s) skipped with approved waiver(s)`,
    };
  }

  // All gates passed, no waivers
  return {
    verdict: 'PASS',
    rationale: `All ${gatesSummary.passed} gate(s) passed with no waivers`,
  };
}

// ============================================================================
// STOA Verdict Generation
// ============================================================================

/**
 * Generate a STOA verdict from execution results.
 */
export function generateStoaVerdict(
  stoa: StoaRole,
  taskId: string,
  gateSelection: GateSelectionResult,
  gateResults: GateExecutionResult[],
  waivers: WaiverRecord[],
  strictMode: boolean
): StoaVerdict {
  const { verdict, rationale } = determineVerdict(gateResults, waivers, strictMode);

  // Collect findings
  const findings: Finding[] = [];

  // Add findings from failed gates
  for (const result of gateResults) {
    if (!result.passed) {
      findings.push(createGateFailureFinding(result));
    }
  }

  // Add findings from waivers
  for (const waiver of waivers) {
    const status = getWaiverStatus(waiver);

    if (status === 'pending_approval') {
      findings.push(createWaiverPendingFinding(waiver));
    } else if (status === 'approved_expired') {
      findings.push(createWaiverExpiredFinding(waiver));
    }
  }

  // Add info finding for skipped gates
  if (gateSelection.skipped.length > 0) {
    findings.push(
      createInfoFinding(
        'gate-selection',
        `${gateSelection.skipped.length} gate(s) skipped: ${gateSelection.skipped.join(', ')}`,
        'Skipped gates are optional and do not affect the verdict'
      )
    );
  }

  return {
    stoa,
    taskId,
    verdict,
    rationale,
    toolIdsSelected: [...gateSelection.execute, ...gateSelection.waiverRequired],
    toolIdsExecuted: gateResults.map((r) => r.toolId),
    waiversProposed: waivers.map((w) => w.toolId),
    findings,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Write a STOA verdict to a file.
 */
export function writeStoaVerdict(evidenceDir: string, verdict: StoaVerdict): string {
  const verdictsDir = getStoaVerdictsDir(evidenceDir);
  const filePath = join(verdictsDir, `${verdict.stoa}.json`);

  writeFileSync(filePath, JSON.stringify(verdict, null, 2), 'utf-8');

  return filePath;
}

// ============================================================================
// Multi-STOA Verdict Aggregation
// ============================================================================

/**
 * Aggregate verdicts from multiple STOAs into a final verdict.
 *
 * Rules:
 * - Any FAIL → final FAIL
 * - Any NEEDS_HUMAN → final NEEDS_HUMAN (unless FAIL)
 * - Any WARN → final WARN (unless FAIL or NEEDS_HUMAN)
 * - All PASS → final PASS
 */
export function aggregateVerdicts(verdicts: StoaVerdict[]): VerdictType {
  if (verdicts.some((v) => v.verdict === 'FAIL')) {
    return 'FAIL';
  }

  if (verdicts.some((v) => v.verdict === 'NEEDS_HUMAN')) {
    return 'NEEDS_HUMAN';
  }

  if (verdicts.some((v) => v.verdict === 'WARN')) {
    return 'WARN';
  }

  return 'PASS';
}

/**
 * Aggregate findings from multiple STOA verdicts.
 */
export function aggregateFindings(verdicts: StoaVerdict[]): Finding[] {
  const allFindings: Finding[] = [];

  for (const verdict of verdicts) {
    for (const finding of verdict.findings) {
      // Prefix source with STOA name
      allFindings.push({
        ...finding,
        source: `${verdict.stoa}/${finding.source}`,
      });
    }
  }

  // Sort by severity
  const severityOrder: Record<FindingSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };

  return allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * Generate a combined rationale from multiple verdicts.
 */
export function generateCombinedRationale(verdicts: StoaVerdict[]): string {
  const parts = verdicts.map((v) => `${v.stoa}: ${v.verdict} - ${v.rationale}`);
  return parts.join('\n');
}

// ============================================================================
// Supporting STOA Sign-off
// ============================================================================

export type SignOffDecision = 'AGREE' | 'VETO' | 'ESCALATE';

export interface SignOffResult {
  stoa: StoaRole;
  decision: SignOffDecision;
  reason: string;
  timestamp: string;
}

/**
 * Determine supporting STOA decision based on lead verdict.
 * This is a simplified auto-decision; real implementation may involve human review.
 */
export function determineSupportingSignOff(
  supportingStoa: StoaRole,
  leadVerdict: StoaVerdict,
  ownFindings: Finding[]
): SignOffResult {
  // Check for critical findings from this STOA's perspective
  const criticalFindings = ownFindings.filter((f) => f.severity === 'critical');
  const highFindings = ownFindings.filter((f) => f.severity === 'high');

  if (criticalFindings.length > 0) {
    return {
      stoa: supportingStoa,
      decision: 'VETO',
      reason: `Critical findings: ${criticalFindings.map((f) => f.message).join('; ')}`,
      timestamp: new Date().toISOString(),
    };
  }

  if (highFindings.length > 0 && leadVerdict.verdict === 'PASS') {
    return {
      stoa: supportingStoa,
      decision: 'ESCALATE',
      reason: `High severity findings but lead says PASS: ${highFindings.map((f) => f.message).join('; ')}`,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    stoa: supportingStoa,
    decision: 'AGREE',
    reason: `Concur with lead verdict: ${leadVerdict.verdict}`,
    timestamp: new Date().toISOString(),
  };
}
