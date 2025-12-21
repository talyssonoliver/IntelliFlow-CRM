/**
 * Evidence Bundle Generator
 *
 * Implements evidence integrity from Framework.md Section 8.
 * Generates SHA256 hashes, evidence bundles, and run summaries.
 *
 * @module tools/scripts/lib/stoa/evidence
 */

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import type {
  EvidenceHash,
  EvidenceBundle,
  RunSummary,
  GateSelectionResult,
  GateExecutionResult,
  WaiverRecord,
  StoaVerdict,
  StoaAssignment,
  VerdictType,
  CsvPatchProposal,
} from './types.js';

// ============================================================================
// Run ID Generation
// ============================================================================

/**
 * Generate a unique run ID for the evidence bundle.
 * Format: YYYYMMDD-HHMMSS-UUID
 */
export function generateRunId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const uuid = randomUUID().slice(0, 8);

  return `${date}-${time}-${uuid}`;
}

// ============================================================================
// SHA256 Hashing
// ============================================================================

/**
 * Calculate SHA256 hash of a string.
 */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Calculate SHA256 hash of a file.
 */
export function sha256File(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Generate evidence hash for a file.
 */
export function generateEvidenceHash(
  filePath: string,
  baseDir: string
): EvidenceHash {
  const stats = statSync(filePath);

  return {
    path: relative(baseDir, filePath).replace(/\\/g, '/'),
    sha256: sha256File(filePath),
    size: stats.size,
  };
}

/**
 * Generate evidence hashes for all files in a directory.
 */
export function generateDirectoryHashes(
  dirPath: string,
  baseDir: string
): EvidenceHash[] {
  const hashes: EvidenceHash[] = [];

  if (!existsSync(dirPath)) {
    return hashes;
  }

  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      hashes.push(...generateDirectoryHashes(entryPath, baseDir));
    } else if (entry.isFile()) {
      hashes.push(generateEvidenceHash(entryPath, baseDir));
    }
  }

  return hashes;
}

// ============================================================================
// Evidence Bundle Directory Structure
// ============================================================================

/**
 * Get the evidence bundle directory path.
 */
export function getEvidenceDir(repoRoot: string, runId: string): string {
  return join(repoRoot, 'artifacts', 'reports', 'system-audit', runId);
}

/**
 * Get the gates log directory path.
 */
export function getGatesDir(evidenceDir: string): string {
  return join(evidenceDir, 'gates');
}

/**
 * Get the STOA verdicts directory path.
 */
export function getStoaVerdictsDir(evidenceDir: string): string {
  return join(evidenceDir, 'stoa-verdicts');
}

/**
 * Get the task updates directory path.
 */
export function getTaskUpdatesDir(evidenceDir: string): string {
  return join(evidenceDir, 'task-updates');
}

/**
 * Ensure all evidence bundle directories exist.
 */
export async function ensureEvidenceDirs(evidenceDir: string): Promise<void> {
  await mkdir(evidenceDir, { recursive: true });
  await mkdir(getGatesDir(evidenceDir), { recursive: true });
  await mkdir(getStoaVerdictsDir(evidenceDir), { recursive: true });
  await mkdir(getTaskUpdatesDir(evidenceDir), { recursive: true });
}

// ============================================================================
// Evidence File Writing
// ============================================================================

/**
 * Write gate selection result to file.
 */
export function writeGateSelection(
  evidenceDir: string,
  selection: GateSelectionResult
): string {
  const filePath = join(evidenceDir, 'gate-selection.json');
  writeFileSync(filePath, JSON.stringify(selection, null, 2), 'utf-8');
  return filePath;
}

/**
 * Write evidence hashes to file.
 */
export function writeEvidenceHashes(
  evidenceDir: string,
  hashes: EvidenceHash[]
): string {
  const filePath = join(evidenceDir, 'evidence-hashes.txt');

  const lines = hashes.map((h) => `${h.sha256}  ${h.path}  (${h.size} bytes)`);
  writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');

  return filePath;
}

/**
 * Write run summary (machine-readable JSON).
 */
export function writeRunSummaryJson(
  evidenceDir: string,
  summary: RunSummary
): string {
  const filePath = join(evidenceDir, 'summary.json');
  writeFileSync(filePath, JSON.stringify(summary, null, 2), 'utf-8');
  return filePath;
}

/**
 * Write run summary (human-readable Markdown).
 */
