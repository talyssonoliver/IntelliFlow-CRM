/**
 * STOA Assignment System
 *
 * Implements deterministic STOA assignment from Framework.md Section 3.
 * - Primary STOA determined by task ID prefix (cosmetic — for ordering only)
 * - Supporting STOAs derived from keywords and impact surface
 * - All STOAs are equal blockers — any FAIL blocks completion
 *
 * @module tools/scripts/lib/stoa/stoa-assignment
 */

import type { StoaRole, StoaAssignment, Task } from './types.js';

// ============================================================================
// Primary STOA Assignment (by Task ID Prefix)
// ============================================================================

/**
 * Prefix patterns for Primary STOA assignment.
 * Order matters - first match wins. More specific patterns must come first.
 *
 * See Framework.md §3.2 for the canonical mapping.
 */
const PRIMARY_STOA_PREFIX_PATTERNS: Array<{ pattern: RegExp; stoa: StoaRole }> = [
  // Foundation — infra, tooling, CI, environments
  { pattern: /^ENV-/i, stoa: 'Foundation' },
  { pattern: /^EP-/i, stoa: 'Foundation' },

  // Security — explicit security epics/exceptions
  { pattern: /^EXC-SEC-/i, stoa: 'Security' },
  { pattern: /^SEC-/i, stoa: 'Security' },

  // Intelligence — AI/ML, analytics
  { pattern: /^AI-SETUP-/i, stoa: 'Intelligence' },
  { pattern: /^AI-/i, stoa: 'Intelligence' },
  { pattern: /^ANALYTICS-/i, stoa: 'Intelligence' },

  // Automation — factory mechanics, orchestration, ops, governance
  { pattern: /^EXC-INIT-/i, stoa: 'Automation' },
  { pattern: /^AUTOMATION-/i, stoa: 'Automation' },
  { pattern: /^DOC-/i, stoa: 'Automation' },
  { pattern: /^PM-OPS-/i, stoa: 'Automation' },
  { pattern: /^ENG-OPS-/i, stoa: 'Automation' },
  { pattern: /^GOV-/i, stoa: 'Automation' },

  // Quality — UI pages (a11y / perf / test coverage focus)
  { pattern: /^PG-/i, stoa: 'Quality' },

  // Domain — product/domain features, brand, go-to-market, sales
  { pattern: /^BRAND-/i, stoa: 'Domain' },
  { pattern: /^GTM-/i, stoa: 'Domain' },
  { pattern: /^SALES-/i, stoa: 'Domain' },
  { pattern: /^IFC-/i, stoa: 'Domain' },
];

/**
 * Determine Primary STOA from task ID prefix.
 * Falls back to 'Domain' if no prefix matches.
 */
export function getPrimaryStoa(taskId: string): StoaRole {
  for (const { pattern, stoa } of PRIMARY_STOA_PREFIX_PATTERNS) {
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
  primaryStoa: StoaRole
): { stoas: StoaRole[]; derivedFrom: StoaAssignment['derivedFrom'] } {
  const supportingStoas: StoaRole[] = [];
  const allText = [task.description || '', task.definitionOfDone || '', task.section || ''].join(
    ' '
  );
  const affectedPaths = task.affectedPaths || [];
  const dependencies = task.dependencies || [];

  const derivedFrom: StoaAssignment['derivedFrom'] = {
    prefix: true, // Primary STOA always derived from prefix
    keywords: [],
    affectedPaths: [],
    dependencies: [],
  };

  for (const stoa of Object.keys(STOA_KEYWORD_TRIGGERS) as StoaRole[]) {
    // Skip if this is the lead STOA (already assigned)
    if (stoa === primaryStoa) continue;

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
 * Assign Primary and Supporting STOAs to a task.
 */
export function assignStoas(task: Task): StoaAssignment {
  const primaryStoa = getPrimaryStoa(task.taskId);
  const { stoas: supportingStoas, derivedFrom } = deriveSupportingStoas(task, primaryStoa);

  return {
    taskId: task.taskId,
    primaryStoa,
    supportingStoas,
    derivedFrom,
  };
}

/**
 * Get all STOAs involved with a task (primary + supporting).
 */
export function getAllInvolvedStoas(assignment: StoaAssignment): StoaRole[] {
  return [assignment.primaryStoa, ...assignment.supportingStoas];
}

// ============================================================================
// Override Support
// ============================================================================

/**
 * Override entry for plan-overrides.yaml
 */
export interface StoaOverride {
  taskId: string;
  primaryStoa: StoaRole;
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
    primaryStoa: override.primaryStoa,
    derivedFrom: {
      ...assignment.derivedFrom,
      prefix: false, // Override means prefix wasn't used
    },
  };
}
