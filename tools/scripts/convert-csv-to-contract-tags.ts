/**
 * Convert CSV columns to machine-enforceable contract tags
 *
 * Converts:
 * - Pre-requisites: FILE:, DIR:, ENV:, POLICY:
 * - Artifacts To Track: EVIDENCE:
 * - Validation Method: VALIDATE:, AUDIT:, GATE:
 *
 * @module tools/scripts/convert-csv-to-contract-tags
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';

const REPO_ROOT = process.cwd();
const CSV_PATH = join(REPO_ROOT, 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

interface CsvRow {
  'Task ID': string;
  Section: string;
  Description: string;
  Owner: string;
  Dependencies: string;
  CleanDependencies: string;
  CrossQuarterDeps: string;
  'Pre-requisites': string;
  'Definition of Done': string;
  Status: string;
  KPIs: string;
  'Target Sprint': string;
  'Artifacts To Track': string;
  'Validation Method': string;
}

// ============================================================================
// Keyword to Contract Tag Mappings
// ============================================================================

/**
 * Map keywords in plain text to FILE: tags
 */
const KEYWORD_TO_FILES: Record<string, string[]> = {
  // Documentation
  documentation: ['docs/*'],
  docusaurus: ['docs/docusaurus.config.js', 'docs/sidebars.js'],
  'api reference': ['apps/api/openapi.json', 'docs/api/*'],
  'api docs': ['apps/api/openapi.json', 'docs/api/*'],
  readme: ['README.md'],
  changelog: ['CHANGELOG.md'],

  // Frontend/UI
  dashboard: ['apps/web/src/app/dashboard/*'],
  ui: ['apps/web/src/components/*', 'packages/ui/src/*'],
  component: ['apps/web/src/components/*', 'packages/ui/src/*'],
  form: ['apps/web/src/components/forms/*'],
  page: ['apps/web/src/app/*'],
  layout: ['apps/web/src/app/layout.tsx'],
  navigation: ['apps/web/src/components/navigation/*'],
  sidebar: ['apps/web/src/components/sidebar/*'],
  header: ['apps/web/src/components/header/*'],
  footer: ['apps/web/src/components/footer/*'],
  modal: ['apps/web/src/components/modals/*'],
  table: ['apps/web/src/components/tables/*'],
  chart: ['apps/web/src/components/charts/*'],
  widget: ['apps/web/src/components/widgets/*'],
  storybook: ['apps/web/.storybook/*'],
  tailwind: ['tailwind.config.ts'],
  shadcn: ['packages/ui/src/components/*'],
  'next.js': ['apps/web/next.config.js'],
  turbopack: ['apps/web/next.config.js'],

  // Backend/API
  trpc: ['apps/api/src/trpc.ts', 'apps/api/src/router.ts'],
  router: ['apps/api/src/modules/**/router.ts'],
  endpoint: ['apps/api/src/modules/*'],
  middleware: ['apps/api/src/middleware/*'],
  api: ['apps/api/src/*'],

  // Database
  prisma: ['packages/db/prisma/schema.prisma'],
  schema: ['packages/db/prisma/schema.prisma'],
  migration: ['packages/db/prisma/migrations/*'],
  database: ['packages/db/prisma/schema.prisma'],
  postgres: ['packages/db/prisma/schema.prisma'],
  supabase: ['supabase/config.toml', 'infra/supabase/*'],

  // Domain/DDD
  domain: ['packages/domain/src/*'],
  aggregate: ['packages/domain/src/*'],
  entity: ['packages/domain/src/*'],
  'value object': ['packages/domain/src/*'],
  repository: ['packages/adapters/src/repositories/*'],
  'bounded context': ['docs/planning/DDD-context-map.puml'],

  // Testing
  test: ['tests/*', 'vitest.config.ts'],
  vitest: ['vitest.config.ts'],
  playwright: ['tests/e2e/*', 'playwright.config.ts'],
  e2e: ['tests/e2e/*'],
  coverage: ['artifacts/coverage/*'],
  'unit test': ['tests/unit/*'],
  'integration test': ['tests/integration/*'],

  // CI/CD
  'github actions': ['.github/workflows/*'],
  ci: ['.github/workflows/ci.yml'],
  cd: ['.github/workflows/cd.yml'],
  pipeline: ['.github/workflows/*'],
  workflow: ['.github/workflows/*'],

  // Infrastructure
  docker: ['docker-compose.yml', 'infra/docker/*'],
  kubernetes: ['infra/k8s/*'],
  terraform: ['infra/terraform/*'],
  monitoring: ['infra/monitoring/*'],
  grafana: ['infra/monitoring/grafana/*'],
  prometheus: ['infra/monitoring/prometheus.yml'],
  observability: ['infra/monitoring/*'],
  otel: ['infra/monitoring/otel-collector.yaml'],

  // AI/ML
  langchain: ['apps/ai-worker/src/chains/*'],
  chain: ['apps/ai-worker/src/chains/*'],
  agent: ['apps/ai-worker/src/agents/*'],
  prompt: ['apps/ai-worker/src/prompts/*'],
  embedding: ['apps/ai-worker/src/embeddings/*'],
  'ai worker': ['apps/ai-worker/*'],
  openai: ['apps/ai-worker/src/*'],
  claude: ['.claude/commands/*'],

  // Security
  security: ['docs/security/*'],
  auth: ['apps/api/src/middleware/auth/*'],
  authentication: ['apps/api/src/middleware/auth/*'],
  authorization: ['apps/api/src/middleware/auth/*'],
  rbac: ['apps/api/src/middleware/auth/rbac.ts'],
  vault: ['infra/vault/*'],
  secret: ['infra/vault/*'],

  // Config
  config: ['turbo.json', 'pnpm-workspace.yaml'],
  eslint: ['.eslintrc.js'],
  prettier: ['.prettierrc'],
  typescript: ['tsconfig.json'],
  turbo: ['turbo.json'],
  monorepo: ['turbo.json', 'pnpm-workspace.yaml'],

  // CRM-specific
  lead: ['packages/domain/src/crm/lead/*', 'apps/web/src/app/leads/*'],
  contact: ['packages/domain/src/crm/contact/*', 'apps/web/src/app/contacts/*'],
  account: ['packages/domain/src/crm/account/*', 'apps/web/src/app/accounts/*'],
  opportunity: ['packages/domain/src/crm/opportunity/*', 'apps/web/src/app/opportunities/*'],
  deal: ['packages/domain/src/crm/opportunity/*', 'apps/web/src/app/deals/*'],
  task: ['packages/domain/src/crm/task/*', 'apps/web/src/app/tasks/*'],
  ticket: ['packages/domain/src/crm/ticket/*', 'apps/web/src/app/tickets/*'],
  case: ['packages/domain/src/legal/cases/*'],
  matter: ['packages/domain/src/legal/cases/*'],
  document: ['packages/domain/src/documents/*', 'apps/web/src/app/documents/*'],
  email: ['packages/domain/src/communications/email/*'],
  notification: ['apps/api/src/notifications/*'],
  analytics: ['apps/web/src/app/analytics/*', 'packages/analytics/*'],
  report: ['apps/web/src/app/reports/*'],
  calendar: ['apps/web/src/app/calendar/*'],
  meeting: ['apps/web/src/app/meetings/*'],
  activity: ['apps/web/src/app/activities/*'],
  workflow: ['apps/api/src/workflows/*'],
  automation: ['apps/api/src/automations/*'],
  billing: ['apps/web/src/app/billing/*'],
  subscription: ['apps/web/src/app/subscriptions/*'],
  settings: ['apps/web/src/app/settings/*'],
  profile: ['apps/web/src/app/profile/*'],
  user: ['apps/web/src/app/users/*'],
  team: ['apps/web/src/app/teams/*'],
  organization: ['apps/web/src/app/organizations/*'],
  onboarding: ['apps/web/src/app/onboarding/*'],
  login: ['apps/web/src/app/auth/login/*'],
  signup: ['apps/web/src/app/auth/signup/*'],
  password: ['apps/web/src/app/auth/password/*'],
  search: ['apps/web/src/components/search/*'],
  filter: ['apps/web/src/components/filters/*'],
  export: ['apps/api/src/exports/*'],
  import: ['apps/api/src/imports/*'],
  integration: ['packages/adapters/src/integrations/*'],
  webhook: ['apps/api/src/webhooks/*'],
  whatsapp: ['packages/adapters/src/whatsapp/*'],
  sms: ['packages/adapters/src/sms/*'],
  crm: ['packages/domain/src/crm/*'],
};

