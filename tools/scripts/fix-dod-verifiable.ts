/**
 * Fix Definition of Done to be Verifiable
 *
 * Strategy:
 * 1. Analyze each task's DOD, KPIs, Artifacts, and Validation Method
 * 2. Convert vague DOD into verifiable criteria with artifact references
 * 3. Ensure KPIs are measurable (numbers, percentages, time limits)
 * 4. Ensure Validation Method can actually verify the DOD
 * 5. Flag inconsistencies between Status and DOD verifiability
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';
import { join } from 'node:path';

const CSV_PATH = join(process.cwd(), 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

// ============================================================================
// DOD VERIFICATION RULES
// ============================================================================

interface DoDVerification {
  hasArtifactRef: boolean; // DOD references specific files
  hasMeasurableCriteria: boolean; // DOD has numbers/percentages
  hasTestableAssertion: boolean; // DOD can be tested (pass/fail)
  matchesValidation: boolean; // Validation Method can verify DOD
  matchesKPIs: boolean; // KPIs align with DOD
}

/**
 * Check if DOD references artifacts
 */
function hasArtifactReference(dod: string, artifacts: string): boolean {
  // Check if DOD mentions file patterns or artifact names
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
    /artifact/i,
    /file/i,
    /document/i,
    /report/i,
    /schema/i,
    /config/i,
    /template/i,
    /checklist/i,
    /guide/i,
  ];

  return (
    artifactPatterns.some((p) => p.test(dod)) ||
    artifacts
      .split(/[,;]/)
      .some((a) =>
        dod.toLowerCase().includes(a.toLowerCase().split('/').pop()?.split('.')[0] || '')
      )
  );
}

/**
 * Check if DOD has measurable criteria
 */
function hasMeasurableCriteria(dod: string): boolean {
  const measurablePatterns = [
    /\d{1,10}%/, // percentages
    /<\d+/, // less than
    />\d+/, // greater than
    /\d{1,10}[ \t]*(ms|s|min|hour|day)/i, // time units
    /100%/, // full coverage
    /zero|0\s+(error|issue|fail|bug)/i, // zero defects
    /all\s+\w+\s+(pass|complete|covered|tested)/i, // all X pass
    /no\s+\w+\s+(error|issue|fail|violation)/i, // no X errors
    /≥|>=|≤|<=/, // comparison operators
  ];

  return measurablePatterns.some((p) => p.test(dod));
}

/**
 * Check if DOD has testable assertions
 */
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

/**
 * Check if Validation Method can verify the DOD
 */
function validationMatchesDod(dod: string, validation: string): boolean {
  const dodLower = dod.toLowerCase();
  const valLower = validation.toLowerCase();

  // Test-related DOD should have VALIDATE:pnpm test
  if (dodLower.includes('test') && !valLower.includes('validate:pnpm test')) {
    // Not necessarily a mismatch - could be manual review
  }

  // Coverage DOD should have GATE:coverage
  if (dodLower.includes('coverage') && !valLower.includes('coverage')) {
    return false;
  }

  // Lighthouse DOD should have GATE:lighthouse
  if (dodLower.includes('lighthouse') && !valLower.includes('lighthouse')) {
    return false;
  }

  // Security DOD should have security validation
  if (
    (dodLower.includes('security') || dodLower.includes('pentest') || dodLower.includes('owasp')) &&
    !valLower.includes('security') &&
    !valLower.includes('audit')
  ) {
    return false;
  }

  // Build DOD should have build validation
  if (dodLower.includes('build') && !valLower.includes('build') && !valLower.includes('audit')) {
    return false;
  }

  return true;
}

/**
 * Check if KPIs align with DOD
 */
function kpisMatchDod(dod: string, kpis: string): boolean {
  const dodLower = dod.toLowerCase();
  const kpiLower = kpis.toLowerCase();

  // If DOD mentions coverage, KPIs should have coverage target
  if (dodLower.includes('coverage') && !kpiLower.includes('coverage')) {
    return false;
  }

  // If DOD mentions performance, KPIs should have latency/time
  if (
    (dodLower.includes('performance') ||
      dodLower.includes('latency') ||
      dodLower.includes('response')) &&
    !kpiLower.includes('ms') &&
    !kpiLower.includes('latency') &&
    !kpiLower.includes('response')
  ) {
    return false;
  }

  return true;
}

/**
 * Verify a task's DOD
 */
function verifyDoD(
  dod: string,
  kpis: string,
  artifacts: string,
  validation: string
): DoDVerification {
  return {
    hasArtifactRef: hasArtifactReference(dod, artifacts),
    hasMeasurableCriteria: hasMeasurableCriteria(dod),
    hasTestableAssertion: hasTestableAssertion(dod),
    matchesValidation: validationMatchesDod(dod, validation),
    matchesKPIs: kpisMatchDod(dod, kpis),
  };
}

// ============================================================================
// DOD ENHANCEMENT
// ============================================================================

