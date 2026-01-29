/**
 * Plan Session - TDD Execution Plan Generation
 *
 * Creates actionable TDD execution plans from specifications:
 * - Decomposes acceptance criteria into TDD steps (RED → GREEN → REFACTOR)
 * - Identifies integration checkpoints
 * - Generates preflight checks and final validations
 * - Estimates effort for each phase
 *
 * @module tools/scripts/lib/stoa/plan-session
 */

import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  HydratedContext,
  SpecificationDocument,
  PlanDocument,
  PlanSession,
  PlanStep,
  PlanStepType,
  TddPhase,
  IntegrationCheckpoint,
  PlanEffortEstimate,
  SpecComponent,
} from './types.js';
import {
  getPlanningDir,
  getPlanPath,
  getPlanSessionPath,
} from './paths.js';

// ============================================================================
// Constants
// ============================================================================

const TDD_PHASES: TddPhase[] = ['RED', 'GREEN', 'REFACTOR'];

const DEFAULT_VALIDATION_COMMANDS: Record<string, string> = {
  typescript: 'pnpm run typecheck',
  tests: 'pnpm run test',
  lint: 'pnpm run lint',
  build: 'pnpm run build',
};

// ============================================================================
// Session Management
// ============================================================================

/**
 * Create a new plan session
 */
export function createPlanSession(
  taskId: string,
  specificationPath: string
): PlanSession {
  return {
    sessionId: `plan-${taskId}-${randomUUID().slice(0, 8)}`,
    taskId,
    specificationPath,
    status: 'in_progress',
    startedAt: new Date().toISOString(),
  };
}

/**
 * Load specification from file
 */
export function loadSpecification(specPath: string, repoRoot: string): SpecificationDocument | null {
  const fullPath = join(repoRoot, specPath);

  if (!existsSync(fullPath)) {
    return null;
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    // Parse specification from markdown
    return parseSpecificationMarkdown(content);
  } catch {
    return null;
  }
}

/**
 * Parse specification markdown into document structure
 */
