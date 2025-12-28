/**
 * CSV Contract Tag Converter v2
 *
 * Converts Sprint_plan.csv columns to machine-enforceable contract tags:
 * - Pre-requisites → FILE:, DIR:, ENV:, POLICY: tags
 * - Artifacts To Track → ARTIFACT: (file paths) + EVIDENCE: (governance) tags
 * - Validation Method → VALIDATE:, GATE:, AUDIT: tags
 *
 * Option B: Hybrid tags - keeps actual file paths as ARTIFACT: and adds EVIDENCE: for governance
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { join } from 'node:path';

const CSV_PATH = join(process.cwd(), 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

// ============================================================================
// PREREQUISITE MAPPINGS (Plain text → Contract tags)
// ============================================================================

const KEYWORD_TO_FILES: Record<string, string[]> = {
  // AI/Claude related
  'claude code': ['.claude/commands/*', 'apps/ai-worker/*'],
  claude: ['.claude/commands/*'],
  copilot: ['.github/copilot/*'],
  'ai tools': ['apps/ai-worker/*', 'tools/integrations/*'],
  'ai agent': ['apps/ai-worker/*'],
  'ai chain': ['apps/ai-worker/src/chains/*'],
  langchain: ['apps/ai-worker/src/chains/*'],
  crewai: ['apps/ai-worker/src/agents/*'],

  // Database
  prisma: ['packages/db/prisma/schema.prisma'],
  database: ['packages/db/prisma/schema.prisma'],
  schema: ['packages/db/prisma/schema.prisma'],
  migrations: ['packages/db/prisma/migrations/*'],
  supabase: ['infra/supabase/*', 'supabase/config.toml'],

  // Monorepo
  monorepo: ['turbo.json', 'pnpm-workspace.yaml'],
  turborepo: ['turbo.json'],
  workspace: ['pnpm-workspace.yaml'],

  // Frontend
  'next.js': ['apps/web/src/app/*'],
  nextjs: ['apps/web/src/app/*'],
  frontend: ['apps/web/src/app/*'],
  'ui components': ['packages/ui/src/*', 'apps/web/src/components/*'],
  shadcn: ['packages/ui/src/*'],
  components: ['apps/web/src/components/*', 'packages/ui/src/*'],
  forms: ['apps/web/src/components/forms/*'],

  // Backend
  trpc: ['apps/api/src/modules/*'],
  api: ['apps/api/src/*'],
  router: ['apps/api/src/modules/**/router.ts'],

  // Testing
  vitest: ['vitest.config.ts'],
  playwright: ['playwright.config.ts', 'tests/e2e/*'],
  tests: ['tests/*', 'vitest.config.ts'],
  e2e: ['tests/e2e/*'],
  coverage: ['artifacts/coverage/*'],

  // CI/CD
  'github actions': ['.github/workflows/*'],
  'ci/cd': ['.github/workflows/ci.yml'],
  pipeline: ['.github/workflows/*'],
  workflows: ['.github/workflows/*'],

  // Infrastructure
  docker: ['docker-compose.yml', 'infra/docker/*'],
  monitoring: ['infra/monitoring/*'],
  observability: ['infra/monitoring/*'],
  opentelemetry: ['infra/monitoring/*'],

  // Domain
  'domain model': ['packages/domain/src/*'],
  domain: ['packages/domain/src/*'],
  entities: ['packages/domain/src/*'],
  aggregates: ['packages/domain/src/*'],
  ddd: ['packages/domain/src/*'],

  // Docs
  documentation: ['docs/*'],
  adr: ['docs/planning/adr/*'],
  docusaurus: ['docs/*'],

  // Security
  security: ['docs/security/*'],
  vault: ['infra/vault/*'],
  secrets: ['.env.example'],

  // CRM specific
  lead: ['packages/domain/src/crm/lead/*', 'apps/web/src/app/leads/*'],
  contact: ['packages/domain/src/crm/contact/*', 'apps/web/src/app/contacts/*'],
  account: ['packages/domain/src/crm/account/*', 'apps/web/src/app/accounts/*'],
  opportunity: ['packages/domain/src/crm/opportunity/*', 'apps/web/src/app/opportunities/*'],
  deal: ['packages/domain/src/crm/opportunity/*', 'apps/web/src/app/deals/*'],
  task: ['packages/domain/src/crm/task/*', 'apps/web/src/app/tasks/*'],
  ticket: ['packages/domain/src/crm/ticket/*', 'apps/web/src/app/tickets/*'],
  email: ['packages/domain/src/communications/email/*'],
  calendar: ['apps/web/src/app/calendar/*', 'packages/adapters/src/integrations/*'],
  dashboard: ['apps/web/src/app/dashboard/*'],
  analytics: ['apps/web/src/app/analytics/*', 'packages/analytics/*'],
  reports: ['apps/web/src/app/reports/*'],
  billing: ['apps/web/src/app/billing/*'],
  subscription: ['apps/web/src/app/subscriptions/*'],
  settings: ['apps/web/src/app/settings/*'],
  profile: ['apps/web/src/app/profile/*'],
  users: ['apps/web/src/app/users/*'],
  teams: ['apps/web/src/app/teams/*'],
  activities: ['apps/web/src/app/activities/*'],
  notifications: ['apps/api/src/notifications/*'],
  webhooks: ['apps/api/src/webhooks/*'],
  integrations: ['packages/adapters/src/integrations/*'],
  imports: ['apps/api/src/imports/*'],
  exports: ['apps/api/src/exports/*'],
  automations: ['apps/api/src/automations/*'],
  search: ['apps/web/src/components/search/*'],
  filters: ['apps/web/src/components/filters/*'],
  tables: ['apps/web/src/components/tables/*'],
  widgets: ['apps/web/src/components/widgets/*'],
  navigation: ['apps/web/src/components/navigation/*'],
  changelog: ['CHANGELOG.md'],
  openapi: ['apps/api/openapi.json'],
};