/**
 * Map keywords to DIR: tags
 */
const KEYWORD_TO_DIRS: Record<string, string[]> = {
  tests: ['tests'],
  'e2e tests': ['tests/e2e'],
  'integration tests': ['tests/integration'],
  'unit tests': ['tests/unit'],
  components: ['apps/web/src/components'],
  pages: ['apps/web/src/app'],
  modules: ['apps/api/src/modules'],
  packages: ['packages'],
  infrastructure: ['infra'],
  migrations: ['packages/db/prisma/migrations'],
  documentation: ['docs'],
  artifacts: ['artifacts'],
};

/**
 * Map keywords to ENV: tags
 */
const KEYWORD_TO_ENV: Record<string, string[]> = {
  supabase: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  database: ['DATABASE_URL'],
  postgres: ['DATABASE_URL'],
  openai: ['OPENAI_API_KEY'],
  'api key': ['API_KEY'],
  github: ['GITHUB_TOKEN'],
  vercel: ['VERCEL_TOKEN'],
  railway: ['RAILWAY_TOKEN'],
  redis: ['REDIS_URL'],
  smtp: ['SMTP_HOST', 'SMTP_PORT'],
  email: ['SMTP_HOST'],
  sentry: ['SENTRY_DSN'],
  analytics: ['ANALYTICS_KEY'],
  stripe: ['STRIPE_SECRET_KEY'],
  auth: ['AUTH_SECRET'],
  jwt: ['JWT_SECRET'],
};

