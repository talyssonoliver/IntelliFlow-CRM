/**
 * Sprint Audit Report Generator
 *
 * Generates human-readable Markdown and machine-readable JSON reports
 * from sprint audit results.
 *
 * @module tools/scripts/lib/sprint-audit/report-generator
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  SprintAuditReport,
  TaskAuditResult,
  AuditOutputPaths,
} from './types';

// =============================================================================
// Output Path Generation
// =============================================================================

/**
 * Generates output paths for audit reports
 */
export function getAuditOutputPaths(
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

// =============================================================================
// JSON Report Generation
// =============================================================================

/**
 * Writes the full JSON report
 */
export async function writeJsonReport(
  report: SprintAuditReport,
  outputPath: string
): Promise<void> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`JSON report written to: ${outputPath}`);
}

/**
 * Writes a simple verdict JSON for CI integration
 */
export async function writeVerdictJson(
  report: SprintAuditReport,
  outputPath: string
): Promise<void> {
  const verdict = {
    run_id: report.run_id,
    sprint: report.sprint,
    verdict: report.verdict,
    passed: report.verdict === 'PASS',
    generated_at: report.generated_at,
    summary: {
      total: report.summary.totalTasks,
      audited: report.summary.auditedTasks,
      passed: report.summary.passedTasks,
      failed: report.summary.failedTasks,
      needs_human: report.summary.needsHumanTasks,
    },
    blocking_issues_count: report.blocking_issues.length,
  };

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, JSON.stringify(verdict, null, 2), 'utf-8');
  console.log(`Verdict JSON written to: ${outputPath}`);
}

// =============================================================================
// Markdown Report Generation
// =============================================================================

/**
 * Generates human-readable Markdown report
 */