function parseSpecificationMarkdown(content: string): SpecificationDocument {
  const taskIdMatch = content.match(/# Specification: ([^\n]+)/);
  const sessionIdMatch = content.match(/\*\*Session ID:\*\* ([^\n]+)/);
  const overviewMatch = content.match(/## Overview\s*\n\n([^#]+?)(?=\n---|\n##)/s);
  const technicalMatch = content.match(/## Technical Approach\s*\n\n([^#]+?)(?=\n---|\n##)/s);
  const interfacesMatch = content.match(/## Interfaces & Contracts\s*\n\n([^#]+?)(?=\n---|\n##)/s);
  const acceptanceMatch = content.match(/## Acceptance Criteria\s*\n\n([^#]+?)(?=\n---|\n##)/s);

  // Parse components table
  const components: SpecComponent[] = [];
  const componentsMatch = content.match(/## Components\s*\n\n[^\n]+\n[^\n]+\n([^#]+?)(?=\n---|\n##)/s);
  if (componentsMatch) {
    const rows = componentsMatch[1].trim().split('\n');
    for (const row of rows) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 4 && !cells[0].includes('---')) {
        components.push({
          name: cells[0],
          type: cells[1],
          location: cells[2],
          purpose: cells[3],
        });
      }
    }
  }

  // Parse acceptance criteria
  const acceptanceCriteria: string[] = [];
  if (acceptanceMatch) {
    const lines = acceptanceMatch[1].trim().split('\n');
    for (const line of lines) {
      const cleaned = line.replace(/^\[[ x]\]\s*/, '').trim();
      if (cleaned) {
        acceptanceCriteria.push(cleaned);
      }
    }
  }

  return {
    taskId: taskIdMatch?.[1]?.trim() || 'UNKNOWN',
    sessionId: sessionIdMatch?.[1]?.trim() || 'UNKNOWN',
    overview: overviewMatch?.[1]?.trim() || '',
    technicalApproach: technicalMatch?.[1]?.trim() || '',
    components,
    interfaces: interfacesMatch?.[1]?.trim() || '',
    integrationPoints: [],
    acceptanceCriteria,
    testRequirements: {
      unitTests: [],
      integrationTests: [],
      edgeCases: [],
    },
    risks: [],
    agentSignoffs: {},
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Plan Generation
// ============================================================================

/**
 * Generate execution plan from specification
 */
export function generatePlan(
  session: PlanSession,
  context: HydratedContext | null,
  spec: SpecificationDocument
): PlanDocument {
  const preflightChecks = generatePreflightChecks(context, spec);
  const steps = decomposeToTddSteps(spec.acceptanceCriteria, spec.components);
  const integrationCheckpoints = generateCheckpoints(steps);
  const finalValidation = generateFinalValidation(spec);
  const estimatedEffort = estimateEffort(steps);

  return {
    taskId: spec.taskId,
    sessionId: session.sessionId,
    specificationRef: session.specificationPath,
    preflightChecks,
    steps,
    integrationCheckpoints,
    finalValidation,
    estimatedEffort,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Complete plan session with generated plan
 */
export function completePlanSession(
  session: PlanSession,
  plan: PlanDocument
): PlanSession {
  return {
    ...session,
    plan,
    status: 'completed',
    completedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Preflight Checks
// ============================================================================

/**
 * Generate preflight checks for the plan
 */
export function generatePreflightChecks(
  context: HydratedContext | null,
  spec: SpecificationDocument
): string[] {
  const checks: string[] = [];

  // Standard preflight checks
  checks.push('Verify all dependencies are installed: `pnpm install`');
  checks.push('Ensure TypeScript compilation passes: `pnpm run typecheck`');
  checks.push('Verify existing tests pass: `pnpm run test`');

  // Check for database migrations
  if (spec.technicalApproach.toLowerCase().includes('prisma') ||
      spec.technicalApproach.toLowerCase().includes('database') ||
      spec.technicalApproach.toLowerCase().includes('migration')) {
    checks.push('Generate Prisma client: `pnpm run db:generate`');
    checks.push('Apply any pending migrations: `pnpm run db:migrate`');
  }

  // Check for environment variables
  if (spec.technicalApproach.toLowerCase().includes('env') ||
      spec.technicalApproach.toLowerCase().includes('environment')) {
    checks.push('Verify required environment variables are set');
  }

  // Check dependencies from context
  if (context?.dependencyArtifacts.length) {
    for (const dep of context.dependencyArtifacts) {
      if (dep.status !== 'Completed') {
        checks.push(`Verify dependency ${dep.taskId} is complete (current: ${dep.status || 'Unknown'})`);
      }
    }
  }

  // Check for component locations
  for (const component of spec.components) {
    if (component.location && !component.location.includes('new')) {
      checks.push(`Verify file exists: ${component.location}`);
    }
  }

  return checks;
}

// ============================================================================
// TDD Step Decomposition
// ============================================================================

/**
 * Decompose acceptance criteria into TDD steps
 */
export function decomposeToTddSteps(
  acceptanceCriteria: string[],
  components: SpecComponent[]
): PlanStep[] {
  const steps: PlanStep[] = [];
  let stepNumber = 0;

  // Group criteria by domain/type
  const testCriteria = acceptanceCriteria.filter(c =>
    c.toLowerCase().includes('test') ||
    c.toLowerCase().includes('coverage') ||
    c.toLowerCase().includes('validate')
  );
  const implCriteria = acceptanceCriteria.filter(c => !testCriteria.includes(c));

  // Phase 1: Create test files (RED phase)
  for (const component of components) {
    if (component.type === 'Module' || component.type === 'Component' || component.type === 'Service') {
      stepNumber++;
      const testFile = generateTestFilePath(component.location);

      steps.push({
        stepNumber,
        name: `Write failing tests for ${component.name}`,
        type: 'test',
        tddPhase: 'RED',
        filesToCreate: [testFile],
        filesToModify: [],
        acceptanceCriteriaAddressed: testCriteria.slice(0, 2),
        validationChecks: [
          `Tests should fail initially: pnpm vitest run ${testFile}`,
          'Verify test structure follows project patterns',
        ],
      });
    }
  }

  // Phase 2: Implementation (GREEN phase)
  for (const component of components) {
    stepNumber++;
    const isNew = !component.location.includes('existing');

    steps.push({
      stepNumber,
      name: `Implement ${component.name}`,
      type: 'implementation',
      tddPhase: 'GREEN',
      filesToCreate: isNew ? [component.location] : [],
      filesToModify: isNew ? [] : [component.location],
      acceptanceCriteriaAddressed: implCriteria.filter(c =>
        c.toLowerCase().includes(component.name.toLowerCase()) ||
        c.toLowerCase().includes(component.type.toLowerCase())
      ),
      validationChecks: [
        'TypeScript compiles without errors',
        'Related tests pass',
      ],
    });
  }

  // Phase 3: Integration (GREEN continuation)
  if (components.length > 1) {
    stepNumber++;
    steps.push({
      stepNumber,
      name: 'Integrate components',
      type: 'integration',
      tddPhase: 'GREEN',
      filesToCreate: [],
      filesToModify: components.map(c => c.location),
      acceptanceCriteriaAddressed: implCriteria.filter(c =>
        c.toLowerCase().includes('integration') ||
        c.toLowerCase().includes('connect')
      ),
      validationChecks: [
        'All unit tests pass',
        'Integration tests pass',
        'TypeScript compiles',
      ],
    });
  }

  // Phase 4: Refactor (REFACTOR phase)
  stepNumber++;
  steps.push({
    stepNumber,
    name: 'Refactor and optimize',
    type: 'implementation',
    tddPhase: 'REFACTOR',
    filesToCreate: [],
    filesToModify: components.map(c => c.location),
    acceptanceCriteriaAddressed: [
      'Code follows project patterns',
      'No duplication',
      'Documentation complete',
    ],
    validationChecks: [
      'Lint passes: pnpm run lint',
      'All tests still pass',
      'No regression in functionality',
    ],
  });

  // Phase 5: Validation
  stepNumber++;
  steps.push({
    stepNumber,
    name: 'Final validation',
    type: 'validation',
    filesToCreate: [],
    filesToModify: [],
    acceptanceCriteriaAddressed: acceptanceCriteria,
    validationChecks: [
      'All acceptance criteria verified',
      'Test coverage meets threshold: `pnpm run test -- --coverage`',
      'Build succeeds: `pnpm run build`',
    ],
  });

  return steps;
}

/**
 * Generate test file path for a component
 */
function generateTestFilePath(componentPath: string): string {
  const dir = componentPath.substring(0, componentPath.lastIndexOf('/'));
  const fileName = basename(componentPath, '.ts').replace('.tsx', '');

  // Determine test location pattern
  if (dir.includes('apps/')) {
    // App code: tests in __tests__ folder
    return `${dir}/__tests__/${fileName}.test.ts`;
  } else if (dir.includes('packages/')) {
    // Package code: tests adjacent or in __tests__
    return `${dir}/__tests__/${fileName}.test.ts`;
  }

  // Default: adjacent test file
  return componentPath.replace(/\.tsx?$/, '.test.ts');
}

// ============================================================================
// Integration Checkpoints
// ============================================================================

/**
 * Generate integration checkpoints for plan steps
 */
export function generateCheckpoints(steps: PlanStep[]): IntegrationCheckpoint[] {
  const checkpoints: IntegrationCheckpoint[] = [];

  // Checkpoint after RED phase (tests written)
  const redSteps = steps.filter(s => s.tddPhase === 'RED');
  if (redSteps.length > 0) {
    const lastRedStep = redSteps[redSteps.length - 1];
    checkpoints.push({
      afterStep: lastRedStep.stepNumber,
      verify: 'All test files created and compile',
      command: 'pnpm run typecheck',
    });
  }

  // Checkpoint after GREEN phase (implementation done)
  const greenSteps = steps.filter(s => s.tddPhase === 'GREEN');
  if (greenSteps.length > 0) {
    const lastGreenStep = greenSteps[greenSteps.length - 1];
    checkpoints.push({
      afterStep: lastGreenStep.stepNumber,
      verify: 'All tests pass',
      command: 'pnpm run test',
    });
  }

  // Checkpoint after integration step
  const integrationStep = steps.find(s => s.type === 'integration');
  if (integrationStep) {
    checkpoints.push({
      afterStep: integrationStep.stepNumber,
      verify: 'Integration complete, no breaking changes',
      command: 'pnpm run test && pnpm run typecheck',
    });
  }

  // Checkpoint after refactor
  const refactorStep = steps.find(s => s.tddPhase === 'REFACTOR');
  if (refactorStep) {
    checkpoints.push({
      afterStep: refactorStep.stepNumber,
      verify: 'Code quality checks pass',
      command: 'pnpm run lint && pnpm run test',
    });
  }

  return checkpoints;
}

// ============================================================================
// Final Validation
// ============================================================================

/**
 * Generate final validation steps
 */
export function generateFinalValidation(spec: SpecificationDocument): string[] {
  const validations: string[] = [];

  // Core validations
  validations.push('Run full test suite: `pnpm run test`');
  validations.push('Verify TypeScript compilation: `pnpm run typecheck`');
  validations.push('Run linting: `pnpm run lint`');
  validations.push('Build project: `pnpm run build`');

  // Check test coverage
  validations.push('Verify test coverage ≥90%: `pnpm run test -- --coverage`');

  // Verify acceptance criteria
  for (const criterion of spec.acceptanceCriteria.slice(0, 5)) {
    validations.push(`Verify: ${criterion}`);
  }

  // Security checks for sensitive components
  if (spec.technicalApproach.toLowerCase().includes('auth') ||
      spec.technicalApproach.toLowerCase().includes('security') ||
      spec.technicalApproach.toLowerCase().includes('encrypt')) {
    validations.push('Security review: Check for OWASP Top 10 vulnerabilities');
    validations.push('Verify secrets are not hardcoded');
  }

  // API-specific validations
  if (spec.technicalApproach.toLowerCase().includes('api') ||
      spec.technicalApproach.toLowerCase().includes('trpc') ||
      spec.technicalApproach.toLowerCase().includes('endpoint')) {
    validations.push('API contract tests pass');
    validations.push('Response time within p95 <100ms requirement');
  }

  return validations;
}

// ============================================================================
// Effort Estimation
// ============================================================================

/**
 * Estimate effort for plan execution
 */
export function estimateEffort(steps: PlanStep[]): PlanEffortEstimate {
  const testSteps = steps.filter(s => s.type === 'test');
  const implSteps = steps.filter(s => s.type === 'implementation');
  const integrationSteps = steps.filter(s => s.type === 'integration');
  const validationSteps = steps.filter(s => s.type === 'validation');

  // Rough estimation based on step count and file count
  const testFiles = testSteps.reduce((sum, s) => sum + s.filesToCreate.length, 0);
  const implFiles = implSteps.reduce((sum, s) => sum + s.filesToCreate.length + s.filesToModify.length, 0);
  const integrationFiles = integrationSteps.reduce((sum, s) => sum + s.filesToModify.length, 0);

  return {
    tests: `~${Math.max(1, testFiles)} test file(s) - ${estimateTimeRange(testFiles, 15, 30)}`,
    implementation: `~${Math.max(1, implFiles)} file(s) - ${estimateTimeRange(implFiles, 20, 45)}`,
    integration: integrationFiles > 0
      ? `~${integrationFiles} file(s) to integrate - ${estimateTimeRange(integrationFiles, 10, 20)}`
      : 'N/A - no integration steps',
    total: calculateTotalEstimate(testFiles, implFiles, integrationFiles),
  };
}

/**
 * Calculate time range estimate
 */
function estimateTimeRange(fileCount: number, minPerFile: number, maxPerFile: number): string {
  const min = Math.max(1, fileCount) * minPerFile;
  const max = Math.max(1, fileCount) * maxPerFile;

  if (max < 60) {
    return `${min}-${max} minutes`;
  }

  const minHours = Math.round(min / 60 * 10) / 10;
  const maxHours = Math.round(max / 60 * 10) / 10;
  return `${minHours}-${maxHours} hours`;
}

/**
 * Calculate total effort estimate
 */
function calculateTotalEstimate(testFiles: number, implFiles: number, integrationFiles: number): string {
  const minTotal = (testFiles * 15) + (implFiles * 20) + (integrationFiles * 10) + 30; // +30 for validation
  const maxTotal = (testFiles * 30) + (implFiles * 45) + (integrationFiles * 20) + 60; // +60 for validation

  // Convert to hours if > 120 minutes
  if (maxTotal > 120) {
    const minHours = Math.round(minTotal / 60 * 10) / 10;
    const maxHours = Math.round(maxTotal / 60 * 10) / 10;
    return `${minHours}-${maxHours} hours`;
  }

  return `${minTotal}-${maxTotal} minutes`;
}

// ============================================================================
// Output Writers
// ============================================================================

/**
 * Write plan to file
 * Uses new unified path structure: .specify/sprints/sprint-{N}/planning/{TASK_ID}-plan.md
 */
export function writePlan(
  plan: PlanDocument,
  repoRoot: string,
  sprintNumber: number,
  specifyDir: string = '.specify'
): string {
  const fullSpecifyDir = join(repoRoot, specifyDir);
  const planDir = getPlanningDir(fullSpecifyDir, sprintNumber);
  mkdirSync(planDir, { recursive: true });

  const outputPath = getPlanPath(fullSpecifyDir, sprintNumber, plan.taskId);
  const md = generatePlanMarkdown(plan);
  writeFileSync(outputPath, md);

  return relative(repoRoot, outputPath);
}

/**
 * Write plan session state to file
 * Uses new unified path structure: .specify/sprints/sprint-{N}/context/{TASK_ID}/plan-session.json
 */
export function writePlanSession(
  session: PlanSession,
  repoRoot: string,
  sprintNumber: number,
  specifyDir: string = '.specify'
): string {
  const fullSpecifyDir = join(repoRoot, specifyDir);
  const outputPath = getPlanSessionPath(fullSpecifyDir, sprintNumber, session.taskId);
  const outputDir = join(fullSpecifyDir, 'sprints', `sprint-${sprintNumber}`, 'context', session.taskId);
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(outputPath, JSON.stringify(session, null, 2));

  return relative(repoRoot, outputPath);
}

/**
 * Generate plan markdown
 */
export function generatePlanMarkdown(plan: PlanDocument): string {
  let md = `# Execution Plan: ${plan.taskId}

**Session ID:** ${plan.sessionId}
**Generated:** ${plan.generatedAt}
**Specification:** ${plan.specificationRef}

---

## Preflight Checks

Before starting implementation, verify:

${plan.preflightChecks.map((c, i) => `${i + 1}. ${c}`).join('\n')}

---

## Estimated Effort

| Phase | Estimate |
|-------|----------|
| Tests | ${plan.estimatedEffort.tests} |
| Implementation | ${plan.estimatedEffort.implementation} |
| Integration | ${plan.estimatedEffort.integration} |
| **Total** | **${plan.estimatedEffort.total}** |

---

## Execution Steps

`;

  // Group steps by TDD phase
  const groupedSteps: Record<string, PlanStep[]> = {};
  for (const step of plan.steps) {
    const phase = step.tddPhase || 'VALIDATION';
    if (!groupedSteps[phase]) {
      groupedSteps[phase] = [];
    }
    groupedSteps[phase].push(step);
  }

  // Output by phase
  const phaseOrder = ['RED', 'GREEN', 'REFACTOR', 'VALIDATION'];
  for (const phase of phaseOrder) {
    const steps = groupedSteps[phase];
    if (!steps?.length) continue;

    md += `### ${getPhaseTitle(phase)}\n\n`;

    for (const step of steps) {
      md += `#### Step ${step.stepNumber}: ${step.name}

**Type:** ${step.type}
`;

      if (step.filesToCreate.length > 0) {
        md += `
**Files to Create:**
${step.filesToCreate.map(f => `- \`${f}\``).join('\n')}
`;
      }

      if (step.filesToModify.length > 0) {
        md += `
**Files to Modify:**
${step.filesToModify.map(f => `- \`${f}\``).join('\n')}
`;
      }

      if (step.acceptanceCriteriaAddressed.length > 0) {
        md += `
**Acceptance Criteria Addressed:**
${step.acceptanceCriteriaAddressed.map(c => `- ${c}`).join('\n')}
`;
      }

      md += `
**Validation:**
${step.validationChecks.map(v => `- [ ] ${v}`).join('\n')}

`;

      // Add checkpoint if exists
      const checkpoint = plan.integrationCheckpoints.find(c => c.afterStep === step.stepNumber);
      if (checkpoint) {
        md += `> **Checkpoint:** ${checkpoint.verify}
> \`${checkpoint.command}\`

`;
      }
    }
  }

  md += `---

## Final Validation

Before marking task complete:

${plan.finalValidation.map((v, i) => `${i + 1}. ${v}`).join('\n')}

---

## Integration Checkpoints Summary

| After Step | Verification | Command |
|------------|--------------|---------|
${plan.integrationCheckpoints.map(c => `| ${c.afterStep} | ${c.verify} | \`${c.command}\` |`).join('\n')}

---

*Generated by MATOP Plan Session*
`;

  return md;
}

/**
 * Get readable phase title
 */
function getPhaseTitle(phase: string): string {
  switch (phase) {
    case 'RED':
      return 'Phase 1: RED - Write Failing Tests';
    case 'GREEN':
      return 'Phase 2: GREEN - Make Tests Pass';
    case 'REFACTOR':
      return 'Phase 3: REFACTOR - Clean Up';
    case 'VALIDATION':
      return 'Phase 4: Final Validation';
    default:
      return phase;
  }
}

// ============================================================================
// Exports
// ============================================================================

export { TDD_PHASES, DEFAULT_VALIDATION_COMMANDS };
