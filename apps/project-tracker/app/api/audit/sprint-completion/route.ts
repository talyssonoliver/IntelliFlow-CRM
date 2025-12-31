/**
 * Sprint Completion Audit API Endpoint
 *
 * POST /api/audit/sprint-completion - Trigger sprint audit
 * GET /api/audit/sprint-completion - Get latest audit report
 *
 * @module apps/project-tracker/app/api/audit/sprint-completion/route
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

// =============================================================================
// Types
// =============================================================================

interface AuditRequest {
  sprint: number;
  strict?: boolean;
  skipValidations?: boolean;
}

interface AuditResponse {
  success: boolean;
  runId?: string;
  verdict?: 'PASS' | 'FAIL';
  reportPath?: string;
  summary?: {
    total: number;
    audited: number;
    passed: number;
    failed: number;
    needsHuman: number;
  };
  error?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function getRepoRoot(): string {
  // When running from project-tracker, cwd is apps/project-tracker
  // Navigate up two levels to get to repo root
  return path.resolve(process.cwd(), '../..');
}

function getLatestAuditReport(sprintNumber: number): string | null {
  const repoRoot = getRepoRoot();
  const latestDir = path.join(
    repoRoot,
    'artifacts/reports/sprint-audit',
    `sprint-${sprintNumber}-latest`
  );

  if (fs.existsSync(latestDir)) {
    const jsonPath = path.join(latestDir, 'audit.json');
    if (fs.existsSync(jsonPath)) {
      return jsonPath;
    }
  }

  return null;
}

function runAuditCli(
  sprint: number,
  strict: boolean,
  skipValidations: boolean
): Promise<{ success: boolean; stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const repoRoot = getRepoRoot();
    const scriptPath = path.join(repoRoot, 'tools/scripts/audit-sprint-completion.ts');

    const args = ['tsx', scriptPath, '--sprint', sprint.toString(), '--json'];

    if (strict) {
      args.push('--strict');
    }

    if (skipValidations) {
      args.push('--skip-validations');
    }

    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', `npx ${args.join(' ')}`] : ['-c', `npx ${args.join(' ')}`];

    let stdout = '';
    let stderr = '';

    const proc = spawn(shell, shellArgs, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        code: code ?? 1,
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        stdout: '',
        stderr: err.message,
        code: 1,
      });
    });

    // Timeout after 15 minutes (auditing many tasks can take time)
    setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({
        success: false,
        stdout,
        stderr: 'Audit timed out after 15 minutes',
        code: 124,
      });
    }, 15 * 60 * 1000);
  });
}

// =============================================================================
// POST - Trigger Audit
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse<AuditResponse>> {
  try {
    const body = (await request.json()) as AuditRequest;

    if (!body.sprint || typeof body.sprint !== 'number') {
      return NextResponse.json(
        { success: false, error: 'sprint (number) is required' },
        { status: 400 }
      );
    }

    console.log(`Starting audit for sprint ${body.sprint}...`);

    // Run the audit CLI
    const result = await runAuditCli(
      body.sprint,
      body.strict ?? false,
      body.skipValidations ?? false
    );

    if (!result.success) {
      // Try to parse partial output
      try {
        const report = JSON.parse(result.stdout);
        return NextResponse.json({
          success: false,
          runId: report.run_id,
          verdict: report.verdict,
          summary: {
            total: report.summary.totalTasks,
            audited: report.summary.auditedTasks,
            passed: report.summary.passedTasks,
            failed: report.summary.failedTasks,
            needsHuman: report.summary.needsHumanTasks,
          },
          error: 'Audit completed with failures',
        });
      } catch {
        return NextResponse.json(
          {
            success: false,
            error: result.stderr || 'Audit failed',
          },
          { status: 500 }
        );
      }
    }

    // Parse the JSON output
    try {
      const report = JSON.parse(result.stdout);
      return NextResponse.json({
        success: true,
        runId: report.run_id,
        verdict: report.verdict,
        reportPath: `artifacts/reports/sprint-audit/${report.run_id}/audit.md`,
        summary: {
          total: report.summary.totalTasks,
          audited: report.summary.auditedTasks,
          passed: report.summary.passedTasks,
          failed: report.summary.failedTasks,
          needsHuman: report.summary.needsHumanTasks,
        },
      });
    } catch (parseError) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to parse audit output: ${parseError}`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Audit error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// GET - Retrieve Latest Report or List Available Sprints
// =============================================================================

/**
 * Gets sprints that have at least one completed task
 */
