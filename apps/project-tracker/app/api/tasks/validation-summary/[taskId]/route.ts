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
  ContextAckStatus,
  PlanDeliverable,
  PlanDeliverablesVerification,
  PlanCheckboxItem,
} from '../../../../../lib/types';
import {
  type RawCoverageSummary,
  type CoverageKpiSnapshot,
  type CoverageThresholds,
  extractArtifactTagPaths,
  extractCoverageThresholdsFromKpis,
  selectTaskScopedCoverage,
  buildCoverageMetricsFromAttestedKpis,
} from '../../../../../lib/task-coverage';

export const dynamic = 'force-dynamic';

// Get repo root (apps/project-tracker -> repo root)
function getRepoRoot(): string {
  return join(process.cwd(), '..', '..');
}

// Get sprint number for a task from CSV
async function loadTaskRecord(taskId: string): Promise<{
  sprintNumber: number;
  artifactPaths: string[];
} | null> {
  const repoRoot = getRepoRoot();
  const csvPath = join(
    repoRoot,
    'apps',
    'project-tracker',
    'docs',
    'metrics',
    '_global',
    'Sprint_plan.csv'
  );

  try {
    const csvContent = await readFile(csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    }) as Array<Record<string, string>>;
    const task = records.find((r) => r['Task ID'] === taskId);
    if (!task) return null;

    return {
      sprintNumber: Number.parseInt(task['Target Sprint'] || '0', 10),
      artifactPaths: extractArtifactTagPaths(task['Artifacts To Track']),
    };
  } catch {
    return null;
  }
}

interface Params {
  params: Promise<{
    taskId: string;
  }>;
}

// Attestation file structure from .specify/sprints/sprint-{N}/attestations/{taskId}/attestation.json
// Completion gates status for enforcement validation
type GateStatus = 'pass' | 'warn' | 'blocked' | 'pending';

interface CompletionGate {
  name: string;
  status: GateStatus;
  details?: string;
  required: boolean;
}

interface CompletionGatesStatus {
  allGatesPassed: boolean;
  canComplete: boolean;
  gates: CompletionGate[];
  blockingReasons: string[];
}

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
  artifact_hashes?: Record<string, string>;
  notes?: string;
}

/**
 * Load attestation data from sprint-based location
 */
