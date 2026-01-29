import { NextResponse } from 'next/server';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import {
  loadTasks,
  updateTaskStatus,
  updateTaskArtifacts,
  type TaskRecord,
} from '@/lib/csv-status';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface SpecRequest {
  taskId: string;
  forceRegenerate?: boolean;
}

interface PhaseResult {
  status: string;
  path?: string;
  sources?: number;
  dependencies?: number;
  patterns?: number;
  domain?: string;
  agents?: string[];
  acceptanceCriteria?: number;
}

/**
 * POST /api/matop/spec
 *
 * SESSION 1: Specification Session
 * Runs MATOP Phases 0-1 for a task:
 * - Phase 0: Context Hydration (gather dependencies, codebase patterns)
 * - Phase 0.5: Agent Selection (pick optimal agents)
 * - Phase 1: Spec Session (generate specification)
 *
 * Updates Sprint_plan.csv status: Specifying -> Spec Complete
 * Does NOT generate the plan (that's SESSION 2)
 */
export async function POST(request: Request) {
  let taskId: string | undefined;

  try {
    const body: SpecRequest = await request.json();
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
    const task = tasks.find((t: TaskRecord) => t['Task ID'] === taskId);

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
    const contextPath = join(sprintDir, 'context', taskId, 'hydrated-context.md');

    // Check if already has spec (unless force regenerate) - check both new and legacy locations
    const legacySpecPath = join(specifyDir, 'specifications', `${taskId}-spec.md`);
    const legacyContextPath = join(specifyDir, 'context', taskId, 'hydrated-context.md');
    const specExists = existsSync(specPath) || existsSync(legacySpecPath);
    const contextExists = existsSync(contextPath) || existsSync(legacyContextPath);

    if (specExists && contextExists && !forceRegenerate) {
      return NextResponse.json({
        success: true,
        taskId,
        status: 'already_specified',
        phases: {
          contextHydration: { status: 'exists', path: contextPath },
          specification: { status: 'exists', path: specPath },
        },
        message: `${taskId} already has spec. Use forceRegenerate: true to regenerate.`,
      });
    }

    // Update status to "Specifying" at the start
    await updateTaskStatus(taskId, 'Specifying');

    // Ensure sprint directories exist
    await mkdir(join(sprintDir, 'specifications'), { recursive: true });
    await mkdir(join(sprintDir, 'context', taskId), { recursive: true });

    // Phase 0: Context Hydration
    const contextResult = await generateContext(task, tasks, projectRoot);
    await writeFile(contextPath, contextResult.content, 'utf-8');

    // Phase 0.5: Agent Selection
    const agentResult = selectAgentsForTask(task);

    // Phase 1: Specification
    const specContent = generateSpecification(task, tasks, agentResult.agents);
    await writeFile(specPath, specContent, 'utf-8');

    // Update task artifacts in CSV
    await updateTaskArtifacts(taskId, {
      spec: `.specify/sprints/sprint-${sprintNumber}/specifications/${taskId}-spec.md`,
      context: `.specify/sprints/sprint-${sprintNumber}/context/${taskId}/hydrated-context.md`,
    });

    // Update status to "Spec Complete"
    await updateTaskStatus(taskId, 'Spec Complete');

    // Build response
    const phases: Record<string, PhaseResult> = {
      contextHydration: {
        status: 'completed',
        path: contextPath,
        sources: contextResult.sources,
        dependencies: contextResult.dependencies,
        patterns: contextResult.patterns,
      },
      agentSelection: {
        status: 'completed',
        domain: agentResult.domain,
        agents: agentResult.agents,
      },
      specification: {
        status: 'completed',
        path: specPath,
        acceptanceCriteria:
          task['Definition of Done']?.split(';').filter(Boolean).length || 0,
      },
    };

    return NextResponse.json({
      success: true,
      taskId,
      status: 'spec_complete',
      csvStatus: 'Spec Complete',
      phases,
      message: `SESSION 1 complete: ${taskId} spec generated. Context: ${contextResult.sources} sources, ${contextResult.dependencies} deps. Ready for SESSION 2: Plan.`,
      nextSession: 'plan',
    });
  } catch (error) {
    console.error('MATOP spec session failed:', error);

    // Rollback status on failure
    if (taskId) {
      try {
        await updateTaskStatus(taskId, 'Planned');
      } catch {
        // Ignore rollback errors
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: 'MATOP spec session failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

async function generateContext(
  task: TaskRecord,
  allTasks: TaskRecord[],
  projectRoot: string
): Promise<{ content: string; sources: number; dependencies: number; patterns: number }> {
  const deps =
    task.Dependencies?.split(',')
      .map((d: string) => d.trim())
      .filter(Boolean) || [];

  // Get dependency details
  const depDetails = deps.map((depId: string) => {
    const depTask = allTasks.find((t: TaskRecord) => t['Task ID'] === depId);
    return {
      taskId: depId,
      description: depTask?.Description || 'Not found',
      status: depTask?.Status || 'Unknown',
      artifacts: depTask?.['Artifacts To Track'] || '',
    };
  });

  // Check for existing specs from dependencies (check sprint-based paths)
  const specifyDir = join(projectRoot, '.specify');
  const depArtifacts = await Promise.all(
    deps.map(async (depId: string) => {
      const depTask = allTasks.find((t: TaskRecord) => t['Task ID'] === depId);
      const depSprint = parseInt(depTask?.['Target Sprint'] || '0', 10);
      const depSprintDir = join(specifyDir, 'sprints', `sprint-${depSprint}`);

      // Check both new sprint-based paths and legacy paths
      const depSpecPathNew = join(depSprintDir, 'specifications', `${depId}-spec.md`);
      const depSpecPathLegacy = join(specifyDir, 'specifications', `${depId}-spec.md`);
      const depPlanPathNew = join(depSprintDir, 'planning', `${depId}-plan.md`);
      const depPlanPathLegacy = join(specifyDir, 'planning', `${depId}-plan.md`);

      return {
        taskId: depId,
        hasSpec: existsSync(depSpecPathNew) || existsSync(depSpecPathLegacy),
        hasPlan: existsSync(depPlanPathNew) || existsSync(depPlanPathLegacy),
      };
    })
  );

  // Simple pattern matching - look for keywords in task description
  const keywords = extractKeywords(task.Description);
  const patterns = keywords.slice(0, 5);

  const content = `# Hydrated Context: ${task['Task ID']}

## Task Metadata

- **Task ID**: ${task['Task ID']}
- **Section**: ${task.Section}
- **Owner**: ${task.Owner}
- **Sprint**: ${task['Target Sprint']}
- **Status**: ${task.Status}

## Description

${task.Description}

## Definition of Done

${task['Definition of Done'] || 'None specified'}

## KPIs

${task.KPIs || 'None specified'}

## Pre-requisites

${task['Pre-requisites'] || 'None specified'}

## Dependency Chain

${
  depDetails.length > 0
    ? depDetails
        .map(
          (d: { taskId: string; status: string; description: string; artifacts: string }) => `### ${d.taskId}
- **Status**: ${d.status}
- **Description**: ${d.description}
- **Artifacts**: ${d.artifacts || 'None'}`
        )
        .join('\n\n')
    : 'No dependencies'
}

## Dependency Artifacts

${
  depArtifacts
    .map((a: { taskId: string; hasSpec: boolean; hasPlan: boolean }) => `- **${a.taskId}**: Spec: ${a.hasSpec ? 'Yes' : 'No'}, Plan: ${a.hasPlan ? 'Yes' : 'No'}`)
    .join('\n') || 'None'
}

## Codebase Patterns

Keywords extracted for pattern matching:
${patterns.map((p) => `- ${p}`).join('\n') || '- No patterns identified'}

## Project Knowledge

- **CLAUDE.md**: Project conventions and standards
- **Architecture docs**: docs/planning/adr/
- **Domain models**: packages/domain/src/
- **Validators**: packages/validators/src/

## Context Sources

1. Sprint_plan.csv (task metadata)
2. Dependency chain analysis (${deps.length} dependencies)
3. Artifact verification (.specify/ directory)
4. Keyword extraction (${patterns.length} patterns)

---

*Generated: ${new Date().toISOString()}*
*Session: MATOP SESSION 1 - Spec*
*Phase: Context Hydration*
`;

  return {
    content,
    sources: 4,
    dependencies: deps.length,
    patterns: patterns.length,
  };
}

function selectAgentsForTask(task: TaskRecord): { domain: string; agents: string[] } {
  const text = `${task.Description} ${task.Section}`.toLowerCase();

  let domain = 'general';
  const agents: string[] = ['Domain-Expert', 'Test-Engineer']; // Always included

  if (text.match(/frontend|ui|component|page|form|dashboard|react|next/)) {
    domain = 'frontend';
    agents.push('Frontend-Lead');
  }
  if (text.match(/backend|api|router|endpoint|database|prisma|trpc/)) {
    domain = 'backend';
    agents.push('Backend-Architect');
  }
  if (text.match(/ai|ml|embedding|vector|langchain|model|agent|llm/)) {
    domain = 'ai';
    agents.push('AI-Specialist');
  }
  if (text.match(/security|auth|permission|encrypt|token|rbac/)) {
    domain = 'security';
    agents.push('Security-Lead');
  }
  if (text.match(/docker|deploy|ci|pipeline|infra|monitoring/)) {
    domain = 'devops';
    agents.push('DevOps-Lead');
  }
  if (text.match(/schema|migration|query|database|model|prisma/)) {
    agents.push('Data-Engineer');
  }

  // Ensure at least 3 agents
  if (agents.length < 3) {
    agents.push('Backend-Architect');
  }

  return { domain, agents: [...new Set(agents)].slice(0, 5) };
}

function generateSpecification(
  task: TaskRecord,
  allTasks: TaskRecord[],
  agents: string[]
): string {
  const deps =
    task.Dependencies?.split(',')
      .map((d: string) => d.trim())
      .filter(Boolean) || [];
  const depDetails = deps
    .map((depId: string) => {
      const depTask = allTasks.find((t: TaskRecord) => t['Task ID'] === depId);
      return depTask
        ? `- **${depId}**: ${depTask.Description}`
        : `- **${depId}**: (not found)`;
    })
    .join('\n');

  const dod =
    task['Definition of Done']
      ?.split(';')
      .map((d: string) => d.trim())
      .filter(Boolean) || [];
  const artifacts =
    task['Artifacts To Track']
      ?.split(';')
      .filter((a: string) => a.startsWith('ARTIFACT:'))
      .map((a: string) => a.replace('ARTIFACT:', '').trim()) || [];

  return `# Specification: ${task['Task ID']}

## Overview

**Task ID**: ${task['Task ID']}
**Section**: ${task.Section}
**Owner**: ${task.Owner}
**Sprint**: ${task['Target Sprint']}
**Generated By**: MATOP SESSION 1 - Spec

## Description

${task.Description}

## Technical Approach

This task will be implemented following these principles:
1. **Context-Driven**: All implementation decisions informed by hydrated context
2. **TDD-Based**: Test-first development with RED -> GREEN -> REFACTOR cycle
3. **Agent-Verified**: Specification reviewed by domain experts

### Selected Agents

${agents.map((a: string) => `- ${a}`).join('\n')}

## Dependencies

${depDetails || 'No dependencies'}

## Components to Create

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
${
  artifacts
    .map((a: string) => `| ${a.split('/').pop()} | Implementation | \`${a}\` | Task artifact |`)
    .join('\n') || '| TBD | Implementation | TBD | See Definition of Done |'
}

## Acceptance Criteria

${
  dod.map((d: string, i: number) => `- [ ] AC-${i + 1}: ${d}`).join('\n') ||
  '- [ ] AC-1: Implementation complete\n- [ ] AC-2: Tests passing'
}

## Test Requirements

### Unit Tests
- Unit tests for all new functions/methods
- Edge case coverage for business logic
- Mocking for external dependencies

### Integration Tests
- API endpoint tests (if applicable)
- Data flow validation
- Cross-module integration

### Edge Cases
${dod.map((d: string) => `- Verify: ${d}`).join('\n') || '- Standard edge case coverage'}

## KPIs

${task.KPIs || 'None specified'}

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Dependencies incomplete | Verify status before starting |
| Scope creep | Stick strictly to Definition of Done |
| Integration issues | Run integration tests early |

## Agent Sign-off

${agents.map((a) => `- [ ] ${a}: Pending`).join('\n')}

---

*Generated: ${new Date().toISOString()}*
*Session: MATOP SESSION 1 - Spec*
*Next: SESSION 2 - Plan*
`;
}

function extractKeywords(description: string): string[] {
  const words = description.toLowerCase().split(/\W+/);
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
    'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have',
    'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'this', 'that', 'these', 'those',
    'it', 'its',
  ]);
  return words.filter((w) => w.length > 3 && !stopWords.has(w));
}
