/**
 * Intelligent Pre-requisites Fix
 *
 * This script analyzes each task individually based on:
 * 1. Task description - what is this task doing?
 * 2. Definition of Done - what needs to be produced?
 * 3. Dependencies - what tasks must complete first?
 * 4. Original pre-requisites - what tools/access/policies are needed?
 *
 * It then builds smart pre-requisites by understanding the context.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';
import { join } from 'node:path';

const CSV_PATH = join(process.cwd(), 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

// Mandatory governance files
const GOVERNANCE_FILES = [
  'artifacts/sprint0/codex-run/Framework.md',
  'audit-matrix.yml',
];

// ============================================================================
// TASK-SPECIFIC PRE-REQUISITES MAPPING
// ============================================================================

interface TaskAnalysis {
  taskId: string;
  prereqs: string[];
}

/**
 * Analyze a task and return its smart pre-requisites.
 * This is where the intelligence lives - each task is analyzed individually.
 */
function analyzeTask(
  taskId: string,
  description: string,
  definitionOfDone: string,
  originalPrereqs: string,
  dependencies: string[],
  depArtifacts: Map<string, string[]>
): TaskAnalysis {
  const prereqs: string[] = [];

  // Always add governance files
  prereqs.push(`FILE:${GOVERNANCE_FILES[0]}`);
  prereqs.push(`FILE:${GOVERNANCE_FILES[1]}`);

  // Parse original pre-requisites
  const origParts = originalPrereqs
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p);

  // Analyze each original requirement
  for (const part of origParts) {
    const lower = part.toLowerCase();

    // Skip empty
    if (!lower) continue;

    // Identify ENV requirements (tools, access, setup)
    if (isEnvironmentRequirement(lower)) {
      prereqs.push(`ENV:${part}`);
      continue;
    }

    // Identify POLICY requirements (approvals, decisions, completions)
    if (isPolicyRequirement(lower)) {
      prereqs.push(`POLICY:${part}`);
      continue;
    }

    // Default: treat as ENV
    prereqs.push(`ENV:${part}`);
  }

  // Add relevant files from dependencies based on what THIS task needs
  // Max 20 inherited files total for comprehensive coverage
  const MAX_TOTAL_INHERITED = 20;
  let inheritedCount = 0;

  for (const depId of dependencies) {
    if (inheritedCount >= MAX_TOTAL_INHERITED) break;

    const depFiles = depArtifacts.get(depId);
    if (!depFiles) continue;

    // Get the most relevant file(s) from the dependency
    const relevantFiles = getRelevantFilesForTask(taskId, description, depFiles);
    for (const file of relevantFiles) {
      if (inheritedCount >= MAX_TOTAL_INHERITED) break;
      prereqs.push(`FILE:${file}`);
      inheritedCount++;
    }
  }

  // Deduplicate
  const unique = [...new Set(prereqs)];

  return { taskId, prereqs: unique };
}

/**
 * Check if a requirement is an environment requirement (tool, access, setup)
 */
function isEnvironmentRequirement(lower: string): boolean {
  const envKeywords = [
    'installed',
    'configured',
    'setup',
    'ready',
    'active',
    'access',
    'account',
    'key',
    'api key',
    'license',
    'provisioned',
    'enabled',
    'running',
    'available',
    'node.js',
    'next.js',
    'typescript',
    'docker',
    'redis',
    'openai',
    'langchain',
    'supabase',
    'github',
    'copilot',
    'k6',
    'vitest',
    'playwright',
    'prisma',
    'trpc',
    'turborepo',
    'pnpm',
    'npm',
    'eslint',
    'prettier',
    'docusaurus',
    'grafana',
    'prometheus',
    'easypanel',
    'tailscale',
    'cloudflare',
    'bullmq',
    'zep',
  ];

  return envKeywords.some((kw) => lower.includes(kw));
}

/**
 * Check if a requirement is a policy requirement (approval, decision, completion)
 */
function isPolicyRequirement(lower: string): boolean {
  const policyKeywords = [
    'approved',
    'complete',
    'completed',
    'defined',
    'identified',
    'evaluated',
    'selected',
    'aligned',
    'vision',
    'strategy',
    'requirements',
    'checklist',
    'mapped',
    'verified',
    'validated',
    'analyzed',
    'researched',
    'designed',
    'documented',
    'reviewed',
    'tested',
    'integrated',
    'rules',
    'assessment',
    'budget',
  ];

  return policyKeywords.some((kw) => lower.includes(kw));
}

/**
 * Get relevant files from dependency based on what the current task needs.
 * This is context-aware: a task about "tRPC" will want the schema, not the docker file.
 */
