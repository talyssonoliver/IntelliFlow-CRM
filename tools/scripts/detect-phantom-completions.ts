/**
 * Real-time Phantom Completion Detection
 *
 * A task is a "phantom completion" if Status = "Completed" but an artifact it
 * tracks does not exist on disk.
 *
 * Two things are reported but do NOT make a task phantom (2026-10-06 audit):
 * - Artifacts under paths the repo deliberately leaves untracked (spec, plan,
 *   context and context_ack files under .specify/sprints, ADR-067). No checkout
 *   has them, so their absence says nothing about the work.
 * - DoD wording warnings. "DOD has no artifact reference" is a keyword match on
 *   the DoD text (it flagged "Response <500ms, Lighthouse >=90; verified by:
 *   pnpm test"); it grades how the DoD is written, not whether the work exists.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { join, resolve } from 'node:path';
import { globSync } from 'glob';
import { getSprintForTask } from './lib/workflow/utils.js';
import { isUntrackedByDesign } from './lib/untracked-by-design.js';

const CSV_PATH = join(process.cwd(), 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');
const OUTPUT_PATH = join(process.cwd(), 'artifacts/reports/phantom-completion-audit.json');

interface PhantomIssue {
  taskId: string;
  description: string;
  status: string;
  issues: string[];
  missingArtifacts: string[];
}

interface AuditResult {
  audit_metadata: {
    generated_at: string;
    audit_type: string;
    sprint_scope: string;
    severity: string;
  };
  summary: {
    total_completed_tasks: number;
    verified_completions: number;
    phantom_completions: number;
    sprint_path_mismatches: number;
    untracked_by_design_artifacts: number;
    dod_wording_warnings: number;
    integrity_score: string;
    conclusion: string;
  };
  verified_tasks: Array<{
    task_id: string;
    description: string;
    artifacts_verified: string[];
  }>;
  phantom_completions: Array<{
    task_id: string;
    description: string;
    status_claimed: string;
    issues: string[];
    missing_artifacts: string[];
  }>;
  untracked_by_design: Array<{ task_id: string; paths: string[] }>;
  dod_wording_warnings: Array<{ task_id: string; issues: string[] }>;
  sprint_path_mismatches: Array<{
    task_id: string;
    description: string;
    expected_sprint: number;
    found_dir: string;
    fix: string;
  }>;
  recommendations: Array<{
    priority: string;
    action: string;
  }>;
}

// ============================================================================
// ARTIFACT VERIFICATION
// ============================================================================

// Prefixes whose value is a file path. Any other `WORD:` prefix (VALIDATE:,
// GATE:, AUDIT:, ...) is a command or metadata, not a file to look for.
const PATH_PREFIXES = new Set([
  'ARTIFACT',
  'EVIDENCE',
  'SPEC',
  'PLAN',
  'CONTEXT',
  'PRD',
  'ATTESTATION',
  'DELIVERY',
]);

export function parseArtifacts(artifactStr: string): string[] {
  if (!artifactStr) return [];

  return artifactStr
    .split(';')
    .flatMap((part) => {
      const item = part.trim();
      const prefixed = /^([A-Z][A-Z_]*):(.*)$/.exec(item);
      if (prefixed) {
        return PATH_PREFIXES.has(prefixed[1]) ? [prefixed[2].trim()] : [];
      }
      // Check for raw path
      if (item.includes('/') || item.includes('.')) {
        return [item];
      }
      return [];
    })
    .filter((p) => p && !p.includes('*')); // Skip wildcards for now
}

function checkArtifactExists(artifactPath: string, root: string): boolean {
  const fullPath = resolve(root, artifactPath);

  // Direct file check
  if (existsSync(fullPath)) {
    return true;
  }

  // Try with glob for patterns
  if (artifactPath.includes('*')) {
    const matches = globSync(artifactPath, { cwd: root });
    return matches.length > 0;
  }

  return false;
}

export function verifyArtifacts(
  artifactStr: string,
  root: string = process.cwd()
): { exists: string[]; missing: string[]; untrackedByDesign: string[] } {
  const artifacts = parseArtifacts(artifactStr);
  const exists: string[] = [];
  const missing: string[] = [];
  const untrackedByDesign: string[] = [];

  for (const artifact of artifacts) {
    // A gitignored path is never proof, even when a local copy happens to exist.
    if (isUntrackedByDesign(artifact, root)) {
      untrackedByDesign.push(artifact);
    } else if (checkArtifactExists(artifact, root)) {
      exists.push(artifact);
    } else {
      missing.push(artifact);
    }
  }

  return { exists, missing, untrackedByDesign };
}

// ============================================================================
// DOD VERIFICATION
// ============================================================================

function hasArtifactReference(dod: string): boolean {
  const artifactPatterns = [
    /\.md/i,
    /\.ts/i,
    /\.js/i,
    /\.json/i,
    /\.yaml/i,
    /\.yml/i,
    /\.prisma/i,
    /\.sql/i,
    /\.puml/i,
    /\.pdf/i,
    /\.xlsx/i,
    /\.csv/i,
    /artifact/i,
    /file/i,
    /document/i,
    /report/i,
    /schema/i,
    /config/i,
    /template/i,
    /checklist/i,
    /guide/i,
    /output/i,
  ];
  return artifactPatterns.some((p) => p.test(dod));
}

function hasMeasurableCriteria(dod: string): boolean {
  const measurablePatterns = [
    /\d{1,10}%/, // percentages
    /<\d+/, // less than
    />\d+/, // greater than
    /\d{1,10}[ \t]*(ms|s|min|hour|day)/i, // time units
    /100%/, // full coverage
    /zero|0\s+(error|issue|fail|bug)/i, // zero defects
    /all\s+\w+\s+(pass|complete|covered|tested)/i, // all X pass
    /no\s+\w+\s+(error|issue|fail|violation)/i, // no X errors
    />=|<=|≥|≤/, // comparison operators
  ];
  return measurablePatterns.some((p) => p.test(dod));
}

function hasTestableAssertion(dod: string): boolean {
  const testablePatterns = [
    /test.*pass/i,
    /coverage/i,
    /lint.*pass/i,
    /build.*success/i,
    /deploy.*success/i,
    /validated/i,
    /verified/i,
    /approved/i,
    /reviewed/i,
    /signed.?off/i,
    /working/i,
    /functional/i,
    /operational/i,
    /active/i,
    /enabled/i,
    /configured/i,
    /integrated/i,
    /implemented/i,
    /created/i,
    /generated/i,
    /published/i,
  ];
  return testablePatterns.some((p) => p.test(dod));
}

export function verifyDod(dod: string): string[] {
  const issues: string[] = [];

  if (!hasArtifactReference(dod)) {
    issues.push('DOD has no artifact reference');
  }

  if (!hasMeasurableCriteria(dod) && !hasTestableAssertion(dod)) {
    issues.push('DOD has no measurable or testable criteria');
  }

  return issues;
}

// ============================================================================
// SPRINT PATH MISMATCH CHECK
// ============================================================================

/**
 * For a completed task, check whether the attestation on disk lives under the
 * sprint folder that matches the CSV "Target Sprint" value.
 *
 * Returns the mismatched directory name if a mismatch is found, or null if:
 *   - no attestation exists at all (not our concern here — artifact check handles that)
 *   - the attestation is in the correct sprint folder
 */
