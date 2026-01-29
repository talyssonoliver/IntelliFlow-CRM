/**
 * Sprint Prompt Generator
 *
 * Generates Sprint Prompt markdown following the template structure
 * from Sprint0_prompt.md and Sprint1_prompt.md.
 */

import type {
  ExecutionPhase,
  ParallelStream,
  TaskPhaseEntry,
  SprintPromptData,
  MissionBrief,
  SprintOverview,
  ExecutionStrategySection,
  TaskSpecification,
  SuccessCriterion,
  CSVTask,
} from '../../../tools/scripts/lib/sprint/types';

interface GeneratorOptions {
  sprintNumber: number;
  tasks: CSVTask[];
  phases: ExecutionPhase[];
  parallelStreams: ParallelStream[];
  projectName?: string;
  theme?: string;
}

/**
 * Generate complete Sprint Prompt markdown
 */
export function generateSprintPrompt(options: GeneratorOptions): string {
  const {
    sprintNumber,
    tasks,
    phases,
    parallelStreams,
    projectName = 'IntelliFlow CRM',
    theme,
  } = options;

  const sprintTasks = tasks.filter((t) => t['Target Sprint'] === String(sprintNumber));
  const completedTasks = sprintTasks.filter((t) => t.Status === 'Done' || t.Status === 'Completed');
  const pendingTasks = sprintTasks.filter((t) => t.Status !== 'Done' && t.Status !== 'Completed');

  const sections: string[] = [];

  // Title and Mission Brief
  sections.push(generateHeader(sprintNumber, projectName));
  sections.push(generateMissionBrief(sprintNumber, projectName, theme || inferTheme(sprintTasks)));

  // Overview Table
  sections.push(generateOverviewTable(sprintTasks, completedTasks, pendingTasks, phases, theme));

  // Dependency Graph
  sections.push(generateDependencyGraphSection(phases, parallelStreams, sprintTasks));

  // Complete Task List
  sections.push(generateTaskListSection(completedTasks, pendingTasks));

  // Execution Strategy
  sections.push(generateExecutionStrategy(phases, parallelStreams, tasks));

  // Success Criteria
  sections.push(generateSuccessCriteria(sprintTasks));

  // Agent Orchestration Instructions
  sections.push(generateAgentInstructions(sprintNumber, phases));

  // Definition of Done
  sections.push(generateDefinitionOfDone(sprintNumber));

  return sections.join('\n\n---\n\n');
}

/**
 * Generate header section
 */
function generateHeader(sprintNumber: number, projectName: string): string {
  return `# Sprint ${sprintNumber} Sub-Agent Orchestration Prompt for Claude Code

## Mission Brief

You are orchestrating Sprint ${sprintNumber} of the **${projectName}** project.

**Execution Model**: Use \`claude --dangerously-skip-permissions\` for autonomous sub-agent spawning with the \`Task\` tool for parallel orchestration.

**Target Application**: All implementation work targets the **web app** (\`apps/web/\` at \`http://localhost:3000\`), not the project-tracker.`;
}

/**
 * Generate mission brief section
 */
function generateMissionBrief(sprintNumber: number, projectName: string, theme: string): string {
  return `## Sprint ${sprintNumber} Mission

**Project**: ${projectName}
**Sprint**: ${sprintNumber}
**Theme**: ${theme}

### Key Objectives
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

### Execution Guidelines
- Complete all achievable tasks for this sprint
- Spawn parallel sub-agents where possible for efficiency
- Validate all deliverables meet KPIs before marking complete
- Escalate blockers and human-intervention tasks promptly
- All implementation targets \`apps/web/\` and \`apps/api/\``;
}

/**
 * Generate overview table
 */
function generateOverviewTable(
  allTasks: CSVTask[],
  completed: CSVTask[],
  pending: CSVTask[],
  phases: ExecutionPhase[],
  theme?: string
): string {
  // Count by section
  const sectionCounts: Record<string, number> = {};
  for (const task of allTasks) {
    const section = task.Section || 'Other';
    sectionCounts[section] = (sectionCounts[section] || 0) + 1;
  }

  // Count parallel tasks
  const parallelTaskCount = phases
    .filter((p) => p.executionType === 'parallel')
    .reduce((sum, p) => sum + p.tasks.length, 0);

  const topSections = Object.entries(sectionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([section]) => section);

  return `## Sprint Overview

| Metric | Value |
|--------|-------|
| **Total Tasks** | ${allTasks.length} |
| **Completed** | ${completed.length} |
| **Pending** | ${pending.length} |
| **Phases** | ${phases.length} |
| **Parallel Tasks** | ${parallelTaskCount} |
| **Theme** | ${theme || inferTheme(allTasks)} |
| **Key Focus Areas** | ${topSections.join(', ')} |
| **Web App** | http://localhost:3000 |`;
}

