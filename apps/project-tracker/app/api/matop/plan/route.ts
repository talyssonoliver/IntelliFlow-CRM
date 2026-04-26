import { NextResponse } from 'next/server';
import { join, basename } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  loadTasks,
  updateTaskStatus,
  updateTaskArtifacts,
  canProceedToSession,
  type TaskRecord,
} from '@/lib/csv-status';
import {
  isValidTaskId,
  resolveSprintPath,
  sanitizeSprintNumber,
} from '@/lib/paths';

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
async function rollbackToPlanningStatus(taskId: string): Promise<void> {
  try {
    await updateTaskStatus(taskId, 'Spec Complete');
  } catch {
    // Ignore rollback errors
  }
}

interface ResolvedPlanPaths {
  specFilename: string;
  planFilename: string;
  specPath: string;
  planPath: string;
  planningDir: string;
  legacySpecPath: string;
}

function resolvePlanPaths(
  safeTaskId: string,
  sprintNumber: number,
  sprintsRoot: string,
  specifyDir: string
): ResolvedPlanPaths | { error: string; status: number } {
  // CodeQL recognises path.basename + character-class regex as a path-injection sanitiser.
  const safeTaskBase = basename(safeTaskId).replace(/[^A-Z0-9-]/g, '');
  if (!safeTaskBase) {
    return { error: 'Task ID could not be converted to a safe filename', status: 400 };
  }
  const specFilename = `${safeTaskBase}-spec.md`;
  const planFilename = `${safeTaskBase}-plan.md`;
  const specPath = resolveSprintPath(sprintsRoot, sprintNumber, 'specifications', specFilename);
  const planPath = resolveSprintPath(sprintsRoot, sprintNumber, 'planning', planFilename);
  const planningDir = resolveSprintPath(sprintsRoot, sprintNumber, 'planning');
  if (!specPath || !planPath || !planningDir) {
    return { error: 'Refusing to construct path outside of sprints root', status: 400 };
  }
  const legacySpecPath = join(specifyDir, 'specifications', specFilename);
  return { specFilename, planFilename, specPath, planPath, planningDir, legacySpecPath };
}

/**
 * Read the spec file from the canonical sprint path; fall back to the legacy
 * `.specify/specifications/` path on ENOENT. Returns null only if both paths
 * are absent (caller turns this into a 400 with `Spec required for X`).
 *
 * Extracted from POST() so the request handler stays under the sonarjs
 * cognitive-complexity ceiling.
 */
async function readSpecWithLegacyFallback(
  specPath: string,
  legacySpecPath: string
): Promise<string | null> {
  try {
    return await readFile(specPath, 'utf-8');
  } catch {
    try {
      return await readFile(legacySpecPath, 'utf-8');
    } catch {
      return null;
    }
  }
}

export async function POST(request: Request) {
  let taskId: string | undefined;

  try {
    const body: PlanRequest = await request.json();
    taskId = body.taskId;
    const forceRegenerate = body.forceRegenerate || false;

    if (!taskId || !isValidTaskId(taskId)) {
      return NextResponse.json(
        { error: 'Task ID is required and must match the canonical task-id pattern' },
        { status: 400 }
      );
    }
    // After isValidTaskId, taskId is a string matching /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*-\d{3}(-[A-Z]+)?$/
    // — no path separators, no traversal, safe for use in filenames.
    const safeTaskId: string = taskId;

    // Resolve paths - go up from apps/project-tracker to project root
    const projectRoot = join(process.cwd(), '..', '..');
    const specifyDir = join(projectRoot, '.specify');
    const sprintsRoot = join(specifyDir, 'sprints');

    // Load task from CSV
    const tasks = await loadTasks();
    const task = tasks.find((t) => t['Task ID'] === safeTaskId);

    if (!task) {
      return NextResponse.json(
        { success: false, error: `Task ${safeTaskId} not found in Sprint_plan.csv` },
        { status: 404 }
      );
    }

    // Get sprint number from task — validated to a safe integer.
    const sprintNumber = sanitizeSprintNumber(task['Target Sprint']) ?? 0;

    const resolved = resolvePlanPaths(safeTaskId, sprintNumber, sprintsRoot, specifyDir);
    if ('error' in resolved) {
      return NextResponse.json(
        { success: false, error: resolved.error },
        { status: resolved.status }
      );
    }
    const { specPath, planPath, planningDir, legacySpecPath } = resolved;

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

    // Update status to "Planning" at the start
    await updateTaskStatus(safeTaskId, 'Planning');

    // Ensure sprint directories exist — `planningDir` was validated above.
    await mkdir(planningDir, { recursive: true });

    // Check if already has plan (unless force regenerate) — avoid existsSync race
    // by attempting readFile; ENOENT means it doesn't exist yet.
    let planAlreadyExists = false;
    try {
      await readFile(planPath, 'utf-8');
      planAlreadyExists = true;
    } catch {
      // ENOENT — plan does not exist yet, proceed
    }
    if (planAlreadyExists && !forceRegenerate) {
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

    // Read spec to get domain info — try new sprint path first, fall back to legacy.
    const specContent = await readSpecWithLegacyFallback(specPath, legacySpecPath);
    if (specContent === null) {
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
    const domain = extractDomainFromSpec(specContent);

    // Phase 2: Plan Generation
    const planContent = generatePlan(task, domain, sprintNumber);
    await writeFile(planPath, planContent, 'utf-8');

    // Update task artifacts in CSV
    await updateTaskArtifacts(safeTaskId, {
      plan: `.specify/sprints/sprint-${sprintNumber}/planning/${safeTaskId}-plan.md`,
    });

    // Update status to "Plan Complete"
    await updateTaskStatus(safeTaskId, 'Plan Complete');

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
      await rollbackToPlanningStatus(taskId);
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

const AGENT_DOMAIN_MAP: Array<[string, string]> = [
  ['Frontend-Lead', 'frontend'],
  ['Backend-Architect', 'backend'],
  ['AI-Specialist', 'ai'],
  ['Security-Lead', 'security'],
  ['DevOps-Lead', 'devops'],
];

function extractDomainFromSpec(specContent: string): string {
  const domainMatch = /Domain:\s*(\w+)/i.exec(specContent);
  if (domainMatch) return domainMatch[1].toLowerCase();
  const agentEntry = AGENT_DOMAIN_MAP.find(([agent]) => specContent.includes(agent));
  return agentEntry ? agentEntry[1] : 'general';
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
      .map((a) => a.replaceAll('ARTIFACT:', '').trim()) || [];
  const validations =
    task['Validation Method']
      ?.split(';')
      .filter((v) => v.startsWith('VALIDATE:'))
      .map((v) => v.replaceAll('VALIDATE:', '').trim()) || [];

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
  return words < 10 ? '30 min' : '45 min';
}