const KEYWORD_TO_ENV: Record<string, string[]> = {
  supabase: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  database: ['DATABASE_URL'],
  prisma: ['DATABASE_URL'],
  openai: ['OPENAI_API_KEY'],
  'api key': ['API_KEY'],
  stripe: ['STRIPE_SECRET_KEY'],
  smtp: ['SMTP_HOST'],
  redis: ['REDIS_URL'],
};

const KEYWORD_TO_POLICY: Record<string, string[]> = {
  security: ['security-baseline'],
  ai: ['ai-safety-review'],
  performance: ['performance-budgets'],
  iso: ['iso-42001-prep'],
  privacy: ['privacy-by-design'],
  foundation: ['foundation-baseline'],
  validation: ['validation-standards'],
  sla: ['sla-compliance'],
  release: ['release-checklist'],
  documentation: ['documentation-standards'],
  project: ['project-standards'],
};

// ============================================================================
// EVIDENCE TYPE MAPPINGS (Task characteristics → Required evidence)
// ============================================================================

const EVIDENCE_RULES: Array<{
  condition: (task: Record<string, string>) => boolean;
  evidence: string[];
}> = [
  // All tasks require context_ack
  {
    condition: () => true,
    evidence: ['context_ack'],
  },
  // Tasks with testing requirements
  {
    condition: (t) =>
      t['Validation Method']?.includes('test') ||
      t['KPIs']?.toLowerCase().includes('coverage') ||
      t['KPIs']?.toLowerCase().includes('test'),
    evidence: ['test_output'],
  },
  // Tasks with config/setup
  {
    condition: (t) =>
      t['Description']?.toLowerCase().includes('config') ||
      t['Description']?.toLowerCase().includes('setup') ||
      t['Description']?.toLowerCase().includes('integration'),
    evidence: ['config_snapshot'],
  },
  // Tasks with documentation
  {
    condition: (t) =>
      t['Artifacts To Track']?.toLowerCase().includes('doc') ||
      t['Description']?.toLowerCase().includes('document'),
    evidence: ['documentation'],
  },
  // Tasks with security requirements
  {
    condition: (t) =>
      t['Description']?.toLowerCase().includes('security') ||
      t['KPIs']?.toLowerCase().includes('vulnerab'),
    evidence: ['security_scan'],
  },
  // Tasks with benchmarks/performance
  {
    condition: (t) =>
      t['Description']?.toLowerCase().includes('benchmark') ||
      t['Description']?.toLowerCase().includes('performance') ||
      t['KPIs']?.toLowerCase().includes('latency') ||
      t['KPIs']?.toLowerCase().includes('<') ||
      t['Artifacts To Track']?.toLowerCase().includes('benchmark'),
    evidence: ['benchmark_results'],
  },
  // Tasks with analysis/reports
  {
    condition: (t) =>
      t['Description']?.toLowerCase().includes('analysis') ||
      t['Description']?.toLowerCase().includes('assessment') ||
      t['Description']?.toLowerCase().includes('review'),
    evidence: ['analysis_report'],
  },
  // Tasks with visual/UI components
  {
    condition: (t) =>
      t['Description']?.toLowerCase().includes('ui') ||
      t['Description']?.toLowerCase().includes('page') ||
      t['Description']?.toLowerCase().includes('dashboard'),
    evidence: ['visual_proof'],
  },
  // Tasks with migrations
  {
    condition: (t) =>
      t['Description']?.toLowerCase().includes('migration') ||
      t['Description']?.toLowerCase().includes('schema'),
    evidence: ['migration_log'],
  },
  // Tasks with integrations
  {
    condition: (t) =>
      t['Description']?.toLowerCase().includes('integration') ||
      t['Description']?.toLowerCase().includes('connect'),
    evidence: ['integration_log'],
  },
  // Tasks with execution/automation
  {
    condition: (t) =>
      t['Description']?.toLowerCase().includes('automat') ||
      t['Description']?.toLowerCase().includes('pipeline') ||
      t['Description']?.toLowerCase().includes('orchestr'),
    evidence: ['execution_log'],
  },
];