function getSprintsWithCompletedTasks(): Array<{ sprint: number; completedCount: number }> {
  // When running from project-tracker, cwd is apps/project-tracker
  // So we use relative path from there
  const csvPath = path.join(
    process.cwd(),
    'docs/metrics/_global/Sprint_plan.csv'
  );

  if (!fs.existsSync(csvPath)) {
    return [];
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parseCSV(content);
  const sprintCounts: Record<number, number> = {};

  for (const record of records) {
    const status = (record['Status'] || '').toLowerCase();
    const targetSprint = record['Target Sprint'];

    if ((status === 'completed' || status === 'done') && targetSprint) {
      const sprintNum = parseInt(targetSprint, 10);
      if (!isNaN(sprintNum)) {
        sprintCounts[sprintNum] = (sprintCounts[sprintNum] || 0) + 1;
      }
    }
  }

  return Object.entries(sprintCounts)
    .map(([sprint, count]) => ({ sprint: parseInt(sprint, 10), completedCount: count }))
    .sort((a, b) => a.sprint - b.sprint);
}

/**
 * Parses CSV content with proper handling of quoted fields and multi-line values
 */
function parseCSV(content: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  // First, split into logical lines (handling multi-line quoted fields)
  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
      // Skip \r\n as single newline
      if (char === '\r' && content[i + 1] === '\n') {
        i++;
      }
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const record: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = fields[j] || '';
    }

    records.push(record);
  }

  return records;
}

/**
 * Parses a single CSV line with proper quote handling
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);

  return fields;
}

/**
 * Lists attestation history for a task
 */
function getAttestationHistory(taskId: string): Array<{ timestamp: string; verdict: string; runId: string }> {
  const repoRoot = getRepoRoot();
  const attestationDir = path.join(repoRoot, 'artifacts/attestations', taskId);

  if (!fs.existsSync(attestationDir)) {
    return [];
  }

  const history: Array<{ timestamp: string; verdict: string; runId: string }> = [];
  const files = fs.readdirSync(attestationDir);

  for (const file of files) {
    if (file.startsWith('attestation-') && file.endsWith('.json') && file !== 'attestation-latest.json') {
      try {
        const filePath = path.join(attestationDir, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        history.push({
          timestamp: content.attestation_timestamp || file.replace('attestation-', '').replace('.json', ''),
          verdict: content.verdict || 'UNKNOWN',
          runId: content.run_id || '',
        });
      } catch {
        // Skip invalid files
      }
    }
  }

  return history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const sprintStr = searchParams.get('sprint');
    const listSprints = searchParams.get('list') === 'true';
    const taskId = searchParams.get('taskId');

    // List available sprints with completed tasks
    if (listSprints) {
      const sprints = getSprintsWithCompletedTasks();
      return NextResponse.json({
        success: true,
        sprints,
      });
    }

    // Get attestation history for a task
    if (taskId) {
      const history = getAttestationHistory(taskId);
      return NextResponse.json({
        success: true,
        taskId,
        history,
      });
    }

    // Get latest audit report for a sprint
    if (!sprintStr) {
      return NextResponse.json(
        { success: false, error: 'sprint query parameter is required (or use list=true)' },
        { status: 400 }
      );
    }

    const sprint = parseInt(sprintStr, 10);
    if (isNaN(sprint)) {
      return NextResponse.json(
        { success: false, error: 'sprint must be a number' },
        { status: 400 }
      );
    }

    const reportPath = getLatestAuditReport(sprint);

    if (!reportPath) {
      return NextResponse.json(
        {
          success: false,
          error: `No audit report found for sprint ${sprint}`,
        },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(reportPath, 'utf-8');
    const report = JSON.parse(content);

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('Error retrieving audit report:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