async function loadAttestation(
  taskId: string,
  sprintNumber: number
): Promise<RawAttestation | null> {
  const repoRoot = getRepoRoot();

  // Try multiple paths
  const possiblePaths = [
    join(
      repoRoot,
      '.specify',
      'sprints',
      `sprint-${sprintNumber}`,
      'attestations',
      taskId,
      'attestation.json'
    ),
    join(
      repoRoot,
      '.specify',
      'sprints',
      `sprint-${sprintNumber}`,
      'attestations',
      taskId,
      `${taskId}-attestation.json`
    ),
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
 * Load context_ack.json status from sprint-based attestation directory
 */
async function loadContextAck(taskId: string, sprintNumber: number): Promise<ContextAckStatus> {
  const repoRoot = getRepoRoot();

  const possiblePaths = [
    join(
      repoRoot,
      '.specify',
      'sprints',
      `sprint-${sprintNumber}`,
      'attestations',
      taskId,
      'context_ack.json'
    ),
    join(repoRoot, 'artifacts', 'attestations', taskId, 'context_ack.json'),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      try {
        const content = await readFile(path, 'utf-8');
        const data = JSON.parse(content) as {
          files_read?: unknown[];
          invariants_acknowledged?: unknown[];
        };
        const relativePath = relative(repoRoot, path).replaceAll('\\', '/');
        return {
          exists: true,
          path: relativePath,
          filesRead: Array.isArray(data.files_read) ? data.files_read.length : 0,
          invariantsCount: Array.isArray(data.invariants_acknowledged)
            ? data.invariants_acknowledged.length
            : 0,
        };
      } catch {
        // Continue to next path
      }
    }
  }

  return { exists: false, path: null, filesRead: 0, invariantsCount: 0 };
}

/**
 * Load task-scoped coverage summary from artifacts
 */
async function loadCoverageSummary(
  taskArtifacts: string[],
  attestation: RawAttestation | null
): Promise<CoverageMetrics | null> {
  const repoRoot = getRepoRoot();
  const coveragePath = join(repoRoot, 'artifacts', 'coverage', 'coverage-summary.json');

  if (!existsSync(coveragePath)) {
    return null;
  }

  try {
    const content = await readFile(coveragePath, 'utf-8');
    const data = JSON.parse(content) as RawCoverageSummary;
    if (!data.total) return null;

    const thresholds: CoverageThresholds = extractCoverageThresholdsFromKpis(
      attestation?.kpi_results as CoverageKpiSnapshot[] | undefined
    );

    const scopedCoverage = selectTaskScopedCoverage(data, {
      repoRoot,
      declaredArtifacts: taskArtifacts,
      attestedArtifacts: Object.keys(attestation?.artifact_hashes ?? {}),
      thresholds,
    });

    if (scopedCoverage) {
      return scopedCoverage;
    }

    return buildCoverageMetricsFromAttestedKpis(
      attestation?.kpi_results as CoverageKpiSnapshot[] | undefined,
      thresholds
    );
  } catch {
    return null;
  }
}

/**
 * Extract H2 headings from markdown content
 */
function extractMarkdownSections(content: string): string[] {
  const headingRegex = /^##\s+([^\n]{1,500})$/gm;
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
  const match = /^#\s+([^\n]{1,500})$/m.exec(content);
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
        const relativePath = relative(repoRoot, path).replaceAll('\\', '/');

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

function extractFilePathsFromBlock(block: string): string[] {
  return (block.match(/- `([^`]+)`/g) || [])
    .map((m) => /- `([^`]+)`/.exec(m)?.[1])
    .filter((p): p is string => !!p);
}

/**
 * Parse plan markdown to extract deliverables and checkboxes
 * Uses the structure from /plan-session skill
 */
async function makeDeliverable(
  repoRoot: string,
  filePath: string,
  fromSection: PlanDeliverable['fromSection'],
  invertStatus: boolean
): Promise<PlanDeliverable> {
  const fullPath = join(repoRoot, filePath);
  const fileExists = existsSync(fullPath);
  let size: number | undefined;
  let lastModified: string | undefined;
  if (fileExists && !invertStatus) {
    try {
      const stats = (await import('node:fs')).statSync(fullPath);
      size = stats.size;
      lastModified = stats.mtime.toISOString();
    } catch {
      // Ignore stat errors
    }
  }
  let status: 'missing' | 'exists' | 'deleted';
  if (invertStatus) {
    status = fileExists ? 'missing' : 'deleted';
  } else {
    status = fileExists ? 'exists' : 'missing';
  }
  return { path: filePath, type: 'file', status, size, lastModified, fromSection };
}

const INLINE_FILE_KNOWN_PREFIXES = [
  'apps/',
  'packages/',
  'infra/',
  'docs/',
  'tests/',
  'scripts/',
  'artifacts/',
  '.specify/',
  '.claude/',
  '.github/',
];
const INLINE_FILE_PATTERN = /`((?:[\w@.-]+\/)+[\w.-]+\.(?:ts|tsx|json|md|js|jsx|css|yaml|yml))`/g;

async function addInlineFileReferences(
  planContent: string,
  addIfNew: (filePath: string, fromSection: PlanDeliverable['fromSection']) => Promise<void>
): Promise<void> {
  const pattern = new RegExp(INLINE_FILE_PATTERN.source, 'g');
  let match;
  while ((match = pattern.exec(planContent)) !== null) {
    const filePath = match[1];
    if (filePath.startsWith('node_modules/') || filePath.startsWith('http')) continue;
    if (!INLINE_FILE_KNOWN_PREFIXES.some((p) => filePath.startsWith(p))) continue;
    await addIfNew(filePath, 'Implementation Steps');
  }
}

async function extractDeliverablesFromPlan(
  planContent: string,
  repoRoot: string
): Promise<PlanDeliverable[]> {
  const deliverables: PlanDeliverable[] = [];

  async function addIfNew(
    filePath: string,
    fromSection: PlanDeliverable['fromSection'],
    invertStatus = false
  ): Promise<void> {
    if (deliverables.some((d) => d.path === filePath)) return;
    deliverables.push(await makeDeliverable(repoRoot, filePath, fromSection, invertStatus));
  }

  // Files to Create/Modify
  for (const pattern of [
    /\*\*Files to Create:\*\*\s*\n((?:- `[^`]+`\n?)+)/g,
    /\*\*Files to Modify:\*\*\s*\n((?:- `[^`]+`\n?)+)/g,
  ]) {
    let match;
    while ((match = pattern.exec(planContent)) !== null) {
      for (const fp of extractFilePathsFromBlock(match[1]))
        await addIfNew(fp, 'Files to Create/Modify');
    }
  }

  // Files to Delete
  const deletePattern = /\*\*Files to Delete[^:]*:\*\*\s*\n((?:- `[^`]+`\n?)+)/g;
  let deleteMatch;
  while ((deleteMatch = deletePattern.exec(planContent)) !== null) {
    for (const fp of extractFilePathsFromBlock(deleteMatch[1]))
      await addIfNew(fp, 'Files to Delete', true);
  }

  // Artifact paths
  const artifactPattern = /`(artifacts\/[^`]+)`/g;
  let artifactMatch;
  while ((artifactMatch = artifactPattern.exec(planContent)) !== null) {
    await addIfNew(artifactMatch[1], 'Artifacts');
  }

  // Test Files sections
  const testFilesPattern = /\*\*Test Files:\*\*\s*\n((?:- `[^`]+`\n?)+)/g;
  let testMatch;
  while ((testMatch = testFilesPattern.exec(planContent)) !== null) {
    for (const fp of extractFilePathsFromBlock(testMatch[1]))
      await addIfNew(fp, 'Implementation Steps');
  }

  // Inline backtick file references
  await addInlineFileReferences(planContent, addIfNew);

  return deliverables;
}

function extractCheckboxesFromPlan(planContent: string): PlanCheckboxItem[] {
  const checkboxItems: PlanCheckboxItem[] = [];
  const lines = planContent.split('\n');
  let currentPhase = 'Unknown';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    const phaseMatch = /^#{2,3}\s+(?:Phase \d+[:\s]*)?([^\n]{1,500})$/.exec(line);
    if (phaseMatch) currentPhase = phaseMatch[1].trim();

    const checkboxMatch = /^(\s*)-\s*\[([ xX])\]\s*([^\n]{1,500})$/.exec(line);
    if (checkboxMatch) {
      checkboxItems.push({
        text: checkboxMatch[3].trim(),
        checked: checkboxMatch[2].toLowerCase() === 'x',
        phase: currentPhase,
        lineNumber: i + 1,
      });
    }
  }

  return checkboxItems;
}

function calculateOverallStatus(
  deliverables: PlanDeliverable[],
  checkboxItems: PlanCheckboxItem[],
  verifiedCount: number,
  checkedCount: number
): {
  overallStatus: 'complete' | 'partial' | 'incomplete' | 'no-plan';
  completionPercentage: number;
} {
  if (deliverables.length === 0 && checkboxItems.length === 0) {
    return { overallStatus: 'incomplete', completionPercentage: 0 };
  }
  const totalItems = deliverables.length + checkboxItems.length;
  const completionPercentage = Math.round(((verifiedCount + checkedCount) / totalItems) * 100);
  let overallStatus: 'complete' | 'partial' | 'incomplete';
  if (completionPercentage === 100) {
    overallStatus = 'complete';
  } else if (completionPercentage > 0) {
    overallStatus = 'partial';
  } else {
    overallStatus = 'incomplete';
  }
  return { overallStatus, completionPercentage };
}

async function parsePlanDeliverables(
  taskId: string,
  sprintNumber: number
): Promise<PlanDeliverablesVerification | null> {
  const repoRoot = getRepoRoot();

  const possiblePaths = [
    join(
      repoRoot,
      '.specify',
      'sprints',
      `sprint-${sprintNumber}`,
      'planning',
      `${taskId}-plan.md`
    ),
    join(repoRoot, '.specify', 'sprints', `sprint-${sprintNumber}`, 'planning', `${taskId}.md`),
  ];

  let planPath: string | null = null;
  let planContent: string | null = null;

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      try {
        planContent = await readFile(path, 'utf-8');
        planPath = relative(repoRoot, path).replaceAll('\\', '/');
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

  const deliverables = await extractDeliverablesFromPlan(planContent, repoRoot);
  const checkboxItems = extractCheckboxesFromPlan(planContent);

  const verifiedCount = deliverables.filter(
    (d) => d.status === 'exists' || d.status === 'deleted'
  ).length;
  const missingCount = deliverables.filter((d) => d.status === 'missing').length;
  const checkedCount = checkboxItems.filter((c) => c.checked).length;

  const { overallStatus, completionPercentage } = calculateOverallStatus(
    deliverables,
    checkboxItems,
    verifiedCount,
    checkedCount
  );

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
async function loadMATOPSummary(
  taskId: string,
  sprintNumber: number
): Promise<MATOPExecutionSummary | null> {
  const repoRoot = getRepoRoot();
  const executionDir = join(
    repoRoot,
    '.specify',
    'sprints',
    `sprint-${sprintNumber}`,
    'execution',
    taskId
  );

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
        // Match both bare timestamp dirs (20260205-225700) and prefixed dirs (IFC-180-validation-20260205-225700)
        return statSync(fullPath).isDirectory() && /(?:^|\w{1,100}-)\d{8}-\d{6}$/.test(entry);
      })
      .sort((a, b) => a.localeCompare(b))
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
      // Match both "Consensus Verdict:** PASS" and "**Consensus: 4/4 PASS**"
      const consensusMatch = /\*?\*?Consensus(?:\s+Verdict)?:.*?\b(PASS|WARN|FAIL)\b/i.exec(
        deliveryContent
      );
      if (consensusMatch) {
        // Extract STOA results from delivery table (| STOA | Verdict | Notes |)
        const stoaResults: Record<string, import('@/lib/types').STOAVerdict> = {};
        const stoaRowRegex =
          /\|[ \t]{0,20}(Foundation|Security|Quality|Domain|Intelligence)[ \t]{0,20}\|[ \t]{0,20}(PASS|WARN|FAIL)[ \t]{0,20}\|[ \t]{0,20}([^|]{0,200})\|/gi;
        let stoaMatch;
        let stoaPassed = 0;
        let stoaTotal = 0;
        while ((stoaMatch = stoaRowRegex.exec(deliveryContent)) !== null) {
          const name = stoaMatch[1].toLowerCase();
          const verdict = stoaMatch[2].toUpperCase() as 'PASS' | 'WARN' | 'FAIL';
          stoaResults[name] = { role: 'Lead', verdict, summary: stoaMatch[3]?.trim() };
          stoaTotal++;
          if (verdict === 'PASS') stoaPassed++;
        }

        return {
          runId: runDirs[0],
          timestamp: new Date().toISOString(),
          consensusVerdict: consensusMatch[1].toUpperCase() as 'PASS' | 'WARN' | 'FAIL',
          stoaResults,
          gatesExecuted: {
            total: stoaTotal,
            passed: stoaPassed,
            warned: 0,
            failed: stoaTotal - stoaPassed,
          },
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
  // Match by name first, then fall back to command for schema-compliant attestations without name
  const matchValidation = (namePattern: string, commandPattern: string) =>
    attestation.validation_results!.find(
      (r) =>
        r.name?.toLowerCase().includes(namePattern) ||
        (!r.name && r.command?.toLowerCase().includes(commandPattern))
    );
  const typecheck = matchValidation('type', 'typecheck');
  const tests = matchValidation('test', 'vitest');
  const lint = matchValidation('lint', 'eslint');
  const build = matchValidation('build', 'build');

  const resolveStatus = (
    v: { passed?: boolean } | null | undefined
  ): 'pass' | 'fail' | 'pending' => {
    if (v?.passed === undefined) return 'pending';
    return v.passed ? 'pass' : 'fail';
  };

  items.push(
    {
      name: 'typecheck',
      status: resolveStatus(typecheck),
      exitCode: typecheck?.exit_code,
      command: typecheck?.command,
      timestamp: typecheck?.timestamp,
      duration: typecheck?.duration_ms,
    },
    {
      name: 'tests',
      status: resolveStatus(tests),
      exitCode: tests?.exit_code,
      command: tests?.command,
      timestamp: tests?.timestamp,
      duration: tests?.duration_ms,
    },
    {
      name: 'lint',
      status: resolveStatus(lint),
      exitCode: lint?.exit_code,
      command: lint?.command,
      timestamp: lint?.timestamp,
      duration: lint?.duration_ms,
    },
    {
      name: 'build',
      status: resolveStatus(build),
      exitCode: build?.exit_code,
      command: build?.command,
      timestamp: build?.timestamp,
      duration: build?.duration_ms,
    }
  );

  return items;
}

function buildLifecycleGate(
  spec: DocumentPreview,
  plan: DocumentPreview,
  contextAckExists: boolean,
  attestation: RawAttestation | null,
  blockingReasons: string[]
): CompletionGate {
  const missing: string[] = [];
  if (!spec.exists) missing.push('spec');
  if (!plan.exists) missing.push('plan');
  if (!contextAckExists) missing.push('context_ack.json');
  if (!attestation) missing.push('attestation');
  if (missing.length > 0) blockingReasons.push(`Lifecycle files missing: ${missing.join(', ')}`);
  return {
    name: 'Lifecycle Flow',
    status: missing.length === 0 ? 'pass' : 'blocked',
    details:
      missing.length === 0
        ? 'spec, plan, context_ack, attestation all present'
        : `Missing: ${missing.join(', ')}`,
    required: true,
  };
}

function buildCheckboxGate(
  planDeliverables: PlanDeliverablesVerification | null,
  blockingReasons: string[]
): CompletionGate {
  const total = planDeliverables?.checkboxes?.total ?? 0;
  const checked = planDeliverables?.checkboxes?.checked ?? 0;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 100;
  let status: GateStatus;
  if (!planDeliverables?.planExists) {
    status = 'pending';
  } else if (pct === 100) {
    status = 'pass';
  } else if (pct >= 80) {
    status = 'warn';
  } else {
    status = 'blocked';
    blockingReasons.push(`Plan checkboxes incomplete: ${checked}/${total} (${pct}%)`);
  }
  return {
    name: 'Plan Checkboxes',
    status,
    details: `${checked}/${total} (${pct}%)`,
    required: true,
  };
}

function buildArtifactGate(
  planDeliverables: PlanDeliverablesVerification | null,
  blockingReasons: string[]
): CompletionGate {
  const total = planDeliverables?.deliverables?.total ?? 0;
  const verified = planDeliverables?.deliverables?.verified ?? 0;
  const artMissing = planDeliverables?.deliverables?.missing ?? 0;
  let status: GateStatus;
  if (total === 0) {
    status = 'pending';
  } else if (artMissing === 0) {
    status = 'pass';
  } else {
    status = 'blocked';
    blockingReasons.push(`Missing artifacts: ${artMissing} files`);
  }
  return {
    name: 'Artifact Verification',
    status,
    details: `${verified}/${total} verified`,
    required: true,
  };
}

function buildBuildValidationGate(
  validationItems: BuildValidationItem[],
  blockingReasons: string[]
): { gate: CompletionGate; allPending: boolean } {
  const keys = ['typecheck', 'tests', 'lint', 'build'] as const;
  const items = keys.map((k) => validationItems.find((i) => i.name === k));
  const allPending = items.every((i) => i?.status === 'pending');
  const allPassed = items.every((i) => i?.status === 'pass');
  const anyFailed = items.some((i) => i?.status === 'fail');
  let status: GateStatus;
  if (allPending) {
    status = 'blocked';
    blockingReasons.push('Build validation not executed');
  } else if (allPassed) {
    status = 'pass';
  } else if (anyFailed) {
    status = 'blocked';
    const failed = items.filter((i) => i?.status === 'fail').map((i) => i?.name);
    blockingReasons.push(`Build validation failed: ${failed.join(', ')}`);
  } else {
    status = 'warn';
  }
  const details = allPassed
    ? 'typecheck, tests, lint, build all passed'
    : `${validationItems.filter((i) => i.status === 'pass').length}/4 passed`;
  return { gate: { name: 'Build Validation', status, details, required: true }, allPending };
}

function buildStoaGate(
  matop: MATOPExecutionSummary | null,
  allBuildPending: boolean,
  blockingReasons: string[]
): CompletionGate {
  let status: GateStatus = 'pending';
  if (!matop) {
    if (!allBuildPending) blockingReasons.push('MATOP validation not executed');
  } else if (matop.consensusVerdict === 'PASS') {
    status = 'pass';
  } else if (matop.consensusVerdict === 'WARN') {
    status = 'warn';
  } else if (matop.consensusVerdict === 'FAIL') {
    status = 'blocked';
    blockingReasons.push('MATOP consensus verdict: FAIL');
  }
  return {
    name: 'STOA Gate Pass',
    status,
    details: matop ? `Consensus: ${matop.consensusVerdict}` : 'Not executed',
    required: true,
  };
}

/**
 * Build completion gates status to help agents determine if task can be completed
 * This enforces the mandatory completion gates defined in /exec and /matop-execute
 */
function buildCompletionGates(
  validationItems: BuildValidationItem[],
  planDeliverables: PlanDeliverablesVerification | null,
  matop: MATOPExecutionSummary | null,
  attestation: RawAttestation | null,
  spec: DocumentPreview,
  plan: DocumentPreview,
  contextAckExists: boolean
): CompletionGatesStatus {
  const blockingReasons: string[] = [];

  const lifecycleGate = buildLifecycleGate(
    spec,
    plan,
    contextAckExists,
    attestation,
    blockingReasons
  );
  const checkboxGate = buildCheckboxGate(planDeliverables, blockingReasons);
  const artifactGate = buildArtifactGate(planDeliverables, blockingReasons);
  const { gate: buildGate, allPending: allBuildPending } = buildBuildValidationGate(
    validationItems,
    blockingReasons
  );
  const stoaGate = buildStoaGate(matop, allBuildPending, blockingReasons);

  const gates = [lifecycleGate, checkboxGate, artifactGate, buildGate, stoaGate];

  // Calculate overall status
  const allGatesPassed = gates.every((g) => g.status === 'pass' || g.status === 'warn');
  const anyGateBlocked = gates.some((g) => g.status === 'blocked');
  const canComplete = allGatesPassed && !anyGateBlocked;

  return {
    allGatesPassed,
    canComplete,
    gates,
    blockingReasons,
  };
}

/**
 * Build enhanced context data from attestation
 */
function buildEnhancedContext(
  attestation: RawAttestation | null,
  taskId: string
): EnhancedContextData | null {
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
    const taskRecord = await loadTaskRecord(taskId);
    const sprintNumber = taskRecord?.sprintNumber ?? 0;

    // Load all data in parallel
    const [attestation, spec, plan, matop, planDeliverables, contextAck] = await Promise.all([
      loadAttestation(taskId, sprintNumber),
      loadDocumentPreview(taskId, sprintNumber, 'spec'),
      loadDocumentPreview(taskId, sprintNumber, 'plan'),
      loadMATOPSummary(taskId, sprintNumber),
      parsePlanDeliverables(taskId, sprintNumber),
      loadContextAck(taskId, sprintNumber),
    ]);

    const coverage = await loadCoverageSummary(taskRecord?.artifactPaths ?? [], attestation);

    // Build validation items from attestation
    const validationItems = buildValidationItems(attestation);
    const allPassed = validationItems.every((i) => i.status === 'pass');
    const anyFailed = validationItems.some((i) => i.status === 'fail');
    const passOrPartial = allPassed ? 'pass' : 'partial';
    const overall = anyFailed ? 'fail' : passOrPartial;

    // Build KPI results — guard against malformed attestations where kpi_results
    // is written as an object dictionary instead of the schema-required array.
    // Schema fix enforced at tools/scripts/validate-schemas.ts; 18 historical files
    // slipped through with object shape (see memory: attestation shape drift 2026-04-14).
    const rawKpis = attestation?.kpi_results;
    const kpiResults: AttestationKPIResult[] = Array.isArray(rawKpis)
      ? rawKpis.map((r) => ({
          kpi: r.kpi,
          target: r.target,
          actual: r.actual,
          met: r.met,
        }))
      : [];

    const rawDod = attestation?.definition_of_done_items;
    const dodResults: DODItemResult[] = Array.isArray(rawDod)
      ? rawDod.map((r) => ({
          criterion: r.criterion,
          met: r.met,
          evidence: r.evidence,
        }))
      : [];

    // Build context data
    const context = buildEnhancedContext(attestation, taskId);

    // Build completion gates status for enforcement
    const completionGates = buildCompletionGates(
      validationItems,
      planDeliverables,
      matop,
      attestation,
      spec,
      plan,
      contextAck.exists
    );

    const result: TaskValidationSummary & { completionGates: CompletionGatesStatus } = {
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

      // Context ack status
      contextAck,

      // Completion gates enforcement status
      completionGates,
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
    return NextResponse.json({ error: 'Failed to load validation summary' }, { status: 500 });
  }
}