export function generateMarkdownReport(report: SprintAuditReport): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Sprint ${report.sprint} Completion Audit Report`);
  lines.push('');
  lines.push(`**Run ID:** \`${report.run_id}\``);
  lines.push(`**Generated:** ${new Date(report.generated_at).toLocaleString()}`);
  lines.push(`**Duration:** ${report.duration_seconds.toFixed(1)} seconds`);
  lines.push(`**Strict Mode:** ${report.config.strictMode ? 'Yes' : 'No'}`);
  lines.push('');

  // Verdict Banner
  const verdictEmoji = report.verdict === 'PASS' ? '✅' : '❌';
  lines.push(`## ${verdictEmoji} Overall Verdict: **${report.verdict}**`);
  lines.push('');

  // Summary Table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|-------|');
  lines.push(`| Total Tasks in Sprint | ${report.summary.totalTasks} |`);
  lines.push(`| Completed Tasks | ${report.summary.completedTasks} |`);
  lines.push(`| Tasks Audited | ${report.summary.auditedTasks} |`);
  lines.push(`| ✅ Passed | ${report.summary.passedTasks} |`);
  lines.push(`| ❌ Failed | ${report.summary.failedTasks} |`);
  lines.push(`| ⚠️ Needs Human Review | ${report.summary.needsHumanTasks} |`);
  lines.push('');

  // Evidence Summary
  lines.push('## Evidence Summary');
  lines.push('');
  lines.push('| Category | Found | Issues |');
  lines.push('|----------|-------|--------|');
  lines.push(`| Artifacts | ${report.evidence_summary.artifactsVerified} ✓ | ${report.evidence_summary.artifactsMissing} missing, ${report.evidence_summary.artifactsEmpty} empty |`);
  lines.push(`| Validations | ${report.evidence_summary.validationsPassed} passed | ${report.evidence_summary.validationsFailed} failed |`);
  lines.push(`| KPIs | ${report.evidence_summary.kpisMet} met | ${report.evidence_summary.kpisMissed} missed |`);
  lines.push(`| Placeholders (in task artifacts) | - | ${report.evidence_summary.placeholdersFound} found |`);
  lines.push(`| Placeholders (codebase total) | - | ${report.evidence_summary.totalCodebasePlaceholders} found |`);
  lines.push('');

  // Blocking Issues
  if (report.blocking_issues.length > 0) {
    lines.push('## ⛔ Blocking Issues');
    lines.push('');
    lines.push('These issues must be resolved before sprint can be considered complete:');
    lines.push('');

    const criticalIssues = report.blocking_issues.filter((i) => i.severity === 'critical');
    const highIssues = report.blocking_issues.filter((i) => i.severity === 'high');
    const mediumIssues = report.blocking_issues.filter((i) => i.severity === 'medium');

    if (criticalIssues.length > 0) {
      lines.push('### 🔴 Critical');
      for (const issue of criticalIssues) {
        lines.push(`- **${issue.taskId}**: ${issue.issue}`);
        lines.push(`  - *Recommendation:* ${issue.recommendation}`);
      }
      lines.push('');
    }

    if (highIssues.length > 0) {
      lines.push('### 🟠 High');
      for (const issue of highIssues) {
        lines.push(`- **${issue.taskId}**: ${issue.issue}`);
        lines.push(`  - *Recommendation:* ${issue.recommendation}`);
      }
      lines.push('');
    }

    if (mediumIssues.length > 0) {
      lines.push('### 🟡 Medium');
      for (const issue of mediumIssues) {
        lines.push(`- **${issue.taskId}**: ${issue.issue}`);
      }
      lines.push('');
    }
  }

  // Task Results
  lines.push('## Task Details');
  lines.push('');

  // Group by verdict
  const passedTasks = report.task_results.filter((r) => r.verdict === 'PASS');
  const failedTasks = report.task_results.filter((r) => r.verdict === 'FAIL');
  const needsHumanTasks = report.task_results.filter((r) => r.verdict === 'NEEDS_HUMAN');

  if (failedTasks.length > 0) {
    lines.push('### ❌ Failed Tasks');
    lines.push('');
    for (const task of failedTasks) {
      lines.push(...generateTaskSection(task));
    }
  }

  if (needsHumanTasks.length > 0) {
    lines.push('### ⚠️ Needs Human Review');
    lines.push('');
    for (const task of needsHumanTasks) {
      lines.push(...generateTaskSection(task));
    }
  }

  if (passedTasks.length > 0) {
    lines.push('### ✅ Passed Tasks');
    lines.push('');
    lines.push('<details>');
    lines.push('<summary>Click to expand passed tasks</summary>');
    lines.push('');
    for (const task of passedTasks) {
      lines.push(...generateTaskSectionCompact(task));
    }
    lines.push('</details>');
    lines.push('');
  }

  // Artifact Hashes
  lines.push('## Artifact Hashes');
  lines.push('');
  lines.push('SHA256 hashes for all verified artifacts:');
  lines.push('');
  lines.push('```');
  for (const [path, hash] of Object.entries(report.artifact_hashes)) {
    lines.push(`${hash}  ${path}`);
  }
  if (Object.keys(report.artifact_hashes).length === 0) {
    lines.push('(No artifacts verified)');
  }
  lines.push('```');
  lines.push('');

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Generated by sprint-completion-auditor at ${report.generated_at}*`);

  return lines.join('\n');
}

/**
 * Generates detailed section for a single task
 */
function generateTaskSection(task: TaskAuditResult): string[] {
  const lines: string[] = [];
  const verdictEmoji = task.verdict === 'PASS' ? '✅' : task.verdict === 'FAIL' ? '❌' : '⚠️';

  lines.push(`#### ${verdictEmoji} ${task.taskId}`);
  lines.push('');
  lines.push(`**Description:** ${task.description}`);
  lines.push(`**Status:** ${task.status}`);
  lines.push('');

  // Issues
  if (task.issues.length > 0) {
    lines.push('**Issues:**');
    for (const issue of task.issues) {
      lines.push(`- ${issue}`);
    }
    lines.push('');
  }

  // Recommendations
  if (task.recommendations.length > 0) {
    lines.push('**Recommendations:**');
    for (const rec of task.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');
  }

  // Artifacts
  if (task.artifacts.length > 0) {
    const missingArtifacts = task.artifacts.filter((a) => a.status !== 'found');
    if (missingArtifacts.length > 0) {
      lines.push('**Missing/Invalid Artifacts:**');
      for (const artifact of missingArtifacts) {
        lines.push(`- \`${artifact.path}\` (${artifact.status})`);
      }
      lines.push('');
    }
  }

  // Placeholders
  if (task.placeholders.length > 0) {
    lines.push('**Placeholders Found:**');
    for (const ph of task.placeholders.slice(0, 5)) {
      lines.push(`- \`${ph.file}:${ph.line}\` - ${ph.pattern}: \`${ph.content.slice(0, 50)}...\``);
    }
    if (task.placeholders.length > 5) {
      lines.push(`- ... and ${task.placeholders.length - 5} more`);
    }
    lines.push('');
  }

  // Failed Validations
  const failedValidations = task.validations.filter((v) => !v.passed);
  if (failedValidations.length > 0) {
    lines.push('**Failed Validations:**');
    for (const v of failedValidations) {
      lines.push(`- \`${v.command}\` (exit code: ${v.exitCode})`);
      if (v.error) {
        lines.push(`  - Error: ${v.error}`);
      }
    }
    lines.push('');
  }

  // Failed KPIs
  const failedKpis = task.kpis.filter((k) => k.actual !== null && !k.met);
  if (failedKpis.length > 0) {
    lines.push('**KPIs Not Met:**');
    for (const kpi of failedKpis) {
      lines.push(`- ${kpi.kpi}: Target ${kpi.target}, Actual ${kpi.actual}`);
    }
    lines.push('');
  }

  // Dependencies
  if (task.dependencies.missing.length > 0) {
    lines.push('**Missing Dependencies:**');
    for (const dep of task.dependencies.missing) {
      lines.push(`- ${dep}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines;
}

/**
 * Generates compact section for passed tasks
 */
function generateTaskSectionCompact(task: TaskAuditResult): string[] {
  const lines: string[] = [];

  lines.push(`- **${task.taskId}**: ${task.description.slice(0, 60)}...`);
  lines.push(`  - Artifacts: ${task.artifacts.length} verified`);
  lines.push(`  - Validations: ${task.validations.length} passed`);
  lines.push(`  - KPIs: ${task.kpis.filter((k) => k.met).length}/${task.kpis.length} met`);

  return lines;
}

/**
 * Writes the Markdown report
 */
export async function writeMarkdownReport(
  report: SprintAuditReport,
  outputPath: string
): Promise<void> {
  const markdown = generateMarkdownReport(report);
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, markdown, 'utf-8');
  console.log(`Markdown report written to: ${outputPath}`);
}

// =============================================================================
// Evidence File Writing
// =============================================================================

/**
 * Writes artifact hashes to a text file
 */
export async function writeArtifactHashes(
  hashes: Record<string, string>,
  outputPath: string
): Promise<void> {
  const lines = Object.entries(hashes).map(([path, hash]) => `${hash}  ${path}`);
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, lines.join('\n') + '\n', 'utf-8');
  console.log(`Artifact hashes written to: ${outputPath}`);
}

/**
 * Writes placeholder scan results
 */
export async function writePlaceholderScan(
  report: SprintAuditReport,
  outputPath: string
): Promise<void> {
  const placeholders = report.task_results.flatMap((r) =>
    r.placeholders.map((p) => ({
      taskId: r.taskId,
      ...p,
    }))
  );

  const scan = {
    generated_at: report.generated_at,
    run_id: report.run_id,
    total_placeholders: placeholders.length,
    findings: placeholders,
  };

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, JSON.stringify(scan, null, 2), 'utf-8');
  console.log(`Placeholder scan written to: ${outputPath}`);
}

// =============================================================================
// Full Report Writing
// =============================================================================

/**
 * Writes all report files
 */
export async function writeAllReports(
  report: SprintAuditReport,
  paths: AuditOutputPaths
): Promise<void> {
  // Ensure output directory exists
  await fs.promises.mkdir(paths.outputDir, { recursive: true });
  await fs.promises.mkdir(paths.evidenceDir, { recursive: true });

  // Write all reports
  await writeJsonReport(report, paths.jsonPath);
  await writeMarkdownReport(report, paths.mdPath);
  await writeVerdictJson(report, paths.verdictPath);
  await writeArtifactHashes(report.artifact_hashes, paths.hashesPath);
  await writePlaceholderScan(report, paths.placeholderScanPath);

  console.log(`\nAll reports written to: ${paths.outputDir}`);
}

/**
 * Creates a "latest" symlink/copy for easy access
 */
export async function createLatestLink(
  paths: AuditOutputPaths,
  sprintNumber: number,
  repoRoot: string
): Promise<void> {
  const latestDir = path.join(repoRoot, 'artifacts/reports/sprint-audit', `sprint-${sprintNumber}-latest`);

  try {
    // Remove existing latest directory
    await fs.promises.rm(latestDir, { recursive: true, force: true });

    // Copy current report as latest
    await copyDirectory(paths.outputDir, latestDir);

    console.log(`Latest report copied to: ${latestDir}`);
  } catch (error) {
    console.warn(`Warning: Could not create latest link: ${error}`);
  }
}

/**
 * Recursively copies a directory
 */
async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true });

  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}
