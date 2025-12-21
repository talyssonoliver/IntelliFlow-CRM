/**
 * STOA Assignment System
 *
 * Implements deterministic STOA assignment from Framework.md Section 3.
 * - Lead STOA determined by task ID prefix
 * - Supporting STOAs derived from keywords and impact surface
 *
 * @module tools/scripts/lib/stoa/stoa-assignment
 */

import type { StoaRole, StoaAssignment, Task } from './types.js';

// ============================================================================
// Lead STOA Assignment (by Task ID Prefix)
// ============================================================================

/**
 * Prefix patterns for Lead STOA assignment.
 * Order matters - first match wins.
 */
const LEAD_STOA_PREFIX_PATTERNS: Array<{ pattern: RegExp; stoa: StoaRole }> = [
  { pattern: /^ENV-/i, stoa: 'Foundation' },
  { pattern: /^EP-/i, stoa: 'Foundation' },
  { pattern: /^EXC-SEC-/i, stoa: 'Security' },
  { pattern: /^SEC-/i, stoa: 'Security' },
  { pattern: /^AI-SETUP-/i, stoa: 'Intelligence' },
  { pattern: /^AI-/i, stoa: 'Intelligence' },
  { pattern: /^AUTOMATION-/i, stoa: 'Automation' },
  { pattern: /^IFC-/i, stoa: 'Domain' },
];

/**
 * Determine Lead STOA from task ID prefix.
 * Falls back to 'Domain' if no prefix matches.
 */
export function getLeadStoa(taskId: string): StoaRole {
  for (const { pattern, stoa } of LEAD_STOA_PREFIX_PATTERNS) {
    if (pattern.test(taskId)) {
      return stoa;
    }
  }
  return 'Domain'; // Default fallback
}

// ============================================================================
// Supporting STOA Derivation (Deterministic Rules)
// ============================================================================

/**
 * Keyword triggers for each STOA.
 * If any keyword is found in task description/DoD, that STOA becomes supporting.
 */
const STOA_KEYWORD_TRIGGERS: Record<StoaRole, string[]> = {
  Security: [
    'auth',
    'jwt',
    'token',
    'session',
    'rbac',
    'permissions',
    'secret',
    'vault',
    'rate-limit',
    'csrf',
    'xss',
    'injection',
    'middleware/auth',
    'public endpoint',
    'rate limiting',
  ],
  Intelligence: [
    'prompt',
    'agent',
    'chain',
    'embedding',
    'vector',
    'scoring',
    'llm',
    'ollama',
    'openai',
    'langchain',
    'crewai',
    'ai-worker',
    'model',
    'eval',
  ],
  Quality: [
    'coverage',
    'e2e',
    'playwright',
    'vitest',
    'mutation',
    'stryker',
    'quality gate',
    'sonarqube',
    'test',
    'integration test',
    'unit test',
    'lint',
    'typecheck',
  ],
  Foundation: [
    'docker',
    'ci',
    'deployment',
    'github actions',
    'environment',
    'infra',
    'observability',
    'monitoring',
    'logging',
    'otel',
    'grafana',
    'prometheus',
  ],
  Domain: [
    'trpc',
    'api',
    'prisma',
    'database',
    'schema',
    'entity',
    'aggregate',
    'domain',
    'use case',
    'repository',
    'migration',
  ],
  Automation: [
    'orchestrator',
    'swarm',
    'tracker',
    'validation',
    'artifact',
    'audit',
    'sprint',
    'metrics',
    'registry',
  ],
};

/**
 * Path patterns that trigger each STOA as supporting.
 */
const STOA_PATH_TRIGGERS: Record<StoaRole, RegExp[]> = {
  Security: [/middleware\/auth/i, /auth/i, /security/i, /\.env/i, /vault/i, /secrets/i],
  Intelligence: [/apps\/ai-worker/i, /prompts/i, /chains/i, /embeddings/i, /scoring/i, /agents/i],
  Quality: [
    /tests\//i,
    /\.test\./i,
    /\.spec\./i,
    /coverage/i,
    /vitest/i,
    /playwright/i,
    /stryker/i,
  ],
  Foundation: [
    /infra\//i,
    /docker/i,
    /\.github\//i,
    /ci\//i,
    /deployment/i,
    /monitoring/i,
    /observability/i,
  ],
  Domain: [/apps\/api/i, /packages\/domain/i, /packages\/db/i, /prisma/i, /schema/i, /migrations/i],
  Automation: [
    /tools\/scripts/i,
    /tools\/lint/i,
    /tools\/audit/i,
    /orchestrator/i,
    /swarm/i,
    /project-tracker/i,
  ],
};

/**
 * Check if text contains any of the given keywords (case-insensitive).
 */
function containsKeyword(text: string, keywords: string[]): boolean {
  const lowerText = text.toLowerCase();
  return keywords.some((kw) => lowerText.includes(kw.toLowerCase()));
}

