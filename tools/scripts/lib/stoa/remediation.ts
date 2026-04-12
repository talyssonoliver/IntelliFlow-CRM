/**
 * STOA Remediation Workflow
 *
 * Implements structured follow-ups for FAIL/NEEDS_HUMAN outcomes
 * as defined in Framework.md Section 6.2 and 7.
 *
 * @module tools/scripts/lib/stoa/remediation
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { StoaVerdict, Finding, VerdictType } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface ReviewQueueItem {
  id: string;
  taskId: string;
  runId: string;
  verdict: VerdictType;
  stoa: string;
  severity: 'blocking' | 'warning' | 'info';
  summary: string;
  findings: Finding[];
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: string | null;
}

export interface BlockerRecord {
  taskId: string;
  runId: string;
  type: 'gate_failure' | 'stoa_veto' | 'waiver_expired' | 'needs_human';
  message: string;
  failedGates: string[];
  evidencePath: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionEvidencePath: string | null;
}

export interface BlockerLedger {
  blockers: BlockerRecord[];
  last_updated: string;
}

export interface HumanPacket {
  taskId: string;
  runId: string;
  createdAt: string;
  escalationReason: string;
  failingCommands: Array<{
    command: string;
    exitCode: number;
    logPath: string;
  }>;
  relevantLogs: string;
  reproductionSteps: string[];
  suspectedRootCause: string;
  safeRollbackSuggestion: string | null;
  recommendedNextAttempt: string;
  status: 'pending' | 'acknowledged' | 'resolved';
}

// ============================================================================
// Review Queue Management
// ============================================================================

// Use a separate path for STOA review queue to avoid conflicts with legacy UI audit queue
const REVIEW_QUEUE_PATH = 'artifacts/reports/stoa-review-queue.json';

export function loadReviewQueue(repoRoot: string): ReviewQueueItem[] {
  const queuePath = join(repoRoot, REVIEW_QUEUE_PATH);
  if (!existsSync(queuePath)) {
    return [];
  }
  try {
    const data = JSON.parse(readFileSync(queuePath, 'utf-8'));
    // Ensure we always return an array
    if (Array.isArray(data)) {
      return data;
    }
    // Handle legacy format with items property
    if (data && Array.isArray(data.items)) {
      return data.items;
    }
    return [];
  } catch {
    return [];
  }
}

export function saveReviewQueue(repoRoot: string, queue: ReviewQueueItem[]): void {
  const queuePath = join(repoRoot, REVIEW_QUEUE_PATH);
  mkdirSync(dirname(queuePath), { recursive: true });
  writeFileSync(queuePath, JSON.stringify(queue, null, 2));
}

export function createReviewQueueItem(
  verdict: StoaVerdict,
  runId: string,
  isBlocking: boolean
): ReviewQueueItem {
  const id = `RQ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    taskId: verdict.taskId,
    runId,
    verdict: verdict.verdict,
    stoa: verdict.stoa,
    severity: isBlocking ? 'blocking' : 'info',
    summary: verdict.rationale,
    findings: verdict.findings,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
  };
}

export function appendToReviewQueue(repoRoot: string, item: ReviewQueueItem): void {
  const queue = loadReviewQueue(repoRoot);

  // Check for existing unresolved item for same task
  const existing = queue.find((q) => q.taskId === item.taskId && q.resolvedAt === null);

  if (existing) {
    // Append findings to existing item
    existing.findings = [...existing.findings, ...item.findings];
    existing.runId = item.runId; // Update to latest run
    existing.summary = `${existing.summary}\n\nUpdate (${item.runId}): ${item.summary}`;
  } else {
    queue.push(item);
  }

  saveReviewQueue(repoRoot, queue);
}

// ============================================================================
// Blocker Management
// ============================================================================

const BLOCKERS_PATH = 'artifacts/blockers.json';

function normalizeBlockerLedger(data: unknown): BlockerLedger {
  const timestamp = new Date().toISOString();
  const normalizeBlockers = (items: unknown[]): BlockerRecord[] =>
    items.map((item) => {
      const blocker = item as BlockerRecord & { resolutionEvidencePath?: string | null };
      return {
        ...blocker,
        resolutionEvidencePath:
          typeof blocker.resolutionEvidencePath === 'string'
            ? blocker.resolutionEvidencePath
            : null,
      };
    });

  if (Array.isArray(data)) {
    return {
      blockers: normalizeBlockers(data),
      last_updated: timestamp,
    };
  }

  if (data && typeof data === 'object') {
    const ledger = data as Partial<BlockerLedger>;
    return {
      blockers: Array.isArray(ledger.blockers) ? normalizeBlockers(ledger.blockers) : [],
      last_updated: typeof ledger.last_updated === 'string' ? ledger.last_updated : timestamp,
    };
  }

  return {
    blockers: [],
    last_updated: timestamp,
  };
}

export function loadBlockerLedger(repoRoot: string): BlockerLedger {
  const blockersPath = join(repoRoot, BLOCKERS_PATH);
  if (!existsSync(blockersPath)) {
    return {
      blockers: [],
      last_updated: new Date().toISOString(),
    };
  }
  try {
    return normalizeBlockerLedger(JSON.parse(readFileSync(blockersPath, 'utf-8')));
  } catch {
    return {
      blockers: [],
      last_updated: new Date().toISOString(),
    };
  }
}

export function loadBlockers(repoRoot: string): BlockerRecord[] {
  return loadBlockerLedger(repoRoot).blockers;
}

export function saveBlockers(repoRoot: string, blockers: BlockerRecord[]): void {
  const blockersPath = join(repoRoot, BLOCKERS_PATH);
  mkdirSync(dirname(blockersPath), { recursive: true });
  const ledger: BlockerLedger = {
    blockers,
    last_updated: new Date().toISOString(),
  };
  writeFileSync(blockersPath, JSON.stringify(ledger, null, 2));
}

export function createBlockerRecord(
  taskId: string,
  runId: string,
  type: BlockerRecord['type'],
  message: string,
  failedGates: string[],
  evidencePath: string
): BlockerRecord {
  return {
    taskId,
    runId,
    type,
    message,
    failedGates,
    evidencePath,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionEvidencePath: null,
  };
}

export function addBlocker(repoRoot: string, blocker: BlockerRecord): void {
  const blockers = loadBlockers(repoRoot);

  // Keep resolved history, but allow only one open blocker per task.
  const filtered = blockers.filter((b) => !(b.taskId === blocker.taskId && b.resolvedAt === null));
  filtered.push(blocker);

  saveBlockers(repoRoot, filtered);
}

export function resolveBlocker(
  repoRoot: string,
  taskId: string,
  resolvedBy: string,
  resolutionEvidencePath: string | null = null
): boolean {
  const blockers = loadBlockers(repoRoot);
  let changed = false;
  const resolvedAt = new Date().toISOString();

  for (const blocker of blockers) {
    if (blocker.taskId === taskId && !blocker.resolvedAt) {
      blocker.resolvedAt = resolvedAt;
      blocker.resolvedBy = resolvedBy;
      blocker.resolutionEvidencePath = resolutionEvidencePath;
      changed = true;
    }
  }

  if (!changed) {
    return false;
  }

  saveBlockers(repoRoot, blockers);
  return true;
}

export function backfillBlockerResolutionEvidence(
  repoRoot: string,
  taskId: string,
  resolutionEvidencePath: string
): boolean {
  const blockers = loadBlockers(repoRoot);
  let changed = false;

  for (const blocker of blockers) {
    if (blocker.taskId === taskId && blocker.resolvedAt && !blocker.resolutionEvidencePath) {
      blocker.resolutionEvidencePath = resolutionEvidencePath;
      changed = true;
    }
  }

  if (changed) {
    saveBlockers(repoRoot, blockers);
  }

  return changed;
}

// ============================================================================
// Human Packet Generation
// ============================================================================

const HUMAN_PACKETS_DIR = 'artifacts/human-intervention-required';

export function generateHumanPacket(
  verdict: StoaVerdict,
  runId: string,
  evidenceDir: string,
  gateResults: Array<{ toolId: string; exitCode: number; logPath: string }>
): HumanPacket {
  const failingCommands = gateResults
    .filter((g) => g.exitCode !== 0)
    .map((g) => ({
      command: g.toolId,
      exitCode: g.exitCode,
      logPath: g.logPath,
    }));

  // Extract reproduction steps from findings
  const reproductionSteps = verdict.findings
    .filter((f) => f.severity === 'high' || f.severity === 'critical')
    .map((f) => `1. Check ${f.source}: ${f.message}`);

  // Generate suspected root cause from findings
  const suspectedRootCause =
    verdict.findings.length > 0
      ? verdict.findings
          .slice(0, 3)
          .map((f) => `${f.source}: ${f.message}`)
          .join('\n')
      : 'Unable to determine root cause automatically';

  // Generate recommended next attempt
  const recommendedNextAttempt =
    verdict.findings
      .filter((f) => f.recommendation)
      .map((f) => f.recommendation)
      .join('\n') || 'Review gate logs and fix underlying issues';

  return {
    taskId: verdict.taskId,
    runId,
    createdAt: new Date().toISOString(),
    escalationReason: verdict.rationale,
    failingCommands,
    relevantLogs: `See evidence at: ${evidenceDir}`,
    reproductionSteps,
    suspectedRootCause,
    safeRollbackSuggestion: null,
    recommendedNextAttempt,
    status: 'pending',
  };
}

export function saveHumanPacket(repoRoot: string, packet: HumanPacket): string {
  const packetsDir = join(repoRoot, HUMAN_PACKETS_DIR);
  mkdirSync(packetsDir, { recursive: true });

  const filename = `${packet.taskId}-${packet.runId}.json`;
  const filePath = join(packetsDir, filename);

  writeFileSync(filePath, JSON.stringify(packet, null, 2));

  // Also create a markdown version for easier reading
  const mdPath = join(packetsDir, `${packet.taskId}-${packet.runId}.md`);
  const md = generateHumanPacketMarkdown(packet);
  writeFileSync(mdPath, md);

  return filePath;
}

function generateHumanPacketMarkdown(packet: HumanPacket): string {
  return `# Human Intervention Required

**Task:** ${packet.taskId}
**Run ID:** ${packet.runId}
**Created:** ${packet.createdAt}
**Status:** ${packet.status}

## Escalation Reason

${packet.escalationReason}

## Failing Commands

${
  packet.failingCommands.length > 0
    ? packet.failingCommands
        .map((c) => `- **${c.command}**: Exit code ${c.exitCode}\n  Log: \`${c.logPath}\``)
        .join('\n')
    : 'No command failures recorded'
}

## Reproduction Steps

${
  packet.reproductionSteps.length > 0
    ? packet.reproductionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : '1. Re-run the MATOP validation for this task'
}

## Suspected Root Cause

${packet.suspectedRootCause}

## Recommended Next Attempt

${packet.recommendedNextAttempt}

${packet.safeRollbackSuggestion ? `## Safe Rollback Suggestion\n\n${packet.safeRollbackSuggestion}` : ''}

## Evidence Location

${packet.relevantLogs}

---

To resolve this, update the status in \`Sprint_plan.csv\` after fixing the issue and re-run:

\`\`\`bash
pnpm matop ${packet.taskId}
\`\`\`
`;
}

// ============================================================================
// Unified Remediation Handler
// ============================================================================

export interface RemediationResult {
  reviewQueueItem?: ReviewQueueItem;
  blocker?: BlockerRecord;
  humanPacket?: HumanPacket;
  actions: string[];
}

/**
 * Process a verdict and create appropriate remediation artifacts.
 *
 * Based on Framework.md Section 6.2:
 * - PASS → Close review queue items for task
 * - FAIL → Create Review Queue item with "blocking" flag
 * - NEEDS_HUMAN → Produce Human Packet and halt retries
 */
