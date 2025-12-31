/**
 * Sprint Completion Auditor
 *
 * Main orchestrator that coordinates all audit components to verify
 * sprint completion with real implementations (no fake results).
 *
 * INTEGRATED WITH:
 * - attestation.schema.json - Standard attestation format
 * - plan-overrides.yaml - Waiver and exception checking
 * - debt-ledger.yaml - Action item tracking
 * - review-queue.json - Human review queue
 *
 * @module tools/scripts/lib/sprint-audit/sprint-auditor
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse as parseCsv } from 'csv-parse/sync';
import type {
  SprintAuditConfig,
  SprintAuditReport,
  TaskAuditResult,
  TaskVerdict,
  SprintVerdict,
  CsvTask,
  AuditSummary,
  AttestationSummary,
  EvidenceSummary,
  BlockingIssue,
  DependencyVerification,
  DefinitionOfDoneResult,
  AuditOutputPaths,
} from './types';

import { DEFAULT_SCAN_CONFIG } from './types';

import {
  runPlaceholderScan,
  filterFindingsByTaskArtifacts,
  generatePlaceholderSummary,
} from './placeholder-detector';

import {
  verifyTaskArtifacts,
  parseArtifactSpec,
  generateArtifactSummary,
  extractArtifactHashes,
  getCriticalArtifactIssues,
} from './artifact-verifier';

import {
  runTaskValidations,
  parseValidationCommands,
  generateValidationSummary,
  allValidationsPassed,
  getFailedValidations,
} from './validation-runner';

import {
  verifyTaskKpis,
  generateKpiSummary,
  getFailedKpis,
  getManualKpis,
} from './kpi-verifier';

// Integration imports
import {
  generateAttestation,
  writeAttestation,
  generateSprintSummary,
  listSprintAttestations,
  type TaskAttestation,
  type AuditFindings,
  type SprintAttestationSummary,
} from './attestation-generator';

import {
  getWaiverStatus,
  type WaiverStatus,
} from './waiver-checker';

import {
  createActionsFromAttestation,
  addToDebtLedger,
  addToReviewQueue,
} from './action-tracker';

// =============================================================================
// Configuration Defaults
// =============================================================================

const DEFAULT_CONFIG: SprintAuditConfig = {
  sprintNumber: 0,
  repoRoot: process.cwd(),
  strictMode: false,
  skipValidations: false,
  parallelLimit: 4,
  validationTimeout: 60_000,
};

// =============================================================================
// CSV Loading
// =============================================================================

/**
 * Loads tasks from Sprint_plan.csv
 */