/**
 * Extract artifact names for DOD reference
 */
function extractArtifactNames(artifacts: string): string[] {
  return artifacts
    .split(/[,;]/)
    .map((a) =>
      a
        .trim()
        .replace(/^ARTIFACT:/, '')
        .replace(/^EVIDENCE:/, '')
    )
    .filter((a) => a && !a.includes('*'))
    .map((a) => {
      const parts = a.split('/');
      return parts[parts.length - 1];
    })
    .slice(0, 3); // Max 3 artifact references
}

/**
 * Extract measurable criteria from KPIs
 */
function extractMeasurableCriteria(kpis: string): string[] {
  const criteria: string[] = [];

  // Extract percentages
  const percentages = kpis.match(/\d{1,10}%/g);
  if (percentages) criteria.push(...percentages.map((p) => `>=${p}`));

  // Extract time limits
  const times = kpis.match(/<\d+\s*(ms|s|min)/gi);
  if (times) criteria.push(...times);

  // Extract "zero X" patterns
  if (/zero|0\s+(error|issue|fail)/i.test(kpis)) {
    criteria.push('zero errors');
  }

  return criteria.slice(0, 3);
}

/**
 * Append artifact reference to DOD if missing
 */
function appendArtifactRef(dod: string, artifacts: string): string {
  const artifactNames = extractArtifactNames(artifacts);
  if (artifactNames.length === 0 || hasArtifactReference(dod, artifacts)) {
    return dod;
  }
  return dod + `; artifacts: ${artifactNames.join(', ')}`;
}

/**
 * Append measurable targets to DOD if missing
 */
function appendMeasurableTargets(dod: string, kpis: string): string {
  if (hasMeasurableCriteria(dod) || !kpis) {
    return dod;
  }
  const criteria = extractMeasurableCriteria(kpis);
  if (criteria.length === 0) {
    return dod;
  }
  return dod + `; targets: ${criteria.join(', ')}`;
}

/**
 * Append VALIDATE commands to DOD if missing
 */
function appendValidateCmds(dod: string, validation: string): string {
  if (!validation.includes('VALIDATE:') || dod.toLowerCase().includes('test')) {
    return dod;
  }
  const validateCmds = validation.match(/VALIDATE:([^;]+)/g);
  if (!validateCmds || validateCmds.length === 0) {
    return dod;
  }
  const cmds = validateCmds.map((v) => v.replaceAll('VALIDATE:', '').trim()).join(', ');
  return dod + `; verified by: ${cmds}`;
}

/**
 * Append GATE names to DOD if missing
 */
function appendGateNames(dod: string, validation: string): string {
  if (!validation.includes('GATE:') || dod.toLowerCase().includes('gate')) {
    return dod;
  }
  const gates = validation.match(/GATE:([^;]+)/g);
  if (!gates || gates.length === 0) {
    return dod;
  }
  const gateNames = gates.map((g) => g.replaceAll('GATE:', '').trim()).join(', ');
  return dod + `; gates: ${gateNames}`;
}

/**
 * Enhance DOD to be more verifiable
 */
function enhanceDoD(
  originalDoD: string,
  kpis: string,
  artifacts: string,
  validation: string
): string {
  let enhancedDoD = originalDoD.trim();
  enhancedDoD = appendArtifactRef(enhancedDoD, artifacts);
  enhancedDoD = appendMeasurableTargets(enhancedDoD, kpis);
  enhancedDoD = appendValidateCmds(enhancedDoD, validation);
  enhancedDoD = appendGateNames(enhancedDoD, validation);
  return enhancedDoD;
}

// ============================================================================
// VALIDATION METHOD ENHANCEMENT
// ============================================================================

/**
 * Ensure validation method matches DOD requirements
 */
function enhanceValidation(dod: string, kpis: string, currentValidation: string): string {
  const parts = currentValidation
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p);
  const dodLower = dod.toLowerCase();
  const kpiLower = kpis.toLowerCase();

  // Add test validation if DOD mentions tests
  if (
    (dodLower.includes('test') || dodLower.includes('coverage')) &&
    !currentValidation.includes('VALIDATE:pnpm test')
  ) {
    parts.push('VALIDATE:pnpm test');
  }

  // Add coverage gate if KPIs mention coverage
  if (kpiLower.includes('coverage') && !currentValidation.includes('GATE:coverage')) {
    if (kpiLower.includes('>90') || kpiLower.includes('>=90')) {
      parts.push('GATE:coverage-gte-90');
    } else if (kpiLower.includes('>80') || kpiLower.includes('>=80')) {
      parts.push('GATE:coverage-gte-80');
    }
  }

  // Add lighthouse gate if DOD mentions lighthouse
  if (dodLower.includes('lighthouse') && !currentValidation.includes('lighthouse')) {
    parts.push('GATE:lighthouse-gte-90');
  }

  // Add security audit if DOD mentions security
  if (
    (dodLower.includes('security') || dodLower.includes('pentest')) &&
    !currentValidation.includes('security') &&
    !currentValidation.includes('audit')
  ) {
    parts.push('AUDIT:security-review');
  }

  // Ensure at least one validation method
  if (parts.length === 0) {
    parts.push('AUDIT:manual-review');
  }

  // Deduplicate
  return [...new Set(parts)].join(';');
}

