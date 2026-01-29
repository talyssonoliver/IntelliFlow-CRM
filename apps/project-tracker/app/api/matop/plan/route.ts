import { NextResponse } from 'next/server';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  loadTasks,
  updateTaskStatus,
  updateTaskArtifacts,
  canProceedToSession,
  type TaskRecord,
} from '@/lib/csv-status';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface PlanRequest {
  taskId: string;
  forceRegenerate?: boolean;
}

interface PhaseResult {
  status: string;
  path?: string;
  steps?: number;
  checkpoints?: number;
  effort?: string;
}

/**
 * POST /api/matop/plan
 *
 * SESSION 2: Planning Session
 * Runs MATOP Phase 2 for a task:
 * - Phase 2: Plan Session (generate TDD execution plan)
 *
 * Prerequisites: Spec must exist (SESSION 1 must be complete)
 * Updates Sprint_plan.csv status: Planning -> Plan Complete
 */
export async function POST(request: Request) {
  let taskId: string | undefined;

  try {
    const body: PlanRequest = await request.json();
    taskId = body.taskId;
    const forceRegenerate = body.forceRegenerate || false;

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    // Resolve paths - go up from apps/project-tracker to project root
    const projectRoot = join(process.cwd(), '..', '..');
    const specifyDir = join(projectRoot, '.specify');

    // Load task from CSV
    const tasks = await loadTasks();
    const task = tasks.find((t) => t['Task ID'] === taskId);

    if (!task) {
      return NextResponse.json(
        { success: false, error: `Task ${taskId} not found in Sprint_plan.csv` },
        { status: 404 }
      );
    }

    // Get sprint number from task
    const sprintNumber = parseInt(task['Target Sprint'] || '0', 10);
    const sprintDir = join(specifyDir, 'sprints', `sprint-${sprintNumber}`);

    // Sprint-based paths
    const specPath = join(sprintDir, 'specifications', `${taskId}-spec.md`);
    const planPath = join(sprintDir, 'planning', `${taskId}-plan.md`);
    const _contextPath = join(sprintDir, 'context', taskId, 'hydrated-context.md');

    // Check prerequisites - must have spec (check both new and legacy locations)
    const legacySpecPath = join(specifyDir, 'specifications', `${taskId}-spec.md`);
    const specExists = existsSync(specPath) || existsSync(legacySpecPath);
    if (!specExists) {
      return NextResponse.json(
        {
          success: false,
          error: `Spec required for ${taskId}. Run SESSION 1: Spec first.`,
          requiredSession: 'spec',
          currentStatus: task.Status,
        },
        { status: 400 }
      );
    }

    // Validate session progression
    const canProceed = canProceedToSession(task, 'plan');
    if (!canProceed.canProceed && !forceRegenerate) {
      return NextResponse.json(
        {
          success: false,
          error: canProceed.reason,
          currentStatus: task.Status,
        },
        { status: 400 }
      );
    }

    // Check if already has plan (unless force regenerate)
    const planExists = existsSync(planPath);
    if (planExists && !forceRegenerate) {
      return NextResponse.json({
        success: true,
        taskId,
        status: 'already_planned',
        phases: {
          plan: { status: 'exists', path: planPath },
        },
        message: `${taskId} already has plan. Use forceRegenerate: true to regenerate.`,
      });
    }

    // Update status to "Planning" at the start
    await updateTaskStatus(taskId, 'Planning');

    // Ensure sprint directories exist
    await mkdir(join(sprintDir, 'planning'), { recursive: true });

    // Read spec to get domain info (try new path first, then legacy)
    const actualSpecPath = existsSync(specPath) ? specPath : legacySpecPath;
    const specContent = await readFile(actualSpecPath, 'utf-8');
    const domain = extractDomainFromSpec(specContent);

    // Phase 2: Plan Generation
    const planContent = generatePlan(task, domain, sprintNumber);
    await writeFile(planPath, planContent, 'utf-8');

    // Update task artifacts in CSV
    await updateTaskArtifacts(taskId, {
      plan: `.specify/sprints/sprint-${sprintNumber}/planning/${taskId}-plan.md`,
    });

    // Update status to "Plan Complete"
    await updateTaskStatus(taskId, 'Plan Complete');

    // Build response
    const phases: Record<string, PhaseResult> = {
      plan: {
        status: 'completed',
        path: planPath,
        steps: countPlanSteps(task),
        checkpoints: 3,
        effort: estimateEffort(task),
      },
    };

    return NextResponse.json({
      success: true,
      taskId,
      status: 'plan_complete',
      csvStatus: 'Plan Complete',
      phases,
      message: `SESSION 2 complete: ${taskId} plan generated. ${phases.plan.steps} steps, ${phases.plan.effort} estimated. Ready for SESSION 3: Exec.`,
      nextSession: 'exec',
    });
  } catch (error) {
    console.error('MATOP plan session failed:', error);

    // Rollback status on failure
    if (taskId) {
      try {
        await updateTaskStatus(taskId, 'Spec Complete');
      } catch {
        // Ignore rollback errors
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: 'MATOP plan session failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

function extractDomainFromSpec(specContent: string): string {
  // Try to extract domain from spec content
  const domainMatch = specContent.match(/Domain:\s*(\w+)/i);
  if (domainMatch) {
    return domainMatch[1].toLowerCase();
  }

  // Infer from agents mentioned
  if (specContent.includes('Frontend-Lead')) return 'frontend';
  if (specContent.includes('Backend-Architect')) return 'backend';
  if (specContent.includes('AI-Specialist')) return 'ai';
  if (specContent.includes('Security-Lead')) return 'security';
  if (specContent.includes('DevOps-Lead')) return 'devops';

  return 'general';
}

function generatePlan(task: TaskRecord, domain: string, sprintNumber: number = 0): string {
  const dod =
    task['Definition of Done']
      ?.split(';')
      .map((d) => d.trim())
      .filter(Boolean) || [];
  const artifacts =
    task['Artifacts To Track']
      ?.split(';')
      .filter((a) => a.startsWith('ARTIFACT:'))
      .map((a) => a.replace('ARTIFACT:', '').trim()) || [];
  const validations =
    task['Validation Method']
      ?.split(';')
      .filter((v) => v.startsWith('VALIDATE:'))
      .map((v) => v.replace('VALIDATE:', '').trim()) || [];

  const totalSteps = 2 + dod.length + 2; // Setup + DoD items + Integration + Validation

  return `# Execution Plan: ${task['Task ID']}

## Overview

This plan decomposes the specification into actionable TDD steps.
- **Domain**: ${domain}
- **Total Steps**: ${totalSteps}
- **Generated By**: MATOP SESSION 2 - Plan

## Pre-flight Checks

1. [ ] Dependencies verified: ${task.Dependencies || 'None'}
2. [ ] Specification reviewed: \`.specify/sprints/sprint-${sprintNumber}/specifications/${task['Task ID']}-spec.md\`
3. [ ] Context pack acknowledged
4. [ ] Feature branch created: \`feat/${task['Task ID'].toLowerCase()}\`

## Phase 1: Setup & Preparation

### Step 1: Environment Setup
**Type**: Preparation
**TDD Phase**: N/A
**Duration**: 15 min
**Actions**:
- [ ] Review specification at \`.specify/sprints/sprint-${sprintNumber}/specifications/${task['Task ID']}-spec.md\`
- [ ] Review hydrated context at \`.specify/sprints/sprint-${sprintNumber}/context/${task['Task ID']}/hydrated-context.md\`
- [ ] Verify all dependencies are complete
- [ ] Create feature branch

### Step 2: Test Scaffold
**Type**: Test Setup
**TDD Phase**: RED (setup)
**Duration**: 20 min
**Actions**:
- [ ] Create test file structure
- [ ] Write test skeletons for each acceptance criterion
- [ ] Verify test runner works

## Phase 2: Implementation (TDD)

${dod
  .map(
    (d, i) => `### Step ${i + 3}: ${d}
**Type**: Implementation
**TDD Phase**: RED -> GREEN -> REFACTOR
**Acceptance Criteria**: AC-${i + 1}
**Duration**: ${estimateStepDuration(d)}
**Actions**:
- [ ] Write failing test (RED)
- [ ] Implement minimal code to pass (GREEN)
- [ ] Refactor for quality (REFACTOR)
- [ ] Verify AC-${i + 1} is satisfied
`
  )
  .join('\n')}

## Phase 3: Integration & Validation

### Step ${dod.length + 3}: Integration Testing
**Type**: Integration
**TDD Phase**: GREEN
**Duration**: 30 min
**Actions**:
- [ ] Run full test suite: \`pnpm test\`
- [ ] Verify type safety: \`pnpm typecheck\`
- [ ] Run linting: \`pnpm lint\`
- [ ] Build verification: \`pnpm build\`

### Step ${dod.length + 4}: Validation & Evidence
**Type**: Validation
**TDD Phase**: N/A
**Duration**: 20 min
**Actions**:
${validations.map((v: string) => `- [ ] Run: \`${v}\``).join('\n') || '- [ ] Manual validation review'}
- [ ] Create evidence bundle
- [ ] Update task status

## Integration Checkpoints

| After Step | Verify | Command |
|------------|--------|---------|
| Step 2 | Tests scaffold | \`pnpm test --passWithNoTests\` |
| Step ${Math.floor(dod.length / 2) + 3} | Midpoint check | \`pnpm typecheck\` |
| Step ${dod.length + 3} | Full integration | \`pnpm test && pnpm build\` |

## Expected Artifacts

${
  artifacts.map((a: string) => `- [ ] \`${a}\``).join('\n') ||
  `- [ ] Implementation files for ${task['Task ID']}\n- [ ] Test files`
}

## Estimated Effort

| Phase | Estimate |
|-------|----------|
| Setup | 0.5h |
| Implementation | ${Math.max(1, dod.length * 0.5)}h |
| Integration | 0.5h |
| Validation | 0.5h |
| **Total** | **${estimateEffort(task)}** |

## Final Validation Checklist

- [ ] All acceptance criteria met
- [ ] All tests passing (unit + integration)
- [ ] Type safety verified
- [ ] Linting clean
- [ ] Build succeeds
- [ ] Evidence bundle created
- [ ] Task status updated to "Completed"

---

*Generated: ${new Date().toISOString()}*
*Session: MATOP SESSION 2 - Plan*
*Next: SESSION 3 - Exec*
`;
}

function countPlanSteps(task: TaskRecord): number {
  const dod = task['Definition of Done']?.split(';').filter(Boolean) || [];
  return 2 + dod.length + 2; // Setup + DoD items + Integration + Validation
}

function estimateEffort(task: TaskRecord): string {
  const dod = task['Definition of Done']?.split(';').filter(Boolean) || [];
  const hours = Math.max(2, 1 + dod.length * 0.5);
  return `${hours}h`;
}

function estimateStepDuration(step: string): string {
  const words = step.split(' ').length;
  if (words < 5) return '20 min';
  if (words < 10) return '30 min';
  return '45 min';
}