export function processVerdictRemediation(
  verdict: StoaVerdict,
  runId: string,
  repoRoot: string,
  evidenceDir: string,
  gateResults: Array<{ toolId: string; exitCode: number; logPath: string }>
): RemediationResult {
  const result: RemediationResult = {
    actions: [],
  };

  switch (verdict.verdict) {
    case 'PASS':
      // Close any open review queue items and blockers for this task.
      if (resolveReviewQueueItems(repoRoot, verdict.taskId, `MATOP run ${runId}`)) {
        result.actions.push(`Closed review queue items for ${verdict.taskId}`);
      }
      if (resolveBlocker(repoRoot, verdict.taskId, `MATOP run ${runId}`, evidenceDir)) {
        result.actions.push(`Resolved blocker for ${verdict.taskId}`);
      }
      break;

    case 'FAIL': {
      // Create blocking Review Queue item
      result.reviewQueueItem = createReviewQueueItem(verdict, runId, true);
      appendToReviewQueue(repoRoot, result.reviewQueueItem);
      result.actions.push(`Created blocking review queue item: ${result.reviewQueueItem.id}`);

      // Create blocker record
      const failedGates = gateResults.filter((g) => g.exitCode !== 0).map((g) => g.toolId);

      result.blocker = createBlockerRecord(
        verdict.taskId,
        runId,
        'gate_failure',
        verdict.rationale,
        failedGates,
        evidenceDir
      );
      addBlocker(repoRoot, result.blocker);
      result.actions.push(`Added blocker for ${verdict.taskId}`);
      break;
    }

    case 'NEEDS_HUMAN': {
      // Create Human Packet
      result.humanPacket = generateHumanPacket(verdict, runId, evidenceDir, gateResults);
      const packetPath = saveHumanPacket(repoRoot, result.humanPacket);
      result.actions.push(`Generated human packet: ${packetPath}`);

      // Also create blocking review queue item
      result.reviewQueueItem = createReviewQueueItem(verdict, runId, true);
      appendToReviewQueue(repoRoot, result.reviewQueueItem);
      result.actions.push(`Created blocking review queue item: ${result.reviewQueueItem.id}`);

      // Create blocker
      result.blocker = createBlockerRecord(
        verdict.taskId,
        runId,
        'needs_human',
        verdict.rationale,
        [],
        evidenceDir
      );
      addBlocker(repoRoot, result.blocker);
      result.actions.push(`Added needs-human blocker for ${verdict.taskId}`);
      break;
    }
  }

  return result;
}

