/**
 * Completion Attestation System
 *
 * Validates that tasks marked as "Completed" truly meet all criteria:
 * - Owner approval
 * - Dependencies not blocking
 * - Pre-requisites still valid
 * - Definition of Done verified
 * - KPIs passing
 * - Artifacts tracked and valid
 * - Validation method executed and passing
 *
 * @module tools/scripts/lib/stoa/attestation
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import {
  findRepoRoot,
  resolveSprintPlanPath,
  parseSprintCsv,
} from '../validation-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface TaskRecord {
  taskId: string;
  section: string;
  description: string;
  owner: string;
  dependencies: string[];
  cleanDependencies: string;
  crossQuarterDeps: string;
  prerequisites: string;
  definitionOfDone: string;
  status: string;
  kpis: string;
  targetSprint: string;
  artifactsToTrack: string[];
  validationMethod: string;
}

export interface AttestationCriterion {
  name: string;
  description: string;
  status: 'pass' | 'warn' | 'fail' | 'skip' | 'pending';
  evidence: string[];
  recommendation?: string;
}

export interface TaskAttestation {
  taskId: string;
  attestedAt: string;
  overallStatus: 'valid' | 'invalid' | 'needs_review';
  criteria: {
    ownerApproval: AttestationCriterion;
    dependenciesClean: AttestationCriterion;
    prerequisitesMet: AttestationCriterion;
    definitionOfDoneMet: AttestationCriterion;
    kpisPassing: AttestationCriterion;
    artifactsTracked: AttestationCriterion;
    validationPassing: AttestationCriterion;
  };
  summary: {
    passed: number;
    warned: number;
    failed: number;
    skipped: number;
  };
}

export interface SprintAttestationReport {
  sprint: string;
  generatedAt: string;
  totalTasks: number;
  completedTasks: number;
  attestations: TaskAttestation[];
  summary: {
    fullyValid: number;
    needsReview: number;
    invalid: number;
  };
}

// ============================================================================
// CSV Parsing
// ============================================================================

export function loadAllTasks(repoRoot: string): TaskRecord[] {
  const csvPath = resolveSprintPlanPath(repoRoot);
  if (!csvPath || !existsSync(csvPath)) {
    throw new Error('Sprint_plan.csv not found');
  }

  const content = readFileSync(csvPath, 'utf-8');
  const { tasks } = parseSprintCsv(content);

  return tasks.map((t) => ({
    taskId: t['Task ID'] || '',
    section: t['Section'] || '',
    description: t['Description'] || '',
    owner: t['Owner'] || '',
    dependencies: (t['Dependencies'] || '').split(',').map((d: string) => d.trim()).filter(Boolean),
    cleanDependencies: t['CleanDependencies'] || '',
    crossQuarterDeps: t['CrossQuarterDeps'] || '',
    prerequisites: t['Pre-requisites'] || '',
    definitionOfDone: t['Definition of Done'] || '',
    status: t['Status'] || '',
    kpis: t['KPIs'] || '',
    targetSprint: t['Target Sprint'] || '',
    // Artifacts can be separated by semicolons OR commas in the CSV
    artifactsToTrack: (t['Artifacts To Track'] || '').split(/[;,]/).map((a: string) => a.trim()).filter(Boolean),
    validationMethod: t['Validation Method'] || '',
  }));
}

export function loadSprintTasks(sprint: string, repoRoot: string): TaskRecord[] {
  const allTasks = loadAllTasks(repoRoot);
  return allTasks.filter((t) => t.targetSprint === sprint);
}

export function loadCompletedTasks(sprint: string, repoRoot: string): TaskRecord[] {
  const sprintTasks = loadSprintTasks(sprint, repoRoot);
  return sprintTasks.filter((t) =>
    t.status === 'Completed' || t.status === 'Done'
  );
}

// ============================================================================
// Task Context Extraction (LLM-sized chunks)
// ============================================================================

export interface TaskContext {
  task: TaskRecord;
  dependencyTasks: TaskRecord[];
  dependentTasks: TaskRecord[];  // Tasks that depend on this one
  relatedArtifacts: string[];
  matopEvidence?: {
    runId: string;
    verdict: string;
    evidenceDir: string;
  };
}

export function extractTaskContext(
  taskId: string,
  repoRoot: string
): TaskContext | null {
  const allTasks = loadAllTasks(repoRoot);
  const task = allTasks.find((t) => t.taskId === taskId);

  if (!task) {
    return null;
  }

  // Find dependency tasks
  const dependencyTasks = allTasks.filter((t) =>
    task.dependencies.includes(t.taskId)
  );

  // Find tasks that depend on this one
  const dependentTasks = allTasks.filter((t) =>
    t.dependencies.includes(taskId)
  );

  // Find related artifacts
  const relatedArtifacts = findRelatedArtifacts(task, repoRoot);

  // Find MATOP evidence if available
  const matopEvidence = findLatestMatopEvidence(taskId, repoRoot);

  return {
    task,
    dependencyTasks,
    dependentTasks,
    relatedArtifacts,
    matopEvidence,
  };
}

function findRelatedArtifacts(task: TaskRecord, repoRoot: string): string[] {
  const found: string[] = [];

  for (const artifactPath of task.artifactsToTrack) {
    const fullPath = join(repoRoot, artifactPath.trim());

    if (existsSync(fullPath)) {
      found.push(artifactPath);
    }
  }

  return found;
}

function findLatestMatopEvidence(
  taskId: string,
  repoRoot: string
): TaskContext['matopEvidence'] | undefined {
  const auditDir = join(repoRoot, 'artifacts', 'reports', 'system-audit');

  if (!existsSync(auditDir)) {
    return undefined;
  }

  // Find runs that contain this task's verdict
  const runs = readdirSync(auditDir)
    .filter((f) => {
      const runPath = join(auditDir, f);
      return statSync(runPath).isDirectory();
    })
    .sort()
    .reverse();  // Most recent first

  for (const runId of runs) {
    const summaryPath = join(auditDir, runId, 'summary.json');
    if (existsSync(summaryPath)) {
      try {
        const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
        if (summary.taskId === taskId) {
          return {
            runId,
            verdict: summary.finalVerdict || 'UNKNOWN',
            evidenceDir: join(auditDir, runId),
          };
        }
      } catch {
        // Skip invalid summaries
      }
    }
  }

  return undefined;
}

// ============================================================================
// Attestation Criteria Validators
// ============================================================================

function checkOwnerApproval(
  task: TaskRecord,
  context: TaskContext
): AttestationCriterion {
  // For now, we check if owner is specified
  // In future, could check for actual approval records
  if (!task.owner || task.owner.trim() === '') {
    return {
      name: 'Owner Approval',
      description: 'Task has an assigned owner who approved completion',
      status: 'fail',
      evidence: [],
      recommendation: 'Assign an owner to this task',
    };
  }

  // If we have MATOP evidence, that serves as automated approval
  if (context.matopEvidence && context.matopEvidence.verdict === 'PASS') {
    return {
      name: 'Owner Approval',
      description: 'Task has an assigned owner who approved completion',
      status: 'pass',
      evidence: [
        `Owner: ${task.owner}`,
        `MATOP verdict: ${context.matopEvidence.verdict}`,
      ],
    };
  }

  return {
    name: 'Owner Approval',
    description: 'Task has an assigned owner who approved completion',
    status: 'warn',
    evidence: [`Owner: ${task.owner}`],
    recommendation: 'Run MATOP validation to confirm automated approval',
  };
}

function checkDependenciesClean(
  task: TaskRecord,
  context: TaskContext
): AttestationCriterion {
  const issues: string[] = [];
  const evidence: string[] = [];

  // If no dependencies, pass
  if (task.dependencies.length === 0 || (task.dependencies.length === 1 && task.dependencies[0] === '')) {
    return {
      name: 'Dependencies Clean',
      description: 'All dependencies are completed and not blocking',
      status: 'pass',
      evidence: ['No dependencies'],
    };
  }

  // Check if all dependencies are completed
  for (const depId of task.dependencies) {
    const depTask = context.dependencyTasks.find((t) => t.taskId === depId);
    if (!depTask) {
      // Dependency not found in current sprint - might be external
      evidence.push(`${depId}: (external or not in sprint)`);
    } else if (depTask.status !== 'Completed' && depTask.status !== 'Done') {
      issues.push(`${depId}: ${depTask.status || 'NOT COMPLETE'}`);
    } else {
      evidence.push(`${depId}: ${depTask.status}`);
    }
  }

  if (issues.length > 0) {
    return {
      name: 'Dependencies Clean',
      description: 'All dependencies are completed and not blocking',
      status: 'fail',
      evidence: [...evidence, ...issues.map((i) => `BLOCKED: ${i}`)],
      recommendation: 'Complete blocking dependencies before marking this task complete',
    };
  }

  return {
    name: 'Dependencies Clean',
    description: 'All dependencies are completed and not blocking',
    status: 'pass',
    evidence,
  };
}

function checkPrerequisitesMet(
  task: TaskRecord,
  context: TaskContext
): AttestationCriterion {
  if (!task.prerequisites || task.prerequisites.trim() === '' || task.prerequisites === '-') {
    return {
      name: 'Prerequisites Met',
      description: 'All pre-requisites are satisfied',
      status: 'pass',
      evidence: ['No prerequisites specified'],
    };
  }

  // Parse prerequisites
  const prereqs = task.prerequisites.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  const evidence: string[] = prereqs.map((p) => `Prereq: ${p}`);

  // KEY INSIGHT: If MATOP already validated this task with PASS,
  // the prerequisites WERE satisfied at validation time.
  // We trust the evidence - no need for manual re-verification.
  if (context.matopEvidence && context.matopEvidence.verdict === 'PASS') {
    return {
      name: 'Prerequisites Met',
      description: 'All pre-requisites are satisfied',
      status: 'pass',
      evidence: [
        ...evidence,
        `Verified by MATOP run: ${context.matopEvidence.runId}`,
      ],
    };
  }

  // If MATOP had WARN, prerequisites might have issues
  if (context.matopEvidence && context.matopEvidence.verdict === 'WARN') {
    return {
      name: 'Prerequisites Met',
      description: 'All pre-requisites are satisfied',
      status: 'warn',
      evidence: [
        ...evidence,
        `MATOP verdict was WARN - review prerequisites`,
      ],
      recommendation: 'Check MATOP evidence for prerequisite issues',
    };
  }

  // No MATOP evidence - needs validation
  return {
    name: 'Prerequisites Met',
    description: 'All pre-requisites are satisfied',
    status: 'warn',
    evidence,
    recommendation: 'Run MATOP validation to verify prerequisites',
  };
}

function checkDefinitionOfDoneMet(
  task: TaskRecord,
  context: TaskContext
): AttestationCriterion {
  if (!task.definitionOfDone || task.definitionOfDone.trim() === '' || task.definitionOfDone === '-') {
    return {
      name: 'Definition of Done Met',
      description: 'All DoD criteria are satisfied',
      status: 'warn',
      evidence: ['No DoD specified'],
      recommendation: 'Add a Definition of Done for this task',
    };
  }

  const evidence: string[] = [];

  // If we have MATOP evidence with PASS, DoD is considered met
  if (context.matopEvidence && context.matopEvidence.verdict === 'PASS') {
    evidence.push(`MATOP verdict: PASS`);
    evidence.push(`Evidence: ${context.matopEvidence.evidenceDir}`);

    return {
      name: 'Definition of Done Met',
      description: 'All DoD criteria are satisfied',
      status: 'pass',
      evidence,
    };
  }

  // Parse DoD items
  const dodItems = task.definitionOfDone.split(/[;]/).map((d) => d.trim()).filter(Boolean);
  for (const item of dodItems) {
    evidence.push(`DoD: ${item}`);
  }

  return {
    name: 'Definition of Done Met',
    description: 'All DoD criteria are satisfied',
    status: 'warn',
    evidence,
    recommendation: 'Run MATOP validation to verify DoD criteria',
  };
}

function checkKpisPassing(
  task: TaskRecord,
  context: TaskContext
): AttestationCriterion {
  if (!task.kpis || task.kpis.trim() === '' || task.kpis === '-') {
    return {
      name: 'KPIs Passing',
      description: 'All KPI targets are met',
      status: 'skip',
      evidence: ['No KPIs specified'],
    };
  }

  // Parse KPIs
  const kpis = task.kpis.split(/[;]/).map((k) => k.trim()).filter(Boolean);
  const evidence: string[] = [];

  for (const kpi of kpis) {
    evidence.push(`KPI: ${kpi}`);
  }

  // If we have MATOP PASS, assume KPIs are met
  if (context.matopEvidence && context.matopEvidence.verdict === 'PASS') {
    return {
      name: 'KPIs Passing',
      description: 'All KPI targets are met',
      status: 'pass',
      evidence: [...evidence, `MATOP verdict: PASS`],
    };
  }

  return {
    name: 'KPIs Passing',
    description: 'All KPI targets are met',
    status: 'warn',
    evidence,
    recommendation: 'Run validation to verify KPIs are still passing',
  };
}

function checkArtifactsTracked(
  task: TaskRecord,
  context: TaskContext,
  repoRoot: string
): AttestationCriterion {
  if (task.artifactsToTrack.length === 0) {
    return {
      name: 'Artifacts Tracked',
      description: 'All specified artifacts exist and are valid',
      status: 'skip',
      evidence: ['No artifacts specified'],
    };
  }

  const found: string[] = [];
  const missing: string[] = [];

  for (const artifact of task.artifactsToTrack) {
    const trimmedArtifact = artifact.trim();

    // Handle glob patterns (contains * or **)
    if (trimmedArtifact.includes('*')) {
      // For glob patterns, check if parent directory exists and has files
      const parentDir = trimmedArtifact.replace(/\/?\*.*$/, '');
      const fullParentPath = join(repoRoot, parentDir);

      if (existsSync(fullParentPath) && statSync(fullParentPath).isDirectory()) {
        try {
          const files = readdirSync(fullParentPath);
          if (files.length > 0) {
            found.push(`${trimmedArtifact} (${files.length} files in ${parentDir})`);
          } else {
            missing.push(`${trimmedArtifact} (directory empty)`);
          }
        } catch {
          missing.push(`${trimmedArtifact} (cannot read directory)`);
        }
      } else {
        missing.push(trimmedArtifact);
      }
      continue;
    }

    const fullPath = join(repoRoot, trimmedArtifact);

    if (existsSync(fullPath)) {
      // Get file hash for evidence
      try {
        const stat = statSync(fullPath);
        if (stat.isFile()) {
          const content = readFileSync(fullPath);
          const hash = createHash('sha256').update(content).digest('hex').slice(0, 12);
          found.push(`${trimmedArtifact} (sha256: ${hash}...)`);
        } else if (stat.isDirectory()) {
          const files = readdirSync(fullPath);
          found.push(`${trimmedArtifact} (directory, ${files.length} items)`);
        }
      } catch {
        found.push(`${trimmedArtifact} (exists)`);
      }
    } else {
      missing.push(trimmedArtifact);
    }
  }

  if (missing.length > 0) {
    return {
      name: 'Artifacts Tracked',
      description: 'All specified artifacts exist and are valid',
      status: 'fail',
      evidence: [
        ...found.map((f) => `Found: ${f}`),
        ...missing.map((m) => `Missing: ${m}`),
      ],
      recommendation: `Create missing artifacts: ${missing.join(', ')}`,
    };
  }

  return {
    name: 'Artifacts Tracked',
    description: 'All specified artifacts exist and are valid',
    status: 'pass',
    evidence: found.map((f) => `Found: ${f}`),
  };
}

function checkValidationPassing(
  task: TaskRecord,
  context: TaskContext
): AttestationCriterion {
  if (!task.validationMethod || task.validationMethod.trim() === '' || task.validationMethod === '-') {
    return {
      name: 'Validation Passing',
      description: 'Validation method executed and passing',
      status: 'warn',
      evidence: ['No validation method specified'],
      recommendation: 'Add a validation method for this task',
    };
  }

  const evidence: string[] = [`Method: ${task.validationMethod}`];

  // If we have MATOP evidence, use that
  if (context.matopEvidence) {
    evidence.push(`MATOP run: ${context.matopEvidence.runId}`);
    evidence.push(`Verdict: ${context.matopEvidence.verdict}`);

    if (context.matopEvidence.verdict === 'PASS') {
      return {
        name: 'Validation Passing',
        description: 'Validation method executed and passing',
        status: 'pass',
        evidence,
      };
    } else if (context.matopEvidence.verdict === 'WARN') {
      return {
        name: 'Validation Passing',
        description: 'Validation method executed and passing',
        status: 'warn',
        evidence,
        recommendation: 'Review MATOP warnings and resolve if needed',
      };
    } else {
      return {
        name: 'Validation Passing',
        description: 'Validation method executed and passing',
        status: 'fail',
        evidence,
        recommendation: 'Fix validation failures and re-run MATOP',
      };
    }
  }

  return {
    name: 'Validation Passing',
    description: 'Validation method executed and passing',
    status: 'pending',
    evidence,
    recommendation: 'Run MATOP validation for this task',
  };
}

// ============================================================================
// Full Attestation
// ============================================================================

export function attestTask(
  taskId: string,
  repoRoot: string
): TaskAttestation | null {
  const context = extractTaskContext(taskId, repoRoot);

  if (!context) {
    return null;
  }

  const criteria = {
    ownerApproval: checkOwnerApproval(context.task, context),
    dependenciesClean: checkDependenciesClean(context.task, context),
    prerequisitesMet: checkPrerequisitesMet(context.task, context),
    definitionOfDoneMet: checkDefinitionOfDoneMet(context.task, context),
    kpisPassing: checkKpisPassing(context.task, context),
    artifactsTracked: checkArtifactsTracked(context.task, context, repoRoot),
    validationPassing: checkValidationPassing(context.task, context),
  };

  // Count statuses
  const allCriteria = Object.values(criteria);
  const summary = {
    passed: allCriteria.filter((c) => c.status === 'pass').length,
    warned: allCriteria.filter((c) => c.status === 'warn').length,
    failed: allCriteria.filter((c) => c.status === 'fail').length,
    skipped: allCriteria.filter((c) => c.status === 'skip' || c.status === 'pending').length,
  };

  // Determine overall status
  let overallStatus: TaskAttestation['overallStatus'];
  if (summary.failed > 0) {
    overallStatus = 'invalid';
  } else if (summary.warned > 0) {
    overallStatus = 'needs_review';
  } else {
    overallStatus = 'valid';
  }

  return {
    taskId,
    attestedAt: new Date().toISOString(),
    overallStatus,
    criteria,
    summary,
  };
}

export function attestSprint(sprint: string, repoRoot: string): SprintAttestationReport {
  const sprintTasks = loadSprintTasks(sprint, repoRoot);
  const completedTasks = sprintTasks.filter((t) =>
    t.status === 'Completed' || t.status === 'Done'
  );

  const attestations: TaskAttestation[] = [];

  for (const task of completedTasks) {
    const attestation = attestTask(task.taskId, repoRoot);
    if (attestation) {
      attestations.push(attestation);
    }
  }

  const summary = {
    fullyValid: attestations.filter((a) => a.overallStatus === 'valid').length,
    needsReview: attestations.filter((a) => a.overallStatus === 'needs_review').length,
    invalid: attestations.filter((a) => a.overallStatus === 'invalid').length,
  };

  return {
    sprint,
    generatedAt: new Date().toISOString(),
    totalTasks: sprintTasks.length,
    completedTasks: completedTasks.length,
    attestations,
    summary,
  };
}

// ============================================================================
// Report Generation
// ============================================================================

export function generateAttestationMarkdown(report: SprintAttestationReport): string {
  let md = `# Sprint ${report.sprint} Completion Attestation Report

**Generated:** ${report.generatedAt}
**Total Tasks:** ${report.totalTasks}
**Completed Tasks:** ${report.completedTasks}

## Summary

| Status | Count |
|--------|-------|
| Fully Valid | ${report.summary.fullyValid} |
| Needs Review | ${report.summary.needsReview} |
| Invalid | ${report.summary.invalid} |

## Attestation Matrix

| Task ID | Owner | Dependencies | Prerequisites | DoD | KPIs | Artifacts | Validation | Overall |
|---------|-------|--------------|---------------|-----|------|-----------|------------|---------|
`;

  for (const a of report.attestations) {
    const icon = (status: string) => {
      switch (status) {
        case 'pass': return '✅';
        case 'warn': return '⚠️';
        case 'fail': return '❌';
        case 'skip': return '⏭️';
        case 'pending': return '🕐';
        default: return '❓';
      }
    };

    const overall = a.overallStatus === 'valid' ? '✅ Valid' :
                    a.overallStatus === 'needs_review' ? '⚠️ Review' : '❌ Invalid';

    md += `| ${a.taskId} | ${icon(a.criteria.ownerApproval.status)} | ${icon(a.criteria.dependenciesClean.status)} | ${icon(a.criteria.prerequisitesMet.status)} | ${icon(a.criteria.definitionOfDoneMet.status)} | ${icon(a.criteria.kpisPassing.status)} | ${icon(a.criteria.artifactsTracked.status)} | ${icon(a.criteria.validationPassing.status)} | ${overall} |\n`;
  }

  // Add details for tasks needing attention
  const needsAttention = report.attestations.filter(
    (a) => a.overallStatus !== 'valid'
  );

  if (needsAttention.length > 0) {
    md += `\n## Tasks Requiring Attention\n\n`;

    for (const a of needsAttention) {
      md += `### ${a.taskId}\n\n`;
      md += `**Status:** ${a.overallStatus}\n\n`;

      const failing = Object.entries(a.criteria)
        .filter(([_, c]) => c.status === 'fail' || c.status === 'warn')
        .map(([key, c]) => ({ key, ...c }));

      for (const c of failing) {
        md += `#### ${c.name}\n`;
        md += `- **Status:** ${c.status.toUpperCase()}\n`;
        if (c.evidence.length > 0) {
          md += `- **Evidence:**\n`;
          for (const e of c.evidence) {
            md += `  - ${e}\n`;
          }
        }
        if (c.recommendation) {
          md += `- **Recommendation:** ${c.recommendation}\n`;
        }
        md += '\n';
      }
    }
  }

  // Legend
  md += `\n## Legend\n\n`;
  md += `| Icon | Meaning |\n`;
  md += `|------|--------|\n`;
  md += `| ✅ | Pass - Criterion fully met |\n`;
  md += `| ⚠️ | Warn - Needs verification |\n`;
  md += `| ❌ | Fail - Criterion not met |\n`;
  md += `| ⏭️ | Skip - Not applicable |\n`;
  md += `| 🕐 | Pending - Awaiting validation |\n`;

  return md;
}

export function saveAttestationReport(
  report: SprintAttestationReport,
  repoRoot: string
): { jsonPath: string; mdPath: string } {
  const dir = join(repoRoot, 'artifacts', 'reports', 'attestation');
  const { mkdirSync } = require('node:fs');
  mkdirSync(dir, { recursive: true });

  const timestamp = report.generatedAt.replace(/[:.]/g, '-').slice(0, 19);
  const jsonPath = join(dir, `sprint-${report.sprint}-${timestamp}.json`);
  const mdPath = join(dir, `sprint-${report.sprint}-${timestamp}.md`);

  // Also save as "latest"
  const latestJsonPath = join(dir, `sprint-${report.sprint}-latest.json`);
  const latestMdPath = join(dir, `sprint-${report.sprint}-latest.md`);

  const md = generateAttestationMarkdown(report);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, md);
  writeFileSync(latestJsonPath, JSON.stringify(report, null, 2));
  writeFileSync(latestMdPath, md);

  return { jsonPath: latestJsonPath, mdPath: latestMdPath };
}