// ============================================================================
// VALIDATION METHOD MAPPINGS
// ============================================================================

const VALIDATION_PATTERNS: Array<{
  pattern: RegExp;
  tags: string[];
}> = [
  // Test commands
  { pattern: /test.*pass/i, tags: ['VALIDATE:pnpm test'] },
  { pattern: /tests? passing/i, tags: ['VALIDATE:pnpm test'] },
  { pattern: /vitest/i, tags: ['VALIDATE:pnpm test'] },
  { pattern: /playwright/i, tags: ['VALIDATE:pnpm test:e2e'] },
  { pattern: /e2e.*pass/i, tags: ['VALIDATE:pnpm test:e2e'] },

  // Build commands
  { pattern: /build.*pass/i, tags: ['VALIDATE:pnpm build'] },
  { pattern: /builds? passing/i, tags: ['VALIDATE:pnpm build'] },

  // Lint commands
  { pattern: /lint.*pass/i, tags: ['VALIDATE:pnpm lint'] },
  { pattern: /linting passing/i, tags: ['VALIDATE:pnpm lint'] },

  // Coverage gates
  { pattern: /coverage[^,]*>?\s*9\d%/i, tags: ['GATE:coverage-90'] },
  { pattern: /coverage[^,]*>?\s*8\d%/i, tags: ['GATE:coverage-80'] },

  // Performance gates
  { pattern: /lighthouse[^,]*>?\s*9\d/i, tags: ['GATE:lighthouse-90'] },
  { pattern: /response.*<?\s*\d+\s*ms/i, tags: ['GATE:response-time'] },
  { pattern: /p9[59].*<?\s*\d+\s*ms/i, tags: ['GATE:p95-latency-check'] },
  { pattern: /latency/i, tags: ['GATE:response-time'] },

  // Security gates
  { pattern: /security.*scan/i, tags: ['GATE:security-scan'] },
  { pattern: /vulnerabilit/i, tags: ['GATE:security-scan'] },
  { pattern: /owasp/i, tags: ['GATE:security-scan'] },

  // Accessibility
  { pattern: /accessibility/i, tags: ['GATE:accessibility'] },
  { pattern: /a11y/i, tags: ['GATE:accessibility'] },

  // Manual review
  { pattern: /manual.*review/i, tags: ['VALIDATE:manual-review'] },
  { pattern: /review.*manual/i, tags: ['VALIDATE:manual-review'] },

  // Audits
  { pattern: /code.*review/i, tags: ['AUDIT:code-review'] },
  { pattern: /security.*review/i, tags: ['AUDIT:security-review'] },
  { pattern: /design.*review/i, tags: ['AUDIT:design-review'] },
  { pattern: /domain.*review/i, tags: ['AUDIT:domain-review'] },
  { pattern: /ai.*review/i, tags: ['AUDIT:ai-review'] },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function hasValidTag(value: string, prefixes: string[]): boolean {
  if (!value || value.trim() === '') return false;
  const parts = value
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p);
  return parts.some((part) => prefixes.some((prefix) => part.startsWith(prefix)));
}

