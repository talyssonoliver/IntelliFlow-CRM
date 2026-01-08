import { NextResponse } from 'next/server';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import Papa from 'papaparse';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface PlanRequest {
  taskId: string;
  forceRegenerate?: boolean;
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

interface PhaseResult {
  status: string;
  path?: string;
  sources?: number;
  dependencies?: number;
  patterns?: number;
  steps?: number;
  checkpoints?: number;
  effort?: string;
  domain?: string;
  agents?: string[];
  acceptanceCriteria?: number;
}

/**
 * POST /api/matop/plan
 *
 * Runs MATOP Phases 0-2 for a task:
 * - Phase 0: Context Hydration (gather dependencies, codebase patterns)
 * - Phase 0.5: Agent Selection (pick optimal agents)
 * - Phase 1: Spec Session (generate specification)
 * - Phase 2: Plan Session (generate TDD execution plan)
 */
export async function POST(request: Request) {
  try {
    const body: PlanRequest = await request.json();
    const { taskId, forceRegenerate = false } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    // Resolve paths - go up from apps/project-tracker to project root
    const projectRoot = join(process.cwd(), '..', '..');
    const specifyDir = join(projectRoot, '.specify');
    const specPath = join(specifyDir, 'specifications', `${taskId}-spec.md`);
    const planPath = join(specifyDir, 'planning', `${taskId}-plan.md`);
    const contextPath = join(specifyDir, 'context', taskId, 'hydrated-context.md');
    const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');

    // Check if already planned (unless force regenerate)
    const specExists = existsSync(specPath);
    const planExists = existsSync(planPath);
    const contextExists = existsSync(contextPath);

    if (specExists && planExists && contextExists && !forceRegenerate) {
      return NextResponse.json({
        success: true,
        taskId,
        status: 'already_planned',
        phases: {
          contextHydration: { status: 'exists', path: contextPath },
          specification: { status: 'exists', path: specPath },
          plan: { status: 'exists', path: planPath },
        },
        message: `${taskId} already has spec and plan. Use forceRegenerate: true to regenerate.`,
      });
    }

    // Load task from CSV
    const csvContent = await readFile(csvPath, 'utf-8');
    const { data } = Papa.parse<TaskRecord>(csvContent, { header: true, skipEmptyLines: true });
    const tasks = data;
    const task = tasks.find((t) => t['Task ID'] === taskId);

    if (!task) {
      return NextResponse.json(
        { success: false, error: `Task ${taskId} not found in Sprint_plan.csv` },
        { status: 404 }
      );
    }

    // Ensure directories exist
    await mkdir(join(specifyDir, 'specifications'), { recursive: true });
    await mkdir(join(specifyDir, 'planning'), { recursive: true });
    await mkdir(join(specifyDir, 'context', taskId), { recursive: true });

    // Phase 0: Context Hydration
    const contextResult = await generateContext(task, tasks, projectRoot);
    await writeFile(contextPath, contextResult.content, 'utf-8');

    // Phase 0.5: Agent Selection
    const agentResult = selectAgentsForTask(task);

    // Phase 1: Specification
    const specContent = generateSpecification(task, tasks, agentResult.agents);
    await writeFile(specPath, specContent, 'utf-8');

    // Phase 2: Plan
    const planContent = generatePlan(task, agentResult.domain);
    await writeFile(planPath, planContent, 'utf-8');

    // Update task artifacts in CSV
    await updateTaskArtifacts(taskId, csvPath, tasks);

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
        acceptanceCriteria: task['Definition of Done']?.split(';').filter(Boolean).length || 0,
      },
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
      status: 'planned',
      phases,
      message: `${taskId} planned using MATOP workflow. Context: ${contextResult.sources} sources, ${contextResult.dependencies} deps. Plan: ${phases.plan.steps} steps.`,
    });
  } catch (error) {
    console.error('MATOP planning failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'MATOP planning failed',
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
  const deps = task.Dependencies?.split(',').map((d) => d.trim()).filter(Boolean) || [];

  // Get dependency details
  const depDetails = deps.map((depId) => {
    const depTask = allTasks.find((t) => t['Task ID'] === depId);
    return {
      taskId: depId,
      description: depTask?.Description || 'Not found',
      status: depTask?.Status || 'Unknown',
      artifacts: depTask?.['Artifacts To Track'] || '',
    };
  });

  // Check for existing specs/plans from dependencies
  const specifyDir = join(projectRoot, '.specify');
  const depArtifacts = await Promise.all(
    deps.map(async (depId) => {
      const depSpecPath = join(specifyDir, 'specifications', `${depId}-spec.md`);
      const depPlanPath = join(specifyDir, 'planning', `${depId}-plan.md`);
      return {
        taskId: depId,
        hasSpec: existsSync(depSpecPath),
        hasPlan: existsSync(depPlanPath),
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

${depDetails.length > 0 ? depDetails.map((d) => `### ${d.taskId}
- **Status**: ${d.status}
- **Description**: ${d.description}
- **Artifacts**: ${d.artifacts || 'None'}`).join('\n\n') : 'No dependencies'}

## Dependency Artifacts

${depArtifacts.map((a) => `- **${a.taskId}**: Spec: ${a.hasSpec ? 'Yes' : 'No'}, Plan: ${a.hasPlan ? 'Yes' : 'No'}`).join('\n') || 'None'}

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
*Mode: MATOP Context Hydration*
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

function generateSpecification(task: TaskRecord, allTasks: TaskRecord[], agents: string[]): string {
  const deps = task.Dependencies?.split(',').map((d) => d.trim()).filter(Boolean) || [];
  const depDetails = deps.map((depId) => {
    const depTask = allTasks.find((t) => t['Task ID'] === depId);
    return depTask
      ? `- **${depId}**: ${depTask.Description}`
      : `- **${depId}**: (not found)`;
  }).join('\n');

  const dod = task['Definition of Done']?.split(';').map((d) => d.trim()).filter(Boolean) || [];
  const artifacts = task['Artifacts To Track']?.split(';')
    .filter((a) => a.startsWith('ARTIFACT:'))
    .map((a) => a.replace('ARTIFACT:', '').trim()) || [];

  return `# Specification: ${task['Task ID']}

## Overview

**Task ID**: ${task['Task ID']}
**Section**: ${task.Section}
**Owner**: ${task.Owner}
**Sprint**: ${task['Target Sprint']}
**Generated By**: MATOP Spec Session

## Description

${task.Description}

## Technical Approach

This task will be implemented following these principles:
1. **Context-Driven**: All implementation decisions informed by hydrated context
2. **TDD-Based**: Test-first development with RED → GREEN → REFACTOR cycle
3. **Agent-Verified**: Specification reviewed by domain experts

### Selected Agents

${agents.map((a) => `- ${a}`).join('\n')}

## Dependencies

${depDetails || 'No dependencies'}

## Components to Create

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
${artifacts.map((a) => `| ${a.split('/').pop()} | Implementation | \`${a}\` | Task artifact |`).join('\n') || '| TBD | Implementation | TBD | See Definition of Done |'}

## Acceptance Criteria

${dod.map((d, i) => `- [ ] AC-${i + 1}: ${d}`).join('\n') || '- [ ] AC-1: Implementation complete\n- [ ] AC-2: Tests passing'}

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
${dod.map((d) => `- Verify: ${d}`).join('\n') || '- Standard edge case coverage'}

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
*MATOP Phase 1: Spec Session*
`;
}

function generatePlan(task: TaskRecord, domain: string): string {
  const dod = task['Definition of Done']?.split(';').map((d) => d.trim()).filter(Boolean) || [];
  const artifacts = task['Artifacts To Track']?.split(';')
    .filter((a) => a.startsWith('ARTIFACT:'))
    .map((a) => a.replace('ARTIFACT:', '').trim()) || [];
  const validations = task['Validation Method']?.split(';')
    .filter((v) => v.startsWith('VALIDATE:'))
    .map((v) => v.replace('VALIDATE:', '').trim()) || [];

  const totalSteps = 2 + dod.length + 2; // Setup + DoD items + Integration + Validation

  return `# Execution Plan: ${task['Task ID']}

## Overview

This plan decomposes the specification into actionable TDD steps.
- **Domain**: ${domain}
- **Total Steps**: ${totalSteps}

## Pre-flight Checks

1. [ ] Dependencies verified: ${task.Dependencies || 'None'}
2. [ ] Specification reviewed: \`.specify/specifications/${task['Task ID']}-spec.md\`
3. [ ] Context pack acknowledged
4. [ ] Feature branch created: \`feat/${task['Task ID'].toLowerCase()}\`

## Phase 1: Setup & Preparation

### Step 1: Environment Setup
**Type**: Preparation
**TDD Phase**: N/A
**Duration**: 15 min
**Actions**:
- [ ] Review specification at \`.specify/specifications/${task['Task ID']}-spec.md\`
- [ ] Review hydrated context at \`.specify/context/${task['Task ID']}/hydrated-context.md\`
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

${dod.map((d, i) => `### Step ${i + 3}: ${d}
**Type**: Implementation
**TDD Phase**: RED → GREEN → REFACTOR
**Acceptance Criteria**: AC-${i + 1}
**Duration**: ${estimateStepDuration(d)}
**Actions**:
- [ ] Write failing test (RED)
- [ ] Implement minimal code to pass (GREEN)
- [ ] Refactor for quality (REFACTOR)
- [ ] Verify AC-${i + 1} is satisfied
`).join('\n')}

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
${validations.map((v) => `- [ ] Run: \`${v}\``).join('\n') || '- [ ] Manual validation review'}
- [ ] Create evidence bundle
- [ ] Update task status

## Integration Checkpoints

| After Step | Verify | Command |
|------------|--------|---------|
| Step 2 | Tests scaffold | \`pnpm test --passWithNoTests\` |
| Step ${Math.floor(dod.length / 2) + 3} | Midpoint check | \`pnpm typecheck\` |
| Step ${dod.length + 3} | Full integration | \`pnpm test && pnpm build\` |

## Expected Artifacts

${artifacts.map((a) => `- [ ] \`${a}\``).join('\n') || `- [ ] Implementation files for ${task['Task ID']}\n- [ ] Test files`}

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
*MATOP Phase 2: Plan Session*
`;
}

async function updateTaskArtifacts(taskId: string, csvPath: string, tasks: TaskRecord[]): Promise<void> {
  const taskIndex = tasks.findIndex((t) => t['Task ID'] === taskId);
  if (taskIndex === -1) return;

  const task = tasks[taskIndex];
  const currentArtifacts = task['Artifacts To Track'] || '';

  // Add SPEC and PLAN artifacts if not present
  const specArtifact = `SPEC:.specify/specifications/${taskId}-spec.md`;
  const planArtifact = `PLAN:.specify/planning/${taskId}-plan.md`;
  const contextArtifact = `CONTEXT:.specify/context/${taskId}/hydrated-context.md`;

  const parts = currentArtifacts.split(';').map((p) => p.trim()).filter(Boolean);
  const hasSpec = parts.some((p) => p.startsWith('SPEC:'));
  const hasPlan = parts.some((p) => p.startsWith('PLAN:'));
  const hasContext = parts.some((p) => p.startsWith('CONTEXT:'));

  const newParts = [...parts];
  if (!hasSpec) newParts.unshift(specArtifact);
  if (!hasPlan) newParts.unshift(planArtifact);
  if (!hasContext) newParts.unshift(contextArtifact);

  if (!hasSpec || !hasPlan || !hasContext) {
    tasks[taskIndex] = {
      ...task,
      'Artifacts To Track': newParts.join(';'),
      Status: task.Status === 'Backlog' ? 'Planned' : task.Status,
    };

    const updatedCsv = Papa.unparse(tasks, { header: true, quotes: true });
    await writeFile(csvPath, updatedCsv, 'utf-8');
  }
}

function extractKeywords(description: string): string[] {
  const words = description.toLowerCase().split(/\W+/);
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that', 'these', 'those', 'it', 'its']);
  return words.filter((w) => w.length > 3 && !stopWords.has(w));
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
