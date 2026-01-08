/**
 * Dynamic Agent Selection
 *
 * Selects optimal agent composition based on task domain:
 * - Backend tasks -> [Architect, Backend-Lead, Test-Engineer]
 * - Frontend tasks -> [Architect, UI-Lead, A11y-Expert, Test-Engineer]
 * - AI/ML tasks -> [AI-Specialist, Data-Engineer, Architect]
 * - Security tasks -> [Security-Lead, Architect, Compliance]
 * - Always includes: Domain-Expert, Test-Engineer
 *
 * @module tools/scripts/lib/stoa/agent-selection
 */

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type {
  Task,
  HydratedContext,
  AgentRole,
  AgentProfile,
  AgentSelection,
  AGENT_ROLES,
} from './types.js';
import { getAgentSelectionPath, getContextDir } from './paths.js';

// ============================================================================
// Agent Pool Configuration
// ============================================================================

export const AGENT_POOL: AgentProfile[] = [
  {
    role: 'Backend-Architect',
    expertise: ['system design', 'API design', 'database', 'tRPC', 'Prisma', 'Node.js'],
    triggerKeywords: /\b(API|router|endpoint|database|prisma|trpc|backend|server|query|mutation)\b/i,
    triggerPaths: [/apps\/api/, /packages\/db/, /packages\/adapters/],
    alwaysInclude: false,
    priority: 1,
  },
  {
    role: 'Frontend-Lead',
    expertise: ['React', 'Next.js', 'UI/UX', 'components', 'Tailwind', 'shadcn'],
    triggerKeywords: /\b(component|page|UI|form|dashboard|frontend|react|next|tailwind|shadcn|widget)\b/i,
    triggerPaths: [/apps\/web/, /packages\/ui/],
    alwaysInclude: false,
    priority: 2,
  },
  {
    role: 'AI-Specialist',
    expertise: ['LangChain', 'embeddings', 'prompts', 'ML', 'agents', 'LLM', 'scoring'],
    triggerKeywords: /\b(AI|ML|embedding|vector|scoring|llm|ollama|openai|langchain|crewai|agent|chain|prompt)\b/i,
    triggerPaths: [/apps\/ai-worker/, /chains/, /agents/, /embeddings/],
    alwaysInclude: false,
    priority: 3,
  },
  {
    role: 'Security-Lead',
    expertise: ['auth', 'validation', 'OWASP', 'encryption', 'RBAC', 'secrets'],
    triggerKeywords: /\b(auth|jwt|token|session|rbac|permissions|secret|vault|rate-limit|csrf|xss|injection|security|encrypt)\b/i,
    triggerPaths: [/security/, /auth/, /rbac/],
    alwaysInclude: false,
    priority: 4,
  },
  {
    role: 'DevOps-Lead',
    expertise: ['Docker', 'CI/CD', 'infrastructure', 'deployment', 'monitoring'],
    triggerKeywords: /\b(docker|ci|cd|deploy|pipeline|github.actions|terraform|infra|monitoring|observability|kubernetes)\b/i,
    triggerPaths: [/infra\//, /\.github\/workflows/, /docker/],
    alwaysInclude: false,
    priority: 5,
  },
  {
    role: 'Data-Engineer',
    expertise: ['Prisma', 'migrations', 'queries', 'pgvector', 'PostgreSQL', 'Supabase'],
    triggerKeywords: /\b(schema|migration|query|database|model|prisma|supabase|postgres|pgvector|RLS)\b/i,
    triggerPaths: [/packages\/db/, /prisma/, /migrations/],
    alwaysInclude: false,
    priority: 6,
  },
  {
    role: 'A11y-Expert',
    expertise: ['WCAG', 'accessibility', 'screen readers', 'keyboard navigation', 'ARIA'],
    triggerKeywords: /\b(accessibility|a11y|wcag|aria|screen.reader|keyboard.nav)\b/i,
    triggerPaths: [/apps\/web/, /packages\/ui/],
    alwaysInclude: false,
    priority: 7,
  },
  {
    role: 'Compliance',
    expertise: ['GDPR', 'ISO', 'audit', 'compliance', 'data protection', 'privacy'],
    triggerKeywords: /\b(gdpr|iso|compliance|audit|privacy|data.protection|regulation|legal)\b/i,
    triggerPaths: [/compliance/, /legal/, /audit/],
    alwaysInclude: false,
    priority: 8,
  },
  {
    role: 'Domain-Expert',
    expertise: ['CRM', 'leads', 'contacts', 'sales', 'business logic', 'opportunities'],
    triggerKeywords: /.*/, // Matches anything - always considered
    triggerPaths: [],
    alwaysInclude: true, // Always included for CRM context
    priority: 9,
  },
  {
    role: 'Test-Engineer',
    expertise: ['TDD', 'Vitest', 'Playwright', 'coverage', 'E2E', 'unit tests'],
    triggerKeywords: /.*/, // Matches anything - always considered
    triggerPaths: [],
    alwaysInclude: true, // Always included for quality
    priority: 10,
  },
];

// ============================================================================
// Task Domain Analysis
// ============================================================================

export type TaskDomain =
  | 'backend'
  | 'frontend'
  | 'ai'
  | 'security'
  | 'infrastructure'
  | 'database'
  | 'compliance'
  | 'cross-cutting';

/**
 * Analyze task to determine its primary domain
 */
export function analyzeTaskDomain(task: Task, context?: HydratedContext): TaskDomain {
  const text = buildSearchText(task, context);
  const scores: Record<TaskDomain, number> = {
    backend: 0,
    frontend: 0,
    ai: 0,
    security: 0,
    infrastructure: 0,
    database: 0,
    compliance: 0,
    'cross-cutting': 0,
  };

  // Backend indicators
  if (/\b(API|router|endpoint|trpc|server|mutation|query)\b/i.test(text)) {
    scores.backend += 10;
  }
  if (/apps\/api/i.test(text)) scores.backend += 5;

  // Frontend indicators
  if (/\b(component|page|UI|dashboard|react|next|frontend)\b/i.test(text)) {
    scores.frontend += 10;
  }
  if (/apps\/web|packages\/ui/i.test(text)) scores.frontend += 5;

  // AI indicators
  if (/\b(AI|ML|embedding|langchain|crewai|scoring|prompt|agent)\b/i.test(text)) {
    scores.ai += 10;
  }
  if (/apps\/ai-worker/i.test(text)) scores.ai += 5;

  // Security indicators
  if (/\b(auth|jwt|token|rbac|security|secret|vault|encryption)\b/i.test(text)) {
    scores.security += 10;
  }
  if (/security/i.test(text)) scores.security += 5;

  // Infrastructure indicators
  if (/\b(docker|ci|cd|deploy|terraform|kubernetes|monitoring)\b/i.test(text)) {
    scores.infrastructure += 10;
  }
  if (/infra\/|\.github\/workflows/i.test(text)) scores.infrastructure += 5;

  // Database indicators
  if (/\b(schema|migration|prisma|database|supabase|postgres)\b/i.test(text)) {
    scores.database += 10;
  }
  if (/packages\/db|prisma/i.test(text)) scores.database += 5;

  // Compliance indicators
  if (/\b(gdpr|iso|compliance|audit|privacy|legal)\b/i.test(text)) {
    scores.compliance += 10;
  }

  // Find the highest scoring domain
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) {
    return 'cross-cutting';
  }

  // Check if multiple domains have similar scores (cross-cutting)
  const topDomains = Object.entries(scores).filter(([_, score]) => score >= maxScore * 0.8);
  if (topDomains.length > 2) {
    return 'cross-cutting';
  }

  return Object.entries(scores).find(([_, score]) => score === maxScore)?.[0] as TaskDomain;
}