/**
 * Check if ALL parts of a value have valid tags (no plain text remaining)
 */
function isFullyTagged(value: string, prefixes: string[]): boolean {
  if (!value || value.trim() === '') return true;
  const parts = value
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p);
  return parts.every((part) => prefixes.some((prefix) => part.startsWith(prefix)));
}

/**
 * Remove plain text portions from a tagged string, keeping only valid tags
 */
function stripPlainText(value: string, prefixes: string[]): string {
  if (!value) return '';
  const parts = value
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p);
  const taggedParts = parts.filter((part) => prefixes.some((prefix) => part.startsWith(prefix)));
  return taggedParts.join(';');
}

function convertPrerequisites(prereqs: string, task: Record<string, string>): string {
  if (!prereqs || prereqs.trim() === '') return '';

  const PREREQ_PREFIXES = ['FILE:', 'DIR:', 'ENV:', 'POLICY:', 'GLOB:'];

  // If fully tagged (no plain text), return as-is
  if (isFullyTagged(prereqs, PREREQ_PREFIXES)) {
    return prereqs;
  }

  // Extract existing valid tags first
  const existingTags = stripPlainText(prereqs, PREREQ_PREFIXES);
  const tags: string[] = existingTags ? existingTags.split(';').filter((t) => t) : [];

  // Get the plain text portions that need conversion
  const allParts = prereqs
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p);
  const plainTextParts = allParts.filter(
    (part) => !PREREQ_PREFIXES.some((prefix) => part.startsWith(prefix))
  );

  // If no plain text remaining, just return the existing tags
  if (plainTextParts.length === 0) {
    return existingTags;
  }

  const plainText = plainTextParts.join(' ');
  const lowerPlainText = plainText.toLowerCase();

  // Extract ENV variables mentioned directly in plain text
  const envMatches = plainText.match(/\b([A-Z][A-Z0-9_]+)\b/g);
  if (envMatches) {
    for (const env of envMatches) {
      if (env.includes('_') && env === env.toUpperCase()) {
        const tag = `ENV:${env}`;
        if (!tags.includes(tag)) tags.push(tag);
      }
    }
  }

  // Match keywords to files (only from plain text)
  for (const [keyword, files] of Object.entries(KEYWORD_TO_FILES)) {
    if (lowerPlainText.includes(keyword)) {
      for (const file of files) {
        const tag = `FILE:${file}`;
        if (!tags.includes(tag)) tags.push(tag);
      }
    }
  }

  // Match keywords to env vars (only from plain text)
  for (const [keyword, envs] of Object.entries(KEYWORD_TO_ENV)) {
    if (lowerPlainText.includes(keyword)) {
      for (const env of envs) {
        const tag = `ENV:${env}`;
        if (!tags.includes(tag)) tags.push(tag);
      }
    }
  }

  // Match keywords to policies (only from plain text)
  for (const [keyword, policies] of Object.entries(KEYWORD_TO_POLICY)) {
    if (lowerPlainText.includes(keyword)) {
      for (const policy of policies) {
        const tag = `POLICY:${policy}`;
        if (!tags.includes(tag)) tags.push(tag);
      }
    }
  }

  // If plain text had no matches, infer from task context
  const newTagsAdded =
    tags.length > (existingTags ? existingTags.split(';').filter((t) => t).length : 0);
  if (!newTagsAdded) {
    const section = task['Section']?.toLowerCase() || '';
    const desc = task['Description']?.toLowerCase() || '';

    if (section.includes('ai') || desc.includes('ai')) {
      if (!tags.includes('POLICY:ai-safety-review')) tags.push('POLICY:ai-safety-review');
    }
    if (section.includes('validation') || desc.includes('validat')) {
      if (!tags.includes('POLICY:validation-standards')) tags.push('POLICY:validation-standards');
    }
    if (section.includes('foundation') || desc.includes('foundation')) {
      if (!tags.includes('POLICY:foundation-baseline')) tags.push('POLICY:foundation-baseline');
    }
  }

  // Deduplicate and sort
  const uniqueTags = [...new Set(tags)].sort();
  return uniqueTags.join(';');
}

