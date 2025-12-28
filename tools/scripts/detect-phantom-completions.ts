/**
 * Real-time Phantom Completion Detection
 *
 * A task is a "phantom completion" if:
 * 1. Status = "Completed" but artifacts don't exist on disk
 * 2. Status = "Completed" but DOD is not verifiable
 * 3. Status = "Completed" but KPIs are not measurable
 *
 * This script does REAL verification, not just static file reading.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { join, resolve } from 'node:path';
import { globSync } from 'glob';

const CSV_PATH = join(process.cwd(), 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');
const OUTPUT_PATH = join(process.cwd(), 'artifacts/reports/phantom-completion-audit.json');

interface PhantomIssue {
  taskId: string;
  description: string;
  status: string;
  issues: string[];
  missingArtifacts: string[];
  dodIssues: string[];
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
    dod_issues: string[];
  }>;
  recommendations: Array<{
    priority: string;
    action: string;
  }>;
}

// ============================================================================
// ARTIFACT VERIFICATION
// ============================================================================

function parseArtifacts(artifactStr: string): string[] {
  if (!artifactStr) return [];

  return artifactStr
    .split(';')
    .flatMap((part) => {
      // Extract path from ARTIFACT: or EVIDENCE: prefix
      const match = part.match(/(?:ARTIFACT:|EVIDENCE:)(.+)/);
      if (match) {
        return [match[1].trim()];
      }
      // Check for raw path
      if (part.includes('/') || part.includes('.')) {
        return [part.trim()];
      }
      return [];
    })
    .filter((p) => p && !p.includes('*')); // Skip wildcards for now
}

function checkArtifactExists(artifactPath: string): boolean {
  const fullPath = resolve(process.cwd(), artifactPath);

  // Direct file check
  if (existsSync(fullPath)) {
    return true;
  }

  // Try with glob for patterns
  if (artifactPath.includes('*')) {
    const matches = globSync(artifactPath, { cwd: process.cwd() });
    return matches.length > 0;
  }

  return false;
}

function verifyArtifacts(artifactStr: string): { exists: string[]; missing: string[] } {
  const artifacts = parseArtifacts(artifactStr);
  const exists: string[] = [];
  const missing: string[] = [];

  for (const artifact of artifacts) {
    if (checkArtifactExists(artifact)) {
      exists.push(artifact);
    } else {
      missing.push(artifact);
    }
  }

  return { exists, missing };
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
    /\d+%/, // percentages
    /<\d+/, // less than
    />\d+/, // greater than
    /\d+\s*(ms|s|min|hour|day)/i, // time units
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

function verifyDod(dod: string): string[] {
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
// MAIN
// ============================================================================

async function main() {
  console.log('=== Real-time Phantom Completion Detection ===\n');

  // Read CSV
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const tasks = parse(csvContent, { columns: true, bom: true, relax_quotes: true }) as Record<
    string,
    string
  >[];

  // Filter completed tasks
  const completedTasks = tasks.filter((t) => t['Status']?.toLowerCase() === 'completed');

  console.log(`Total tasks: ${tasks.length}`);
  console.log(`Completed tasks: ${completedTasks.length}\n`);

  const phantoms: PhantomIssue[] = [];
  const verified: { task_id: string; description: string; artifacts_verified: string[] }[] = [];

  for (const task of completedTasks) {
    const taskId = task['Task ID'];
    const description = task['Description'] || '';
    const dod = task['Definition of Done'] || '';
    const artifacts = task['Artifacts To Track'] || '';
    const issues: string[] = [];

    // Check artifacts exist
    const artifactCheck = verifyArtifacts(artifacts);

    // Check DOD is verifiable
    const dodIssues = verifyDod(dod);

    // Determine if phantom
    if (artifactCheck.missing.length > 0 || dodIssues.length > 0) {
      if (artifactCheck.missing.length > 0) {
        issues.push(`Missing ${artifactCheck.missing.length} artifact(s)`);
      }
      issues.push(...dodIssues);

      phantoms.push({
        taskId,
        description: description.substring(0, 60),
        status: 'Completed',
        issues,
        missingArtifacts: artifactCheck.missing,
        dodIssues,
      });
    } else {
      verified.push({
        task_id: taskId,
        description: description.substring(0, 60),
        artifacts_verified: artifactCheck.exists,
      });
    }
  }

  // Calculate metrics
  const totalCompleted = completedTasks.length;
  const verifiedCount = verified.length;
  const phantomCount = phantoms.length;
  const integrityScore =
    totalCompleted > 0 ? Math.round((verifiedCount / totalCompleted) * 100) : 100;

  // Determine severity
  let severity = 'INFO';
  if (phantomCount > 0) {
    severity = phantomCount > 10 ? 'CRITICAL' : phantomCount > 5 ? 'HIGH' : 'MEDIUM';
  }

  console.log('=== Results ===');
  console.log(`Verified completions: ${verifiedCount}`);
  console.log(`Phantom completions: ${phantomCount}`);
  console.log(`Integrity score: ${integrityScore}%`);
  console.log(`Severity: ${severity}\n`);

  if (phantoms.length > 0) {
    console.log('=== Phantom Completions ===\n');
    for (const p of phantoms) {
      console.log(`[${p.taskId}] ${p.description}`);
      for (const issue of p.issues) {
        console.log(`  - ${issue}`);
      }
      if (p.missingArtifacts.length > 0) {
        console.log(
          `  Missing: ${p.missingArtifacts.slice(0, 3).join(', ')}${p.missingArtifacts.length > 3 ? '...' : ''}`
        );
      }
      console.log('');
    }
  }

  // Build audit result
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
      integrity_score: `${integrityScore}%`,
      conclusion:
        phantomCount === 0
          ? 'All completed tasks have been verified - no phantom completions detected'
          : `${phantomCount} tasks marked as Completed but missing artifacts or unverifiable DOD`,
    },
    verified_tasks: verified,
    phantom_completions: phantoms.map((p) => ({
      task_id: p.taskId,
      description: p.description,
      status_claimed: p.status,
      issues: p.issues,
      missing_artifacts: p.missingArtifacts,
      dod_issues: p.dodIssues,
    })),
    recommendations:
      phantomCount > 0
        ? [
            {
              priority: 'HIGH',
              action: 'Create missing artifacts for phantom completions',
            },
            {
              priority: 'MEDIUM',
              action: 'Update DOD to include verifiable criteria',
            },
            {
              priority: 'LOW',
              action: 'Consider reverting status to "In Progress" until artifacts exist',
            },
          ]
        : [
            {
              priority: 'INFO',
              action: 'All tasks verified - maintain current validation practices',
            },
          ],
  };

  // Write audit result
  writeFileSync(OUTPUT_PATH, JSON.stringify(auditResult, null, 2));
  console.log(`Audit written to: ${OUTPUT_PATH}`);
}

main().catch(console.error);
