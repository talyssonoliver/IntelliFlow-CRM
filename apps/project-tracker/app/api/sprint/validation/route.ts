/**
 * GET /api/sprint/validation
 *
 * RSI endpoint for sprint validation results.
 * Sources: Sprint_plan.csv, attestations, validation files
 * Fallback: artifacts/reports/sprint{N}-validation-latest.json
 * Query: ?sprint=N
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { RawCSVRow } from '../../../../lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
function loadFallback(sprintNumber: number): any | null {
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

// Load all attestations for a sprint
function loadSprintAttestations(sprintNumber: number): Map<string, any> {
  const projectRoot = getProjectRoot();
  const csvPath = join(projectRoot, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');
  const attestationsDir = join(projectRoot, 'artifacts', 'attestations');
  const attestations = new Map<string, any>();

  try {
    // First get task IDs for this sprint
    const sprintTaskIds: string[] = [];
    if (existsSync(csvPath)) {
      const content = readFileSync(csvPath, 'utf8');
      const results = Papa.parse(content, { header: true, skipEmptyLines: true });

      for (const row of results.data as RawCSVRow[]) {
        const targetSprint = row['Target Sprint'];
        const sprintNum = targetSprint === 'Continuous' ? -1 : parseInt(String(targetSprint ?? ''));

        if (sprintNum === sprintNumber && row['Task ID']) {
          sprintTaskIds.push(row['Task ID']);
        }
      }
    }

    // Load attestations for sprint tasks
    if (existsSync(attestationsDir)) {
      for (const taskId of sprintTaskIds) {
        const ackPath = join(attestationsDir, taskId, 'context_ack.json');
        if (existsSync(ackPath)) {
          attestations.set(taskId, JSON.parse(readFileSync(ackPath, 'utf8')));
        }
      }
    }
  } catch (error) {
    console.error('Error loading sprint attestations:', error);
  }

  return attestations;
}

// Extract validation results from attestations
function extractValidations(attestations: Map<string, any>): ValidationResult[] {
  const validations: ValidationResult[] = [];

  for (const [taskId, attestation] of attestations) {
    // Extract validation results from attestation
    if (attestation.validation_results) {
      for (const validation of attestation.validation_results) {
        validations.push({
          taskId,
          validationType: validation.type || 'generic',
          passed: validation.passed || validation.status === 'passed',
          details: validation.details || validation.message || '',
          timestamp: attestation.attestation_timestamp || '',
        });
      }
    }

    // Also check evidence_summary
    if (attestation.evidence_summary) {
      validations.push({
        taskId,
        validationType: 'evidence',
        passed: attestation.verdict === 'COMPLETE',
        details: `Artifacts: ${attestation.evidence_summary.artifacts_verified}, Validations: ${attestation.evidence_summary.validations_passed}`,
        timestamp: attestation.attestation_timestamp || '',
      });
    }
  }

  return validations;
}

// Extract KPI validations from attestations
function extractKpiValidations(attestations: Map<string, any>): KpiValidation[] {
  const kpiValidations: KpiValidation[] = [];

  for (const [taskId, attestation] of attestations) {
    if (attestation.kpi_results) {
      for (const kpi of attestation.kpi_results) {
        kpiValidations.push({
          taskId,
          kpi: kpi.kpi || kpi.name || '',
          target: kpi.target || '',
          actual: kpi.actual || '',
          met: kpi.met || false,
        });
      }
    }
  }

  return kpiValidations;
}

// Load validation file if exists
function loadValidationFile(sprintNumber: number): any | null {
  const projectRoot = getProjectRoot();
  const validationPath = join(projectRoot, 'artifacts', 'reports', `sprint${sprintNumber}-validation-results.json`);

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
function loadSprintSummary(sprintNumber: number): any | null {
  const projectRoot = getProjectRoot();
  const summaryPath = join(projectRoot, 'apps', 'project-tracker', 'docs', 'metrics', `sprint-${sprintNumber}`, '_summary.json');

  try {
    if (existsSync(summaryPath)) {
      return JSON.parse(readFileSync(summaryPath, 'utf8'));
    }
  } catch {
    // Ignore errors
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sprintNumber = parseInt(searchParams.get('sprint') || '0');

    const attestations = loadSprintAttestations(sprintNumber);
    const validations = extractValidations(attestations);
    const kpiValidations = extractKpiValidations(attestations);
    const validationFile = loadValidationFile(sprintNumber);
    const sprintSummary = loadSprintSummary(sprintNumber);

    // Calculate validation metrics
    const passedValidations = validations.filter(v => v.passed).length;
    const failedValidations = validations.filter(v => !v.passed).length;
    const totalValidations = validations.length;
    const validationScore = totalValidations > 0
      ? Math.round((passedValidations / totalValidations) * 100)
      : 0;

    // Calculate KPI metrics
    const passedKpis = kpiValidations.filter(k => k.met).length;
    const totalKpis = kpiValidations.length;
    const kpiScore = totalKpis > 0
      ? Math.round((passedKpis / totalKpis) * 100)
      : 0;

    // Determine overall status
    let overallStatus: SprintValidation['overallStatus'] = 'pending';
    if (totalValidations > 0) {
      if (failedValidations === 0) {
        overallStatus = 'passed';
      } else if (passedValidations === 0) {
        overallStatus = 'failed';
      } else {
        overallStatus = 'partial';
      }
    }

    // Group validations by type
    const byType = validations.reduce((acc, v) => {
      if (!acc[v.validationType]) acc[v.validationType] = { passed: 0, failed: 0 };
      if (v.passed) {
        acc[v.validationType].passed++;
      } else {
        acc[v.validationType].failed++;
      }
      return acc;
    }, {} as Record<string, { passed: number; failed: number }>);

    // Find failed KPIs for reporting
    const failedKpis = kpiValidations
      .filter(k => !k.met)
      .map(k => ({
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
      validationFile: validationFile ? {
        exists: true,
        timestamp: validationFile.fileTimestamp,
        summary: validationFile.summary || null,
      } : { exists: false },
      sprintContext: sprintSummary ? {
        totalTasks: sprintSummary.total_tasks,
        completedTasks: sprintSummary.completed_tasks,
        lastUpdated: sprintSummary.updated_at,
      } : null,
      recentValidations: validations
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 15)
        .map(v => ({
          taskId: v.taskId,
          type: v.validationType,
          passed: v.passed,
          timestamp: v.timestamp,
        })),
      recommendation: overallStatus === 'passed'
        ? 'All validations passed - sprint is validated'
        : overallStatus === 'failed'
        ? 'CRITICAL: All validations failed - review required'
        : overallStatus === 'partial'
        ? `${failedValidations} validations failed - address before sprint close`
        : 'Run validations to verify sprint completion',
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