/**
 * Close resolved review queue items for a task.
 */
export function resolveReviewQueueItems(
  repoRoot: string,
  taskId: string,
  resolvedBy: string,
  resolution: string = 'Task passed validation'
): boolean {
  const queue = loadReviewQueue(repoRoot);
  let changed = false;

  for (const item of queue) {
    if (item.taskId === taskId && item.resolvedAt === null) {
      item.resolvedAt = new Date().toISOString();
      item.resolvedBy = resolvedBy;
      item.resolution = resolution;
      changed = true;
    }
  }

  if (changed) {
    saveReviewQueue(repoRoot, queue);
  }

  return changed;
}

// ============================================================================
// Remediation Report Generation
// ============================================================================

export function generateRemediationReport(result: RemediationResult, verdict: StoaVerdict): string {
  let report = `## Remediation Actions for ${verdict.taskId}\n\n`;
  report += `**Verdict:** ${verdict.verdict}\n`;
  report += `**STOA:** ${verdict.stoa}\n\n`;

  if (result.actions.length > 0) {
    report += `### Actions Taken\n\n`;
    for (const action of result.actions) {
      report += `- ${action}\n`;
    }
    report += '\n';
  }

  if (verdict.findings.length > 0) {
    report += `### Findings\n\n`;
    report += `| Severity | Source | Message | Recommendation |\n`;
    report += `|----------|--------|---------|----------------|\n`;
    for (const finding of verdict.findings) {
      const rec = finding.recommendation?.replaceAll(/\|/g, '\\|') || '-';
      report += `| ${finding.severity} | ${finding.source} | ${finding.message} | ${rec} |\n`;
    }
    report += '\n';
  }

  if (result.blocker) {
    report += `### Blocker Created\n\n`;
    report += `- **Type:** ${result.blocker.type}\n`;
    report += `- **Message:** ${result.blocker.message}\n`;
    report += `- **Failed Gates:** ${result.blocker.failedGates.join(', ') || 'None'}\n`;
    report += `- **Evidence:** ${result.blocker.evidencePath}\n\n`;
  }

  if (result.humanPacket) {
    report += `### Human Intervention Required\n\n`;
    report += `A human packet has been generated with detailed information.\n`;
    report += `See: \`artifacts/human-intervention-required/${verdict.taskId}-*.md\`\n\n`;
  }

  // Add resolution guidance based on verdict
  report += `### Next Steps\n\n`;
  switch (verdict.verdict) {
    case 'PASS':
      report += `Task has passed validation. No action required.\n`;
      break;
    case 'FAIL':
      report += `1. Review failed gates and their logs\n`;
      report += `2. Fix the underlying issues\n`;
      report += `3. Re-run validation: \`pnpm matop ${verdict.taskId}\`\n`;
      report += `4. The task is blocked until all gates pass\n`;
      break;
    case 'NEEDS_HUMAN':
      report += `1. Review the human packet for detailed information\n`;
      report += `2. Manually investigate the escalation reason\n`;
      report += `3. Apply the recommended fix\n`;
      report += `4. Re-run validation: \`pnpm matop ${verdict.taskId}\`\n`;
      break;
  }

  return report;
}