/**
 * Check if any path matches the given patterns.
 */
function matchesPathPattern(paths: string[], patterns: RegExp[]): boolean {
  return paths.some((path) => patterns.some((pattern) => pattern.test(path)));
}

/**
 * Find keywords that matched for a given STOA.
 */
function findMatchedKeywords(text: string, keywords: string[]): string[] {
  const lowerText = text.toLowerCase();
  return keywords.filter((kw) => lowerText.includes(kw.toLowerCase()));
}

/**
 * Find paths that matched for a given STOA.
 */
function findMatchedPaths(paths: string[], patterns: RegExp[]): string[] {
  return paths.filter((path) => patterns.some((pattern) => pattern.test(path)));
}

/**
 * Derive supporting STOAs from task metadata.
 *
 * Rules (from Framework.md 3.2):
 * - Security STOA: task touches auth, secrets, RBAC, etc.
 * - Quality STOA: task modifies tests, coverage, quality gates
 * - Foundation STOA: task touches infra, docker, CI, observability
 * - Intelligence STOA: task touches ai-worker, prompts, chains
 * - Domain STOA: task touches API, domain packages, DB contracts
 * - Automation STOA: task touches orchestrator, swarm, tracker
 */
export function deriveSupportingStoas(
  task: Task,
  leadStoa: StoaRole
): { stoas: StoaRole[]; derivedFrom: StoaAssignment['derivedFrom'] } {
  const supportingStoas: StoaRole[] = [];
  const allText = [task.description || '', task.definitionOfDone || '', task.section || ''].join(
    ' '
  );
  const affectedPaths = task.affectedPaths || [];
  const dependencies = task.dependencies || [];

  const derivedFrom: StoaAssignment['derivedFrom'] = {
    prefix: true, // Lead STOA always derived from prefix
    keywords: [],
    affectedPaths: [],
    dependencies: [],
  };

  for (const stoa of Object.keys(STOA_KEYWORD_TRIGGERS) as StoaRole[]) {
    // Skip if this is the lead STOA (already assigned)
    if (stoa === leadStoa) continue;

    let shouldAdd = false;

    // Check keyword triggers
    const keywords = STOA_KEYWORD_TRIGGERS[stoa];
    const matchedKeywords = findMatchedKeywords(allText, keywords);
    if (matchedKeywords.length > 0) {
      shouldAdd = true;
      derivedFrom.keywords.push(...matchedKeywords);
    }

    // Check path triggers
    const patterns = STOA_PATH_TRIGGERS[stoa];
    const matchedPaths = findMatchedPaths(affectedPaths, patterns);
    if (matchedPaths.length > 0) {
      shouldAdd = true;
      derivedFrom.affectedPaths.push(...matchedPaths);
    }

    if (shouldAdd && !supportingStoas.includes(stoa)) {
      supportingStoas.push(stoa);
    }
  }

  // Track dependencies (any dependency adds relationship context)
  derivedFrom.dependencies = dependencies;

  return { stoas: supportingStoas, derivedFrom };
}

// ============================================================================
// Full STOA Assignment
// ============================================================================

/**
 * Assign Lead and Supporting STOAs to a task.
 */
export function assignStoas(task: Task): StoaAssignment {
  const leadStoa = getLeadStoa(task.taskId);
  const { stoas: supportingStoas, derivedFrom } = deriveSupportingStoas(task, leadStoa);

  return {
    taskId: task.taskId,
    leadStoa,
    supportingStoas,
    derivedFrom,
  };
}

/**
 * Get all STOAs involved with a task (lead + supporting).
 */
export function getAllInvolvedStoas(assignment: StoaAssignment): StoaRole[] {
  return [assignment.leadStoa, ...assignment.supportingStoas];
}

// ============================================================================
// Override Support
// ============================================================================

/**
 * Override entry for plan-overrides.yaml
 */
export interface StoaOverride {
  taskId: string;
  leadStoa: StoaRole;
  justification: string;
  expiresAt: string | 'permanent';
}

/**
 * Apply overrides from plan-overrides.yaml.
 * Returns modified assignment if override exists.
 */
export function applyOverrides(
  assignment: StoaAssignment,
  overrides: StoaOverride[]
): StoaAssignment {
  const override = overrides.find((o) => o.taskId === assignment.taskId);

  if (!override) {
    return assignment;
  }

  // Check if override is expired
  if (override.expiresAt !== 'permanent') {
    const expiryDate = new Date(override.expiresAt);
    if (expiryDate < new Date()) {
      // Override expired, use original
      return assignment;
    }
  }

  // Apply the override
  return {
    ...assignment,
    leadStoa: override.leadStoa,
    derivedFrom: {
      ...assignment.derivedFrom,
      prefix: false, // Override means prefix wasn't used
    },
  };
}
