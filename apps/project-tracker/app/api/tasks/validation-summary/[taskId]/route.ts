import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import type {
  TaskValidationSummary,
  BuildValidationItem,
  CoverageMetrics,
  MATOPExecutionSummary,
  AttestationKPIResult,
  DODItemResult,
  DocumentPreview,
  EnhancedContextData,
  STOAVerdict,
  PlanDeliverablesVerification,
  PlanDeliverable,
  PlanCheckboxItem,
} from '../../../../../lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Get repo root (apps/project-tracker -> repo root)
function getRepoRoot(): string {
  return join(process.cwd(), '..', '..');
}

// Get sprint number for a task from CSV
async function getTaskSprintNumber(taskId: string): Promise<number> {
  const repoRoot = getRepoRoot();
  const csvPath = join(repoRoot, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');

  try {
    const csvContent = await readFile(csvPath, 'utf-8');
    const records = parse(csvContent, { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
    const task = records.find((r) => r['Task ID'] === taskId);
    return parseInt(task?.['Target Sprint'] || '0', 10);
  } catch {
    return 0;
  }
}

interface Params {
  params: Promise<{
    taskId: string;
  }>;
}

// Attestation file structure from .specify/sprints/sprint-{N}/attestations/{taskId}/attestation.json
interface RawAttestation {
  task_id?: string;
  run_id?: string;
  attestor?: string;
  attestation_timestamp?: string;
  verdict?: 'COMPLETE' | 'INCOMPLETE' | 'BLOCKED';
  evidence_summary?: {
    artifacts_verified?: number;
    validations_passed?: number;
    validations_failed?: number;
    gates_passed?: number;
    gates_failed?: number;
    kpis_met?: number;
    kpis_missed?: number;
    placeholders_found?: number;
  };
  validation_results?: Array<{
    name: string;
    command?: string;
    exit_code?: number;
    passed?: boolean;
    timestamp?: string;
    duration_ms?: number;
  }>;
  gate_results?: Array<{
    gate_id: string;
    passed: boolean;
    exit_code?: number;
    timestamp?: string;
  }>;
  kpi_results?: Array<{
    kpi: string;
    target: string;
    actual: string;
    met: boolean;
  }>;
  definition_of_done_items?: Array<{
    criterion: string;
    met: boolean;
    evidence?: string;
  }>;
  context_acknowledgment?: {
    files_read?: Array<{ path: string; sha256?: string; hash?: string }>;
    invariants_acknowledged?: string[];
    acknowledged_at?: string;
  };
  notes?: string;
}

// Coverage summary structure - includes per-file coverage
interface CoverageMetric {
  total: number;
  covered: number;
  skipped?: number;
  pct: number;
}

interface FileCoverage {
  lines: CoverageMetric;
  branches: CoverageMetric;
  functions: CoverageMetric;
  statements: CoverageMetric;
}

interface RawCoverageSummary {
  total?: FileCoverage;
  [filePath: string]: FileCoverage | undefined;
}

// Task to package mapping based on task ID patterns and known associations
const TASK_PACKAGE_MAP: Record<string, string[]> = {
  // AI-related tasks map to ai-worker
  'IFC-085': ['apps/ai-worker'],
  'IFC-005': ['apps/ai-worker'],
  'IFC-155': ['apps/ai-worker'],
  'AI-SETUP': ['apps/ai-worker'],

  // API tasks
  'IFC-003': ['apps/api'],
  'IFC-004': ['apps/api'],

  // Web/UI tasks
  'PG-': ['apps/web'],
  'IFC-090': ['apps/web'],
  'IFC-091': ['apps/web'],
};

/**
 * Determine which package(s) a task belongs to based on task ID
 */
function getTaskPackages(taskId: string): string[] {
  // Check exact match first
  if (TASK_PACKAGE_MAP[taskId]) {
    return TASK_PACKAGE_MAP[taskId];
  }

  // Check prefix matches
  for (const [prefix, packages] of Object.entries(TASK_PACKAGE_MAP)) {
    if (taskId.startsWith(prefix)) {
      return packages;
    }
  }

  // Default: return all packages (global coverage)
  return [];
}

/**
 * Load attestation data from sprint-based location
 */
async function loadAttestation(taskId: string, sprintNumber: number): Promise<RawAttestation | null> {
  const repoRoot = getRepoRoot();

  // Try multiple paths
  const possiblePaths = [
    join(repoRoot, '.specify', 'sprints', `sprint-${sprintNumber}`, 'attestations', taskId, 'attestation.json'),
    join(repoRoot, '.specify', 'sprints', `sprint-${sprintNumber}`, 'attestations', taskId, `${taskId}-attestation.json`),
    join(repoRoot, 'artifacts', 'attestations', taskId, 'attestation.json'),
    join(repoRoot, 'artifacts', 'attestations', taskId, `${taskId}-attestation.json`),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      try {
        const content = await readFile(path, 'utf-8');
        return JSON.parse(content) as RawAttestation;
      } catch {
        // Continue to next path
      }
    }
  }
  return null;
}

/**
 * Load coverage summary from artifacts, optionally filtered by task's package
 */
async function loadCoverageSummary(taskId: string): Promise<CoverageMetrics | null> {
  const repoRoot = getRepoRoot();
  const coveragePath = join(repoRoot, 'artifacts', 'coverage', 'coverage-summary.json');

  if (!existsSync(coveragePath)) {
    return null;
  }

  try {
    const content = await readFile(coveragePath, 'utf-8');
    const data = JSON.parse(content) as RawCoverageSummary;

    if (!data.total) return null;

    const threshold = 80; // Coverage threshold
    const taskPackages = getTaskPackages(taskId);

    // If no specific packages, return global coverage
    if (taskPackages.length === 0) {
      return buildCoverageMetrics(data.total, threshold);
    }

    // Filter coverage by package paths and aggregate
    const aggregated = {
      lines: { total: 0, covered: 0 },
      branches: { total: 0, covered: 0 },
      functions: { total: 0, covered: 0 },
      statements: { total: 0, covered: 0 },
    };

    let fileCount = 0;

    for (const [filePath, fileCoverage] of Object.entries(data)) {
      if (filePath === 'total' || !fileCoverage) continue;

      // Normalize path separators for cross-platform compatibility
      const normalizedPath = filePath.replace(/\\/g, '/');

      // Check if file belongs to any of the task's packages
      const belongsToPackage = taskPackages.some((pkg) =>
        normalizedPath.includes(pkg.replace(/\\/g, '/'))
      );

      if (belongsToPackage) {
        fileCount++;
        aggregated.lines.total += fileCoverage.lines?.total ?? 0;
        aggregated.lines.covered += fileCoverage.lines?.covered ?? 0;
        aggregated.branches.total += fileCoverage.branches?.total ?? 0;
        aggregated.branches.covered += fileCoverage.branches?.covered ?? 0;
        aggregated.functions.total += fileCoverage.functions?.total ?? 0;
        aggregated.functions.covered += fileCoverage.functions?.covered ?? 0;
        aggregated.statements.total += fileCoverage.statements?.total ?? 0;
        aggregated.statements.covered += fileCoverage.statements?.covered ?? 0;
      }
    }

    // If no files found for the package, return null
    if (fileCount === 0) {
      return null;
    }

    // Calculate percentages
    const calcPct = (covered: number, total: number) =>
      total > 0 ? Math.round((covered / total) * 10000) / 100 : 0;

    const packageCoverage: FileCoverage = {
      lines: {
        total: aggregated.lines.total,
        covered: aggregated.lines.covered,
        pct: calcPct(aggregated.lines.covered, aggregated.lines.total),
      },
      branches: {
        total: aggregated.branches.total,
        covered: aggregated.branches.covered,
        pct: calcPct(aggregated.branches.covered, aggregated.branches.total),
      },
      functions: {
        total: aggregated.functions.total,
        covered: aggregated.functions.covered,
        pct: calcPct(aggregated.functions.covered, aggregated.functions.total),
      },
      statements: {
        total: aggregated.statements.total,
        covered: aggregated.statements.covered,
        pct: calcPct(aggregated.statements.covered, aggregated.statements.total),
      },
    };

    const metrics = buildCoverageMetrics(packageCoverage, threshold);

    // Add package info to the response
    if (metrics) {
      (metrics as CoverageMetrics & { package?: string; fileCount?: number }).package =
        taskPackages.join(', ');
      (metrics as CoverageMetrics & { package?: string; fileCount?: number }).fileCount =
        fileCount;
    }

    return metrics;
  } catch {
    return null;
  }
}

/**
 * Build CoverageMetrics from raw coverage data
 */
function buildCoverageMetrics(coverage: FileCoverage, threshold: number): CoverageMetrics {
  return {
    lines: {
      pct: coverage.lines?.pct ?? 0,
      covered: coverage.lines?.covered ?? 0,
      total: coverage.lines?.total ?? 0,
      met: (coverage.lines?.pct ?? 0) >= threshold,
    },
    branches: {
      pct: coverage.branches?.pct ?? 0,
      covered: coverage.branches?.covered ?? 0,
      total: coverage.branches?.total ?? 0,
      met: (coverage.branches?.pct ?? 0) >= threshold,
    },
    functions: {
      pct: coverage.functions?.pct ?? 0,
      covered: coverage.functions?.covered ?? 0,
      total: coverage.functions?.total ?? 0,
      met: (coverage.functions?.pct ?? 0) >= threshold,
    },
    statements: coverage.statements
      ? {
          pct: coverage.statements.pct ?? 0,
          covered: coverage.statements.covered ?? 0,
          total: coverage.statements.total ?? 0,
          met: (coverage.statements.pct ?? 0) >= threshold,
        }
      : undefined,
    overall: {
      pct: coverage.lines?.pct ?? 0,
      met: (coverage.lines?.pct ?? 0) >= threshold,
    },
  };
}

/**
 * Extract H2 headings from markdown content
 */
function extractMarkdownSections(content: string): string[] {
  const headingRegex = /^##\s+(.+)$/gm;
  const sections: string[] = [];
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    sections.push(match[1].trim());
  }
  return sections;
}

/**
 * Extract title from markdown content (first H1)
 */
function extractMarkdownTitle(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : undefined;
}

/**
 * Load document preview (spec or plan)
 */
async function loadDocumentPreview(
  taskId: string,
  sprintNumber: number,
  docType: 'spec' | 'plan'
): Promise<DocumentPreview> {
  const repoRoot = getRepoRoot();
  const folder = docType === 'spec' ? 'specifications' : 'planning';
  const suffix = docType === 'spec' ? '-spec.md' : '-plan.md';

  const possiblePaths = [
    join(repoRoot, '.specify', 'sprints', `sprint-${sprintNumber}`, folder, `${taskId}${suffix}`),
    join(repoRoot, '.specify', 'sprints', `sprint-${sprintNumber}`, folder, `${taskId}.md`),
    // Legacy paths
    join(repoRoot, 'artifacts', 'attestations', taskId, `${docType}.md`),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      try {
        const content = await readFile(path, 'utf-8');
        const sections = extractMarkdownSections(content);
        const title = extractMarkdownTitle(content);
        const relativePath = relative(repoRoot, path).replace(/\\/g, '/');

        return {
          exists: true,
          path: relativePath,
          title,
          excerpt: content.slice(0, 500).trim() + (content.length > 500 ? '...' : ''),
          sections,
        };
      } catch {
        // Continue to next path
      }
    }
  }

  return {
    exists: false,
    path: null,
  };
}