export function loadSprintTasks(repoRoot: string): CsvTask[] {
  const csvPath = path.join(
    repoRoot,
    'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
  );

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Sprint_plan.csv not found at ${csvPath}`);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records as CsvTask[];
}

/**
 * Filters tasks for a specific sprint
 */
export function filterSprintTasks(tasks: CsvTask[], sprintNumber: number): CsvTask[] {
  return tasks.filter((task) => {
    const targetSprint = task['Target Sprint'];
    if (!targetSprint) return false;

    // Handle "Continuous" tasks
    if (targetSprint.toLowerCase() === 'continuous') {
      return false; // Exclude continuous tasks from sprint audits
    }

    return parseInt(targetSprint, 10) === sprintNumber;
  });
}

/**
 * Filters to only completed tasks
 */
export function filterCompletedTasks(tasks: CsvTask[]): CsvTask[] {
  return tasks.filter((task) => {
    const status = task.Status?.toLowerCase() || '';
    return status === 'completed' || status === 'done';
  });
}

// =============================================================================
// Dependency Verification
// =============================================================================

/**
 * Verifies task dependencies are completed
 */
export function verifyDependencies(
  task: CsvTask,
  allTasks: CsvTask[],
  repoRoot: string
): DependencyVerification {
  const dependencies = task.Dependencies
    ? task.Dependencies.split(',').map((d) => d.trim()).filter((d) => d)
    : [];

  const attestationsFound: string[] = [];
  const missing: string[] = [];

  for (const depId of dependencies) {
    // Check if dependency is completed
    const depTask = allTasks.find((t) => t['Task ID'] === depId);
    const isCompleted = depTask && ['completed', 'done'].includes(depTask.Status?.toLowerCase() || '');

    if (!isCompleted) {
      missing.push(depId);
      continue;
    }

    // Check for attestation file
    const attestationPath = path.join(
      repoRoot,
      'artifacts/attestations',
      depId,
      'attestation.json'
    );

    if (fs.existsSync(attestationPath)) {
      attestationsFound.push(depId);
    }
  }

  return {
    taskId: task['Task ID'],
    dependencies,
    allCompleted: missing.length === 0,
    attestationsFound,
    missing,
  };
}

// =============================================================================
// Definition of Done Verification
// =============================================================================

/**
 * Parses and verifies Definition of Done criteria
 */
export function verifyDefinitionOfDone(
  task: CsvTask,
  artifactResults: Awaited<ReturnType<typeof verifyTaskArtifacts>>,
  validationResults: Awaited<ReturnType<typeof runTaskValidations>>
): DefinitionOfDoneResult {
  const dodString = task['Definition of Done'] || '';

  // Split DoD into individual criteria
  const criteria = dodString
    .split(/[;,]/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  if (criteria.length === 0) {
    return {
      criteria: [],
      verified: 0,
      unverified: 0,
      details: [],
    };
  }

  const details: DefinitionOfDoneResult['details'] = [];

  for (const criterion of criteria) {
    let verified = false;
    let evidence = '';

    // Try to verify common DoD patterns
    const lowerCriterion = criterion.toLowerCase();

    // Artifact-based verification
    if (lowerCriterion.includes('created') || lowerCriterion.includes('exist')) {
      verified = artifactResults.every((a) => a.status === 'found');
      evidence = verified
        ? `All ${artifactResults.length} artifacts exist`
        : `Missing artifacts: ${artifactResults.filter((a) => a.status === 'missing').length}`;
    }
    // Test-based verification
    else if (lowerCriterion.includes('test') || lowerCriterion.includes('pass')) {
      verified = allValidationsPassed(validationResults);
      evidence = verified
        ? `All ${validationResults.length} validations passed`
        : `Failed validations: ${validationResults.filter((v) => !v.passed).length}`;
    }
    // Documentation verification
    else if (lowerCriterion.includes('documented') || lowerCriterion.includes('readme')) {
      const docArtifacts = artifactResults.filter(
        (a) => a.path.endsWith('.md') || a.path.includes('docs/')
      );
      verified = docArtifacts.length > 0 && docArtifacts.every((a) => a.status === 'found');
      evidence = verified
        ? `Documentation found: ${docArtifacts.map((a) => a.path).join(', ')}`
        : 'No documentation artifacts verified';
    }
    // Default: needs manual verification
    else {
      verified = false;
      evidence = 'Requires manual verification';
    }

    details.push({ criterion, verified, evidence });
  }

  return {
    criteria,
    verified: details.filter((d) => d.verified).length,
    unverified: details.filter((d) => !d.verified).length,
    details,
  };
}

// =============================================================================
// Task Verdict Determination
// =============================================================================

/**
 * Determines verdict for a single task
 */
function determineTaskVerdict(
  artifactIssues: number,
  validationsFailed: number,
  kpisFailed: number,
  placeholdersFound: number,
  dependenciesMissing: number,
  strictMode: boolean
): TaskVerdict {
  // Critical failures always result in FAIL
  if (artifactIssues > 0 || validationsFailed > 0 || dependenciesMissing > 0) {
    return 'FAIL';
  }

  // In strict mode, placeholders and missed KPIs also fail
  if (strictMode && (placeholdersFound > 0 || kpisFailed > 0)) {
    return 'FAIL';
  }

  // In normal mode, placeholders and missed KPIs need human review
  if (placeholdersFound > 0 || kpisFailed > 0) {
    return 'NEEDS_HUMAN';
  }

  return 'PASS';
}

// =============================================================================
// Single Task Audit
// =============================================================================

/**
 * Audits a single task with full integration
 *
 * @param cachedPlaceholders - Pre-computed placeholder scan results (for performance)
 */
export async function auditTask(
  task: CsvTask,
  allTasks: CsvTask[],
  config: SprintAuditConfig,
  validationLogsDir: string,
  runId?: string,
  cachedPlaceholders?: Awaited<ReturnType<typeof runPlaceholderScan>>
): Promise<{ result: TaskAuditResult; attestation: TaskAttestation }> {
  const taskId = task['Task ID'];
  const issues: string[] = [];
  const recommendations: string[] = [];

  console.log(`Auditing task: ${taskId}`);

  // 0. Check waiver status from plan-overrides.yaml
  let waiverStatus: WaiverStatus | null = null;
  try {
    waiverStatus = getWaiverStatus(config.repoRoot, taskId);
    if (waiverStatus.hasWaiver) {
      console.log(`  Waiver: expires ${waiverStatus.waiverExpiry} (${waiverStatus.daysUntilExpiry} days)`);
    }
  } catch {
    // plan-overrides.yaml not found, continue without waiver checking
  }

  // 1. Verify artifacts
  const artifacts = await verifyTaskArtifacts(
    taskId,
    task['Artifacts To Track'] || '',
    config.repoRoot
  );
  const criticalArtifacts = getCriticalArtifactIssues(artifacts);
  if (criticalArtifacts.length > 0) {
    issues.push(`Missing or invalid artifacts: ${criticalArtifacts.map((a) => a.path).join(', ')}`);
    recommendations.push('Create all required artifacts before marking task complete');
  }

  // 2. Filter placeholders for task artifacts (uses cached scan from sprint level)
  const artifactPaths = parseArtifactSpec(task['Artifacts To Track'] || '');
  // Use cached placeholders if provided (much faster), otherwise scan (for standalone task audits)
  const allPlaceholders = cachedPlaceholders ?? await runPlaceholderScan(config.repoRoot, DEFAULT_SCAN_CONFIG);
  const placeholders = filterFindingsByTaskArtifacts(allPlaceholders, artifactPaths);
  if (placeholders.length > 0) {
    issues.push(`Found ${placeholders.length} placeholder(s) in task artifacts`);
    recommendations.push('Remove TODO, FIXME, STUB, and empty function placeholders');
  }

  // 3. Run validations (unless skipped)
  let validations: Awaited<ReturnType<typeof runTaskValidations>> = [];
  if (!config.skipValidations) {
    validations = await runTaskValidations(
      taskId,
      task['Validation Method'] || '',
      config.repoRoot,
      validationLogsDir,
      config.validationTimeout
    );
    const failedValidations = getFailedValidations(validations);
    if (failedValidations.length > 0) {
      issues.push(`Validation(s) failed: ${failedValidations.map((v) => v.command).join(', ')}`);
      recommendations.push('Fix failing validations before marking complete');
    }
  }

  // 4. Verify KPIs
  const kpis = await verifyTaskKpis(
    taskId,
    task.KPIs || '',
    config.repoRoot,
    config.skipValidations
  );
  const failedKpis = getFailedKpis(kpis);
  if (failedKpis.length > 0) {
    issues.push(`KPI(s) not met: ${failedKpis.map((k) => k.kpi).join(', ')}`);
    recommendations.push('Improve implementation to meet KPI targets');
  }

  // 5. Verify dependencies
  const dependencies = verifyDependencies(task, allTasks, config.repoRoot);
  if (!dependencies.allCompleted) {
    issues.push(`Incomplete dependencies: ${dependencies.missing.join(', ')}`);
    recommendations.push('Complete all dependencies before this task');
  }

  // 6. Verify Definition of Done
  const definitionOfDone = verifyDefinitionOfDone(task, artifacts, validations);
  if (definitionOfDone.unverified > 0) {
    issues.push(`${definitionOfDone.unverified} DoD criteria unverified`);
  }

  // 7. Build findings for attestation (respects waivers)
  const findings: AuditFindings = {
    artifacts,
    validations,
    kpis,
    placeholders,
    dependencies,
    definitionOfDone,
    hasWaiver: waiverStatus?.hasWaiver || false,
    waiverExpired: waiverStatus?.waiverExpired || false,
    debtAllowed: waiverStatus?.debtAllowed || false,
  };

  // 8. Generate attestation (uses existing schema format)
  const attestation = generateAttestation(
    taskId,
    findings,
    runId,
    issues.join('; ')
  );

  // 9. Write attestation to standard location
  await writeAttestation(config.repoRoot, attestation);

  // 10. Create action items for failures (integrates with debt-ledger.yaml)
  if (attestation.verdict !== 'COMPLETE') {
    const actions = createActionsFromAttestation(
      attestation,
      waiverStatus?.acceptanceOwner || 'Tech Lead'
    );

    if (actions.length > 0) {
      try {
        const addedIds = await addToDebtLedger(config.repoRoot, actions);
        if (addedIds.length > 0) {
          console.log(`  Created ${addedIds.length} action item(s) in debt-ledger.yaml`);
        }
      } catch (err) {
        console.warn(`  Warning: Could not update debt-ledger.yaml: ${err}`);
      }
    }

    // 11. Add to review queue if needs human review
    if (attestation.verdict === 'NEEDS_HUMAN') {
      try {
        await addToReviewQueue(
          config.repoRoot,
          attestation,
          waiverStatus?.tier || 'C'
        );
        console.log(`  Added to review queue`);
      } catch (err) {
        console.warn(`  Warning: Could not update review-queue.json: ${err}`);
      }
    }
  }

  // Map attestation verdict to legacy TaskVerdict
  const verdict: TaskVerdict = mapAttestationVerdict(attestation.verdict);

  const result: TaskAuditResult = {
    taskId,
    description: task.Description,
    status: task.Status,
    verdict,
    artifacts,
    placeholders,
    validations,
    kpis,
    dependencies,
    definitionOfDone,
    issues,
    recommendations,
  };

  return { result, attestation };
}

/**
 * Maps attestation verdict to legacy TaskVerdict
 */
function mapAttestationVerdict(verdict: string): TaskVerdict {
  switch (verdict) {
    case 'COMPLETE':
      return 'PASS';
    case 'INCOMPLETE':
    case 'PARTIAL':
    case 'BLOCKED':
      return 'FAIL';
    case 'NEEDS_HUMAN':
      return 'NEEDS_HUMAN';
    default:
      return 'FAIL';
  }
}

// =============================================================================
// Sprint Audit Orchestration
// =============================================================================

/**
 * Main audit function - audits an entire sprint
 */
export async function auditSprintCompletion(
  config: Partial<SprintAuditConfig>
): Promise<SprintAuditReport> {
  const fullConfig: SprintAuditConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  const runId = fullConfig.runId || generateRunId(fullConfig.sprintNumber);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Sprint ${fullConfig.sprintNumber} Completion Audit`);
  console.log(`Run ID: ${runId}`);
  console.log(`Strict Mode: ${fullConfig.strictMode}`);
  console.log(`${'='.repeat(60)}\n`);

  // Setup output paths
  const outputPaths = getAuditOutputPaths(fullConfig.repoRoot, fullConfig.sprintNumber, runId);
  await fs.promises.mkdir(outputPaths.evidenceDir, { recursive: true });
  await fs.promises.mkdir(outputPaths.validationLogsDir, { recursive: true });

  // Load and filter tasks
  const allTasks = loadSprintTasks(fullConfig.repoRoot);
  const sprintTasks = filterSprintTasks(allTasks, fullConfig.sprintNumber);
  const completedTasks = filterCompletedTasks(sprintTasks);

  console.log(`Total sprint tasks: ${sprintTasks.length}`);
  console.log(`Completed tasks to audit: ${completedTasks.length}\n`);

  // Run placeholder scan ONCE for the entire repo (major performance optimization)
  console.log(`Running placeholder scan (once for all tasks)...`);
  const placeholderScanStart = Date.now();
  const cachedPlaceholders = await runPlaceholderScan(fullConfig.repoRoot, DEFAULT_SCAN_CONFIG);
  const placeholderScanDuration = ((Date.now() - placeholderScanStart) / 1000).toFixed(1);
  console.log(`Placeholder scan complete: ${cachedPlaceholders.length} findings in ${placeholderScanDuration}s\n`);

  // Save placeholder scan to evidence directory
  await fs.promises.writeFile(
    outputPaths.placeholderScanPath,
    JSON.stringify({
      scanned_at: new Date().toISOString(),
      duration_seconds: parseFloat(placeholderScanDuration),
      total_findings: cachedPlaceholders.length,
      findings: cachedPlaceholders,
    }, null, 2),
    'utf-8'
  );

  // Audit each completed task (using cached placeholder scan)
  const taskResults: TaskAuditResult[] = [];
  const attestations: TaskAttestation[] = [];
  for (const task of completedTasks) {
    const { result, attestation } = await auditTask(
      task,
      allTasks,
      fullConfig,
      outputPaths.validationLogsDir,
      runId,
      cachedPlaceholders // Pass cached scan results
    );
    taskResults.push(result);
    attestations.push(attestation);
  }

  // Generate summaries
  const summary = generateAuditSummary(sprintTasks, completedTasks, taskResults);
  const attestationSummary = generateAttestationSummary(attestations);
  const evidenceSummary = generateEvidenceSummary(taskResults, cachedPlaceholders.length);
  const blockingIssues = extractBlockingIssues(taskResults);
  const artifactHashes = collectArtifactHashes(taskResults);

  // Determine sprint verdict
  const sprintVerdict: SprintVerdict =
    taskResults.every((r) => r.verdict === 'PASS') ? 'PASS' : 'FAIL';

  const durationSeconds = (Date.now() - startTime) / 1000;

  const report: SprintAuditReport = {
    $schema: '../schemas/sprint-audit-report.schema.json',
    schema_version: '1.0.0',
    run_id: runId,
    sprint: fullConfig.sprintNumber,
    generated_at: new Date().toISOString(),
    attestor: 'sprint-completion-auditor',
    verdict: sprintVerdict,
    config: {
      strictMode: fullConfig.strictMode,
      skipValidations: fullConfig.skipValidations,
    },
    summary,
    attestation_summary: attestationSummary,
    evidence_summary: evidenceSummary,
    artifact_hashes: artifactHashes,
    task_results: taskResults,
    blocking_issues: blockingIssues,
    duration_seconds: durationSeconds,
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Audit Complete - Verdict: ${sprintVerdict}`);
  console.log(`Duration: ${durationSeconds.toFixed(1)}s`);
  console.log(`${'='.repeat(60)}\n`);

  return report;
}

// =============================================================================
// Helper Functions
// =============================================================================

function generateRunId(sprintNumber: number): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  const random = Math.random().toString(36).substring(2, 8);
  return `sprint${sprintNumber}-audit-${timestamp}-${random}`;
}

function getAuditOutputPaths(
  repoRoot: string,
  sprintNumber: number,
  runId: string
): AuditOutputPaths {
  const outputDir = path.join(repoRoot, 'artifacts/reports/sprint-audit', runId);
  return {
    outputDir,
    jsonPath: path.join(outputDir, 'audit.json'),
    mdPath: path.join(outputDir, 'audit.md'),
    verdictPath: path.join(outputDir, 'verdict.json'),
    evidenceDir: path.join(outputDir, 'evidence'),
    hashesPath: path.join(outputDir, 'evidence/artifact-hashes.txt'),
    validationLogsDir: path.join(outputDir, 'evidence/validation-logs'),
    placeholderScanPath: path.join(outputDir, 'evidence/placeholder-scan.json'),
  };
}

function generateAuditSummary(
  sprintTasks: CsvTask[],
  completedTasks: CsvTask[],
  taskResults: TaskAuditResult[]
): AuditSummary {
  return {
    totalTasks: sprintTasks.length,
    completedTasks: completedTasks.length,
    auditedTasks: taskResults.length,
    passedTasks: taskResults.filter((r) => r.verdict === 'PASS').length,
    failedTasks: taskResults.filter((r) => r.verdict === 'FAIL').length,
    needsHumanTasks: taskResults.filter((r) => r.verdict === 'NEEDS_HUMAN').length,
  };
}

function generateAttestationSummary(attestations: TaskAttestation[]): AttestationSummary {
  const byVerdict = {
    complete: 0,
    incomplete: 0,
    partial: 0,
    blocked: 0,
    needs_human: 0,
    missing: 0,
  };

  let debtItemsCreated = 0;
  let reviewQueueItems = 0;

  for (const attestation of attestations) {
    switch (attestation.verdict) {
      case 'COMPLETE':
        byVerdict.complete++;
        break;
      case 'INCOMPLETE':
        byVerdict.incomplete++;
        debtItemsCreated++;
        break;
      case 'PARTIAL':
        byVerdict.partial++;
        debtItemsCreated++;
        break;
      case 'BLOCKED':
        byVerdict.blocked++;
        debtItemsCreated++;
        break;
      case 'NEEDS_HUMAN':
        byVerdict.needs_human++;
        reviewQueueItems++;
        break;
    }
  }

  return {
    by_verdict: byVerdict,
    debt_items_created: debtItemsCreated,
    review_queue_items: reviewQueueItems,
  };
}

function generateEvidenceSummary(
  taskResults: TaskAuditResult[],
  totalCodebasePlaceholders: number
): EvidenceSummary {
  let artifactsVerified = 0;
  let artifactsMissing = 0;
  let artifactsEmpty = 0;
  let validationsPassed = 0;
  let validationsFailed = 0;
  let kpisMet = 0;
  let kpisMissed = 0;
  let placeholdersFound = 0;

  for (const result of taskResults) {
    for (const artifact of result.artifacts) {
      if (artifact.status === 'found') artifactsVerified++;
      else if (artifact.status === 'missing') artifactsMissing++;
      else if (artifact.status === 'empty') artifactsEmpty++;
    }

    for (const validation of result.validations) {
      if (validation.passed) validationsPassed++;
      else validationsFailed++;
    }

    for (const kpi of result.kpis) {
      if (kpi.met) kpisMet++;
      else if (kpi.actual !== null) kpisMissed++;
    }

    placeholdersFound += result.placeholders.length;
  }

  return {
    artifactsVerified,
    artifactsMissing,
    artifactsEmpty,
    validationsPassed,
    validationsFailed,
    kpisMet,
    kpisMissed,
    placeholdersFound,
    totalCodebasePlaceholders,
  };
}

function extractBlockingIssues(taskResults: TaskAuditResult[]): BlockingIssue[] {
  const issues: BlockingIssue[] = [];

  for (const result of taskResults) {
    if (result.verdict === 'FAIL') {
      for (const issue of result.issues) {
        let severity: 'critical' | 'high' | 'medium' = 'high';

        if (issue.includes('Missing') || issue.includes('failed')) {
          severity = 'critical';
        } else if (issue.includes('KPI') || issue.includes('placeholder')) {
          severity = 'high';
        }

        issues.push({
          taskId: result.taskId,
          severity,
          issue,
          recommendation: result.recommendations[0] || 'Review and fix issue',
        });
      }
    }
  }

  return issues;
}

function collectArtifactHashes(taskResults: TaskAuditResult[]): Record<string, string> {
  const hashes: Record<string, string> = {};

  for (const result of taskResults) {
    for (const artifact of result.artifacts) {
      if (artifact.sha256 && artifact.status === 'found') {
        hashes[artifact.path] = artifact.sha256;
      }
    }
  }

  return hashes;
}

// Re-export types for convenience
export type { SprintAuditConfig, SprintAuditReport, TaskAuditResult };
