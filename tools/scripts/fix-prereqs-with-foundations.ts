/**
 * Smart Pre-requisites Fix with Foundational Artifacts
 *
 * Strategy:
 * 1. Build a map of foundational artifacts (ADRs, playbooks, guidelines, schemas)
 * 2. Identify which tasks CREATE these foundational artifacts
 * 3. For each task, determine which foundational artifacts it should reference based on:
 *    - Its domain (security, architecture, testing, etc.)
 *    - Its dependencies (transitive inheritance)
 *    - Its description (context-aware matching)
 * 4. Include Definition of Done outputs from dependencies
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';
import { join } from 'node:path';

const CSV_PATH = join(process.cwd(), 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

// Mandatory governance files
const GOVERNANCE_FILES = [
  'artifacts/sprint0/codex-run/Framework.md',
  'tools/audit/audit-matrix.yml',
];

// Maximum files to avoid overflow
const MAX_PREREQ_FILES = 20;

// ============================================================================
// FOUNDATIONAL ARTIFACTS REGISTRY
// ============================================================================

interface FoundationalArtifact {
  file: string;
  createdBy: string;
  category:
    | 'adr'
    | 'playbook'
    | 'schema'
    | 'architecture'
    | 'security'
    | 'testing'
    | 'design'
    | 'ops'
    | 'events';
  appliesTo: string[]; // Keywords in task description that trigger inclusion
}

const FOUNDATIONAL_ARTIFACTS: FoundationalArtifact[] = [
  // ADRs
  {
    file: 'docs/planning/adr/ADR-001-modern-stack.md',
    createdBy: 'IFC-001',
    category: 'adr',
    appliesTo: ['architecture', 'stack', 'trpc', 'supabase', 'next.js', 'turborepo'],
  },
  {
    file: 'docs/planning/adr/ADR-004-multi-tenancy.md',
    createdBy: 'IFC-135',
    category: 'adr',
    appliesTo: ['tenant', 'multi-tenant', 'isolation'],
  },
  {
    file: 'docs/planning/adr/ADR-005-workflow-engine.md',
    createdBy: 'IFC-135',
    category: 'adr',
    appliesTo: ['workflow', 'engine', 'automation'],
  },
  {
    file: 'docs/planning/adr/ADR-006-agent-tools.md',
    createdBy: 'IFC-135',
    category: 'adr',
    appliesTo: ['agent', 'tool', 'ai assistant'],
  },
  {
    file: 'docs/planning/adr/ADR-007-data-governance.md',
    createdBy: 'IFC-135',
    category: 'adr',
    appliesTo: ['data', 'retention', 'classification', 'gdpr'],
  },
  {
    file: 'docs/planning/adr/ADR-008-audit-logging.md',
    createdBy: 'IFC-135',
    category: 'adr',
    appliesTo: ['audit', 'logging', 'compliance'],
  },

  // Architecture docs
  {
    file: 'docs/architecture/hex-boundaries.md',
    createdBy: 'IFC-106',
    category: 'architecture',
    appliesTo: ['hexagonal', 'ports', 'adapters', 'domain', 'application', 'repository', 'service'],
  },
  {
    file: 'docs/architecture/repo-layout.md',
    createdBy: 'IFC-106',
    category: 'architecture',
    appliesTo: ['package', 'monorepo', 'structure'],
  },
  {
    file: 'docs/planning/DDD-context-map.puml',
    createdBy: 'IFC-002',
    category: 'architecture',
    appliesTo: ['ddd', 'domain', 'bounded context', 'aggregate', 'entity'],
  },

  // Schema
  {
    file: 'packages/db/prisma/schema.prisma',
    createdBy: 'IFC-002',
    category: 'schema',
    appliesTo: ['prisma', 'database', 'schema', 'model', 'entity', 'aggregate', 'repository'],
  },

  // Security docs
  {
    file: 'docs/security/zero-trust-design.md',
    createdBy: 'IFC-072',
    category: 'security',
    appliesTo: ['security', 'zero trust', 'rls', 'authentication', 'authorization', 'mtls'],
  },
  {
    file: 'docs/security/owasp-checklist.md',
    createdBy: 'IFC-008',
    category: 'security',
    appliesTo: ['owasp', 'vulnerability', 'security scan', 'penetration'],
  },

  // Testing docs
  {
    file: 'docs/tdd-guidelines.md',
    createdBy: 'IFC-109',
    category: 'testing',
    appliesTo: ['test', 'tdd', 'coverage', 'unit test', 'integration test'],
  },
  {
    file: 'docs/shared/review-checklist.md',
    createdBy: 'IFC-109',
    category: 'testing',
    appliesTo: ['review', 'code review', 'pr'],
  },

  // Playbooks
  {
    file: 'docs/operations/engineering-playbook.md',
    createdBy: 'ENG-OPS-001',
    category: 'playbook',
    appliesTo: ['engineering', 'sdlc', 'development', 'implementation'],
  },
  {
    file: 'docs/operations/quality-gates.md',
    createdBy: 'ENG-OPS-001',
    category: 'playbook',
    appliesTo: ['quality', 'gate', 'ci', 'pipeline'],
  },
  {
    file: 'docs/operations/pr-checklist.md',
    createdBy: 'ENG-OPS-001',
    category: 'playbook',
    appliesTo: ['pr', 'pull request', 'merge'],
  },
  {
    file: 'docs/operations/release-rollback.md',
    createdBy: 'ENG-OPS-001',
    category: 'playbook',
    appliesTo: ['release', 'rollback', 'deployment'],
  },
  {
    file: 'docs/operations/project-playbook.md',
    createdBy: 'PM-OPS-001',
    category: 'ops',
    appliesTo: ['project', 'sprint', 'backlog', 'planning'],
  },

  // Governance
  {
    file: 'docs/architecture/adr/000-template.md',
    createdBy: 'GOV-001',
    category: 'adr',
    appliesTo: ['adr', 'architecture decision'],
  },
  {
    file: 'docs/architecture/decision-workflow.md',
    createdBy: 'GOV-001',
    category: 'adr',
    appliesTo: ['decision', 'architecture', 'governance'],
  },

  // Design system
  {
    file: 'docs/design-system/token-mapping.md',
    createdBy: 'BRAND-002',
    category: 'design',
    appliesTo: ['design', 'token', 'tailwind', 'shadcn', 'theme', 'ui component'],
  },
  {
    file: 'docs/company/brand/visual-identity.md',
    createdBy: 'BRAND-001',
    category: 'design',
    appliesTo: ['brand', 'visual', 'design', 'ui', 'frontend'],
  },

  // Events infrastructure
  {
    file: 'docs/events/contracts-v1.yaml',
    createdBy: 'IFC-150',
    category: 'events',
    appliesTo: ['event', 'domain event', 'publish', 'subscribe', 'outbox'],
  },
  {
    file: 'docs/operations/runbooks/dlq-triage.md',
    createdBy: 'IFC-151',
    category: 'events',
    appliesTo: ['dlq', 'dead letter', 'retry', 'consumer'],
  },
];

// ============================================================================
// TASK ANALYSIS
// ============================================================================

interface OriginalTask {
  taskId: string;
  description: string;
  section: string;
  definitionOfDone: string;
  originalPrereqs: string;
  dependencies: string[];
  artifacts: string[];
}

/**
 * Parse artifacts from the "Artifacts To Track" column
 */
