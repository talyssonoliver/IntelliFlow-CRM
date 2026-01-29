/**
 * Workflow Validation
 *
 * MATOP and STOA validation logic shared between UI and CLI.
 */

import type { StoaType, MatopVerdict, TaskRecord } from './types';
import { STOA_PREFIX_RULES, STOA_KEYWORD_TRIGGERS, MATOP_CONSENSUS } from './config';

/**
 * STOA assignment result
 */
export interface StoaAssignment {
  leadStoa: StoaType;
  supportingStoas: StoaType[];
  allStoas: StoaType[];
  reasons: Record<StoaType, string[]>;
}

/**
 * STOA verdict
 */
export interface StoaVerdict {
  stoa: StoaType;
  verdict: MatopVerdict;
  gatesPassed: string[];
  gatesFailed: string[];
  gatessWarned: string[];
  waivers: string[];
  errors: string[];
  duration: number;
}

/**
 * MATOP result
 */
export interface MatopResult {
  verdict: MatopVerdict;
  stoaVerdicts: StoaVerdict[];
  consensus: {
    passCount: number;
    warnCount: number;
    failCount: number;
    needsHumanCount: number;
  };
  summary: string;
}

/**
 * Assign STOAs to a task based on its characteristics
 */
export function assignStoas(task: TaskRecord): StoaAssignment {
  const taskId = task['Task ID'];
  const description = (task.Description || '').toLowerCase();
  const section = (task.Section || '').toLowerCase();
  const dod = (task['Definition of Done'] || '').toLowerCase();
  const kpis = (task.KPIs || '').toLowerCase();

  const reasons: Record<StoaType, string[]> = {
    Foundation: [],
    Security: [],
    Quality: [],
    Domain: [],
    Intelligence: [],
    Automation: [],
  };

  // Determine lead STOA by prefix
  let leadStoa: StoaType = 'Domain'; // Default
  for (const [prefix, stoa] of Object.entries(STOA_PREFIX_RULES)) {
    if (taskId.startsWith(prefix)) {
      leadStoa = stoa;
      reasons[stoa].push(`Task ID prefix "${prefix}" matches ${stoa} STOA`);
      break;
    }
  }

  // Find supporting STOAs by keyword triggers
  const supportingStoas = new Set<StoaType>();
  const searchText = `${description} ${section} ${dod} ${kpis}`;

  for (const [stoa, keywords] of Object.entries(STOA_KEYWORD_TRIGGERS) as [StoaType, string[]][]) {
    for (const keyword of keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        if (stoa !== leadStoa) {
          supportingStoas.add(stoa);
          reasons[stoa].push(`Keyword "${keyword}" found in task`);
        }
      }
    }
  }

  // Foundation is always included for baseline gates
  if (leadStoa !== 'Foundation') {
    supportingStoas.add('Foundation');
    reasons.Foundation.push('Baseline gates (typecheck, build, lint) always required');
  }

  const allStoas = [leadStoa, ...Array.from(supportingStoas)];

  return {
    leadStoa,
    supportingStoas: Array.from(supportingStoas),
    allStoas,
    reasons,
  };
}

/**
 * Calculate MATOP consensus from STOA verdicts
 */