// ============================================================================
// CSV PROCESSING
// ============================================================================

function escapeField(value: string): string {
  if (!value) return '""';
  const needsQuotes =
    value.includes(',') || value.includes('"') || value.includes('\n') || value.includes(';');
  const escaped = value.replaceAll(/"/g, '""');
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

interface TaskIssue {
  taskId: string;
  issue: string;
}

interface ProcessResult {
  dodEnhanced: number;
  validationEnhanced: number;
  issues: TaskIssue[];
}

/**
 * Collect issues for a completed task's verification
 */
function collectCompletedTaskIssues(taskId: string, verification: DoDVerification): TaskIssue[] {
  const found: TaskIssue[] = [];
  if (!verification.hasArtifactRef) {
    found.push({ taskId, issue: 'Completed but DOD has no artifact reference' });
  }
  if (!verification.hasMeasurableCriteria && !verification.hasTestableAssertion) {
    found.push({ taskId, issue: 'Completed but DOD has no measurable/testable criteria' });
  }
  if (!verification.matchesValidation) {
    found.push({ taskId, issue: 'Validation method does not match DOD requirements' });
  }
  return found;
}

/**
 * Process all tasks: verify, enhance DOD, enhance validation
 */
function processTasks(tasks: Record<string, string>[]): ProcessResult {
  let dodEnhanced = 0;
  let validationEnhanced = 0;
  const issues: TaskIssue[] = [];

  for (const task of tasks) {
    const taskId = task['Task ID'];
    const status = task['Status'] || '';
    const dod = task['Definition of Done'] || '';
    const kpis = task['KPIs'] || '';
    const artifacts = task['Artifacts To Track'] || '';
    const validation = task['Validation Method'] || '';

    const verification = verifyDoD(dod, kpis, artifacts, validation);

    if (status.toLowerCase() === 'completed') {
      issues.push(...collectCompletedTaskIssues(taskId, verification));
    }

    const enhancedDoD = enhanceDoD(dod, kpis, artifacts, validation);
    if (enhancedDoD !== dod) {
      task['Definition of Done'] = enhancedDoD;
      dodEnhanced++;
    }

    const enhancedValidation = enhanceValidation(dod, kpis, validation);
    if (enhancedValidation !== validation) {
      task['Validation Method'] = enhancedValidation;
      validationEnhanced++;
    }
  }

  return { dodEnhanced, validationEnhanced, issues };
}

/**
 * Print issues found in completed tasks
 */
function printIssues(issues: TaskIssue[]): void {
  if (issues.length === 0) return;

  console.log('=== Issues in Completed Tasks ===\n');
  for (const issue of issues.slice(0, 20)) {
    console.log(`  ${issue.taskId}: ${issue.issue}`);
  }
  if (issues.length > 20) {
    console.log(`  ... and ${issues.length - 20} more`);
  }
  console.log('');
}

/**
 * Print sample enhanced tasks
 */
function printSamples(tasks: Record<string, string>[]): void {
  console.log('=== Sample Enhanced Tasks ===\n');
  const sampleIds = ['EXC-INIT-001', 'ENV-004-AI', 'IFC-003', 'IFC-044', 'IFC-072'];

  for (const id of sampleIds) {
    const task = tasks.find((t) => t['Task ID'] === id);
    if (!task) continue;
    console.log('='.repeat(70));
    console.log(`Task: ${id} (${task['Status']})`);
    console.log(`\nDOD: ${task['Definition of Done']}`);
    console.log(`\nKPIs: ${task['KPIs']}`);
    console.log(`\nValidation: ${task['Validation Method']}`);
    console.log('');
  }
}

async function main() {
  console.log('=== Fix Definition of Done to be Verifiable ===\n');

  console.log('Reading CSV...');
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const tasks = parse(csvContent, { columns: true, bom: true, relax_quotes: true }) as Record<
    string,
    string
  >[];
  console.log(`Found ${tasks.length} tasks\n`);

  const { dodEnhanced, validationEnhanced, issues } = processTasks(tasks);

  console.log(`DOD enhanced: ${dodEnhanced}`);
  console.log(`Validation enhanced: ${validationEnhanced}`);
  console.log(`Issues found in completed tasks: ${issues.length}\n`);

  const headers = Object.keys(tasks[0]);
  const output = stringifyCsv(tasks, headers);
  writeFileSync(CSV_PATH, output, 'utf-8');
  console.log(`Written to: ${CSV_PATH}\n`);

  printIssues(issues);
  printSamples(tasks);
}

main().catch(console.error);