function parseArtifacts(artifacts: string): string[] {
  if (!artifacts) return [];
  return artifacts
    .split(/[,;]/)
    .map((a) => a.trim().replace(/^ARTIFACT:/, ''))
    .filter((a) => a && !a.includes('*') && a.includes('.'));
}

/**
 * Check if a task description matches keywords for a foundational artifact
 */
function matchesKeywords(description: string, keywords: string[]): boolean {
  const lower = description.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Get foundational artifacts that apply to a task based on its description
 */
function getApplicableFoundations(
  taskId: string,
  description: string,
  section: string,
  completedTasks: Set<string>
): string[] {
  const foundations: string[] = [];

  for (const artifact of FOUNDATIONAL_ARTIFACTS) {
    // Only include if the creating task is completed or is a dependency
    if (!completedTasks.has(artifact.createdBy)) continue;

    // Check if task description matches artifact keywords
    if (matchesKeywords(description, artifact.appliesTo)) {
      foundations.push(artifact.file);
    }

    // Section-based matching
    const sectionLower = section.toLowerCase();
    if (artifact.category === 'security' && sectionLower.includes('security')) {
      foundations.push(artifact.file);
    }
    if (
      artifact.category === 'testing' &&
      (sectionLower.includes('testing') || sectionLower.includes('validation'))
    ) {
      foundations.push(artifact.file);
    }
    if (artifact.category === 'architecture' && sectionLower.includes('architecture')) {
      foundations.push(artifact.file);
    }
  }

  return [...new Set(foundations)];
}

/**
 * Get all completed tasks (transitively through dependencies)
 */
function getCompletedTasksUpToTask(
  taskId: string,
  taskMap: Map<string, OriginalTask>,
  completedStatuses: Map<string, boolean>
): Set<string> {
  const completed = new Set<string>();

  function traverse(id: string, visited: Set<string>) {
    if (visited.has(id)) return;
    visited.add(id);

    const task = taskMap.get(id);
    if (!task) return;

    // Add this task if completed
    if (completedStatuses.get(id)) {
      completed.add(id);
    }

    // Traverse dependencies
    for (const depId of task.dependencies) {
      traverse(depId, visited);
    }
  }

  // Traverse all dependencies of this task
  const task = taskMap.get(taskId);
  if (task) {
    for (const depId of task.dependencies) {
      traverse(depId, new Set());
    }
  }

  // Also add all tasks that are marked as completed
  for (const [id, isCompleted] of completedStatuses) {
    if (isCompleted) completed.add(id);
  }

  return completed;
}

/**
 * Classify a plain-text requirement into POLICY:, ENV:, or FILE:
 */
function classifyRequirement(
  req: string
): { type: 'POLICY' | 'ENV' | 'FILE'; value: string } | null {
  const lower = req.toLowerCase().trim();
  if (!lower) return null;

  // Known software/tool names that should NOT be treated as files
  const knownTools = ['node.js', 'next.js', 'vue.js', 'react.js', 'nuxt.js', 'express.js'];
  for (const tool of knownTools) {
    if (lower.includes(tool)) {
      return { type: 'ENV', value: req.trim() };
    }
  }

  // File references
  if (lower.includes('/') || lower.includes('\\')) {
    const fileMatch = req.match(/([a-zA-Z0-9_./-]+\/[a-zA-Z0-9_./-]+\.[a-z]{2,5})/);
    if (fileMatch) {
      return { type: 'FILE', value: fileMatch[1] };
    }
  }

  // Environment/Access requirements
  if (
    lower.includes('access') ||
    lower.includes('account') ||
    lower.includes('key') ||
    lower.includes('license') ||
    lower.includes('api key') ||
    lower.includes('installed') ||
    lower.includes('configured') ||
    lower.includes('setup') ||
    lower.includes('ready') ||
    lower.includes('provisioned') ||
    lower.includes('credentials') ||
    lower.includes('enabled')
  ) {
    return { type: 'ENV', value: req.trim() };
  }

  // Policy/Approval requirements
  if (
    lower.includes('approved') ||
    lower.includes('complete') ||
    lower.includes('defined') ||
    lower.includes('identified') ||
    lower.includes('evaluated') ||
    lower.includes('selected') ||
    lower.includes('strategy') ||
    lower.includes('vision') ||
    lower.includes('alignment') ||
    lower.includes('requirements') ||
    lower.includes('checklist') ||
    lower.includes('mapped') ||
    lower.includes('established') ||
    lower.includes('documented') ||
    lower.includes('agreed')
  ) {
    return { type: 'POLICY', value: req.trim() };
  }

  // Default to ENV
  return { type: 'ENV', value: req.trim() };
}

/**
 * Get primary artifact from dependency (first non-wildcard file)
 */
function getPrimaryArtifact(artifacts: string[]): string | null {
  for (const artifact of artifacts) {
    if (!artifact.includes('*') && artifact.includes('.')) {
      return artifact;
    }
  }
  return null;
}

// ============================================================================
// CSV PROCESSING
// ============================================================================

function escapeField(value: string): string {
  if (!value) return '""';
  const needsQuotes =
    value.includes(',') || value.includes('"') || value.includes('\n') || value.includes(';');
  const escaped = value.replace(/\"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function stringifyCsv(tasks: Record<string, string>[], headers: string[]): string {
  const headerRow = headers.map(escapeField).join(',');
  const dataRows = tasks.map((task) => headers.map((h) => escapeField(task[h] || '')).join(','));
  return [headerRow, ...dataRows].join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('=== Smart Pre-requisites Fix with Foundational Artifacts ===\n');

  // Read current CSV
  console.log('Reading current CSV...');
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const currentTasks = parse(csvContent, {
    columns: true,
    bom: true,
    relax_quotes: true,
  }) as Record<string, string>[];
  console.log(`Found ${currentTasks.length} tasks\n`);

  // Get original CSV from git
  console.log('Fetching original CSV from git...');
  const gitOutput = execSync(
    'git show HEAD:"apps/project-tracker/docs/metrics/_global/Sprint_plan.csv"',
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );
  const originalTasks = parse(gitOutput, {
    columns: true,
    bom: true,
    relax_quotes: true,
  }) as Record<string, string>[];
  console.log(`Found ${originalTasks.length} tasks in original CSV\n`);

  // Build task map
  const taskMap = new Map<string, OriginalTask>();
  const completedStatuses = new Map<string, boolean>();
  const artifactsMap = new Map<string, string[]>();

  for (const task of originalTasks) {
    const taskId = task['Task ID'];
    const deps = (task['Dependencies'] || '')
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d);
    const artifacts = parseArtifacts(task['Artifacts To Track'] || '');

    taskMap.set(taskId, {
      taskId,
      description: task['Description'] || '',
      section: task['Section'] || '',
      definitionOfDone: task['Definition of Done'] || '',
      originalPrereqs: task['Pre-requisites'] || '',
      dependencies: deps,
      artifacts,
    });

    completedStatuses.set(taskId, (task['Status'] || '').toLowerCase() === 'completed');
    artifactsMap.set(taskId, artifacts);
  }

  // Process each task
  console.log('Processing tasks with foundational artifacts...\n');
  let updated = 0;

  for (const task of currentTasks) {
    const taskId = task['Task ID'];
    const original = taskMap.get(taskId);

    if (!original) {
      console.log(`  WARN: No original data for ${taskId}`);
      continue;
    }

    const prereqs: string[] = [];

    // 1. Always add mandatory governance files
    for (const file of GOVERNANCE_FILES) {
      prereqs.push(`FILE:${file}`);
    }

    // 2. Convert original plain-text requirements
    const origParts = original.originalPrereqs
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p);
    for (const part of origParts) {
      const classified = classifyRequirement(part);
      if (classified) {
        prereqs.push(`${classified.type}:${classified.value}`);
      }
    }

    // 3. Get completed tasks (for foundational artifact eligibility)
    const completedTasks = getCompletedTasksUpToTask(taskId, taskMap, completedStatuses);

    // 4. Add foundational artifacts based on task context
    const foundations = getApplicableFoundations(
      taskId,
      original.description,
      original.section,
      completedTasks
    );
    for (const file of foundations) {
      prereqs.push(`FILE:${file}`);
    }

    // 5. Add primary artifacts from direct dependencies
    for (const depId of original.dependencies) {
      const depArtifacts = artifactsMap.get(depId);
      if (depArtifacts) {
        const primary = getPrimaryArtifact(depArtifacts);
        if (primary) {
          prereqs.push(`FILE:${primary}`);
        }
      }
    }

    // Deduplicate and limit
    const unique = [...new Set(prereqs)].slice(0, MAX_PREREQ_FILES);
    const newPrereqs = unique.join(';');

    const oldPrereqs = task['Pre-requisites'];
    if (newPrereqs !== oldPrereqs) {
      task['Pre-requisites'] = newPrereqs;
      updated++;
    }
  }

  console.log(`Updated ${updated} tasks\n`);

  // Write back
  const headers = Object.keys(currentTasks[0]);
  const output = stringifyCsv(currentTasks, headers);
  writeFileSync(CSV_PATH, output, 'utf-8');
  console.log(`Written to: ${CSV_PATH}\n`);

  // Show detailed samples
  console.log('=== Sample Tasks with Foundational Artifacts ===\n');

  const sampleIds = [
    'IFC-003', // tRPC API - should get schema.prisma, ADR-001
    'IFC-106', // Hex boundaries - architecture task
    'IFC-107', // Repositories - should get hex-boundaries, schema
    'IFC-110', // Tests - should get tdd-guidelines
    'IFC-127', // Tenant isolation - should get zero-trust, ADR-004
    'IFC-136', // Case aggregate - should get schema, hex-boundaries
  ];

  for (const id of sampleIds) {
    const task = currentTasks.find((t) => t['Task ID'] === id);
    const orig = taskMap.get(id);
    if (task && orig) {
      console.log(`${'='.repeat(70)}`);
      console.log(`Task: ${id} - ${orig.description.substring(0, 50)}...`);
      console.log(`Section: ${orig.section}`);
      console.log(`Deps: [${orig.dependencies.join(', ')}]`);
      console.log(`\nPre-requisites:`);
      const prereqParts = task['Pre-requisites'].split(';');
      for (const part of prereqParts) {
        const isFoundation = FOUNDATIONAL_ARTIFACTS.some((f) => part.includes(f.file));
        console.log(`  ${isFoundation ? '[F]' : '   '} ${part}`);
      }
      console.log('');
    }
  }
}

main().catch(console.error);