function checkAttestationSprintPath(
  taskId: string,
  expectedSprint: number
): { mismatch: true; foundDir: string } | { mismatch: false } {
  const repoRoot = process.cwd();
  const sprintsDir = join(repoRoot, '.specify', 'sprints');

  if (!existsSync(sprintsDir)) {
    return { mismatch: false };
  }

  // Check expected location first — if found there, no mismatch
  const expectedDir = join(sprintsDir, `sprint-${expectedSprint}`, 'attestations', taskId);
  const expectedAttestation = join(expectedDir, 'attestation.json');
  if (existsSync(expectedAttestation)) {
    return { mismatch: false };
  }

  // Scan all other sprint dirs for the attestation
  let sprintDirs: string[];
  try {
    sprintDirs = readdirSync(sprintsDir).filter((d) => /^sprint-\d+$/.test(d));
  } catch {
    return { mismatch: false };
  }

  for (const dir of sprintDirs) {
    if (dir === `sprint-${expectedSprint}`) continue; // already checked above
    const altAttestation = join(sprintsDir, dir, 'attestations', taskId, 'attestation.json');
    if (existsSync(altAttestation)) {
      return { mismatch: true, foundDir: dir };
    }
  }

  return { mismatch: false };
}

// ============================================================================
// MAIN
// ============================================================================

type SprintMismatchEntry = {
  task_id: string;
  description: string;
  expected_sprint: number;
  found_dir: string;
};
type VerifiedEntry = { task_id: string; description: string; artifacts_verified: string[] };