function convertArtifacts(artifacts: string, task: Record<string, string>): string {
  if (!artifacts || artifacts.trim() === '') return 'EVIDENCE:context_ack';

  const tags: string[] = [];

  // Convert existing file paths to ARTIFACT: tags
  const paths = artifacts
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p);

  for (const path of paths) {
    // Skip if already tagged
    if (path.startsWith('ARTIFACT:') || path.startsWith('EVIDENCE:')) {
      tags.push(path);
    } else {
      // Convert plain path to ARTIFACT: tag
      tags.push(`ARTIFACT:${path}`);
    }
  }

  // Add EVIDENCE: tags based on task characteristics
  const evidenceTypes = new Set<string>();

  for (const rule of EVIDENCE_RULES) {
    if (rule.condition(task)) {
      for (const evidence of rule.evidence) {
        evidenceTypes.add(evidence);
      }
    }
  }

  for (const evidence of evidenceTypes) {
    const tag = `EVIDENCE:${evidence}`;
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }

  // Deduplicate all tags
  const uniqueTags = [...new Set(tags)];
  return uniqueTags.join(';');
}

function convertValidationMethod(validation: string, task: Record<string, string>): string {
  if (!validation || validation.trim() === '') return 'VALIDATE:manual-review';

  // Already has proper tags?
  if (hasValidTag(validation, ['VALIDATE:', 'GATE:', 'AUDIT:'])) {
    return validation;
  }

  const tags: string[] = [];
  const lowerValidation = validation.toLowerCase();

  // Match patterns
  for (const { pattern, tags: patternTags } of VALIDATION_PATTERNS) {
    if (pattern.test(lowerValidation)) {
      for (const tag of patternTags) {
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }
  }

  // Default if no matches
  if (tags.length === 0) {
    tags.push('VALIDATE:manual-review');
    tags.push('AUDIT:code-review');
  }

  return tags.join(';');
}

// ============================================================================
// CSV STRINGIFY (Custom implementation)
// ============================================================================

function escapeField(value: string): string {
  if (!value) return '""';
  const needsQuotes = value.includes(',') || value.includes('"') || value.includes('\n');
  const escaped = value.replace(/"/g, '""');
  return needsQuotes || value.includes(';')
    ? `"${escaped}"`
    : escaped.includes(' ')
      ? `"${escaped}"`
      : escaped;
}

function stringifyCsv(tasks: Record<string, string>[], headers: string[]): string {
  const headerRow = headers.map(escapeField).join(',');
  const dataRows = tasks.map((task) => headers.map((h) => escapeField(task[h] || '')).join(','));
  return [headerRow, ...dataRows].join('\n');
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('Reading CSV...');
  const csvContent = readFileSync(CSV_PATH, 'utf-8');

  console.log('Parsing CSV...');
  const tasks = parse(csvContent, { columns: true, bom: true, relax_quotes: true }) as Record<
    string,
    string
  >[];

  console.log(`Found ${tasks.length} tasks`);

  const headers = Object.keys(tasks[0]);

  let prereqConverted = 0;
  let artifactConverted = 0;
  let validationConverted = 0;

  for (const task of tasks) {
    const taskId = task['Task ID'];

    // Convert Pre-requisites
    const originalPrereqs = task['Pre-requisites'] || '';
    const newPrereqs = convertPrerequisites(originalPrereqs, task);
    if (newPrereqs !== originalPrereqs) {
      task['Pre-requisites'] = newPrereqs;
      prereqConverted++;
      console.log(`Pre-reqs: ${taskId} -> ${newPrereqs.substring(0, 60)}...`);
    }

    // Convert Artifacts To Track
    const originalArtifacts = task['Artifacts To Track'] || '';
    const newArtifacts = convertArtifacts(originalArtifacts, task);
    if (newArtifacts !== originalArtifacts) {
      task['Artifacts To Track'] = newArtifacts;
      artifactConverted++;
      console.log(`Artifacts: ${taskId} -> ${newArtifacts.substring(0, 60)}...`);
    }

    // Convert Validation Method
    const originalValidation = task['Validation Method'] || '';
    const newValidation = convertValidationMethod(originalValidation, task);
    if (newValidation !== originalValidation) {
      task['Validation Method'] = newValidation;
      validationConverted++;
      console.log(`Validation: ${taskId} -> ${newValidation.substring(0, 60)}...`);
    }
  }

  console.log(`\nConverted ${prereqConverted} Pre-requisites fields`);
  console.log(`Converted ${artifactConverted} Artifacts To Track fields`);
  console.log(`Converted ${validationConverted} Validation Method fields`);

  // Write back
  const output = stringifyCsv(tasks, headers);
  writeFileSync(CSV_PATH, output, 'utf-8');
  console.log(`\nWritten updated CSV to: ${CSV_PATH}`);

  // Verification
  console.log('\n--- Verification ---');

  // Check Pre-requisites
  const plainPrereqs = tasks.filter((t) => {
    const prereqs = t['Pre-requisites'] || '';
    if (!prereqs) return false;
    return !hasValidTag(prereqs, ['FILE:', 'DIR:', 'ENV:', 'POLICY:']);
  });
  console.log(`Tasks with plain text Pre-requisites remaining: ${plainPrereqs.length}`);
  if (plainPrereqs.length > 0 && plainPrereqs.length <= 5) {
    plainPrereqs.forEach((t) => console.log(`  - ${t['Task ID']}: ${t['Pre-requisites']}`));
  }

  // Check Artifacts
  const noArtifactTag = tasks.filter((t) => {
    const artifacts = t['Artifacts To Track'] || '';
    return !hasValidTag(artifacts, ['ARTIFACT:', 'EVIDENCE:']);
  });
  console.log(`Tasks without ARTIFACT:/EVIDENCE: tags: ${noArtifactTag.length}`);

  // Check Validation
  const noValidationTag = tasks.filter((t) => {
    const validation = t['Validation Method'] || '';
    return !hasValidTag(validation, ['VALIDATE:', 'GATE:', 'AUDIT:']);
  });
  console.log(`Tasks without VALIDATE:/GATE:/AUDIT: tags: ${noValidationTag.length}`);

  // Sample output
  console.log('\n--- Sample Converted Tasks ---');
  tasks.slice(0, 3).forEach((t) => {
    console.log(`\n${t['Task ID']}:`);
    console.log(`  Pre-reqs: ${t['Pre-requisites']?.substring(0, 80)}...`);
    console.log(`  Artifacts: ${t['Artifacts To Track']?.substring(0, 80)}...`);
    console.log(`  Validation: ${t['Validation Method']}`);
  });
}

main().catch(console.error);
