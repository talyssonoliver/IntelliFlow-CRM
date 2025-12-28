/**
 * Fix CSV v3 - Correct Implementation
 *
 * 1. FILE: only specific files (no wildcards)
 * 2. EVIDENCE: literal paths with {TASK_ID} template
 * 3. VALIDATE: executable commands, GATE: thresholds, AUDIT: manual reviews
 * 4. Owner: "Original Owner (STOA-Role)"
 * 5. Remove CrossQuarterDeps and CleanDependencies
 * 6. Add mandatory governance files
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { join } from 'node:path';

const CSV_PATH = join(process.cwd(), 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

// ============================================================================
// MANDATORY GOVERNANCE FILES (actual file paths)
// ============================================================================

const MANDATORY_FILES = [
  'artifacts/sprint0/codex-run/Framework.md',
  'tools/audit/audit-matrix.yml',
];

// ============================================================================
// STOA ROLE MAPPING
// ============================================================================

function getSTOARole(owner: string): string {
  const lower = owner.toLowerCase();

  if (lower.includes('ceo') || lower.includes('cfo') || lower.includes('leadership')) {
    return 'STOA-Leadership';
  }
  if (lower.includes('security')) {
    return 'STOA-Security';
  }
  if (lower.includes('qa') || lower.includes('test') || lower.includes('performance')) {
    return 'STOA-Quality';
  }
  if (
    lower.includes('ai') ||
    lower.includes('ml') ||
    lower.includes('langchain') ||
    lower.includes('data scientist')
  ) {
    return 'STOA-Intelligence';
  }
  if (
    lower.includes('devops') ||
    lower.includes('automation') ||
    lower.includes('copilot') ||
    lower.includes('claude')
  ) {
    return 'STOA-Automation';
  }
  if (lower.includes('frontend') || lower.includes('backend') || lower.includes('support')) {
    return 'STOA-Domain';
  }
  return 'STOA-Foundation';
}

// ============================================================================
// EVIDENCE PATH TEMPLATES
// ============================================================================

const EVIDENCE_TYPES: Record<string, string> = {
  context_ack: 'artifacts/attestations/{TASK_ID}/context_ack.json',
  test_output: 'artifacts/attestations/{TASK_ID}/test_output.json',
  config_snapshot: 'artifacts/attestations/{TASK_ID}/config_snapshot.json',
  documentation: 'artifacts/attestations/{TASK_ID}/documentation.json',
  security_scan: 'artifacts/attestations/{TASK_ID}/security_scan.json',
  benchmark_results: 'artifacts/attestations/{TASK_ID}/benchmark_results.json',
  analysis_report: 'artifacts/attestations/{TASK_ID}/analysis_report.json',
  visual_proof: 'artifacts/attestations/{TASK_ID}/visual_proof.png',
  migration_log: 'artifacts/attestations/{TASK_ID}/migration_log.json',
  integration_log: 'artifacts/attestations/{TASK_ID}/integration_log.json',
  execution_log: 'artifacts/attestations/{TASK_ID}/execution_log.json',
};

// ============================================================================
// VALIDATION COMMANDS (actual executable)
// ============================================================================

const VALIDATION_COMMANDS: Record<string, string> = {
  test: 'pnpm test',
  tests: 'pnpm test',
  'unit test': 'pnpm test:unit',
  integration: 'pnpm test:integration',
  e2e: 'pnpm test:e2e',
  playwright: 'pnpm test:e2e',
  lint: 'pnpm lint',
  build: 'pnpm build',
  typecheck: 'pnpm typecheck',
  'type check': 'pnpm typecheck',
};

const GATE_THRESHOLDS: Record<string, string> = {
  'coverage >90': 'coverage-gte-90',
  'coverage >80': 'coverage-gte-80',
  coverage: 'coverage-gte-90',
  'lighthouse >90': 'lighthouse-gte-90',
  lighthouse: 'lighthouse-gte-90',
  'response <': 'response-time-check',
  latency: 'latency-check',
  p95: 'p95-latency-check',
  p99: 'p99-latency-check',
  'security scan': 'security-scan-pass',
  vulnerability: 'security-scan-pass',
  accessibility: 'accessibility-check',
};

const AUDIT_TYPES: Record<string, string> = {
  'code review': 'code-review',
  'security review': 'security-review',
  'design review': 'design-review',
  'domain review': 'domain-review',
  'ai review': 'ai-review',
  'manual review': 'manual-review',
  review: 'code-review',
};

// ============================================================================
// CONVERSION FUNCTIONS
// ============================================================================

function convertPrerequisites(prereqs: string, taskId: string): string {
  if (!prereqs || prereqs.trim() === '') {
    // Minimum: governance files
    return MANDATORY_FILES.map((f) => `FILE:${f}`).join(';');
  }

  const tags: string[] = [];

  // Always add mandatory governance files first
  for (const file of MANDATORY_FILES) {
    tags.push(`FILE:${file}`);
  }

  // Parse existing content for specific file references
  const parts = prereqs
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p);

  for (const part of parts) {
    // Skip vague requirements like "Budget approved"
    if (
      part.includes('approved') ||
      part.includes('access') ||
      part.includes('ready') ||
      part.includes('configured') ||
      part.includes('selected') ||
      part.includes('licenses')
    ) {
      continue;
    }

    // Extract specific file paths mentioned
    const filePatterns = [
      /schema\.prisma/i,
      /config\.toml/i,
      /\.env/i,
      /package\.json/i,
      /tsconfig/i,
      /turbo\.json/i,
      /pnpm-workspace/i,
      /docker-compose/i,
      /\.github\/workflows/i,
      /vitest\.config/i,
      /playwright\.config/i,
    ];

    for (const pattern of filePatterns) {
      if (pattern.test(part)) {
        // Map to actual file path
        if (/schema\.prisma/i.test(part)) tags.push('FILE:packages/db/prisma/schema.prisma');
        if (/config\.toml/i.test(part)) tags.push('FILE:supabase/config.toml');
        if (/turbo\.json/i.test(part)) tags.push('FILE:turbo.json');
        if (/pnpm-workspace/i.test(part)) tags.push('FILE:pnpm-workspace.yaml');
        if (/vitest\.config/i.test(part)) tags.push('FILE:vitest.config.ts');
        if (/playwright\.config/i.test(part)) tags.push('FILE:playwright.config.ts');
      }
    }
  }

  // Deduplicate
  return [...new Set(tags)].join(';');
}

function convertArtifacts(artifacts: string, taskId: string): string {
  if (!artifacts || artifacts.trim() === '') {
    return `EVIDENCE:artifacts/attestations/${taskId}/context_ack.json`;
  }

  const tags: string[] = [];
  const paths = artifacts
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p);

  for (const path of paths) {
    // Skip wildcards - we need specific files
    if (path.includes('*')) {
      // Try to infer a specific file from the pattern
      // e.g., "apps/web/*" -> skip (too vague)
      // e.g., "docs/*.md" -> skip (too vague)
      continue;
    }

    // Keep specific file paths
    if (path.includes('/') || path.includes('.')) {
      tags.push(`ARTIFACT:${path}`);
    }
  }

  // Always add context_ack evidence with actual path
  tags.push(`EVIDENCE:artifacts/attestations/${taskId}/context_ack.json`);

  // Deduplicate
  return [...new Set(tags)].join(';');
}

function convertValidation(validation: string, taskId: string): string {
  if (!validation || validation.trim() === '') {
    return 'AUDIT:manual-review';
  }

  const tags: string[] = [];
  const lower = validation.toLowerCase();

  // Find VALIDATE commands
  for (const [keyword, command] of Object.entries(VALIDATION_COMMANDS)) {
    if (lower.includes(keyword)) {
      tags.push(`VALIDATE:${command}`);
    }
  }

  // Find GATE thresholds
  for (const [keyword, gate] of Object.entries(GATE_THRESHOLDS)) {
    if (lower.includes(keyword)) {
      tags.push(`GATE:${gate}`);
    }
  }

  // Find AUDIT types
  for (const [keyword, audit] of Object.entries(AUDIT_TYPES)) {
    if (lower.includes(keyword)) {
      tags.push(`AUDIT:${audit}`);
    }
  }

  // Default if nothing matched
  if (tags.length === 0) {
    tags.push('AUDIT:manual-review');
  }

  // Deduplicate
  return [...new Set(tags)].join(';');
}

function combineOwnerWithRole(owner: string): string {
  if (!owner || owner.trim() === '') return 'TBD (STOA-Foundation)';

  // Check if already has STOA role
  if (owner.includes('STOA-')) return owner;

  const role = getSTOARole(owner);
  return `${owner} (${role})`;
}

// ============================================================================
// CSV STRINGIFY
// ============================================================================

function escapeField(value: string): string {
  if (!value) return '""';
  const needsQuotes =
    value.includes(',') || value.includes('"') || value.includes('\n') || value.includes(';');
  const escaped = value.replace(/"/g, '""');
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
  console.log('Reading CSV...');
  const csvContent = readFileSync(CSV_PATH, 'utf-8');

  console.log('Parsing CSV...');
  const tasks = parse(csvContent, { columns: true, bom: true, relax_quotes: true }) as Record<
    string,
    string
  >[];

  console.log(`Found ${tasks.length} tasks\n`);

  // Remove deprecated columns
  const originalHeaders = Object.keys(tasks[0]);
  const headers = originalHeaders.filter(
    (h) => h !== 'CrossQuarterDeps' && h !== 'CleanDependencies'
  );

  console.log('=== Removing deprecated columns ===');
  console.log(`Removed: CrossQuarterDeps, CleanDependencies`);

  let prereqsConverted = 0;
  let artifactsConverted = 0;
  let validationConverted = 0;
  let ownersUpdated = 0;

  for (const task of tasks) {
    const taskId = task['Task ID'];

    // Convert Pre-requisites
    const oldPrereqs = task['Pre-requisites'] || '';
    const newPrereqs = convertPrerequisites(oldPrereqs, taskId);
    if (newPrereqs !== oldPrereqs) {
      task['Pre-requisites'] = newPrereqs;
      prereqsConverted++;
    }

    // Convert Artifacts
    const oldArtifacts = task['Artifacts To Track'] || '';
    const newArtifacts = convertArtifacts(oldArtifacts, taskId);
    if (newArtifacts !== oldArtifacts) {
      task['Artifacts To Track'] = newArtifacts;
      artifactsConverted++;
    }

    // Convert Validation
    const oldValidation = task['Validation Method'] || '';
    const newValidation = convertValidation(oldValidation, taskId);
    if (newValidation !== oldValidation) {
      task['Validation Method'] = newValidation;
      validationConverted++;
    }

    // Combine Owner with STOA role
    const oldOwner = task['Owner'] || '';
    const newOwner = combineOwnerWithRole(oldOwner);
    if (newOwner !== oldOwner) {
      task['Owner'] = newOwner;
      ownersUpdated++;
    }

    // Remove deprecated columns
    delete task['CrossQuarterDeps'];
    delete task['CleanDependencies'];
  }

  console.log('\n=== Conversion Summary ===');
  console.log(`Pre-requisites converted: ${prereqsConverted}`);
  console.log(`Artifacts converted: ${artifactsConverted}`);
  console.log(`Validation converted: ${validationConverted}`);
  console.log(`Owners updated: ${ownersUpdated}`);

  // Write back
  const output = stringifyCsv(tasks, headers);
  writeFileSync(CSV_PATH, output, 'utf-8');
  console.log(`\nWritten to: ${CSV_PATH}`);

  // Verification
  console.log('\n=== Verification ===');

  // Sample tasks
  console.log('\n--- Sample Tasks ---');
  for (const task of tasks.slice(0, 3)) {
    console.log(`\n${task['Task ID']}:`);
    console.log(`  Owner: ${task['Owner']}`);
    console.log(`  Pre-reqs: ${task['Pre-requisites']}`);
    console.log(`  Artifacts: ${task['Artifacts To Track']?.substring(0, 80)}...`);
    console.log(`  Validation: ${task['Validation Method']}`);
  }
}

main().catch(console.error);