/**
 * Build search text from task and context
 */
function buildSearchText(task: Task, context?: HydratedContext): string {
  const parts = [
    task.description || '',
    task.definitionOfDone || '',
    task.section || '',
    ...(task.affectedPaths || []),
  ];

  if (context) {
    // Add dependency info
    for (const dep of context.dependencyArtifacts) {
      if (dep.specPath) parts.push(dep.specPath);
      if (dep.planPath) parts.push(dep.planPath);
    }

    // Add pattern file paths
    for (const pattern of context.codebasePatterns) {
      parts.push(pattern.filePath);
    }
  }

  return parts.join(' ');
}

// ============================================================================
// Agent Matching
// ============================================================================

/**
 * Check if an agent should be included for a task
 */
export function matchAgentToTask(
  agent: AgentProfile,
  task: Task,
  context?: HydratedContext
): { matches: boolean; reason: string } {
  // Always include agents marked as alwaysInclude
  if (agent.alwaysInclude) {
    return { matches: true, reason: 'Always included for all tasks' };
  }

  const text = buildSearchText(task, context);

  // Check keyword triggers
  if (agent.triggerKeywords.test(text)) {
    const match = text.match(agent.triggerKeywords);
    return {
      matches: true,
      reason: `Keyword match: "${match?.[0] || 'unknown'}"`,
    };
  }

  // Check path triggers
  for (const pathPattern of agent.triggerPaths) {
    if (pathPattern.test(text)) {
      return {
        matches: true,
        reason: `Path match: ${pathPattern.source}`,
      };
    }
  }

  return { matches: false, reason: 'No triggers matched' };
}

// ============================================================================
// Agent Selection
// ============================================================================

const MIN_AGENTS = 3;
const MAX_AGENTS = 5;

/**
 * Select optimal agents for a task
 */