export interface CompletionClassification {
  phantom: PhantomIssue | null;
  verified: VerifiedEntry | null;
  untrackedByDesign: string[];
  dodWarnings: string[];
}

/** Classify one Completed task. Only a missing tracked artifact makes it phantom. */
export function classifyCompletion(
  task: Record<string, string>,
  root: string = process.cwd()
): CompletionClassification {
  const taskId = task['Task ID'];
  const shortDesc = (task['Description'] || '').substring(0, 60);
  const artifactCheck = verifyArtifacts(task['Artifacts To Track'] || '', root);
  const dodWarnings = verifyDod(task['Definition of Done'] || '');
  const base = { untrackedByDesign: artifactCheck.untrackedByDesign, dodWarnings };

  const phantom = (issues: string[]): CompletionClassification => ({
    ...base,
    verified: null,
    phantom: {
      taskId,
      description: shortDesc,
      status: 'Completed',
      issues,
      missingArtifacts: artifactCheck.missing,
    },
  });
  if (artifactCheck.missing.length > 0) {
    return phantom([`Missing ${artifactCheck.missing.length} artifact(s)`]);
  }
  // Skipping untracked paths must never turn "no evidence" into a pass.
  if (artifactCheck.exists.length === 0) {
    return phantom(['No tracked evidence: every artifact is untracked by design or absent']);
  }
  return {
    ...base,
    phantom: null,
    verified: { task_id: taskId, description: shortDesc, artifacts_verified: artifactCheck.exists },
  };
}

function classifyTask(
  task: Record<string, string>,
  phantoms: PhantomIssue[],
  verified: VerifiedEntry[],
  sprintMismatches: SprintMismatchEntry[],
  untracked: Array<{ task_id: string; paths: string[] }>,
  dodWarnings: Array<{ task_id: string; issues: string[] }>
): void {
  const taskId = task['Task ID'];
  const shortDesc = (task['Description'] || '').substring(0, 60);

  let expectedSprint = 0;
  try {
    expectedSprint = getSprintForTask(taskId, process.cwd());
  } catch {
    /* skip */
  }
  if (expectedSprint > 0) {
    const sprintCheck = checkAttestationSprintPath(taskId, expectedSprint);
    if (sprintCheck.mismatch) {
      sprintMismatches.push({
        task_id: taskId,
        description: shortDesc,
        expected_sprint: expectedSprint,
        found_dir: sprintCheck.foundDir,
      });
    }
  }

  const result = classifyCompletion(task);
  if (result.phantom) phantoms.push(result.phantom);
  if (result.verified) verified.push(result.verified);
  if (result.untrackedByDesign.length > 0)
    untracked.push({ task_id: taskId, paths: result.untrackedByDesign });
  if (result.dodWarnings.length > 0)
    dodWarnings.push({ task_id: taskId, issues: result.dodWarnings });
}

function determineSeverity(phantomCount: number): string {
  if (phantomCount === 0) return 'INFO';
  if (phantomCount > 10) return 'CRITICAL';
  if (phantomCount > 5) return 'HIGH';
  return 'MEDIUM';
}

function printPhantomEntry(p: PhantomIssue): void {
  console.log(`[${p.taskId}] ${p.description}`);
  for (const issue of p.issues) console.log(`  - ${issue}`);
  if (p.missingArtifacts.length > 0) {
    const overflow = p.missingArtifacts.length > 3 ? '...' : '';
    console.log(`  Missing: ${p.missingArtifacts.slice(0, 3).join(', ')}${overflow}`);
  }
  console.log('');
}

function printPhantomReport(
  phantoms: PhantomIssue[],
  sprintMismatches: SprintMismatchEntry[]
): void {
  if (phantoms.length > 0) {
    console.log('=== Phantom Completions ===\n');
    for (const p of phantoms) {
      printPhantomEntry(p);
    }
  }
  if (sprintMismatches.length > 0) {
    console.log('=== Sprint Path Mismatches ===\n');
    for (const m of sprintMismatches) {
      console.log(`[${m.task_id}] ${m.description}`);
      console.log(
        `  Expected: sprint-${m.expected_sprint}/attestations/${m.task_id}/attestation.json`
      );
      console.log(`  Found at: ${m.found_dir}/attestations/${m.task_id}/attestation.json`);
      console.log(
        `  Fix: Move attestation to sprint-${m.expected_sprint} or update CSV Target Sprint.`
      );
      console.log('');
    }
  }
}

