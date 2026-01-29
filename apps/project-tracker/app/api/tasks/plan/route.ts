import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';

export const dynamic = 'force-dynamic';

interface PlanTaskRequest {
  taskId: string;
}

interface TaskRecord {
  'Task ID': string;
  Section: string;
  Description: string;
  Owner: string;
  Dependencies: string;
  'Pre-requisites': string;
  'Definition of Done': string;
  Status: string;
  KPIs: string;
  'Target Sprint': string;
  'Artifacts To Track': string;
  'Validation Method': string;
}

export async function POST(request: Request) {
  try {
    const body: PlanTaskRequest = await request.json();
    const { taskId } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const projectRoot = join(process.cwd(), '..', '..');
    const specifyDir = join(projectRoot, '.specify');
    const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');

    // Read CSV to get task details first (need sprint number)
    const csvContent = await readFile(csvPath, 'utf-8');
    const { data, meta } = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    const tasks = data as TaskRecord[];
    const taskIndex = tasks.findIndex((t) => t['Task ID'] === taskId);

    if (taskIndex === -1) {
      return NextResponse.json({ error: `Task ${taskId} not found` }, { status: 404 });
    }

    const task = tasks[taskIndex];
    const sprintNumber = parseInt(task['Target Sprint'] || '0', 10);
    const sprintDir = join(specifyDir, 'sprints', `sprint-${sprintNumber}`);

    // Sprint-based paths (new structure)
    const specFile = join(sprintDir, 'specifications', `${taskId}-spec.md`);
    const planFile = join(sprintDir, 'planning', `${taskId}-plan.md`);

    // Check if spec/plan already exists
    const specExists = existsSync(specFile);
    const planExists = existsSync(planFile);

    // SESSION 2: Plan requires spec to exist first (created in SESSION 1: Spec)
    if (!specExists) {
      return NextResponse.json({
        success: false,
        taskId,
        error: 'spec_required',
        message: `Spec must be completed first. Run SESSION 1: Spec for ${taskId}.`,
      }, { status: 400 });
    }

    // Plan already exists
    if (planExists) {
      return NextResponse.json({
        success: true,
        taskId,
        status: 'already_planned',
        specPath: `.specify/sprints/sprint-${sprintNumber}/specifications/${taskId}-spec.md`,
        planPath: `.specify/sprints/sprint-${sprintNumber}/planning/${taskId}-plan.md`,
        message: `Task ${taskId} already has a plan.`,
      });
    }

    // Ensure planning directory exists
    await mkdir(join(sprintDir, 'planning'), { recursive: true });

    // Add PLAN to artifacts if not present (SPEC should already be there from SESSION 1)
    const currentArtifacts = task['Artifacts To Track'] || '';
    const newArtifacts = addPlanToArtifacts(currentArtifacts, taskId, sprintNumber);

    const enrichedTask: TaskRecord = {
      ...task,
      'Artifacts To Track': newArtifacts,
    };

    // SESSION 2: Generate implementation plan ONLY (spec already exists from SESSION 1)
    const planContent = generatePlan(enrichedTask, sprintNumber);
    await writeFile(planFile, planContent, 'utf-8');

    tasks[taskIndex] = {
      ...task,
      'Artifacts To Track': newArtifacts,
      Status: task.Status === 'Spec Complete' ? 'Planned' : task.Status,
    };

    // Write updated CSV
    const updatedCsv = Papa.unparse(tasks, {
      header: true,
      quotes: true,
      columns: meta.fields,
    });

    await writeFile(csvPath, updatedCsv, 'utf-8');

    // Trigger sync
    try {
      await fetch(`${getBaseUrl(request)}/api/sync-metrics`, { method: 'POST' });
    } catch {
      // Sync failure is non-critical
    }

    return NextResponse.json({
      success: true,
      taskId,
      status: 'planned',
      previousStatus: task.Status,
      newStatus: task.Status === 'Spec Complete' ? 'Planned' : task.Status,
      specPath: `.specify/sprints/sprint-${sprintNumber}/specifications/${taskId}-spec.md`,
      planPath: `.specify/sprints/sprint-${sprintNumber}/planning/${taskId}-plan.md`,
      message: `SESSION 2 complete: Plan created for ${taskId}. Ready for SESSION 3: Exec.`,
    });
  } catch (error) {
    console.error('Error planning task:', error);
    return NextResponse.json(
      {
        error: 'Failed to plan task',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * SESSION 2: Add only PLAN path to artifacts (SPEC should already exist from SESSION 1)
 */
function addPlanToArtifacts(current: string, taskId: string, sprintNumber: number): string {
  const planPath = `PLAN:.specify/sprints/sprint-${sprintNumber}/planning/${taskId}-plan.md`;

  const parts = current
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);

  // Check if PLAN already exists
  if (parts.some((p) => p.startsWith('PLAN:'))) {
    return current; // Already has PLAN, don't duplicate
  }

  // Find SPEC position and insert PLAN after it
  const specIndex = parts.findIndex((p) => p.startsWith('SPEC:'));
  if (specIndex !== -1) {
    parts.splice(specIndex + 1, 0, planPath);
  } else {
    // No SPEC found, add PLAN at the beginning
    parts.unshift(planPath);
  }

  return parts.join(';');
}

function generatePlan(task: TaskRecord, sprintNumber: number): string {
  const artifacts = task['Artifacts To Track']
    .split(';')
    .filter((a) => a.startsWith('ARTIFACT:'))
    .map((a) => a.replace('ARTIFACT:', '').trim());

  const validations = task['Validation Method']
    .split(';')
    .filter((v) => v.startsWith('VALIDATE:'))
    .map((v) => v.replace('VALIDATE:', '').trim());

  const dodItems = task['Definition of Done']
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);

  const sprintDir = `.specify/sprints/sprint-${sprintNumber}`;

  return `# Implementation Plan: ${task['Task ID']}

## Overview

This plan outlines the implementation steps for **${task['Task ID']}**.

## Context Inputs (must be gathered before coding)

- Dependencies: ${task.Dependencies || 'None'}
- Definition of Done items: ${task['Definition of Done']}
- Artifacts to produce: ${artifacts.join(', ') || 'None specified'}
- Brand guide: docs/company/brand/style-guide.md
- Page registry: docs/design/page-registry.md
- Sitemap: docs/design/sitemap.md
- Relevant flows: review apps/project-tracker/docs/metrics/_global/flows and Flow_to_Task_Quick_Reference.md for this task
- Context Pack/Ack: build context pack and record ack at \`${sprintDir}/attestations/${task['Task ID']}/context_pack.md\` and \`attestation.json\`

## Phase 1: Setup & Preparation

1. [ ] Review specification at \`${sprintDir}/specifications/${task['Task ID']}-spec.md\`
2. [ ] Verify all dependencies are DONE (check dependency graph and prerequisite artifacts)
3. [ ] Build Context Pack for this task and store at \`${sprintDir}/attestations/${task['Task ID']}/context_pack.md\`
4. [ ] Record Context Ack (\`attestation.json\`) acknowledging files read and invariants
5. [ ] Set up local development environment
6. [ ] Create feature branch: \`feat/${task['Task ID'].toLowerCase()}\`

## Phase 2: Implementation

### Files to Create/Modify

${artifacts.map((a, i) => `${i + 1}. [ ] \`${a}\``).join('\n') || '- No specific artifacts defined'}

### Implementation Steps

Based on the Definition of Done and artifacts:

${dodItems.map((d, i) => `${i + 1}. [ ] ${d}`).join('\n') || '- No Definition of Done provided'}
${artifacts.length
    ? artifacts
        .map((a, i) => `${i + 1 + dodItems.length}. [ ] Produce artifact: ${a}`)
        .join('\n')
    : ''}

## Phase 2.5: TDD Harness

1. [ ] Identify key behaviors from Definition of Done and write tests first
2. [ ] Add/extend test suites to cover critical paths and edge cases
3. [ ] Keep tests in lockstep with implementation changes

## Phase 3: Testing

1. [ ] Write unit tests for new functionality
2. [ ] Run existing test suite: \`pnpm test\`
3. [ ] Verify coverage meets thresholds

## Phase 4: Validation

${validations.map((v, i) => `${i + 1}. [ ] Run: \`${v}\``).join('\n') || '1. [ ] Manual review'}