export function selectAgents(task: Task, context?: HydratedContext): AgentSelection {
  const taskDomain = analyzeTaskDomain(task, context);
  const selected: AgentRole[] = [];
  const rationale: Record<string, string> = {};

  // First pass: Add all matching agents
  for (const agent of AGENT_POOL) {
    const { matches, reason } = matchAgentToTask(agent, task, context);
    if (matches) {
      selected.push(agent.role);
      rationale[agent.role] = reason;
    }
  }

  // Ensure minimum agents
  if (selected.length < MIN_AGENTS) {
    // Add Backend-Architect if not present (good general-purpose)
    if (!selected.includes('Backend-Architect')) {
      selected.push('Backend-Architect');
      rationale['Backend-Architect'] = 'Added for minimum team composition';
    }

    // Add based on domain
    if (!selected.includes('Frontend-Lead') && taskDomain === 'frontend') {
      selected.push('Frontend-Lead');
      rationale['Frontend-Lead'] = 'Added based on task domain';
    }

    if (!selected.includes('Data-Engineer') && taskDomain === 'database') {
      selected.push('Data-Engineer');
      rationale['Data-Engineer'] = 'Added based on task domain';
    }
  }

  // Sort by priority and limit to MAX_AGENTS
  const prioritySorted = selected.sort((a, b) => {
    const prioA = AGENT_POOL.find((p) => p.role === a)?.priority || 99;
    const prioB = AGENT_POOL.find((p) => p.role === b)?.priority || 99;
    return prioA - prioB;
  });

  const finalAgents = prioritySorted.slice(0, MAX_AGENTS);

  // Add Security-Lead for high-risk tasks even if at capacity
  const isHighRisk =
    /\b(auth|security|payment|credential|secret|encrypt)\b/i.test(
      `${task.description} ${task.definitionOfDone}`
    );

  if (isHighRisk && !finalAgents.includes('Security-Lead')) {
    // Replace lowest priority agent with Security-Lead
    if (finalAgents.length >= MAX_AGENTS) {
      const removed = finalAgents.pop();
      if (removed) {
        delete rationale[removed];
      }
    }
    finalAgents.push('Security-Lead');
    rationale['Security-Lead'] = 'Added due to high-risk indicators in task';
  }

  return {
    taskId: task.taskId,
    selectedAgents: finalAgents,
    selectionRationale: rationale,
    taskDomain,
    selectedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Agent Selection Output
// ============================================================================

/**
 * Write agent selection to file
 * Uses new unified path structure: .specify/{TASK_ID}/context/agent-selection.json
 */
export function writeAgentSelection(
  selection: AgentSelection,
  repoRoot: string,
  specifyDir: string = '.specify'
): string {
  const fullSpecifyDir = join(repoRoot, specifyDir);
  const contextDir = getContextDir(fullSpecifyDir, selection.taskId);
  mkdirSync(contextDir, { recursive: true });

  const outputPath = getAgentSelectionPath(fullSpecifyDir, selection.taskId);
  writeFileSync(outputPath, JSON.stringify(selection, null, 2));

  return relative(repoRoot, outputPath);
}

/**
 * Generate markdown description of agent selection
 */
export function generateAgentSelectionMarkdown(selection: AgentSelection): string {
  let md = `# Agent Selection: ${selection.taskId}

**Task Domain:** ${selection.taskDomain}
**Selected At:** ${selection.selectedAt}

## Selected Agents

| Agent | Expertise | Rationale |
|-------|-----------|-----------|
`;

  for (const agentRole of selection.selectedAgents) {
    const profile = AGENT_POOL.find((p) => p.role === agentRole);
    const expertise = profile?.expertise.slice(0, 3).join(', ') || 'N/A';
    const rationale = selection.selectionRationale[agentRole] || 'N/A';
    md += `| ${agentRole} | ${expertise} | ${rationale} |\n`;
  }

  md += `
## Agent Roles

`;

  for (const agentRole of selection.selectedAgents) {
    const profile = AGENT_POOL.find((p) => p.role === agentRole);
    md += `### ${agentRole}

**Priority:** ${profile?.priority || 'N/A'}
**Expertise:** ${profile?.expertise.join(', ') || 'N/A'}
**Always Included:** ${profile?.alwaysInclude ? 'Yes' : 'No'}

`;
  }

  return md;
}

// ============================================================================
// Domain-Specific Team Compositions
// ============================================================================

/**
 * Get recommended team composition for a specific domain
 */
export function getRecommendedTeam(domain: TaskDomain): AgentRole[] {
  switch (domain) {
    case 'backend':
      return ['Backend-Architect', 'Data-Engineer', 'Test-Engineer', 'Domain-Expert'];
    case 'frontend':
      return ['Frontend-Lead', 'A11y-Expert', 'Test-Engineer', 'Domain-Expert'];
    case 'ai':
      return ['AI-Specialist', 'Backend-Architect', 'Test-Engineer', 'Domain-Expert'];
    case 'security':
      return ['Security-Lead', 'Backend-Architect', 'Compliance', 'Test-Engineer'];
    case 'infrastructure':
      return ['DevOps-Lead', 'Security-Lead', 'Test-Engineer', 'Domain-Expert'];
    case 'database':
      return ['Data-Engineer', 'Backend-Architect', 'Test-Engineer', 'Domain-Expert'];
    case 'compliance':
      return ['Compliance', 'Security-Lead', 'Test-Engineer', 'Domain-Expert'];
    case 'cross-cutting':
    default:
      return ['Backend-Architect', 'Frontend-Lead', 'Test-Engineer', 'Domain-Expert'];
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  MIN_AGENTS,
  MAX_AGENTS,
};