function buildAuditConclusion(phantomCount: number, mismatchCount: number): string {
  if (phantomCount === 0 && mismatchCount === 0) {
    return 'All completed tasks have been verified - no phantom completions or sprint path mismatches detected';
  }
  return [
    phantomCount > 0
      ? `${phantomCount} tasks marked as Completed but missing tracked artifacts`
      : '',
    mismatchCount > 0 ? `${mismatchCount} tasks have attestations in the wrong sprint folder` : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function buildRecommendations(
  phantomCount: number,
  mismatchCount: number
): Array<{ priority: string; action: string }> {
  if (phantomCount === 0 && mismatchCount === 0) {
    return [
      { priority: 'INFO', action: 'All tasks verified - maintain current validation practices' },
    ];
  }
  const recs: Array<{ priority: string; action: string }> = [];
  if (phantomCount > 0) {
    recs.push({ priority: 'HIGH', action: 'Create missing artifacts for phantom completions' });
    recs.push({
      priority: 'LOW',
      action: 'Consider reverting status to "In Progress" until artifacts exist',
    });
  }
  if (mismatchCount > 0) {
    recs.push({
      priority: 'HIGH',
      action:
        'Move misplaced attestations to their correct sprint folder, or update CSV Target Sprint',
    });
  }
  return recs;
}

async function main() {
  console.log('=== Real-time Phantom Completion Detection ===\n');

  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const tasks = parse(csvContent, { columns: true, bom: true, relax_quotes: true }) as Record<
    string,
    string
  >[];
  const completedTasks = tasks.filter((t) => t['Status']?.toLowerCase() === 'completed');

  console.log(`Total tasks: ${tasks.length}`);
  console.log(`Completed tasks: ${completedTasks.length}\n`);

  const phantoms: PhantomIssue[] = [];
  const verified: VerifiedEntry[] = [];
  const sprintMismatches: SprintMismatchEntry[] = [];
  const untracked: Array<{ task_id: string; paths: string[] }> = [];
  const dodWarnings: Array<{ task_id: string; issues: string[] }> = [];

  for (const task of completedTasks) {
    classifyTask(task, phantoms, verified, sprintMismatches, untracked, dodWarnings);
  }

  const totalCompleted = completedTasks.length;
  const verifiedCount = verified.length;
  const phantomCount = phantoms.length;
  const integrityScore =
    totalCompleted > 0 ? Math.round((verifiedCount / totalCompleted) * 100) : 100;
  const severity = determineSeverity(phantomCount);

  console.log('=== Results ===');
  console.log(`Verified completions: ${verifiedCount}`);
  console.log(`Phantom completions: ${phantomCount}`);
  console.log(`Sprint path mismatches: ${sprintMismatches.length}`);
  console.log(`Integrity score: ${integrityScore}%`);
  console.log(`Severity: ${severity}\n`);

  printPhantomReport(phantoms, sprintMismatches);

  const auditResult: AuditResult = {
    audit_metadata: {
      generated_at: new Date().toISOString(),
      audit_type: 'PHANTOM_COMPLETION_DETECTION',
      sprint_scope: 'all',
      severity,
    },
    summary: {
      total_completed_tasks: totalCompleted,
      verified_completions: verifiedCount,
      phantom_completions: phantomCount,
      sprint_path_mismatches: sprintMismatches.length,
      untracked_by_design_artifacts: untracked.length,
      dod_wording_warnings: dodWarnings.length,
      integrity_score: `${integrityScore}%`,
      conclusion: buildAuditConclusion(phantomCount, sprintMismatches.length),
    },
    verified_tasks: verified,
    phantom_completions: phantoms.map((p) => ({
      task_id: p.taskId,
      description: p.description,
      status_claimed: p.status,
      issues: p.issues,
      missing_artifacts: p.missingArtifacts,
    })),
    untracked_by_design: untracked,
    dod_wording_warnings: dodWarnings,
    sprint_path_mismatches: sprintMismatches.map((m) => ({
      task_id: m.task_id,
      description: m.description,
      expected_sprint: m.expected_sprint,
      found_dir: m.found_dir,
      fix: `Move attestation to sprint-${m.expected_sprint}/attestations/${m.task_id}/ or update CSV Target Sprint to match ${m.found_dir}.`,
    })),
    recommendations: buildRecommendations(phantomCount, sprintMismatches.length),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(auditResult, null, 2));
  console.log(`Audit written to: ${OUTPUT_PATH}`);
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('detect-phantom-completions.ts')) {
  main().catch(console.error);
}