## Phase 5: Quality Gates

1. [ ] TypeScript compilation: \`pnpm typecheck\`
2. [ ] Linting: \`pnpm lint\`
3. [ ] Build: \`pnpm build\`
4. [ ] Security scan: \`pnpm audit\`

## Phase 6: Completion

1. [ ] Update task status to "In Progress" when starting
2. [ ] Ensure attestation.json is present in \`${sprintDir}/attestations/${task['Task ID']}/\`
3. [ ] Create evidence bundle at \`${sprintDir}/attestations/${task['Task ID']}/\`
4. [ ] Mark as "Completed" when all criteria met and audits pass

---

*Generated: ${new Date().toISOString()}*
*Spec: ${sprintDir}/specifications/${task['Task ID']}-spec.md*
`;
}

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

// Helper to get sprint number from CSV
async function getTaskSprintNumber(taskId: string): Promise<number> {
  const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');
  try {
    const csvContent = await readFile(csvPath, 'utf-8');
    const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    const task = (data as TaskRecord[]).find((t) => t['Task ID'] === taskId);
    return parseInt(task?.['Target Sprint'] || '0', 10);
  } catch {
    return 0;
  }
}

// GET endpoint to check planning status
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json({ error: 'taskId query param required' }, { status: 400 });
  }

  const projectRoot = join(process.cwd(), '..', '..');
  const specifyDir = join(projectRoot, '.specify');

  // Get task's sprint number for sprint-based path lookup
  const sprintNumber = await getTaskSprintNumber(taskId);
  const sprintDir = join(specifyDir, 'sprints', `sprint-${sprintNumber}`);

  // Sprint-based paths
  const specFile = join(sprintDir, 'specifications', `${taskId}-spec.md`);
  const planFile = join(sprintDir, 'planning', `${taskId}-plan.md`);
  const contextFile = join(sprintDir, 'context', taskId, 'hydrated-context.md');

  const specExists = existsSync(specFile);
  const planExists = existsSync(planFile);
  const contextExists = existsSync(contextFile);

  const specPath = specExists
    ? `.specify/sprints/sprint-${sprintNumber}/specifications/${taskId}-spec.md`
    : null;

  const planPath = planExists
    ? `.specify/sprints/sprint-${sprintNumber}/planning/${taskId}-plan.md`
    : null;

  return NextResponse.json(
    {
      taskId,
      sprintNumber,
      hasSpec: specExists,
      hasPlan: planExists,
      hasContext: contextExists,
      isPlanned: specExists && planExists,
      specPath,
      planPath,
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