/**
 * Map sections/keywords to POLICY: tags
 */
const KEYWORD_TO_POLICY: Record<string, string> = {
  // Sections
  validation: 'validation-standards',
  security: 'security-baseline',
  testing: 'testing-standards',
  domain: 'ddd-aggregate-rules',
  infrastructure: 'infrastructure-baseline',
  ai: 'ai-safety-review',
  compliance: 'compliance-baseline',
  documentation: 'documentation-standards',
  performance: 'performance-budgets',
  observability: 'observability-baseline',

  // Keywords
  gdpr: 'gdpr-compliance',
  iso: 'iso-42001-prep',
  owasp: 'owasp-baseline',
  accessibility: 'accessibility-wcag',
  privacy: 'privacy-by-design',
  audit: 'audit-trail',
  governance: 'governance-standards',
  deployment: 'deployment-checklist',
  release: 'release-checklist',
  rollback: 'rollback-procedure',
  incident: 'incident-response',
  sla: 'sla-compliance',
  uptime: 'uptime-sla',
};

// ============================================================================
// Conversion Logic
// ============================================================================

/**
 * Check if a field already has contract tags
 */
function hasContractTags(value: string): boolean {
  const tagPatterns = [
    'FILE:',
    'DIR:',
    'ENV:',
    'POLICY:',
    'EVIDENCE:',
    'VALIDATE:',
    'AUDIT:',
    'GATE:',
  ];
  return tagPatterns.some((pattern) => value.includes(pattern));
}

/**
 * Check if value is valid contract tags (not just has some, but properly formatted)
 */
function isFullyConverted(value: string): boolean {
  if (!value || value.trim() === '') return false;

  // Split by semicolon and check each part
  const parts = value
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p);

  // All parts should start with a valid tag prefix
  const validPrefixes = ['FILE:', 'DIR:', 'ENV:', 'POLICY:'];
  return parts.every((part) => validPrefixes.some((prefix) => part.startsWith(prefix)));
}

/**
 * Convert Pre-requisites field to contract tags
 */