function getRelevantFilesForTask(
  taskId: string,
  description: string,
  depFiles: string[]
): string[] {
  const lower = description.toLowerCase();
  const relevant: string[] = [];

  // Filter to max 5 most relevant files per dependency (increased for better coverage)
  let count = 0;
  const maxPerDep = 5;

  for (const file of depFiles) {
    if (count >= maxPerDep) break;

    // Skip wildcards
    if (file.includes('*')) continue;

    // Skip if no extension (probably a directory)
    if (!file.includes('.')) continue;

    const fileLower = file.toLowerCase();

    // Score relevance based on task context
    let isRelevant = false;

    // Database/Prisma tasks want schema
    if (
      (lower.includes('prisma') || lower.includes('database') || lower.includes('schema')) &&
      fileLower.includes('schema.prisma')
    ) {
      isRelevant = true;
    }

    // tRPC tasks want router/trpc files
    if (lower.includes('trpc') && (fileLower.includes('trpc') || fileLower.includes('router'))) {
      isRelevant = true;
    }

    // Frontend tasks want component files
    if (
      (lower.includes('frontend') || lower.includes('ui') || lower.includes('next.js')) &&
      (fileLower.includes('components') || fileLower.includes('app/'))
    ) {
      isRelevant = true;
    }

    // Docker/infra tasks want docker-compose
    if (
      (lower.includes('docker') || lower.includes('container')) &&
      fileLower.includes('docker-compose')
    ) {
      isRelevant = true;
    }

    // CI/CD tasks want workflow files
    if (
      (lower.includes('ci/cd') || lower.includes('pipeline') || lower.includes('github actions')) &&
      fileLower.includes('workflows/')
    ) {
      isRelevant = true;
    }

    // Monitoring/observability tasks want otel/monitoring configs
    if (
      (lower.includes('monitoring') || lower.includes('observability') || lower.includes('otel')) &&
      (fileLower.includes('otel') || fileLower.includes('monitoring'))
    ) {
      isRelevant = true;
    }

    // Testing tasks want test files or coverage
    if (
      (lower.includes('test') || lower.includes('coverage') || lower.includes('e2e')) &&
      (fileLower.includes('test') || fileLower.includes('coverage'))
    ) {
      isRelevant = true;
    }

    // Security tasks want security configs
    if (
      (lower.includes('security') || lower.includes('owasp')) &&
      (fileLower.includes('security') || fileLower.includes('compliance'))
    ) {
      isRelevant = true;
    }

    // LangChain/AI tasks want chains/agents
    if (
      (lower.includes('langchain') || lower.includes('ai ') || lower.includes('agent')) &&
      (fileLower.includes('chain') ||
        fileLower.includes('agent') ||
        fileLower.includes('ai-worker'))
    ) {
      isRelevant = true;
    }

    // Supabase tasks want supabase config
    if (lower.includes('supabase') && fileLower.includes('supabase')) {
      isRelevant = true;
    }

    // Monorepo tasks want turbo.json
    if (
      lower.includes('monorepo') &&
      (fileLower.includes('turbo') || fileLower.includes('pnpm-workspace'))
    ) {
      isRelevant = true;
    }

    // Feature flags tasks want flag configs
    if (lower.includes('feature flag') && fileLower.includes('feature-flag')) {
      isRelevant = true;
    }

    // Documentation tasks want docs
    if (lower.includes('documentation') && fileLower.includes('docs/')) {
      isRelevant = true;
    }

    // Integration testing wants multiple types
    if (lower.includes('integration test') || lower.includes('integration testing')) {
      if (
        fileLower.includes('test') ||
        fileLower.includes('integration') ||
        fileLower.includes('coverage') ||
        fileLower.includes('docker-compose')
      ) {
        isRelevant = true;
      }
    }

    // If still no match, take the first non-wildcard file as fallback
    if (!isRelevant && count === 0) {
      isRelevant = true;
    }

    if (isRelevant) {
      relevant.push(file);
      count++;
    }
  }

  return relevant;
}

/**
 * Parse artifacts string into array of file paths
 */
function parseArtifacts(artifacts: string): string[] {
  if (!artifacts) return [];
  return artifacts
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a && !a.includes('*') && a.includes('.'));
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
  console.log('=== Intelligent Pre-requisites Fix ===\n');

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

  // Build maps
  const originalMap = new Map<string, Record<string, string>>();
  const depArtifactsMap = new Map<string, string[]>();

  for (const task of originalTasks) {
    const taskId = task['Task ID'];
    originalMap.set(taskId, task);
    depArtifactsMap.set(taskId, parseArtifacts(task['Artifacts To Track'] || ''));
  }

  // Process each task
  console.log('Analyzing tasks intelligently...\n');
  let updated = 0;

  for (const task of currentTasks) {
    const taskId = task['Task ID'];
    const original = originalMap.get(taskId);

    if (!original) {
      console.log(`  WARN: No original data for ${taskId}`);
      continue;
    }

    // Parse dependencies
    const deps = (original['Dependencies'] || '')
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d);

    // Analyze this task
    const analysis = analyzeTask(
      taskId,
      original['Description'] || '',
      original['Definition of Done'] || '',
      original['Pre-requisites'] || '',
      deps,
      depArtifactsMap
    );

    const newPrereqs = analysis.prereqs.join(';');
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
  console.log('=== Detailed Analysis Samples ===\n');

  const sampleIds = [
    'EXC-INIT-001', // No deps
    'AI-SETUP-001', // Depends on EXC-INIT-001
    'ENV-006-AI', // Prisma, depends on ENV-004-AI (Supabase)
    'ENV-007-AI', // tRPC, depends on ENV-006-AI (Prisma)
    'IFC-003', // tRPC API, depends on IFC-002 (DDD)
    'ENV-013-AI', // Security, multiple deps
    'ENV-017-AI', // Integration testing, 5 deps
  ];

  for (const id of sampleIds) {
    const task = currentTasks.find((t) => t['Task ID'] === id);
    const orig = originalMap.get(id);
    if (task && orig) {
      console.log(`${'='.repeat(60)}`);
      console.log(`Task: ${id}`);
      console.log(`Description: ${orig['Description']?.substring(0, 80)}...`);
      console.log(
        `Deps: [${(orig['Dependencies'] || '')
          .split(',')
          .map((d) => d.trim())
          .filter((d) => d)
          .join(', ')}]`
      );
      console.log(`Original prereqs: "${orig['Pre-requisites']}"`);
      console.log(`\nNew prereqs:`);
      const prereqParts = task['Pre-requisites'].split(';');
      for (const part of prereqParts) {
        console.log(`  - ${part}`);
      }
      console.log('');
    }
  }
}

main().catch(console.error);
