# Spec Exploration — Full Exploration Process

## Spawning Exploration Agents

Exploration agents need tools (Read, Grep, Glob), not inter-agent chat. **Always
use subagents** regardless of agent mode.

```typescript
const explorations = await Promise.all(
  agents.map((agent) =>
    Task({
      subagent_type: 'Explore', // Always Explore subagent
      prompt: buildExplorationPrompt(agent, session, suggestedFiles),
      description: `${agent} codebase exploration`,
    })
  )
);
```

## Exploration Agent Prompt Template

```markdown
You are the {AGENT_ROLE} exploring the codebase for task {TASK_ID}.

**BEFORE ANY ANALYSIS**, you must:

1. Read the primary files mentioned in the task
2. Search for related patterns and implementations
3. Verify the context provided is accurate

**Required Tool Usage**:

- Read at least 2-3 key files relevant to your expertise
- Use Grep to find existing patterns (e.g., similar implementations)
- Use Glob to discover related files in the codebase

**Your Exploration Output**: List every file you read with:

- File path
- Key findings (what you learned)
- Relevant line numbers for important code

**Files to Explore** (based on task): {LIST_OF_SUGGESTED_FILES_FROM_HYDRATION}

Only after exploration, proceed to analysis.
```

## Analysis Prompt Template

After exploration, agents receive their findings for analysis:

```markdown
You are the {AGENT_ROLE} analyzing task {TASK_ID}.

## Verified Context (From Your Exploration)

{EXPLORATION_FINDINGS}

## Round: {ROUND_TYPE}

Based on the files you actually read, provide your {ROUND_TYPE} contribution.

**REQUIREMENT**: Every claim must cite a file path and line number.

## Your Contribution

{ROUND_SPECIFIC_SECTIONS}

**INVALID**: Any analysis not backed by file citations.
```

## Verification Checklist

Before moving to ANALYSIS round, verify:

- [ ] Each agent has called Read tool at least 2 times
- [ ] Agents cited specific file paths in their responses
- [ ] Agents referenced line numbers for key code
- [ ] Any discrepancies between summary and actual code noted

## Recovery from Invalid Session

If exploration phase was skipped:

1. Stop the current session
2. Spawn exploration agents first (using Explore subagent_type)
3. Collect their file findings
4. Restart analysis rounds with verified findings

## Valid vs Invalid Indicators

**Valid session:**

- Exploration agents used Read/Grep/Glob tools
- Each agent read at least 2 files
- All analysis includes file:line citations
- Proposals reference existing patterns from code
- Challenges cite specific problematic code

**INVALID session (reject):**

- No tool calls in exploration phase
- Analysis without file citations
- "Based on the context provided..." without file verification
- Proposals that don't reference existing code patterns
- Challenges without code evidence

## Mandatory Co-Artifact Detection (Phase 0.75 post-check)

After exploration completes, run these automatic detection rules before ANALYSIS
rounds:

### Rule 1: Page Creation → PAGE_MAP Co-Change

If ANY agent's exploration findings indicate the task will create `page.tsx`
files:

1. Flag `docs/design/PAGE_MAP_AND_FLOWS.md` as **mandatory co-artifact**
2. Flag `docs/design/sitemap.md` as **recommended co-artifact**
3. Flag `docs/design/navigation-reachability-audit.md` as **recommended
   co-artifact**
4. Flag `docs/design/diagrams/complete-dependency-chains.md` as **recommended
   co-artifact** (UI layer status update)

Detection triggers (any of these in exploration findings):

- Plan to create files matching `apps/web/src/app/**/page.tsx`
- References to "new page", "new route", "new module page" in task description
- Task ID prefix `PG-*` (page tasks always create pages)

When triggered, inject into the ANALYSIS round prompt:

```
**MANDATORY CO-ARTIFACTS DETECTED**:
This task creates new page(s). The specification MUST include:
- AC for updating PAGE_MAP_AND_FLOWS.md with new route entries and updated total count
- AC for updating sitemap-reconciliation.test.ts TC-25 count if page count changes
- Note in Integration Points: "Cross-document updates required for PAGE_MAP, sitemap.md"
```

### Rule 2: Sidebar Config → Navigation Audit Co-Change

If task modifies files matching `apps/web/src/components/sidebar/configs/*.ts`:

- Flag `docs/design/navigation-reachability-audit.md` as **mandatory
  co-artifact**

### Rule 3: API Route Creation → Docs Co-Change

If task creates files matching `apps/web/src/app/api/**/route.ts`:

- Flag `docs/design/PAGE_MAP_AND_FLOWS.md` API Routes table as **recommended
  co-artifact**
