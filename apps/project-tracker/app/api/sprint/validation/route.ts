/**
 * GET /api/sprint/validation
 *
 * RSI endpoint for sprint validation results.
 * Sources: Sprint_plan.csv, attestations, validation files
 * Fallback: artifacts/reports/sprint{N}-validation-latest.json
 * Query: ?sprint=N
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';
import type { RawCSVRow } from '../../../../lib/types';

export const dynamic = 'force-dynamic';

interface ValidationResult {
  taskId: string;
  validationType: string;
  passed: boolean;
  details: string;
  timestamp: string;
}

interface KpiValidation {
  taskId: string;
  kpi: string;
  target: string;
  actual: string;
  met: boolean;
}

interface SprintValidation {
  sprintNumber: number;
  overallStatus: 'passed' | 'failed' | 'partial' | 'pending';
  validationScore: number;
  totalValidations: number;
  passedValidations: number;
  failedValidations: number;
}

function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

// Get fallback file path pattern
function getFallbackPath(sprintNumber: number): string {
  const projectRoot = getProjectRoot();
  return join(projectRoot, 'artifacts', 'reports', `sprint${sprintNumber}-validation-latest.json`);
}

// Load fallback data if exists
function loadFallback(sprintNumber: number): any {
  const fallbackPath = getFallbackPath(sprintNumber);
  try {
    if (existsSync(fallbackPath)) {
      return JSON.parse(readFileSync(fallbackPath, 'utf8'));
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// Save generated data as fallback for future use
function saveFallback(sprintNumber: number, data: any): void {
  const fallbackPath = getFallbackPath(sprintNumber);
  try {
    writeFileSync(fallbackPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving fallback:', error);
  }
}

// Get task IDs belonging to a specific sprint from the CSV
function getSprintTaskIds(csvPath: string, sprintNumber: number): string[] {
  if (!existsSync(csvPath)) return [];
  const content = readFileSync(csvPath, 'utf8');
  const results = Papa.parse(content, { header: true, skipEmptyLines: true });
  const taskIds: string[] = [];
  for (const row of results.data as RawCSVRow[]) {
    const targetSprint = row['Target Sprint'];
    const sprintNum =
      targetSprint === 'Continuous' ? -1 : Number.parseInt(String(targetSprint ?? ''));
    if (sprintNum === sprintNumber && row['Task ID']) {
      taskIds.push(row['Task ID']);
    }
  }
  return taskIds;
}

// Load attestation for a single task
function loadTaskAttestationFromDir(attestationsDir: string, taskId: string): any {
  const ackPath = join(attestationsDir, taskId, 'context_ack.json');
  if (!existsSync(ackPath)) return null;
  try {
    return JSON.parse(readFileSync(ackPath, 'utf8'));
  } catch {
    return null;
  }
}

// Load all attestations for a sprint
function loadSprintAttestations(sprintNumber: number): Map<string, any> {
  const projectRoot = getProjectRoot();
  const csvPath = join(
    projectRoot,
    'apps',
    'project-tracker',
    'docs',
    'metrics',
    '_global',
    'Sprint_plan.csv'
  );
  const attestationsDir = join(projectRoot, 'artifacts', 'attestations');
  const attestations = new Map<string, any>();

  try {
    const sprintTaskIds = getSprintTaskIds(csvPath, sprintNumber);
    if (!existsSync(attestationsDir)) return attestations;
    for (const taskId of sprintTaskIds) {
      const data = loadTaskAttestationFromDir(attestationsDir, taskId);
      if (data) attestations.set(taskId, data);
    }
  } catch (error) {
    console.error('Error loading sprint attestations:', error);
  }

  return attestations;
}

// Extract validation results from a single attestation entry
function extractValidationsFromEntry(taskId: string, attestation: any): ValidationResult[] {
  const results: ValidationResult[] = [];
  if (attestation.validation_results) {
    for (const v of attestation.validation_results) {
      results.push({
        taskId,
        validationType: v.type || 'generic',
        passed: v.passed || v.status === 'passed',
        details: v.details || v.message || '',
        timestamp: attestation.attestation_timestamp || '',
      });
    }
  }
  if (attestation.evidence_summary) {
    results.push({
      taskId,
      validationType: 'evidence',
      passed: attestation.verdict === 'COMPLETE',
      details: `Artifacts: ${attestation.evidence_summary.artifacts_verified}, Validations: ${attestation.evidence_summary.validations_passed}`,
      timestamp: attestation.attestation_timestamp || '',
    });
  }
  return results;
}

// Extract validation results from attestations
function extractValidations(attestations: Map<string, any>): ValidationResult[] {
  return Array.from(attestations.entries()).flatMap(([taskId, attestation]) =>
    extractValidationsFromEntry(taskId, attestation)
  );
}

// Extract KPI validations from attestations
function extractKpiValidations(attestations: Map<string, any>): KpiValidation[] {
  return Array.from(attestations.entries()).flatMap(([taskId, attestation]) => {
    if (!attestation.kpi_results) return [];
    return attestation.kpi_results.map((kpi: any) => ({
      taskId,
      kpi: kpi.kpi || kpi.name || '',
      target: kpi.target || '',
      actual: kpi.actual || '',
      met: kpi.met || false,
    }));
  });
}

// Load validation file if exists
function loadValidationFile(sprintNumber: number): any {
  const projectRoot = getProjectRoot();
  const validationPath = join(
    projectRoot,
    'artifacts',
    'reports',
    `sprint${sprintNumber}-validation-results.json`
  );

  try {
    if (existsSync(validationPath)) {
      const content = JSON.parse(readFileSync(validationPath, 'utf8'));
      const stats = statSync(validationPath);
      return { ...content, fileTimestamp: stats.mtime.toISOString() };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// Load sprint summary for additional context
function loadSprintSummary(sprintNumber: number): any {
  const projectRoot = getProjectRoot();
  const summaryPath = join(
    projectRoot,
    'apps',
    'project-tracker',
    'docs',
    'metrics',
    `sprint-${sprintNumber}`,
    '_summary.json'
  );

  try {
    if (existsSync(summaryPath)) {
      return JSON.parse(readFileSync(summaryPath, 'utf8'));
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function getValidationRecommendation(
  status: SprintValidation['overallStatus'],
  failedCount: number
): string {
  if (status === 'passed') return 'All validations passed - sprint is validated';
  if (status === 'failed') return 'CRITICAL: All validations failed - review required';
  if (status === 'partial')
    return `${failedCount} validations failed - address before sprint close`;
  return 'Run validations to verify sprint completion';
}

function resolveValidationStatus(
  totalValidations: number,
  passedValidations: number,
  failedValidations: number
): SprintValidation['overallStatus'] {
  if (totalValidations === 0) return 'pending';
  if (failedValidations === 0) return 'passed';
  if (passedValidations === 0) return 'failed';
  return 'partial';
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sprintNumber = Number.parseInt(searchParams.get('sprint') || '0');

    const attestations = loadSprintAttestations(sprintNumber);
    const validations = extractValidations(attestations);
    const kpiValidations = extractKpiValidations(attestations);
    const validationFile = loadValidationFile(sprintNumber);
    const sprintSummary = loadSprintSummary(sprintNumber);

    // Calculate validation metrics
    const passedValidations = validations.filter((v) => v.passed).length;
    const failedValidations = validations.filter((v) => !v.passed).length;
    const totalValidations = validations.length;
    const validationScore =
      totalValidations > 0 ? Math.round((passedValidations / totalValidations) * 100) : 0;

    // Calculate KPI metrics
    const passedKpis = kpiValidations.filter((k) => k.met).length;
    const totalKpis = kpiValidations.length;
    const kpiScore = totalKpis > 0 ? Math.round((passedKpis / totalKpis) * 100) : 0;

    // Determine overall status
    const overallStatus = resolveValidationStatus(
      totalValidations,
      passedValidations,
      failedValidations
    );

    // Group validations by type
    const byType = validations.reduce(
      (acc, v) => {
        if (!acc[v.validationType]) acc[v.validationType] = { passed: 0, failed: 0 };
        const key = v.passed ? 'passed' : 'failed';
        acc[v.validationType][key]++;
        return acc;
      },
      {} as Record<string, { passed: number; failed: number }>
    );

    // Find failed KPIs for reporting
    const failedKpis = kpiValidations
      .filter((k) => !k.met)
      .map((k) => ({
        taskId: k.taskId,
        kpi: k.kpi,
        target: k.target,
        actual: k.actual,
      }));

    // Tasks with attestations
    const attestedTasks = Array.from(attestations.keys());
    const taskVerdict = Array.from(attestations.entries()).map(([taskId, att]) => ({
      taskId,
      verdict: att.verdict,
      kpisMet: att.evidence_summary?.kpis_met || 0,
      kpisTotal: att.kpi_results?.length || 0,
    }));

    // Build response data
    const responseData = {
      source: 'fresh',
      timestamp: new Date().toISOString(),
      pattern: 'RSI',
      sprint: sprintNumber,
      fallbackPath: getFallbackPath(sprintNumber),
      validation: {
        sprintNumber,
        overallStatus,
        validationScore,
        totalValidations,
        passedValidations,
        failedValidations,
      },
      kpis: {
        total: totalKpis,
        passed: passedKpis,
        failed: totalKpis - passedKpis,
        score: kpiScore,
        failedKpis: failedKpis.slice(0, 10),
      },
      byType,
      attestedTasks: {
        count: attestedTasks.length,
        tasks: taskVerdict,
      },
      validationFile: validationFile
        ? {
            exists: true,
            timestamp: validationFile.fileTimestamp,
            summary: validationFile.summary || null,
          }
        : { exists: false },
      sprintContext: sprintSummary
        ? {
            totalTasks: sprintSummary.total_tasks,
            completedTasks: sprintSummary.completed_tasks,
            lastUpdated: sprintSummary.updated_at,
          }
        : null,
      recentValidations: [...validations]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 15)
        .map((v) => ({
          taskId: v.taskId,
          type: v.validationType,
          passed: v.passed,
          timestamp: v.timestamp,
        })),
      recommendation: getValidationRecommendation(overallStatus, failedValidations),
    };

    // If no attestations available, try fallback
    if (attestations.size === 0) {
      const fallbackData = loadFallback(sprintNumber);
      if (fallbackData) {
        return NextResponse.json(
          { ...fallbackData, source: 'fallback' },
          {
            headers: {
              'Cache-Control': 'no-store, no-cache, max-age=0',
            },
          }
        );
      }
    }

    // Save fresh data as fallback for future use
    saveFallback(sprintNumber, responseData);

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, max-age=0',
      },
    });
  } catch (error) {
    console.error('Error generating sprint validation:', error);
    return NextResponse.json(
      { error: 'Failed to generate sprint validation', details: String(error) },
      { status: 500 }
    );
  }
}
