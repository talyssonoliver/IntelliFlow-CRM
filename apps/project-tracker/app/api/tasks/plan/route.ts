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
    const specDir = join(projectRoot, '.specify');
    const specFile = join(specDir, 'specifications', `${taskId}.md`);
    const planFile = join(specDir, 'planning', `${taskId}.md`);
    const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');

    // Check if spec already exists
    const specExists = existsSync(specFile);
    const planExists = existsSync(planFile);

    if (specExists && planExists) {
      return NextResponse.json({
        success: true,
        taskId,
        status: 'already_planned',
        specPath: `.specify/specifications/${taskId}.md`,
        planPath: `.specify/planning/${taskId}.md`,
        message: `Task ${taskId} already has spec and plan.`,
      });
    }

    // Read CSV to get task details
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

    // Ensure directories exist
    await mkdir(join(specDir, 'specifications'), { recursive: true });
    await mkdir(join(specDir, 'planning'), { recursive: true });

    const currentArtifacts = task['Artifacts To Track'] || '';
    const newArtifacts = addSpecPlanToArtifacts(currentArtifacts, taskId);

    const enrichedTask: TaskRecord = {
      ...task,
      'Artifacts To Track': newArtifacts,
    };

    // Generate specification
    const specContent = generateSpecification(enrichedTask, tasks);
    await writeFile(specFile, specContent, 'utf-8');

    // Generate implementation plan
    const planContent = generatePlan(enrichedTask);
    await writeFile(planFile, planContent, 'utf-8');

    tasks[taskIndex] = {
      ...task,
      'Artifacts To Track': newArtifacts,
      Status: task.Status === 'Backlog' ? 'Planned' : task.Status,
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
      newStatus: task.Status === 'Backlog' ? 'Planned' : task.Status,
      specPath: `.specify/specifications/${taskId}.md`,
      planPath: `.specify/planning/${taskId}.md`,
      message: `Task ${taskId} planned successfully. Spec and plan created.`,
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

function addSpecPlanToArtifacts(current: string, taskId: string): string {
  const specPath = `SPEC:.specify/specifications/${taskId}.md`;
  const planPath = `PLAN:.specify/planning/${taskId}.md`;
  const contextPackPath = `EVIDENCE:artifacts/attestations/${taskId}/context_pack.md`;
  const contextAckPath = `EVIDENCE:artifacts/attestations/${taskId}/context_ack.json`;

  const parts = current
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);

  // Remove existing SPEC:/PLAN:/EVIDENCE context entries to avoid duplicates
  const filtered = parts.filter(
    (p) =>
      !p.startsWith('SPEC:') &&
      !p.startsWith('PLAN:') &&
      !p.includes('context_pack') &&
      !p.includes('context_ack')
  );

  // Add new ones at the beginning
  return [specPath, planPath, contextPackPath, contextAckPath, ...filtered].join(';');
}

function generateSpecification(task: TaskRecord, allTasks: TaskRecord[]): string {
  const deps = task.Dependencies.split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  const depDetails = deps
    .map((depId) => {
      const depTask = allTasks.find((t) => t['Task ID'] === depId);
      return depTask ? `- **${depId}**: ${depTask.Description}` : `- **${depId}**: (not found)`;
    })
    .join('\n');

  return `# Specification: ${task['Task ID']}

## Overview

**Task ID**: ${task['Task ID']}
**Section**: ${task.Section}
**Owner**: ${task.Owner}
**Sprint**: ${task['Target Sprint']}
**Status**: ${task.Status || 'Backlog'}

## Description

${task.Description}

## Dependencies

${depDetails || 'No dependencies'}

## Pre-requisites

${task['Pre-requisites'] || 'None specified'}

## Definition of Done

${task['Definition of Done']}

## KPIs & Targets

${task.KPIs || 'None specified'}

## Expected Artifacts

${
  task['Artifacts To Track']
    .split(';')
    .filter((a) => a.startsWith('ARTIFACT:'))
    .map((a) => `- ${a.replace('ARTIFACT:', '')}`)
    .join('\n') || 'None specified'
}

## Validation Method

${task['Validation Method'] || 'Manual review'}

## Required References & Context

- Brand standards: docs/company/brand/style-guide.md
- Page inventory: docs/design/page-registry.md
- Sitemap: docs/design/sitemap.md
- User flows (consult relevant flow docs under apps/project-tracker/docs/metrics/_global/flows and Flow_to_Task_Quick_Reference.md)
- Past dependencies: ${deps.join(', ') || 'None'}
- Context controls: artifacts/sprint0/codex-run/Framework.md (Context Pack + Context Ack requirements)

---

*Generated: ${new Date().toISOString()}*
`;
}

function generatePlan(task: TaskRecord): string {
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
- Context Pack/Ack: build context pack and record ack at \`artifacts/attestations/${task['Task ID']}/context_pack.md\` and \`context_ack.json\`

## Phase 1: Setup & Preparation

1. [ ] Review specification at \`.specify/specifications/${task['Task ID']}.md\`
2. [ ] Verify all dependencies are DONE (check dependency graph and prerequisite artifacts)
3. [ ] Build Context Pack for this task and store at \`artifacts/attestations/${task['Task ID']}/context_pack.md\`
4. [ ] Record Context Ack (\`context_ack.json\`) acknowledging files read and invariants
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
2. [ ] Ensure context_ack.json is present in \`artifacts/attestations/${task['Task ID']}/\`
3. [ ] Create evidence bundle at \`artifacts/attestations/${task['Task ID']}/\`
4. [ ] Mark as "Completed" when all criteria met and audits pass

---

*Generated: ${new Date().toISOString()}*
*Spec: .specify/specifications/${task['Task ID']}.md*
`;
}

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

// GET endpoint to check planning status
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json({ error: 'taskId query param required' }, { status: 400 });
  }

  const projectRoot = join(process.cwd(), '..', '..');
  const specFile = join(projectRoot, '.specify', 'specifications', `${taskId}.md`);
  const planFile = join(projectRoot, '.specify', 'planning', `${taskId}.md`);

  const specExists = existsSync(specFile);
  const planExists = existsSync(planFile);

  return NextResponse.json(
    {
      taskId,
      hasSpec: specExists,
      hasPlan: planExists,
      isPlanned: specExists && planExists,
      specPath: specExists ? `.specify/specifications/${taskId}.md` : null,
      planPath: planExists ? `.specify/planning/${taskId}.md` : null,
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
