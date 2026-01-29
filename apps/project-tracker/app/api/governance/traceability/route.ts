/**
 * GET /api/governance/traceability
 *
 * RSI (Recursive Self-Improvement) endpoint that dynamically generates
 * a traceability matrix linking tasks to artifacts, tests, and documentation.
 *
 * Traceability categories:
 * - artifacts: Files created by the task
 * - attestations: Completion evidence and validation
 * - tests: Related test files
 * - documentation: Related docs and ADRs
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadCSVTasks } from '@/lib/governance';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface TraceLink {
  type: 'artifact' | 'attestation' | 'test' | 'documentation';
  path: string;
  exists: boolean;
  size?: number;
  modifiedAt?: string;
}

interface TaskTraceability {
  task_id: string;
  description: string;
  section: string;
  status: string;
  sprint: number | 'Continuous';
  links: TraceLink[];
  coverage: {
    artifacts: { total: number; found: number };
    attestations: { total: number; found: number };
    tests: { total: number; found: number };
    documentation: { total: number; found: number };
  };
  overallCoverage: number;
}

// Get project root path
function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

// Check file existence and get metadata
function getFileInfo(filePath: string): { exists: boolean; size?: number; modifiedAt?: string } {
  const projectRoot = getProjectRoot();
  const fullPath = join(projectRoot, filePath);

  try {
    if (existsSync(fullPath)) {
      const stats = statSync(fullPath);
      return {
        exists: true,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    }
  } catch {
    // Ignore errors
  }

  return { exists: false };
}

// Get task sprint number from CSV (cached for performance)
const taskSprintCache = new Map<string, number>();

function getTaskSprint(taskId: string): number {
  if (taskSprintCache.has(taskId)) {
    return taskSprintCache.get(taskId)!;
  }

  const projectRoot = getProjectRoot();
  const csvPath = join(projectRoot, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');

  try {
    const content = readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');
    const headers = lines[0].split(',');
    const taskIdIndex = headers.findIndex(h => h.includes('Task ID'));
    const sprintIndex = headers.findIndex(h => h.includes('Target Sprint'));

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      if (row[taskIdIndex]?.trim() === taskId) {
        const sprint = parseInt(row[sprintIndex]?.trim() || '0', 10);
        taskSprintCache.set(taskId, sprint);
        return sprint;
      }
    }
  } catch {
    // Ignore errors
  }

  taskSprintCache.set(taskId, 0);
  return 0;
}

// Find attestation for a task
function findAttestation(taskId: string): TraceLink | null {
  const projectRoot = getProjectRoot();
  const sprintNumber = getTaskSprint(taskId);

  // Sprint-based attestation path
  const attestationDir = join(projectRoot, '.specify', 'sprints', `sprint-${sprintNumber}`, 'attestations', taskId);
  const attestationFile = join(attestationDir, 'attestation.json');

  try {
    if (existsSync(attestationFile)) {
      const stats = statSync(attestationFile);
      return {
        type: 'attestation',
        path: `.specify/sprints/sprint-${sprintNumber}/attestations/${taskId}/attestation.json`,
        exists: true,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    }
  } catch {
    // Ignore errors
  }

  return null;
}

// Find related test files by task ID pattern
function findRelatedTests(taskId: string): TraceLink[] {
  const projectRoot = getProjectRoot();
  const tests: TraceLink[] = [];

  // Common test directories
  const testDirs = [
    'tests',
    'apps/web/src',
    'apps/api/src',
    'packages/domain/src',
    'packages/application/src',
    'packages/validators',
    'packages/ui',
  ];

  // Convert task ID to possible test file patterns
  const patterns = [
    taskId.toLowerCase(),
    taskId.replace(/-/g, '_').toLowerCase(),
    taskId.replace(/-/g, '').toLowerCase(),
  ];

  for (const testDir of testDirs) {
    const fullDir = join(projectRoot, testDir);
    try {
      if (!existsSync(fullDir)) continue;

      const files = readdirSync(fullDir, { recursive: true });
      for (const file of files) {
        const fileName = String(file).toLowerCase();
        if (fileName.includes('.test.') || fileName.includes('.spec.') || fileName.includes('__tests__')) {
          for (const pattern of patterns) {
            if (fileName.includes(pattern)) {
              const filePath = join(testDir, String(file));
              const info = getFileInfo(filePath);
              if (info.exists) {
                tests.push({
                  type: 'test',
                  path: filePath,
                  exists: true,
                  size: info.size,
                  modifiedAt: info.modifiedAt,
                });
              }
              break;
            }
          }
        }
      }
    } catch {
      // Ignore directory errors
    }
  }

  return tests;
}

// Find related documentation
function findRelatedDocs(taskId: string, _section: string): TraceLink[] {
  const projectRoot = getProjectRoot();
  const docs: TraceLink[] = [];
  const sprintNumber = getTaskSprint(taskId);

  // Check for ADR
  const adrDir = join(projectRoot, 'docs', 'planning', 'adr');
  try {
    if (existsSync(adrDir)) {
      const files = readdirSync(adrDir);
      for (const file of files) {
        const fileName = String(file).toLowerCase();
        if (fileName.includes(taskId.toLowerCase()) || fileName.includes(taskId.replace(/-/g, '_').toLowerCase())) {
          const filePath = `docs/planning/adr/${file}`;
          const info = getFileInfo(filePath);
          docs.push({
            type: 'documentation',
            path: filePath,
            exists: info.exists,
            size: info.size,
            modifiedAt: info.modifiedAt,
          });
        }
      }
    }
  } catch {
    // Ignore errors
  }

  // Check for task-specific context pack (sprint-based path)
  const contextPackPath = `.specify/sprints/sprint-${sprintNumber}/attestations/${taskId}/context_pack.md`;
  const contextInfo = getFileInfo(contextPackPath);
  if (contextInfo.exists) {
    docs.push({
      type: 'documentation',
      path: contextPackPath,
      exists: true,
      size: contextInfo.size,
      modifiedAt: contextInfo.modifiedAt,
    });
  }

  // Check for implementation spec (sprint-based path)
  const implSpecPath = `.specify/sprints/sprint-${sprintNumber}/attestations/${taskId}/implementation-spec.md`;
  const implInfo = getFileInfo(implSpecPath);
  if (implInfo.exists) {
    docs.push({
      type: 'documentation',
      path: implSpecPath,
      exists: true,
      size: implInfo.size,
      modifiedAt: implInfo.modifiedAt,
    });
  }

  return docs;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskFilter = searchParams.get('task');
    const sectionFilter = searchParams.get('section');
    const sprintFilter = searchParams.get('sprint');
    const coverageFilter = searchParams.get('coverage'); // 'low', 'medium', 'high'

    // Load fresh data from CSV
    const allTasks = loadCSVTasks();

    if (!allTasks.length) {
      return NextResponse.json(
        {
          error: 'No tasks found',
          message: 'Sprint_plan.csv is empty or not found',
        },
        { status: 404 }
      );
    }

    // Filter tasks
    let filteredTasks = allTasks;

    if (taskFilter) {
      filteredTasks = filteredTasks.filter((t) =>
        t.taskId.toLowerCase().includes(taskFilter.toLowerCase())
      );
    }

    if (sectionFilter) {
      filteredTasks = filteredTasks.filter((t) =>
        t.section.toLowerCase().includes(sectionFilter.toLowerCase())
      );
    }

    if (sprintFilter) {
      const sprintNum = parseInt(sprintFilter, 10);
      if (!isNaN(sprintNum)) {
        filteredTasks = filteredTasks.filter((t) => t.sprint === sprintNum);
      }
    }

    // Build traceability matrix
    const traceabilityMatrix: TaskTraceability[] = [];

    for (const task of filteredTasks) {
      const links: TraceLink[] = [];

      // Add declared artifacts
      for (const artifact of task.artifacts) {
        if (artifact && artifact.trim()) {
          const info = getFileInfo(artifact);
          links.push({
            type: 'artifact',
            path: artifact,
            exists: info.exists,
            size: info.size,
            modifiedAt: info.modifiedAt,
          });
        }
      }

      // Add attestation
      const attestation = findAttestation(task.taskId);
      if (attestation) {
        links.push(attestation);
      }

      // Add related tests
      const tests = findRelatedTests(task.taskId);
      links.push(...tests);

      // Add related documentation
      const docs = findRelatedDocs(task.taskId, task.section);
      links.push(...docs);

      // Calculate coverage
      const artifactLinks = links.filter((l) => l.type === 'artifact');
      const attestationLinks = links.filter((l) => l.type === 'attestation');
      const testLinks = links.filter((l) => l.type === 'test');
      const docLinks = links.filter((l) => l.type === 'documentation');

      const coverage = {
        artifacts: {
          total: task.artifacts.filter((a) => a && a.trim()).length || 1,
          found: artifactLinks.filter((l) => l.exists).length,
        },
        attestations: {
          total: 1,
          found: attestationLinks.filter((l) => l.exists).length,
        },
        tests: {
          total: 1,
          found: testLinks.filter((l) => l.exists).length > 0 ? 1 : 0,
        },
        documentation: {
          total: 1,
          found: docLinks.filter((l) => l.exists).length > 0 ? 1 : 0,
        },
      };

      // Calculate overall coverage (weighted)
      const weights = { artifacts: 0.4, attestations: 0.3, tests: 0.2, documentation: 0.1 };
      const overallCoverage = Math.round(
        (coverage.artifacts.found / coverage.artifacts.total) * weights.artifacts * 100 +
          (coverage.attestations.found / coverage.attestations.total) * weights.attestations * 100 +
          (coverage.tests.found / coverage.tests.total) * weights.tests * 100 +
          (coverage.documentation.found / coverage.documentation.total) * weights.documentation * 100
      );

      traceabilityMatrix.push({
        task_id: task.taskId,
        description: task.description,
        section: task.section,
        status: task.status,
        sprint: task.sprint,
        links,
        coverage,
        overallCoverage,
      });
    }

    // Apply coverage filter
    let finalMatrix = traceabilityMatrix;
    if (coverageFilter) {
      if (coverageFilter === 'low') {
        finalMatrix = traceabilityMatrix.filter((t) => t.overallCoverage < 33);
      } else if (coverageFilter === 'medium') {
        finalMatrix = traceabilityMatrix.filter((t) => t.overallCoverage >= 33 && t.overallCoverage < 66);
      } else if (coverageFilter === 'high') {
        finalMatrix = traceabilityMatrix.filter((t) => t.overallCoverage >= 66);
      }
    }

    // Sort by coverage (lowest first for visibility)
    finalMatrix.sort((a, b) => a.overallCoverage - b.overallCoverage);

    // Calculate summary statistics
    const summary = {
      totalTasks: finalMatrix.length,
      averageCoverage: Math.round(
        finalMatrix.reduce((sum, t) => sum + t.overallCoverage, 0) / finalMatrix.length || 0
      ),
      byCoverage: {
        low: finalMatrix.filter((t) => t.overallCoverage < 33).length,
        medium: finalMatrix.filter((t) => t.overallCoverage >= 33 && t.overallCoverage < 66).length,
        high: finalMatrix.filter((t) => t.overallCoverage >= 66).length,
      },
      byType: {
        artifacts: {
          total: finalMatrix.reduce((sum, t) => sum + t.coverage.artifacts.total, 0),
          found: finalMatrix.reduce((sum, t) => sum + t.coverage.artifacts.found, 0),
        },
        attestations: {
          total: finalMatrix.length,
          found: finalMatrix.filter((t) => t.coverage.attestations.found > 0).length,
        },
        tests: {
          total: finalMatrix.length,
          found: finalMatrix.filter((t) => t.coverage.tests.found > 0).length,
        },
        documentation: {
          total: finalMatrix.length,
          found: finalMatrix.filter((t) => t.coverage.documentation.found > 0).length,
        },
      },
    };

    return NextResponse.json(
      {
        source: 'fresh',
        timestamp: new Date().toISOString(),
        pattern: 'RSI',
        filters: {
          task: taskFilter || 'all',
          section: sectionFilter || 'all',
          sprint: sprintFilter || 'all',
          coverage: coverageFilter || 'all',
        },
        summary,
        matrix: finalMatrix.slice(0, 100), // Limit to 100 tasks for performance
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error generating traceability matrix:', error);
    return NextResponse.json(
      { error: 'Failed to generate traceability matrix', details: String(error) },
      { status: 500 }
    );
  }
}