/**
 * Parse plan markdown to extract deliverables and checkboxes
 * Uses the structure from /plan-session skill
 */
async function parsePlanDeliverables(
  taskId: string,
  sprintNumber: number
): Promise<PlanDeliverablesVerification | null> {
  const repoRoot = getRepoRoot();

  // Find plan file
  const possiblePaths = [
    join(repoRoot, '.specify', 'sprints', `sprint-${sprintNumber}`, 'planning', `${taskId}-plan.md`),
    join(repoRoot, '.specify', 'sprints', `sprint-${sprintNumber}`, 'planning', `${taskId}.md`),
  ];

  let planPath: string | null = null;
  let planContent: string | null = null;

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      try {
        planContent = await readFile(path, 'utf-8');
        planPath = relative(repoRoot, path).replace(/\\/g, '/');
        break;
      } catch {
        // Continue to next path
      }
    }
  }

  if (!planContent || !planPath) {
    return {
      taskId,
      planExists: false,
      planPath: null,
      deliverables: { total: 0, verified: 0, missing: 0, items: [] },
      checkboxes: { total: 0, checked: 0, unchecked: 0, items: [] },
      overallStatus: 'no-plan',
      completionPercentage: 0,
      verifiedAt: new Date().toISOString(),
    };
  }

  // Extract files from "Files to Create:" and "Files to Modify:" sections
  const deliverables: PlanDeliverable[] = [];
  const filePatterns = [
    /\*\*Files to Create:\*\*\s*\n((?:- `[^`]+`\n?)+)/g,
    /\*\*Files to Modify:\*\*\s*\n((?:- `[^`]+`\n?)+)/g,
  ];

  for (const pattern of filePatterns) {
    let match;
    while ((match = pattern.exec(planContent)) !== null) {
      const fileListBlock = match[1];
      const fileMatches = fileListBlock.match(/- `([^`]+)`/g);
      if (fileMatches) {
        for (const fileMatch of fileMatches) {
          const filePath = fileMatch.match(/- `([^`]+)`/)?.[1];
          if (filePath && !deliverables.some((d) => d.path === filePath)) {
            const fullPath = join(repoRoot, filePath);
            const fileExists = existsSync(fullPath);
            let size: number | undefined;
            let lastModified: string | undefined;

            if (fileExists) {
              try {
                const stats = (await import('node:fs')).statSync(fullPath);
                size = stats.size;
                lastModified = stats.mtime.toISOString();
              } catch {
                // Ignore stat errors
              }
            }

            deliverables.push({
              path: filePath,
              type: 'file',
              status: fileExists ? 'exists' : 'missing',
              size,
              lastModified,
              fromSection: 'Files to Create/Modify',
            });
          }
        }
      }
    }
  }

  // Also extract artifact paths mentioned in the plan
  const artifactPattern = /`(artifacts\/[^`]+)`/g;
  let artifactMatch;
  while ((artifactMatch = artifactPattern.exec(planContent)) !== null) {
    const artifactPath = artifactMatch[1];
    if (!deliverables.some((d) => d.path === artifactPath)) {
      const fullPath = join(repoRoot, artifactPath);
      const fileExists = existsSync(fullPath);

      deliverables.push({
        path: artifactPath,
        type: 'file',
        status: fileExists ? 'exists' : 'missing',
        fromSection: 'Artifacts',
      });
    }
  }

  // Extract checkboxes from the plan
  const checkboxItems: PlanCheckboxItem[] = [];
  const lines = planContent.split('\n');
  let currentPhase = 'Unknown';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track current phase (e.g., "### Phase 1: RED", "## Final Validation")
    const phaseMatch = line.match(/^#{2,3}\s+(?:Phase \d+[:\s]*)?(.+)$/);
    if (phaseMatch) {
      currentPhase = phaseMatch[1].trim();
    }

    // Match checkboxes: - [ ] or - [x]
    const checkboxMatch = line.match(/^(\s*)-\s*\[([ xX])\]\s*(.+)$/);
    if (checkboxMatch) {
      const isChecked = checkboxMatch[2].toLowerCase() === 'x';
      const text = checkboxMatch[3].trim();

      checkboxItems.push({
        text,
        checked: isChecked,
        phase: currentPhase,
        lineNumber: i + 1,
      });
    }
  }

  // Calculate verification summary
  const verifiedCount = deliverables.filter((d) => d.status === 'exists').length;
  const missingCount = deliverables.filter((d) => d.status === 'missing').length;
  const checkedCount = checkboxItems.filter((c) => c.checked).length;

  // Overall status calculation
  let overallStatus: 'complete' | 'partial' | 'incomplete' | 'no-plan' = 'incomplete';
  let completionPercentage = 0;

  if (deliverables.length > 0 || checkboxItems.length > 0) {
    const totalItems = deliverables.length + checkboxItems.length;
    const completedItems = verifiedCount + checkedCount;
    completionPercentage = Math.round((completedItems / totalItems) * 100);

    if (completionPercentage === 100) {
      overallStatus = 'complete';
    } else if (completionPercentage > 0) {
      overallStatus = 'partial';
    } else {
      overallStatus = 'incomplete';
    }
  }

  return {
    taskId,
    planExists: true,
    planPath,
    deliverables: {
      total: deliverables.length,
      verified: verifiedCount,
      missing: missingCount,
      items: deliverables,
    },
    checkboxes: {
      total: checkboxItems.length,
      checked: checkedCount,
      unchecked: checkboxItems.length - checkedCount,
      items: checkboxItems,
    },
    overallStatus,
    completionPercentage,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Load MATOP execution summary (if available)
 */
async function loadMATOPSummary(taskId: string, sprintNumber: number): Promise<MATOPExecutionSummary | null> {
  const repoRoot = getRepoRoot();
  const executionDir = join(repoRoot, '.specify', 'sprints', `sprint-${sprintNumber}`, 'execution', taskId);

  if (!existsSync(executionDir)) {
    return null;
  }

  // Find the most recent run directory
  const { readdirSync, statSync } = await import('node:fs');
  try {
    const entries = readdirSync(executionDir);
    const runDirs = entries
      .filter((entry) => {
        const fullPath = join(executionDir, entry);
        return statSync(fullPath).isDirectory() && /^\d{8}-\d{6}$/.test(entry);
      })
      .sort()
      .reverse();

    if (runDirs.length === 0) return null;

    const latestRunDir = join(executionDir, runDirs[0]);
    const matopSummaryPath = join(latestRunDir, 'matop', 'summary.json');

    if (existsSync(matopSummaryPath)) {
      const content = await readFile(matopSummaryPath, 'utf-8');
      return JSON.parse(content) as MATOPExecutionSummary;
    }

    // Try to construct from delivery report if no MATOP summary
    const deliveryPath = join(latestRunDir, `${taskId}-delivery.md`);
    if (existsSync(deliveryPath)) {
      const deliveryContent = await readFile(deliveryPath, 'utf-8');
      // Extract basic info from delivery if available
      const consensusMatch = deliveryContent.match(/Consensus Verdict:\*\*\s*(\w+)/i);
      if (consensusMatch) {
        return {
          runId: runDirs[0],
          timestamp: new Date().toISOString(),
          consensusVerdict: consensusMatch[1].toUpperCase() as 'PASS' | 'WARN' | 'FAIL',
          stoaResults: {},
          gatesExecuted: { total: 0, passed: 0, warned: 0, failed: 0 },
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Build validation items from attestation data
 */
function buildValidationItems(attestation: RawAttestation | null): BuildValidationItem[] {
  const items: BuildValidationItem[] = [];

  if (!attestation?.validation_results) {
    return [
      { name: 'typecheck', status: 'pending' },
      { name: 'tests', status: 'pending' },
      { name: 'lint', status: 'pending' },
      { name: 'build', status: 'pending' },
    ];
  }

  // Map validation results to build validation items (with null safety)
  const typecheck = attestation.validation_results.find((r) =>
    r.name && (r.name.toLowerCase().includes('typecheck') || r.name.toLowerCase().includes('type'))
  );
  const tests = attestation.validation_results.find((r) =>
    r.name && r.name.toLowerCase().includes('test')
  );
  const lint = attestation.validation_results.find((r) =>
    r.name && r.name.toLowerCase().includes('lint')
  );
  const build = attestation.validation_results.find((r) =>
    r.name && r.name.toLowerCase().includes('build')
  );

  items.push({
    name: 'typecheck',
    status: typecheck ? (typecheck.passed ? 'pass' : 'fail') : 'pending',
    exitCode: typecheck?.exit_code,
    command: typecheck?.command,
    timestamp: typecheck?.timestamp,
    duration: typecheck?.duration_ms,
  });

  items.push({
    name: 'tests',
    status: tests ? (tests.passed ? 'pass' : 'fail') : 'pending',
    exitCode: tests?.exit_code,
    command: tests?.command,
    timestamp: tests?.timestamp,
    duration: tests?.duration_ms,
  });

  items.push({
    name: 'lint',
    status: lint ? (lint.passed ? 'pass' : 'fail') : 'pending',
    exitCode: lint?.exit_code,
    command: lint?.command,
    timestamp: lint?.timestamp,
    duration: lint?.duration_ms,
  });

  items.push({
    name: 'build',
    status: build ? (build.passed ? 'pass' : 'fail') : 'pending',
    exitCode: build?.exit_code,
    command: build?.command,
    timestamp: build?.timestamp,
    duration: build?.duration_ms,
  });

  return items;
}

/**
 * Build enhanced context data from attestation
 */
function buildEnhancedContext(attestation: RawAttestation | null, taskId: string): EnhancedContextData | null {
  if (!attestation?.context_acknowledgment) {
    return null;
  }

  const ctx = attestation.context_acknowledgment;
  const filesRead = (ctx.files_read || []).map((f) => ({
    path: f.path,
    hash: f.sha256 || f.hash || '',
    status: 'matched' as const,
  }));

  return {
    taskId,
    runId: attestation.run_id,
    filesRead,
    invariantsAcknowledged: ctx.invariants_acknowledged || [],
    acknowledgedAt: ctx.acknowledged_at,
    totalFilesCount: filesRead.length,
    validatedFilesCount: filesRead.length,
  };
}

export async function GET(request: Request, { params }: Params) {
  const resolvedParams = await params;
  const { taskId } = resolvedParams;

  try {
    // Get sprint number from CSV
    const sprintNumber = await getTaskSprintNumber(taskId);

    // Load all data in parallel
    const [attestation, coverage, spec, plan, matop, planDeliverables] = await Promise.all([
      loadAttestation(taskId, sprintNumber),
      loadCoverageSummary(taskId),
      loadDocumentPreview(taskId, sprintNumber, 'spec'),
      loadDocumentPreview(taskId, sprintNumber, 'plan'),
      loadMATOPSummary(taskId, sprintNumber),
      parsePlanDeliverables(taskId, sprintNumber),
    ]);

    // Build validation items from attestation
    const validationItems = buildValidationItems(attestation);
    const allPassed = validationItems.every((i) => i.status === 'pass');
    const anyFailed = validationItems.some((i) => i.status === 'fail');
    const overall = anyFailed ? 'fail' : allPassed ? 'pass' : 'partial';

    // Build KPI results
    const kpiResults: AttestationKPIResult[] = (attestation?.kpi_results || []).map((r) => ({
      kpi: r.kpi,
      target: r.target,
      actual: r.actual,
      met: r.met,
    }));

    // Build DoD results
    const dodResults: DODItemResult[] = (attestation?.definition_of_done_items || []).map((r) => ({
      criterion: r.criterion,
      met: r.met,
      evidence: r.evidence,
    }));

    // Build context data
    const context = buildEnhancedContext(attestation, taskId);

    const result: TaskValidationSummary = {
      taskId,
      sprintNumber,
      timestamp: new Date().toISOString(),

      buildValidation: {
        overall,
        items: validationItems,
      },

      coverage,

      matop,

      kpis: {
        total: kpiResults.length,
        met: kpiResults.filter((r) => r.met).length,
        results: kpiResults,
      },

      dod: {
        total: dodResults.length,
        met: dodResults.filter((r) => r.met).length,
        items: dodResults,
      },

      context,

      planDeliverables,

      spec,
      plan,

      attestation: {
        exists: !!attestation,
        verdict: attestation?.verdict,
        attestor: attestation?.attestor,
        timestamp: attestation?.attestation_timestamp,
        artifactsVerified: attestation?.evidence_summary?.artifacts_verified,
        validationsPassed: attestation?.evidence_summary?.validations_passed,
        gatesPassed: attestation?.evidence_summary?.gates_passed,
      },
    };

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('Error loading validation summary:', error);
    return NextResponse.json(
      { error: 'Failed to load validation summary' },
      { status: 500 }
    );
  }
}