export function calculateConsensus(verdicts: StoaVerdict[]): MatopResult {
  const passCount = verdicts.filter((v) => v.verdict === 'PASS').length;
  const warnCount = verdicts.filter((v) => v.verdict === 'WARN').length;
  const failCount = verdicts.filter((v) => v.verdict === 'FAIL').length;
  const needsHumanCount = verdicts.filter((v) => v.verdict === 'NEEDS_HUMAN').length;

  let finalVerdict: MatopVerdict;
  let summary: string;

  if (MATOP_CONSENSUS.failOnAnyFail && failCount > 0) {
    finalVerdict = 'FAIL';
    const failedStoas = verdicts.filter((v) => v.verdict === 'FAIL').map((v) => v.stoa);
    summary = `FAIL: ${failCount} STOA(s) failed (${failedStoas.join(', ')})`;
  } else if (MATOP_CONSENSUS.needsHumanOnAny && needsHumanCount > 0) {
    finalVerdict = 'NEEDS_HUMAN';
    const humanStoas = verdicts.filter((v) => v.verdict === 'NEEDS_HUMAN').map((v) => v.stoa);
    summary = `NEEDS_HUMAN: ${needsHumanCount} STOA(s) require human review (${humanStoas.join(', ')})`;
  } else if (MATOP_CONSENSUS.warnOnAnyWarn && warnCount > 0) {
    finalVerdict = 'WARN';
    const warnedStoas = verdicts.filter((v) => v.verdict === 'WARN').map((v) => v.stoa);
    summary = `WARN: ${warnCount} STOA(s) passed with warnings (${warnedStoas.join(', ')})`;
  } else if (passCount >= MATOP_CONSENSUS.minPassCount) {
    finalVerdict = 'PASS';
    summary = `PASS: All ${passCount} STOA(s) passed validation`;
  } else {
    finalVerdict = 'FAIL';
    summary = `FAIL: Insufficient passing STOAs (${passCount}/${MATOP_CONSENSUS.minPassCount} required)`;
  }

  return {
    verdict: finalVerdict,
    stoaVerdicts: verdicts,
    consensus: {
      passCount,
      warnCount,
      failCount,
      needsHumanCount,
    },
    summary,
  };
}

/**
 * Get baseline gates that all tasks must pass
 */
export function getBaselineGates(): string[] {
  return ['turbo-typecheck', 'turbo-build', 'turbo-lint'];
}

/**
 * Get STOA-specific gates
 */
export function getStoaGates(stoa: StoaType): string[] {
  switch (stoa) {
    case 'Foundation':
      return ['artifact-validation', 'docker-config'];
    case 'Security':
      return ['pnpm-audit', 'gitleaks', 'csrf-validation', 'auth-security-review'];
    case 'Quality':
      return ['test-coverage', 'a11y-audit', 'mutation-testing'];
    case 'Domain':
      return ['flow-compliance', 'business-logic-validation', 'ddd-boundaries'];
    case 'Intelligence':
      return ['ai-performance-check', 'prompt-injection-scan', 'model-validation'];
    case 'Automation':
      return ['pipeline-validation', 'infrastructure-check', 'deployment-readiness'];
    default:
      return [];
  }
}

/**
 * Get all gates for a task based on assigned STOAs
 */
export function getTaskGates(assignment: StoaAssignment): {
  baseline: string[];
  stoaSpecific: Record<StoaType, string[]>;
  all: string[];
} {
  const baseline = getBaselineGates();
  const stoaSpecific: Record<StoaType, string[]> = {} as Record<StoaType, string[]>;

  for (const stoa of assignment.allStoas) {
    stoaSpecific[stoa] = getStoaGates(stoa);
  }

  const all = [...baseline, ...Object.values(stoaSpecific).flat()];

  return { baseline, stoaSpecific, all };
}

/**
 * Determine status update based on MATOP verdict
 */
export function getStatusFromVerdict(verdict: MatopVerdict): 'Completed' | 'In Progress' | 'Failed' | 'Needs Human' {
  switch (verdict) {
    case 'PASS':
      return 'Completed';
    case 'WARN':
      return 'In Progress'; // Needs remediation
    case 'FAIL':
      return 'Failed';
    case 'NEEDS_HUMAN':
      return 'Needs Human';
  }
}

/**
 * Generate a summary of what needs remediation for a WARN verdict
 */
export function generateRemediationSummary(verdicts: StoaVerdict[]): string[] {
  const items: string[] = [];

  for (const verdict of verdicts) {
    if (verdict.verdict === 'WARN' || verdict.verdict === 'FAIL') {
      for (const gate of verdict.gatesFailed) {
        items.push(`[${verdict.stoa}] Gate "${gate}" failed`);
      }
      for (const gate of verdict.gatessWarned) {
        items.push(`[${verdict.stoa}] Gate "${gate}" has warnings`);
      }
      for (const error of verdict.errors) {
        items.push(`[${verdict.stoa}] ${error}`);
      }
    }
  }

  return items;
}