/**
 * Generate dependency graph section
 */
function generateDependencyGraphSection(
  phases: ExecutionPhase[],
  parallelStreams: ParallelStream[],
  _tasks: CSVTask[]
): string {
  const lines: string[] = ['## Sprint Dependency Graph', '', '```'];

  // Header
  lines.push('EXECUTION PHASES');
  lines.push('='.repeat(60));
  lines.push('');

  // Draw each phase
  for (const phase of phases) {
    lines.push(`Phase ${phase.phaseNumber}: ${phase.name}`);
    lines.push('-'.repeat(40));

    if (phase.executionType === 'parallel') {
      // Group by stream
      const streamGroups = new Map<string, TaskPhaseEntry[]>();
      for (const task of phase.tasks) {
        const stream = task.parallelStreamId || 'default';
        if (!streamGroups.has(stream)) {
          streamGroups.set(stream, []);
        }
        streamGroups.get(stream)!.push(task);
      }

      // Show parallel notation
      lines.push('  [PARALLEL EXECUTION]');
      for (const [streamId, streamTasks] of streamGroups) {
        lines.push(`  Stream ${streamId}:`);
        for (const task of streamTasks) {
          const status = task.status === 'completed' ? '✓' : '○';
          lines.push(`    ${status} ${task.taskId}`);
        }
      }
      lines.push('  ↓ (all complete before next phase)');
    } else {
      // Sequential
      for (const task of phase.tasks) {
        const status = task.status === 'completed' ? '✓' : '○';
        lines.push(`  ${status} ${task.taskId} → ${task.description.slice(0, 40)}...`);
      }
      lines.push('  ↓');
    }

    lines.push('');
  }

  lines.push('='.repeat(60));
  lines.push('```');

  // Add parallel streams summary
  if (parallelStreams.length > 0) {
    lines.push('');
    lines.push('### Parallel Streams');
    lines.push('');
    lines.push('| Stream | Tasks | Dependencies |');
    lines.push('|--------|-------|--------------|');
    for (const stream of parallelStreams) {
      const deps =
        stream.sharedDependencies.length > 0 ? stream.sharedDependencies.join(', ') : 'None';
      lines.push(`| ${stream.streamId} | ${stream.tasks.join(', ')} | ${deps} |`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate complete task list section
 */
function generateTaskListSection(completed: CSVTask[], pending: CSVTask[]): string {
  const lines: string[] = ['## Complete Task List'];

  // Completed tasks
  if (completed.length > 0) {
    lines.push('');
    lines.push(`### Completed Tasks (${completed.length})`);
    lines.push('');
    lines.push('| Task ID | Section | Description | Status |');
    lines.push('|---------|---------|-------------|--------|');
    for (const task of completed) {
      lines.push(
        `| **${task['Task ID']}** | ${task.Section} | ${task.Description} | ✅ Completed |`
      );
    }
  }

  // Pending tasks
  if (pending.length > 0) {
    lines.push('');
    lines.push(`### Pending Tasks (${pending.length})`);
    lines.push('');
    lines.push('| Task ID | Section | Description | Owner | Dependencies | KPIs |');
    lines.push('|---------|---------|-------------|-------|--------------|------|');
    for (const task of pending) {
      const deps = task.Dependencies || 'None';
      const kpis = task.KPIs || '-';
      lines.push(
        `| **${task['Task ID']}** | ${task.Section} | ${task.Description} | ${task.Owner} | ${deps} | ${kpis} |`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Generate execution strategy section
 */
function generateExecutionStrategy(
  phases: ExecutionPhase[],
  parallelStreams: ParallelStream[],
  allTasks: CSVTask[]
): string {
  const lines: string[] = ['## Execution Strategy'];

  // Generate per-phase sections
  for (const phase of phases) {
    lines.push('');
    lines.push(
      `### Phase ${phase.phaseNumber}: ${phase.name} (${phase.executionType.charAt(0).toUpperCase() + phase.executionType.slice(1)})`
    );
    lines.push('');

    if (phase.executionType === 'parallel') {
      lines.push('Execute these streams **simultaneously** using the `Task` tool:');
      lines.push('');
      lines.push('```bash');
      lines.push('# Spawn parallel sub-agents');

      // Get unique streams in this phase
      const phaseStreams = new Set(phase.tasks.map((t) => t.parallelStreamId).filter(Boolean));
      for (const streamId of phaseStreams) {
        const streamTasks = phase.tasks.filter((t) => t.parallelStreamId === streamId);
        const streamName = inferStreamName(streamTasks);
        lines.push(`Task("${streamId}", "${streamName}") &`);
      }

      lines.push('```');
      lines.push('');
    }

    // Generate task specifications
    for (const task of phase.tasks) {
      const csvTask = allTasks.find((t) => t['Task ID'] === task.taskId);
      if (csvTask) {
        lines.push(generateTaskSpecification(csvTask, task));
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/**
 * Generate individual task specification
 */
function generateTaskSpecification(csvTask: CSVTask, phaseEntry: TaskPhaseEntry): string {
  const lines: string[] = [];

  lines.push(`### ${csvTask['Task ID']}: ${csvTask.Description}`);
  lines.push('');
  lines.push('### Key Objectives');
  lines.push('');
  lines.push('- Code: Deliver high-quality, tested code for the web app');
  lines.push('- Integration: Seamlessly integrate new features into existing architecture');
  lines.push('- Security: Ensure robust security and compliance');
  lines.push('- Performance: Optimize for speed and responsiveness');
  lines.push('- Aviability: Ensure high availability and reliability');
  lines.push('- Maintainability: Write clean, maintainable code');
  lines.push('- Documentation: Provide clear documentation and specs');
  lines.push('');
  lines.push('#### Context');
  lines.push(`Dependency: ${csvTask.Dependencies || 'None'}`);
  lines.push(`Owner: ${csvTask.Owner}`);
  lines.push(`Execution Mode: ${phaseEntry.executionMode.toUpperCase()}`);
  lines.push('');

  // Pre-requisites
  if (csvTask['Pre-requisites']) {
    lines.push('#### Pre-requisites');
    const prereqs = csvTask['Pre-requisites'].split(';').map((p) => p.trim());
    for (const prereq of prereqs) {
      if (prereq) lines.push(`- ${prereq}`);
    }
    lines.push('');
  }

  // Tasks (from Definition of Done)
  if (csvTask['Definition of Done']) {
    lines.push('#### Tasks');
    const tasks = csvTask['Definition of Done'].split(';').map((t) => t.trim());
    let taskNum = 1;
    for (const task of tasks) {
      if (task) {
        lines.push(`${taskNum}. ${task}`);
        taskNum++;
      }
    }
    lines.push('### Key Objectives');
    lines.push('');
    lines.push('- Code: Deliver high-quality, tested code for the web app');
    lines.push('- Integration: Seamlessly integrate new features into existing architecture');
    lines.push('- Security: Ensure robust security and compliance');
    lines.push('- Performance: Optimize for speed and responsiveness');
    lines.push('- Aviability: Ensure high availability and reliability');
    lines.push('- Maintainability: Write clean, maintainable code');
    lines.push('- Documentation: Provide clear documentation and specs');
    lines.push('');
    lines.push('');
  }

  // Validation
  if (csvTask['Validation Method']) {
    lines.push('#### Validation');
    lines.push('```bash');
    const validations = csvTask['Validation Method'].split(';').map((v) => v.trim());
    for (const validation of validations) {
      if (validation) lines.push(`# ${validation}`);
    }
    lines.push('```');
    lines.push('');
  }

  // KPIs
  if (csvTask.KPIs) {
    lines.push('#### KPIs');
    const kpis = csvTask.KPIs.split(';').map((k) => k.trim());
    for (const kpi of kpis) {
      if (kpi) lines.push(`- ${kpi}`);
    }
    lines.push('');
  }

  // Artifacts - use table format for better clarity
  if (csvTask['Artifacts To Track']) {
    lines.push('#### Artifacts');
    lines.push('| Type | Path | Description |');
    lines.push('|------|------|-------------|');
    const artifacts = csvTask['Artifacts To Track'].split(';').map((a) => a.trim());
    for (const artifact of artifacts) {
      if (artifact) {
        // Parse artifact type prefix (ARTIFACT:, EVIDENCE:, SPEC:, PLAN:)
        const match = artifact.match(/^(ARTIFACT|EVIDENCE|SPEC|PLAN):(.+)$/);
        if (match) {
          const type = match[1];
          const path = match[2].trim();
          const desc = inferArtifactDescription(path);
          lines.push(`| ${type} | ${path} | ${desc} |`);
        } else {
          // Legacy format without prefix
          lines.push(`| ARTIFACT | ${artifact} | ${inferArtifactDescription(artifact)} |`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Infer artifact description from path
 */
function inferArtifactDescription(path: string): string {
  const filename = path.split('/').pop() || path;
  const baseName = filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

  // Common patterns
  if (path.includes('attestation')) return 'Completion attestation';
  if (path.includes('context_ack')) return 'Context acknowledgment';
  if (path.includes('context_pack')) return 'Prerequisites manifest';
  if (path.includes('.test.') || path.includes('.spec.')) return 'Test file';
  if (path.includes('schema')) return 'Schema definition';
  if (path.endsWith('.sql')) return 'Database migration';
  if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'Configuration file';
  if (path.endsWith('.md')) return 'Documentation';
  if (path.includes('dashboard')) return 'Dashboard configuration';
  if (path.includes('metrics')) return 'Metrics data';
  if (path.includes('report')) return 'Report output';

  // Capitalize first letter of each word
  return baseName.replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Generate success criteria section
 */
function generateSuccessCriteria(tasks: CSVTask[]): string {
  const lines: string[] = ['## Success Criteria', ''];

  // Group KPIs by category
  const kpiCategories: Record<string, string[]> = {};

  for (const task of tasks) {
    if (task.KPIs) {
      const category = task.Section || 'General';
      if (!kpiCategories[category]) {
        kpiCategories[category] = [];
      }
      const kpis = task.KPIs.split(';')
        .map((k) => k.trim())
        .filter((k) => k);
      kpiCategories[category].push(...kpis);
    }
  }

  lines.push('| Category | Metric | Target |');
  lines.push('|----------|--------|--------|');

  for (const [category, kpis] of Object.entries(kpiCategories)) {
    for (const kpi of [...new Set(kpis)]) {
      // Parse KPI string to extract metric and target
      const parts = kpi.split(':').map((p) => p.trim());
      const metric = parts[0] || kpi;
      const target = parts[1] || 'Met';
      lines.push(`| ${category} | ${metric} | ${target} |`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate agent orchestration instructions
 */
function generateAgentInstructions(sprintNumber: number, phases: ExecutionPhase[]): string {
  const swarmTasks = phases.flatMap((p) => p.tasks).filter((t) => t.executionMode === 'swarm');
  const matopTasks = phases.flatMap((p) => p.tasks).filter((t) => t.executionMode === 'matop');
  const manualTasks = phases.flatMap((p) => p.tasks).filter((t) => t.executionMode === 'manual');
  const allTasks = phases.flatMap((p) => p.tasks);

  // Generate actual parallel spawn example from this sprint's tasks
  const parallelPhases = phases.filter((p) => p.executionType === 'parallel');
  let parallelExample = '';
  if (parallelPhases.length > 0) {
    const firstParallelPhase = parallelPhases[0];
    const streams = new Map<string, string[]>();
    for (const task of firstParallelPhase.tasks) {
      const streamId = task.parallelStreamId || 'default';
      if (!streams.has(streamId)) {
        streams.set(streamId, []);
      }
      streams.get(streamId)!.push(task.taskId);
    }
    parallelExample = Array.from(streams.entries())
      .map(([streamId, taskIds]) => `Task("${streamId}", "Execute ${taskIds.join(', ')}") &`)
      .join('\n');
  } else if (allTasks.length > 0) {
    // Fallback: show first few tasks as example
    parallelExample = allTasks
      .slice(0, 3)
      .map((t, i) => `Task("STREAM-${String.fromCharCode(65 + i)}", "Execute ${t.taskId}") &`)
      .join('\n');
  }

  // Calculate previous sprint for context
  const prevSprint = sprintNumber > 0 ? sprintNumber - 1 : 0;

  return `## Agent Orchestration Instructions

### How to Execute This Sprint

This sprint should be executed using Claude Code with sub-agent orchestration. Follow these patterns:

### 0. Pre-Execution Context (CRITICAL)

**Before starting any task, gather context from previous work:**

\`\`\`bash
### Key Objectives
');
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Aviability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

# 1. Read completed tasks from previous sprint(s) for context
cat apps/project-tracker/docs/metrics/sprint-${prevSprint}/_summary.json

# 2. Review dependency graph to understand task relationships
cat apps/project-tracker/docs/metrics/_global/dependency-graph.json

# 3. Check current sprint status
cat apps/project-tracker/docs/metrics/_global/Sprint_plan.csv | grep "Sprint ${sprintNumber}"

# 4. Review any existing specs/plans from dependencies
ls -la artifacts/specs/
ls -la artifacts/plans/
\`\`\`

**Key Files to Read for Context:**
- \`apps/project-tracker/docs/metrics/_global/Sprint_plan.csv\` - Full task registry
- \`.specify/sprints/sprint-*/\` - Sprint-organized specs, plans, attestations, evidence
- \`docs/architecture/\` - Architecture decisions and patterns

**Attestation Structure** (\`.specify/sprints/sprint-{N}/attestations/<TASK_ID>/\`):
- \`attestation.json\` - Completion evidence with verdict, KPIs, validations
- \`context_pack.md\` - Prerequisites (files read before starting)
- \`context_pack.manifest.json\` - SHA256 hashes of prerequisite files

### 1. Task Lifecycle Workflow

**IMPORTANT**: Every task must follow this lifecycle:

\`\`\`
Backlog → Planned → In Progress → Done
\`\`\`

**For each task, execute these steps in order:**

#### Step 1: Plan the Task (Backlog → Planned)
\`\`\`bash
# Create task specification
mkdir -p artifacts/specs/<TASK_ID>
# Write spec file with:
# - Objective and scope
# - Technical approach
# - Files to create/modify
# - Test strategy
# - Acceptance criteria

# Update Sprint_plan.csv status to "Planned"
# Edit the CSV directly or use sync tools
\`\`\`

#### Step 2: Start Implementation (Planned → In Progress)
\`\`\`bash
# Update status to "In Progress" in Sprint_plan.csv
# Execute via SWARM or MATOP (see sections below)
\`\`\`

#### Step 3: Complete & Validate (In Progress → Done)
\`\`\`bash
# Run validation and audit (see Section 8)
# Update status to "Done" in Sprint_plan.csv with evidence
# Create attestation in .specify/sprints/sprint-{N}/attestations/<TASK_ID>/
\`\`\`

### 2. Parallel Task Spawning

For parallel phases, spawn sub-agents using the \`Task\` tool:

\`\`\`bash
# Sprint ${sprintNumber} parallel execution:
${parallelExample || '# No parallel tasks in this sprint'}
\`\`\`

The \`&\` suffix indicates parallel execution. Wait for all to complete before proceeding to the next phase.

### 3. SWARM Execution (Implementation Tasks)

For **implementation tasks** (${swarmTasks.length} tasks marked as \`swarm\`):

\`\`\`bash
# Run via SWARM 5-phase pipeline
./scripts/swarm/orchestrator.sh run-quick <TASK_ID>
\`\`\`

**SWARM Pipeline Phases:**
1. **Architect** - Generate spec/plan via MCP → Creates \`artifacts/specs/<TASK_ID>/\`
2. **Enforcer** - Generate tests (TDD) → Creates test files first
3. **Builder** - Implement code → Makes tests pass
4. **Gatekeeper** - Run quality gates (typecheck, lint, test)
5. **Auditor** - Logic & security review → Creates attestation

**Before SWARM execution, the agent MUST:**
1. Read the task's pre-requisites from Sprint_plan.csv
2. Read any dependent task's evidence/output
3. Create a spec in \`artifacts/specs/<TASK_ID>/spec.md\`
4. Update status to "Planned" before starting

**SWARM Tasks in this Sprint:**
${swarmTasks.length > 0 ? swarmTasks.map((t) => `- \`${t.taskId}\`: ${t.description}`).join('\n') : '- None'}

### 4. MATOP Execution (Validation Tasks)

For **validation tasks** (${matopTasks.length} tasks marked as \`matop\`):

\`\`\`bash
# Run via MATOP unified orchestrator
pnpm matop <TASK_ID>
# or
npx tsx tools/stoa/matop-execute.ts <TASK_ID>
\`\`\`

**MATOP STOA Gates:**
- **Foundation** - TypeCheck, Build, Test coverage, ESLint, Prettier
- **Security** - Gitleaks, pnpm audit, Snyk, Semgrep, Trivy
- **Quality** - Test coverage enforcement
- **Domain** - Dependency validation, business logic tests
- **Intelligence** - AI component tests
- **Automation** - CI/CD pipeline validation

**Before MATOP execution, the agent MUST:**
1. Verify all dependencies are completed (check attestations)
2. Read the task definition from Sprint_plan.csv
3. Update status to "In Progress" before running gates

**MATOP Tasks in this Sprint:**
${matopTasks.length > 0 ? matopTasks.map((t) => `- \`${t.taskId}\`: ${t.description}`).join('\n') : '- None'}

### 5. Manual Tasks

These tasks require human intervention (${manualTasks.length} tasks):

${manualTasks.length > 0 ? manualTasks.map((t) => `- \`${t.taskId}\`: ${t.description}`).join('\n') : '- None'}

### 6. Status Updates

**Task Status Lifecycle:**
| Status | Meaning | Trigger |
|--------|---------|---------|
| Backlog | Not started | Initial state |
| Planned | Spec created, ready to start | After spec/plan created |
| In Progress | Currently being worked on | After starting execution |
| Done | Completed and validated | After audit passes |
| Blocked | Waiting on dependency/issue | When blocker identified |

**Automatic Updates:**
After completing each task, the system will automatically:
1. Update \`Sprint_plan.csv\` status to "Done"
2. Generate evidence in \`artifacts/stoa-runs/\` or \`artifacts/swarm-runs/\`
3. Create attestation in \`.specify/sprints/sprint-{N}/attestations/<TASK_ID>/attestation.json\` with:
   - \`$schema\`: Relative path to \`apps/project-tracker/docs/metrics/schemas/attestation.schema.json\`
   - \`schema_version\`: \`"1.0.0"\`
   - \`verdict\`: \`"COMPLETE"\` or \`"INCOMPLETE"\`
   - \`context_acknowledgment\`: files_read with SHA256 hashes
   - \`kpi_results\`: target vs actual for each KPI
   - \`definition_of_done_items\`: criteria with met/evidence
4. Update phase summaries

**Manual status updates:**
\`\`\`bash
# Update Sprint_plan.csv directly
# Then sync metrics
pnpm --filter project-tracker sync-metrics
\`\`\`

### 7. Error Handling

If a task fails:
1. Check \`artifacts/blockers.json\` for blocker details
2. Check \`artifacts/human-intervention-required.json\` for escalations
3. Review remediation report in evidence directory
4. Fix issues and re-run the task

### 8. Final Audit & Validation (CRITICAL)

**Before marking any task as Done, run the full audit:**

\`\`\`bash
# Run comprehensive audit for the task
pnpm turbo typecheck --filter=...
pnpm turbo lint --filter=...
pnpm turbo test --filter=...

# Or run the full audit matrix
npx tsx tools/stoa/run-stoa.ts --task-id <TASK_ID> --gates foundation,security,quality

# Verify all gates pass
cat artifacts/stoa-runs/<TASK_ID>/summary.json | jq '.verdict'
\`\`\`

**Required Gates for Sprint Completion:**
| Gate | Command | Pass Criteria |
|------|---------|---------------|
| TypeCheck | \`pnpm turbo typecheck\` | Exit code 0 |
| Lint | \`pnpm turbo lint\` | 0 warnings |
| Test | \`pnpm turbo test\` | Coverage ≥90% |
| Gitleaks | \`gitleaks detect\` | No secrets found |
| Build | \`pnpm turbo build\` | Exit code 0 |

**Sprint-Level Audit:**
\`\`\`bash
# Before declaring sprint complete, run full audit
pnpm audit:sprint ${sprintNumber}

# Generate attestation report
npx tsx tools/scripts/attest-sprint.ts ${sprintNumber}

# Verify all tasks pass
cat artifacts/reports/attestation/sprint-${sprintNumber}-latest.json
\`\`\`

### 9. Web App Development Workflow

**Use the Web App (http://localhost:3000) for development and testing:**

| Area | Path | Description |
|------|------|-------------|
| **Dashboard** | \`/dashboard\` | Main CRM dashboard |
| **Leads** | \`/leads\` | Lead management |
| **Contacts** | \`/contacts\` | Contact management |
| **Deals** | \`/deals\` | Deal pipeline |
| **Tickets** | \`/tickets\` | Support tickets |
| **Cases** | \`/cases/timeline\` | Case timeline |
| **Analytics** | \`/analytics\` | Analytics dashboard |
| **Agent Approvals** | \`/agent-approvals/preview\` | AI agent approval workflow |

**Development Commands:**
\`\`\`bash
# Start the web app
pnpm --filter web dev

# Start the API
pnpm --filter api dev

# Start all apps
pnpm dev

# Run web app tests
pnpm --filter web test

# Build the web app
pnpm --filter web build

# Type check
pnpm --filter web typecheck
\`\`\`

**API Development (tRPC):**
\`\`\`bash
# API is served at http://localhost:3001/trpc
# tRPC client types are auto-generated

# Run API tests
pnpm --filter api test

# Type check API
pnpm --filter api typecheck
\`\`\`

### 10. Execution Order Summary

| Phase | Type | Tasks |
|-------|------|-------|
${phases.map((p) => `| ${p.phaseNumber} | ${p.executionType} | ${p.tasks.map((t) => t.taskId).join(', ')} |`).join('\n')}`;
}

/**
 * Generate definition of done section
 */
function generateDefinitionOfDone(sprintNumber: number): string {
  return `## Definition of Done

A task is considered **DONE** when:
  ### Key Objectives
  - Code: Deliver high-quality, tested code for the web app
  - Integration: Seamlessly integrate new features into existing architecture
  - Security: Ensure robust security and compliance
  - Performance: Optimize for speed and responsiveness
  - Aviability: Ensure high availability and reliability
  - Maintainability: Write clean, maintainable code
  - Documentation: Provide clear documentation and specs

1. ✅ All validation commands pass (exit code 0)
2. ✅ All artifacts listed are created and accessible
3. ✅ All KPIs meet or exceed target values
4. ✅ No blocking issues or errors remain
5. ✅ Status updated to "Done" in Sprint_plan.csv
6. ✅ Attestation created in \`.specify/sprints/sprint-{N}/attestations/<TASK_ID>/\`
7. ✅ Code merged to main branch (if applicable)

### Sprint ${sprintNumber} Completion Gate

The sprint is complete when:
- All achievable tasks marked as Done
- Deferred tasks documented with target sprint
- Blockers escalated with clear resolution path
- Phase summaries updated with final metrics
- Sprint summary reflects accurate totals
- All attestations generated with COMPLETE verdict`;
}

/**
 * Infer sprint theme from tasks
 */
function inferTheme(tasks: CSVTask[]): string {
  const sectionCounts: Record<string, number> = {};
  for (const task of tasks) {
    const section = task.Section || 'Other';
    sectionCounts[section] = (sectionCounts[section] || 0) + 1;
  }

  const topSection = Object.entries(sectionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'General';

  // Map section to theme
  const themeMap: Record<string, string> = {
    Validation: 'Validation & Architecture Foundation',
    'AI Foundation': 'AI Infrastructure Setup',
    Environment: 'Environment Configuration',
    Security: 'Security & Compliance',
    'Core CRM': 'Core CRM Development',
    Architecture: 'Architecture & Design',
    Observability: 'Observability & Monitoring',
    Planning: 'Planning & Documentation',
    Commercial: 'Commercial Assets',
  };

  return themeMap[topSection] || topSection;
}

/**
 * Infer stream name from tasks
 */
function inferStreamName(tasks: TaskPhaseEntry[]): string {
  if (tasks.length === 0) return 'General';

  const sections = tasks.map((t) => t.section);
  const uniqueSections = [...new Set(sections)];

  if (uniqueSections.length === 1) {
    return uniqueSections[0];
  }

  // Find common theme
  const sectionLower = uniqueSections.join(' ').toLowerCase();
  if (sectionLower.includes('security') || sectionLower.includes('compliance')) {
    return 'Security & Compliance';
  }
  if (sectionLower.includes('architecture') || sectionLower.includes('governance')) {
    return 'Architecture & Governance';
  }
  if (sectionLower.includes('infrastructure') || sectionLower.includes('observability')) {
    return 'Infrastructure & Observability';
  }
  if (
    sectionLower.includes('design') ||
    sectionLower.includes('commercial') ||
    sectionLower.includes('brand')
  ) {
    return 'Design & Commercial';
  }

  return uniqueSections.slice(0, 2).join(' & ');
}

/**
 * Generate SprintPromptData structure (for JSON output)
 */
export function generateSprintPromptData(options: GeneratorOptions): SprintPromptData {
  const {
    sprintNumber,
    tasks,
    phases,
    parallelStreams,
    projectName = 'IntelliFlow CRM',
    theme,
  } = options;

  const sprintTasks = tasks.filter((t) => t['Target Sprint'] === String(sprintNumber));
  const _completedTasks = sprintTasks.filter((t) => t.Status === 'Done' || t.Status === 'Completed');
  const inferredTheme = theme || inferTheme(sprintTasks);

  // Mission Brief
  const missionBrief: MissionBrief = {
    project: projectName,
    sprintNumber,
    theme: inferredTheme,
    timeline: `Sprint ${sprintNumber}`,
    deliverables: sprintTasks.map((t) => t.Description),
    targetApp: 'http://localhost:3000',
    targetPaths: ['apps/web/', 'apps/api/'],
  };

  // Overview
  const sectionCounts: Record<string, number> = {};
  const modeCounts: Record<string, number> = { swarm: 0, matop: 0, manual: 0 };

  for (const phase of phases) {
    for (const task of phase.tasks) {
      sectionCounts[task.section] = (sectionCounts[task.section] || 0) + 1;
      modeCounts[task.executionMode]++;
    }
  }

  const overview: SprintOverview = {
    totalTasks: sprintTasks.length,
    bySection: sectionCounts,
    byExecutionMode: modeCounts as Record<'swarm' | 'matop' | 'manual', number>,
    parallelStreamCount: parallelStreams.length,
    webAppUrl: 'http://localhost:3000',
  };

  // Execution Strategy
  const executionStrategy: ExecutionStrategySection = {
    phases: phases.map((p) => ({
      phaseNumber: p.phaseNumber,
      name: p.name,
      executionType: p.executionType,
      taskCount: p.tasks.length,
      parallelStreams:
        p.executionType === 'parallel'
          ? [...new Set(p.tasks.map((t) => t.parallelStreamId).filter(Boolean) as string[])]
          : undefined,
      description: `Phase ${p.phaseNumber}: ${p.tasks.length} tasks (${p.executionType})`,
    })),
    parallelSpawnSyntax: parallelStreams.map((s) => `Task("${s.streamId}", "${s.name}")`),
  };

  // Task Specifications
  const taskSpecifications: TaskSpecification[] = sprintTasks.map((csvTask) => {
    const phaseEntry = phases.flatMap((p) => p.tasks).find((t) => t.taskId === csvTask['Task ID']);

    return {
      taskId: csvTask['Task ID'],
      section: csvTask.Section,
      description: csvTask.Description,
      context: `Sprint ${sprintNumber} - ${csvTask.Section}`,
      prerequisites:
        csvTask['Pre-requisites']
          ?.split(';')
          .map((p) => p.trim())
          .filter((p) => p) || [],
      tasks:
        csvTask['Definition of Done']
          ?.split(';')
          .map((t) => t.trim())
          .filter((t) => t) || [],
      validation:
        csvTask['Validation Method']
          ?.split(';')
          .map((v) => v.trim())
          .filter((v) => v) || [],
      kpis:
        csvTask.KPIs?.split(';')
          .map((k) => k.trim())
          .filter((k) => k) || [],
      artifacts:
        csvTask['Artifacts To Track']
          ?.split(',')
          .map((a) => a.trim())
          .filter((a) => a) || [],
      executionMode: phaseEntry?.executionMode || 'manual',
      dependencies:
        csvTask.Dependencies?.split(',')
          .map((d) => d.trim())
          .filter((d) => d && d !== 'None') || [],
    };
  });

  // Success Criteria
  const successCriteria: SuccessCriterion[] = [];
  const seenMetrics = new Set<string>();

  for (const task of sprintTasks) {
    if (task.KPIs) {
      const kpis = task.KPIs.split(';')
        .map((k) => k.trim())
        .filter((k) => k);
      for (const kpi of kpis) {
        if (!seenMetrics.has(kpi)) {
          seenMetrics.add(kpi);
          successCriteria.push({
            category: task.Section,
            metric: kpi,
            target: 'Met',
            validationMethod: task['Validation Method'] || 'Manual verification',
          });
        }
      }
    }
  }

  // Definition of Done
  const definitionOfDone = [
    '### Key Objectives',
    '- Code: Deliver high-quality, tested code for the web app',
    '- Integration: Seamlessly integrate new features into existing architecture',
    '- Security: Ensure robust security and compliance',
    '- Performance: Optimize for speed and responsiveness',
    '- Aviability: Ensure high availability and reliability',
    '- Maintainability: Write clean, maintainable code',
    '- Documentation: Provide clear documentation and specs',
    '',
    '### Sprint ${sprintNumber} Completion Gate',
    'The sprint is complete when:',
    '✅ All achievable tasks marked as Done',
    '✅ Deferred tasks documented with target sprint',
    '✅ Blockers escalated with clear resolution path',
    '✅ Phase summaries updated with final metrics',
    '✅ Sprint summary reflects accurate totals',
    'All validation commands pass (exit code 0)',
    'All artifacts listed are created and accessible',
    'All KPIs meet or exceed target values',
    'No blocking issues or errors remain',
    'Status updated to "Done" in Sprint_plan.csv',
    'Attestation created in .specify/sprints/sprint-{N}/attestations/<TASK_ID>/',
    'Code merged to main branch (if applicable)',
  ];

  return {
    missionBrief,
    overview,
    dependencyGraph: '', // Will be set by generateAsciiGraph
    executionStrategy,
    taskSpecifications,
    successCriteria,
    definitionOfDone,
  };
}