export function writeRunSummaryMd(
  evidenceDir: string,
  summary: RunSummary
): string {
  const filePath = join(evidenceDir, 'summary.md');

  const md = `# Run Summary

**Run ID:** ${summary.runId}
**Task ID:** ${summary.taskId}
**Started:** ${summary.startedAt}
**Completed:** ${summary.completedAt}
**Strict Mode:** ${summary.strictMode ? 'Yes' : 'No'}

## STOA Assignment

- **Lead STOA:** ${summary.stoaAssignment.leadStoa}
- **Supporting STOAs:** ${summary.stoaAssignment.supportingStoas.join(', ') || 'None'}

## Gate Selection

- **Execute:** ${summary.gateSelection.execute.length} gates
- **Waiver Required:** ${summary.gateSelection.waiverRequired.length} gates
- **Skipped:** ${summary.gateSelection.skipped.length} gates

### Gates to Execute
${summary.gateSelection.execute.map((g) => `- ${g}`).join('\n') || '- None'}

### Gates Requiring Waiver
${summary.gateSelection.waiverRequired.map((g) => `- ${g}`).join('\n') || '- None'}

## Final Verdict

**${summary.finalVerdict}**

## Findings

| Severity | Count |
|----------|-------|
| Critical | ${summary.findingsCount.critical} |
| High | ${summary.findingsCount.high} |
| Medium | ${summary.findingsCount.medium} |
| Low | ${summary.findingsCount.low} |
| Info | ${summary.findingsCount.info} |

## Waivers

Total waivers: ${summary.waiverCount}

## Evidence Hashes

${summary.evidenceHashes.length} files hashed. See \`evidence-hashes.txt\` for details.
`;

  writeFileSync(filePath, md, 'utf-8');
  return filePath;
}

/**
 * Write CSV patch proposal to file.
 */
export function writeCsvPatchProposal(
  evidenceDir: string,
  proposal: CsvPatchProposal
): string {
  const filePath = join(evidenceDir, 'csv-patch-proposal.json');
  writeFileSync(filePath, JSON.stringify(proposal, null, 2), 'utf-8');
  return filePath;
}

// ============================================================================
// Evidence Bundle Generation
// ============================================================================

/**
 * Create a complete evidence bundle.
 */
export async function createEvidenceBundle(
  repoRoot: string,
  runId: string,
  taskId: string,
  gateSelection: GateSelectionResult,
  gateResults: GateExecutionResult[],
  waivers: WaiverRecord[],
  stoaVerdicts: StoaVerdict[],
  csvPatchProposal?: CsvPatchProposal
): Promise<EvidenceBundle> {
  const evidenceDir = getEvidenceDir(repoRoot, runId);
  await ensureEvidenceDirs(evidenceDir);

  // Write all files
  writeGateSelection(evidenceDir, gateSelection);

  if (csvPatchProposal) {
    writeCsvPatchProposal(evidenceDir, csvPatchProposal);
  }

  // Generate hashes for all files in the evidence directory
  const hashes = generateDirectoryHashes(evidenceDir, evidenceDir);

  // Write evidence hashes
  writeEvidenceHashes(evidenceDir, hashes);

  return {
    runId,
    taskId,
    timestamp: new Date().toISOString(),
    hashes,
    gateSelection,
    gateResults,
    waivers,
    stoaVerdicts,
    csvPatchProposal,
  };
}

/**
 * Create a run summary from evidence bundle and STOA assignment.
 */
export function createRunSummary(
  bundle: EvidenceBundle,
  stoaAssignment: StoaAssignment,
  resolvedCsvPath: string,
  strictMode: boolean,
  startedAt: string
): RunSummary {
  // Determine final verdict from STOA verdicts
  const verdicts = bundle.stoaVerdicts.map((v) => v.verdict);
  let finalVerdict: VerdictType = 'PASS';

  if (verdicts.includes('FAIL')) {
    finalVerdict = 'FAIL';
  } else if (verdicts.includes('NEEDS_HUMAN')) {
    finalVerdict = 'NEEDS_HUMAN';
  } else if (verdicts.includes('WARN')) {
    finalVerdict = 'WARN';
  }

  // Count findings by severity
  const findingsCount = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const verdict of bundle.stoaVerdicts) {
    for (const finding of verdict.findings) {
      findingsCount[finding.severity]++;
    }
  }

  return {
    runId: bundle.runId,
    taskId: bundle.taskId,
    startedAt,
    completedAt: new Date().toISOString(),
    resolvedCsvPath,
    strictMode,
    stoaAssignment,
    gateSelection: bundle.gateSelection,
    finalVerdict,
    evidenceHashes: bundle.hashes,
    waiverCount: bundle.waivers.length,
    findingsCount,
  };
}

/**
 * Write a complete run summary (both JSON and MD).
 */
export function writeRunSummary(
  evidenceDir: string,
  summary: RunSummary
): { jsonPath: string; mdPath: string } {
  return {
    jsonPath: writeRunSummaryJson(evidenceDir, summary),
    mdPath: writeRunSummaryMd(evidenceDir, summary),
  };
}

// ============================================================================
// Evidence Verification
// ============================================================================

/**
 * Verify integrity of evidence hashes.
 */
export function verifyEvidenceIntegrity(
  evidenceDir: string,
  hashes: EvidenceHash[]
): { valid: boolean; mismatches: string[] } {
  const mismatches: string[] = [];

  for (const hash of hashes) {
    const filePath = join(evidenceDir, hash.path);

    if (!existsSync(filePath)) {
      mismatches.push(`Missing file: ${hash.path}`);
      continue;
    }

    const currentHash = sha256File(filePath);

    if (currentHash !== hash.sha256) {
      mismatches.push(
        `Hash mismatch: ${hash.path} (expected ${hash.sha256.slice(0, 16)}..., got ${currentHash.slice(0, 16)}...)`
      );
    }
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  };
}