function convertPrerequisites(
  taskId: string,
  prereqs: string,
  section: string,
  description: string
): string {
  if (!prereqs || prereqs.trim() === '') {
    // Generate from section/description
    return generatePrerequisitesFromContext(taskId, section, description);
  }

  if (isFullyConverted(prereqs)) {
    return prereqs; // Already properly converted
  }

  const tags: string[] = [];
  const lower = prereqs.toLowerCase();
  const descLower = description.toLowerCase();
  const combinedText = lower + ' ' + descLower;

  // Find FILE: tags from keywords
  for (const [keyword, files] of Object.entries(KEYWORD_TO_FILES)) {
    if (combinedText.includes(keyword)) {
      for (const file of files) {
        const tag = `FILE:${file}`;
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }
  }

  // Find DIR: tags from keywords
  for (const [keyword, dirs] of Object.entries(KEYWORD_TO_DIRS)) {
    if (combinedText.includes(keyword)) {
      for (const dir of dirs) {
        const tag = `DIR:${dir}`;
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }
  }

  // Find ENV: tags from keywords
  for (const [keyword, envVars] of Object.entries(KEYWORD_TO_ENV)) {
    if (combinedText.includes(keyword)) {
      for (const env of envVars) {
        const tag = `ENV:${env}`;
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }
  }

  // Find POLICY: tag from keywords
  let policyFound = false;
  for (const [keyword, policy] of Object.entries(KEYWORD_TO_POLICY)) {
    if (combinedText.includes(keyword)) {
      const tag = `POLICY:${policy}`;
      if (!tags.includes(tag)) {
        tags.push(tag);
        policyFound = true;
      }
    }
  }

  // Add section-based policy if none found
  if (!policyFound) {
    const sectionPolicy = KEYWORD_TO_POLICY[section.toLowerCase()];
    if (sectionPolicy) {
      tags.push(`POLICY:${sectionPolicy}`);
    }
  }

  // If still no tags, add defaults based on task ID prefix
  if (tags.length === 0) {
    return generatePrerequisitesFromContext(taskId, section, description);
  }

  return tags.join(';');
}

/**
 * Generate prerequisites from task context when original is empty or unconvertible
 */
function generatePrerequisitesFromContext(
  taskId: string,
  section: string,
  description: string
): string {
  const tags: string[] = [];
  const descLower = description.toLowerCase();

  // Add FILE: based on task ID prefix
  if (taskId.startsWith('PG-')) {
    // Page tasks
    tags.push('FILE:apps/web/src/app/*');
    tags.push('FILE:apps/web/src/components/*');
  } else if (taskId.startsWith('IFC-')) {
    // IntelliFlow Core tasks
    tags.push('FILE:packages/domain/src/*');
    if (descLower.includes('api') || descLower.includes('trpc')) {
      tags.push('FILE:apps/api/src/*');
    }
    if (descLower.includes('ui') || descLower.includes('page') || descLower.includes('form')) {
      tags.push('FILE:apps/web/src/*');
    }
  } else if (taskId.startsWith('ENV-')) {
    tags.push('FILE:turbo.json');
    tags.push('FILE:pnpm-workspace.yaml');
  } else if (taskId.startsWith('AI-') || taskId.startsWith('AUTOMATION-')) {
    tags.push('FILE:.claude/commands/*');
    tags.push('FILE:apps/ai-worker/*');
  } else if (taskId.startsWith('DOC-')) {
    tags.push('FILE:docs/*');
  } else if (taskId.startsWith('SEC-') || taskId.startsWith('EXC-SEC-')) {
    tags.push('FILE:docs/security/*');
  }

  // Add POLICY: based on section
  const sectionPolicy = KEYWORD_TO_POLICY[section.toLowerCase()];
  if (sectionPolicy) {
    tags.push(`POLICY:${sectionPolicy}`);
  } else {
    // Default policies by task type
    if (taskId.startsWith('PG-')) {
      tags.push('POLICY:ui-standards');
    } else if (taskId.startsWith('IFC-')) {
      tags.push('POLICY:domain-standards');
    } else {
      tags.push('POLICY:project-standards');
    }
  }

  // Add ENV: if description mentions common services
  for (const [keyword, envVars] of Object.entries(KEYWORD_TO_ENV)) {
    if (descLower.includes(keyword)) {
      for (const env of envVars) {
        const tag = `ENV:${env}`;
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }
  }

  return tags.length > 0 ? tags.join(';') : 'POLICY:project-standards';
}

/**
 * Convert Artifacts To Track field to contract tags
 */
function convertArtifacts(taskId: string, artifacts: string): string {
  if (!artifacts || artifacts.trim() === '') return 'EVIDENCE:context_ack';
  if (hasContractTags(artifacts) && artifacts.includes('EVIDENCE:context_ack')) {
    return artifacts; // Already converted
  }

  const tags: string[] = ['EVIDENCE:context_ack'];
  const lower = artifacts.toLowerCase();

  if (lower.includes('test') || lower.includes('coverage') || lower.includes('vitest')) {
    tags.push('EVIDENCE:test_output');
  }
  if (lower.includes('benchmark') || lower.includes('performance') || lower.includes('k6')) {
    tags.push('EVIDENCE:benchmark_results');
  }
  if (lower.includes('log') || lower.includes('trace')) {
    tags.push('EVIDENCE:execution_log');
  }
  if (lower.includes('report') || lower.includes('analysis')) {
    tags.push('EVIDENCE:analysis_report');
  }
  if (lower.includes('security') || lower.includes('scan') || lower.includes('audit')) {
    tags.push('EVIDENCE:security_scan');
  }
  if (lower.includes('integration')) {
    tags.push('EVIDENCE:integration_log');
  }
  if (lower.includes('screenshot') || lower.includes('video') || lower.includes('demo')) {
    tags.push('EVIDENCE:visual_proof');
  }
  if (lower.includes('config') || lower.includes('yaml') || lower.includes('json')) {
    tags.push('EVIDENCE:config_snapshot');
  }
  if (lower.includes('migration') || lower.includes('schema')) {
    tags.push('EVIDENCE:migration_log');
  }
  if (lower.includes('documentation') || lower.includes('docs')) {
    tags.push('EVIDENCE:documentation');
  }

  if (tags.length === 1) {
    tags.push('EVIDENCE:task_output');
  }

  return [...new Set(tags)].join(';');
}

/**
 * Convert Validation Method field to contract tags
 */
function convertValidation(taskId: string, validation: string, section: string): string {
  if (!validation || validation.trim() === '') return 'VALIDATE:manual-review';
  if (hasContractTags(validation)) return validation;

  const tags: string[] = [];
  const lower = validation.toLowerCase();

  if (lower.includes('test')) {
    tags.push('VALIDATE:pnpm test');
  }
  if (lower.includes('build')) {
    tags.push('VALIDATE:pnpm build');
  }
  if (lower.includes('lint')) {
    tags.push('VALIDATE:pnpm lint');
  }
  if (lower.includes('typecheck') || lower.includes('type check')) {
    tags.push('VALIDATE:pnpm typecheck');
  }

  if (lower.includes('coverage') || lower.includes('>90%') || lower.includes('≥90%')) {
    tags.push('GATE:coverage-90');
  }
  if (lower.includes('lighthouse') || lower.includes('vitals')) {
    tags.push('GATE:lighthouse-90');
  }
  if (
    lower.includes('response') ||
    lower.includes('latency') ||
    lower.includes('<50ms') ||
    lower.includes('<100ms')
  ) {
    tags.push('GATE:response-time');
  }
  if (lower.includes('security') || lower.includes('vulnerab')) {
    tags.push('GATE:security-scan');
  }
  if (lower.includes('accessibility') || lower.includes('a11y')) {
    tags.push('GATE:accessibility');
  }

  if (lower.includes('review') || lower.includes('reviewed')) {
    tags.push('AUDIT:code-review');
  }
  if (lower.includes('design') || lower.includes('architecture')) {
    tags.push('AUDIT:design-review');
  }
  if (lower.includes('security') || lower.includes('pentest')) {
    tags.push('AUDIT:security-review');
  }
  if (lower.includes('domain') || lower.includes('ddd')) {
    tags.push('AUDIT:domain-review');
  }

  if (tags.length === 0) {
    const sectionDefaults: Record<string, string[]> = {
      Validation: ['VALIDATE:pnpm test', 'GATE:coverage-90', 'AUDIT:code-review'],
      Security: ['VALIDATE:security-scan', 'GATE:security-scan', 'AUDIT:security-review'],
      Testing: ['VALIDATE:pnpm test', 'GATE:coverage-90', 'AUDIT:code-review'],
      Domain: ['VALIDATE:pnpm test', 'GATE:coverage-90', 'AUDIT:domain-review'],
      Infrastructure: ['VALIDATE:infra-check', 'GATE:health-check', 'AUDIT:infra-review'],
      'AI Foundation': ['VALIDATE:ai-test', 'GATE:ai-safety', 'AUDIT:ai-review'],
    };

    const defaults = sectionDefaults[section] || ['VALIDATE:manual-review', 'AUDIT:code-review'];
    tags.push(...defaults);
  }

  return [...new Set(tags)].join(';');
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  console.log('Reading CSV...');
  const csvContent = readFileSync(CSV_PATH, 'utf-8');

  console.log('Parsing CSV...');
  const rows: CsvRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });

  console.log(`Found ${rows.length} tasks`);

  let updatedCount = 0;
  let prereqsFixed = 0;

  for (const row of rows) {
    const taskId = row['Task ID'];
    const section = row.Section || '';
    const description = row.Description || '';

    const oldPrereqs = row['Pre-requisites'] || '';
    const oldArtifacts = row['Artifacts To Track'] || '';
    const oldValidation = row['Validation Method'] || '';

    const newPrereqs = convertPrerequisites(taskId, oldPrereqs, section, description);
    const newArtifacts = convertArtifacts(taskId, oldArtifacts);
    const newValidation = convertValidation(taskId, oldValidation, section);

    // Check if prereqs was plain text and now has tags
    if (!isFullyConverted(oldPrereqs) && isFullyConverted(newPrereqs)) {
      prereqsFixed++;
    }

    if (
      newPrereqs !== oldPrereqs ||
      newArtifacts !== oldArtifacts ||
      newValidation !== oldValidation
    ) {
      row['Pre-requisites'] = newPrereqs;
      row['Artifacts To Track'] = newArtifacts;
      row['Validation Method'] = newValidation;
      updatedCount++;

      if (!isFullyConverted(oldPrereqs) && isFullyConverted(newPrereqs)) {
        console.log(`Fixed prereqs: ${taskId} -> ${newPrereqs.substring(0, 60)}...`);
      }
    }
  }

  console.log(`\nConverted ${updatedCount} tasks`);
  console.log(`Fixed ${prereqsFixed} Pre-requisites fields from plain text to tags`);

  // Write back to CSV
  const headers = [
    'Task ID',
    'Section',
    'Description',
    'Owner',
    'Dependencies',
    'CleanDependencies',
    'CrossQuarterDeps',
    'Pre-requisites',
    'Definition of Done',
    'Status',
    'KPIs',
    'Target Sprint',
    'Artifacts To Track',
    'Validation Method',
  ];

  function escapeField(value: string): string {
    if (value === null || value === undefined) return '""';
    const str = String(value);
    return `"${str.replace(/"/g, '""')}"`;
  }

  const lines: string[] = [];
  lines.push(headers.map(escapeField).join(','));

  for (const row of rows) {
    const values = headers.map((h) => escapeField((row as Record<string, string>)[h] || ''));
    lines.push(values.join(','));
  }

  const bom = '\ufeff';
  writeFileSync(CSV_PATH, bom + lines.join('\n'), 'utf-8');

  console.log(`\nWritten updated CSV to: ${CSV_PATH}`);

  // Verification
  console.log('\n--- Verification ---');
  let stillPlainText = 0;
  for (const row of rows) {
    if (!isFullyConverted(row['Pre-requisites'])) {
      stillPlainText++;
      if (stillPlainText <= 5) {
        console.log(
          `Still plain text: ${row['Task ID']}: "${row['Pre-requisites'].substring(0, 50)}..."`
        );
      }
    }
  }
  console.log(`Tasks with plain text Pre-requisites remaining: ${stillPlainText}`);
}

main();
