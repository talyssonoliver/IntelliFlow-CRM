/**
 * Fix CSV Governance Gaps
 *
 * Addresses 5 critical issues identified in CSV analysis:
 * 1. Remove CrossQuarterDeps and CleanDependencies columns (derived in registry)
 * 2. Add mandatory governance prerequisites (Framework.md, audit-matrix.yml)
 * 3. Fix FILE-less tasks (especially PG-* pages)
 * 4. Convert wildcards to GLOB: tag type
 * 5. Normalize Owner field to STOA roles
 *
 * @module tools/scripts/fix-csv-governance-gaps
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { join } from 'node:path';

const CSV_PATH = join(process.cwd(), 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

// ============================================================================
// STOA Role Mapping (Owner normalization)
// ============================================================================

const OWNER_TO_STOA_ROLE: Record<string, string> = {
  // Leadership
  ceo: 'STOA-Leadership',
  cto: 'STOA-Leadership',
  cfo: 'STOA-Leadership',
  leadership: 'STOA-Leadership',
  'ceo + leadership': 'STOA-Leadership',
  'ceo + cto + cfo': 'STOA-Leadership',
  'cfo + ceo': 'STOA-Leadership',

  // Tech Lead
  'tech lead': 'STOA-Foundation',
  'tech lead + da': 'STOA-Foundation',
  'tech lead + backend dev': 'STOA-Foundation',
  'tech lead + claude code': 'STOA-Foundation',

  // Backend
  'backend dev': 'STOA-Domain',
  'backend dev + ai specialist': 'STOA-Intelligence',
  'backend dev + da': 'STOA-Domain',
  'backend dev + devops': 'STOA-Automation',
  'backend dev + tech lead': 'STOA-Foundation',
  'backend dev + ai agents': 'STOA-Intelligence',
  'backend dev + copilot': 'STOA-Automation',
  'backend dev + claude code': 'STOA-Automation',

  // Frontend
  'frontend dev': 'STOA-Domain',
  'frontend dev + ux': 'STOA-Domain',
  'frontend dev + backend dev': 'STOA-Domain',
  'frontend dev + claude code': 'STOA-Automation',
  'frontend dev + ai analytics': 'STOA-Intelligence',

  // AI
  'ai specialist': 'STOA-Intelligence',
  'ai specialist + claude code': 'STOA-Intelligence',
  'ai specialist + backend dev': 'STOA-Intelligence',
  'ai specialist + data scientist': 'STOA-Intelligence',

  // DevOps
  devops: 'STOA-Automation',
  'devops + pm': 'STOA-Automation',
  'devops + backend dev': 'STOA-Automation',
  'devops + claude code': 'STOA-Automation',

  // QA
  qa: 'STOA-Quality',
  'qa lead': 'STOA-Quality',
  'qa + whole team': 'STOA-Quality',
  'qa lead + ai testing suite': 'STOA-Quality',

  // Security
  'security eng': 'STOA-Security',
  'security eng + cto': 'STOA-Security',
  'security eng + ai security tools': 'STOA-Security',
  'security team': 'STOA-Security',

  // PM
  pm: 'STOA-Foundation',
  'pm + tech lead': 'STOA-Foundation',
  'pm + ai planning tools': 'STOA-Foundation',

  // Performance
  'performance eng': 'STOA-Quality',
  'performance eng + devops': 'STOA-Quality',
  'performance eng + ai tools': 'STOA-Quality',

  // Documentation
  'tech writer': 'STOA-Foundation',
  'tech writer + ai agents': 'STOA-Foundation',
  devrel: 'STOA-Foundation',

  // Support
  'support eng': 'STOA-Domain',
  'support team': 'STOA-Domain',

  // All Teams
  'all teams': 'STOA-Quality',
  'all teams + ai orchestrator': 'STOA-Quality',
  'whole team': 'STOA-Quality',
};

// ============================================================================
// Mandatory Governance Prerequisites
// ============================================================================

const MANDATORY_GOVERNANCE_PREREQS = [
  'FILE:artifacts/sprint0/codex-run/Framework.md',
  'FILE:audit-matrix.yml',
  'POLICY:STOA-v4.2',
];

// ============================================================================
// Task-specific FILE prerequisites for PG-* tasks
// ============================================================================

const PG_TASK_FILE_MAPPING: Record<string, string[]> = {
  // Public pages
  'PG-001': ['apps/web/app/(public)/page.tsx', 'apps/web/components/marketing/*'],
  'PG-002': ['apps/web/app/(public)/features/page.tsx'],
  'PG-003': ['apps/web/app/(public)/pricing/page.tsx'],
  'PG-004': ['apps/web/app/(public)/about/page.tsx'],
  'PG-005': ['apps/web/app/(public)/contact/page.tsx', 'apps/web/components/forms/ContactForm.tsx'],
  'PG-006': ['apps/web/app/(public)/partners/page.tsx'],
  'PG-007': ['apps/web/app/(public)/press/page.tsx'],
  'PG-008': ['apps/web/app/(public)/security/page.tsx', 'docs/security/security-policy.md'],
  'PG-009': ['apps/web/app/(public)/blog/page.tsx'],
  'PG-010': ['apps/web/app/(public)/blog/[slug]/page.tsx'],
  'PG-011': ['apps/web/app/(public)/careers/page.tsx'],
  'PG-012': ['apps/web/app/(public)/careers/[id]/page.tsx'],
  'PG-013': ['apps/web/app/(public)/lp/[slug]/page.tsx'],
  'PG-014': ['apps/web/app/(public)/status/page.tsx', 'infra/monitoring/status-config.yaml'],

  // Auth pages
  'PG-015': ['apps/web/app/(auth)/login/page.tsx', 'packages/auth/src/login.ts'],
  'PG-016': ['apps/web/app/(auth)/signup/page.tsx', 'packages/validators/src/auth/signup.ts'],
  'PG-017': ['apps/web/app/(auth)/signup/success/page.tsx'],
  'PG-018': ['apps/web/app/(auth)/logout/page.tsx'],
  'PG-019': [
    'apps/web/app/(auth)/forgot-password/page.tsx',
    'packages/domain/src/communications/email/templates/*',
  ],
  'PG-020': ['apps/web/app/(auth)/reset-password/[token]/page.tsx'],
  'PG-021': ['apps/web/app/(auth)/mfa/setup/page.tsx'],
  'PG-022': ['apps/web/app/(auth)/mfa/verify/page.tsx'],
  'PG-023': ['apps/web/app/(auth)/verify-email/[token]/page.tsx'],
  'PG-024': ['apps/web/app/(auth)/auth/callback/page.tsx'],

  // Billing pages
  'PG-025': ['apps/web/app/(billing)/billing/page.tsx', 'packages/adapters/src/stripe/*'],
  'PG-026': ['apps/web/app/(billing)/billing/checkout/page.tsx'],
  'PG-027': ['apps/web/app/(billing)/billing/invoices/page.tsx'],
  'PG-028': ['apps/web/app/(billing)/billing/invoices/[id]/page.tsx'],
  'PG-029': ['apps/web/app/(billing)/billing/payment-methods/page.tsx'],
  'PG-030': ['apps/web/app/(billing)/billing/subscription/page.tsx'],
  'PG-031': ['apps/web/app/(billing)/billing/upgrade/page.tsx'],

  // Developer pages
  'PG-032': ['apps/web/app/(developer)/docs/page.tsx', 'docs/index.md'],
  'PG-033': ['apps/web/app/(developer)/docs/api/page.tsx', 'apps/api/openapi.json'],
  'PG-034': ['apps/web/app/(developer)/docs/webhooks/page.tsx', 'apps/api/src/webhooks/*'],
  'PG-035': ['apps/web/app/(developer)/changelog/page.tsx', 'CHANGELOG.md'],
  'PG-036': ['apps/web/app/(developer)/sandbox/page.tsx'],
  'PG-037': ['apps/web/app/(developer)/components/page.tsx', 'packages/ui/src/components/*'],

  // Admin pages
  'PG-038': ['apps/web/app/(admin)/admin/page.tsx'],
  'PG-039': ['apps/web/app/(admin)/admin/users/page.tsx', 'packages/domain/src/platform/user/*'],
  'PG-040': ['apps/web/app/(admin)/admin/audit-log/page.tsx'],
  'PG-041': ['apps/web/app/(admin)/admin/ai-config/page.tsx', 'apps/ai-worker/src/config/*'],
  'PG-042': ['apps/web/app/(admin)/admin/system-health/page.tsx', 'infra/monitoring/*'],
  'PG-043': ['apps/web/app/(admin)/admin/feature-flags/page.tsx'],
  'PG-044': ['apps/web/app/(admin)/admin/search-config/page.tsx'],
  'PG-045': ['apps/web/app/(admin)/admin/widgets/page.tsx'],

  // Support pages
  'PG-046': ['apps/web/app/(support)/tickets/page.tsx', 'packages/domain/src/crm/ticket/*'],
  'PG-047': ['apps/web/app/(support)/tickets/new/page.tsx'],
  'PG-048': ['apps/web/app/(support)/tickets/[id]/page.tsx'],
  'PG-049': ['apps/web/app/(support)/kb/page.tsx', 'apps/ai-worker/src/rag/*'],
  'PG-050': ['apps/web/app/(support)/privacy/page.tsx', 'docs/legal/privacy-policy.md'],
  'PG-051': ['apps/web/app/(support)/terms/page.tsx', 'docs/legal/terms-of-service.md'],
  'PG-052': ['apps/web/app/(support)/accessibility/page.tsx'],
  'PG-053': ['apps/web/app/(support)/cookies/page.tsx'],

  // CRM pages
  'PG-054': ['apps/web/app/(crm)/leads/page.tsx', 'packages/domain/src/crm/lead/*'],
  'PG-055': ['apps/web/app/(crm)/leads/search/page.tsx'],
  'PG-056': ['apps/web/app/(crm)/leads/import/page.tsx'],
  'PG-057': ['apps/web/app/(crm)/leads/export/page.tsx'],
  'PG-058': ['apps/web/app/(crm)/leads/[id]/page.tsx'],
  'PG-059': ['apps/web/app/(crm)/leads/[id]/edit/page.tsx'],
  'PG-060': ['apps/web/app/(crm)/leads/new/page.tsx'],
  'PG-061': [
    'apps/web/app/(crm)/leads/[id]/score/page.tsx',
    'apps/ai-worker/src/chains/scoring.chain.ts',
  ],
  'PG-062': ['apps/web/app/(crm)/leads/[id]/convert/page.tsx'],
  'PG-063': ['apps/web/app/(crm)/leads/bulk/page.tsx'],

  // Contact pages
  'PG-064': ['apps/web/app/(crm)/contacts/page.tsx', 'packages/domain/src/crm/contact/*'],
  'PG-065': ['apps/web/app/(crm)/contacts/[id]/page.tsx'],
  'PG-066': ['apps/web/app/(crm)/contacts/new/page.tsx'],
  'PG-067': ['apps/web/app/(crm)/contacts/[id]/edit/page.tsx'],
  'PG-068': ['apps/web/app/(crm)/contacts/merge/page.tsx'],

  // Account pages
  'PG-069': ['apps/web/app/(crm)/accounts/page.tsx', 'packages/domain/src/crm/account/*'],
  'PG-070': ['apps/web/app/(crm)/accounts/[id]/page.tsx'],
  'PG-071': ['apps/web/app/(crm)/accounts/new/page.tsx'],
  'PG-072': ['apps/web/app/(crm)/accounts/[id]/edit/page.tsx'],

  // Opportunity/Deal pages
  'PG-073': ['apps/web/app/(crm)/deals/page.tsx', 'packages/domain/src/crm/opportunity/*'],
  'PG-074': ['apps/web/app/(crm)/deals/[id]/page.tsx'],
  'PG-075': ['apps/web/app/(crm)/deals/new/page.tsx'],
  'PG-076': ['apps/web/app/(crm)/deals/pipeline/page.tsx'],
  'PG-077': ['apps/web/app/(crm)/deals/forecast/page.tsx'],

  // Analytics pages
  'PG-078': ['apps/web/app/(analytics)/analytics/page.tsx', 'packages/analytics/*'],
  'PG-079': ['apps/web/app/(analytics)/analytics/reports/page.tsx'],
  'PG-080': ['apps/web/app/(analytics)/activities/page.tsx'],

  // Task pages
  'PG-081': ['apps/web/app/(crm)/tasks/page.tsx', 'packages/domain/src/crm/task/*'],
  'PG-082': ['apps/web/app/(crm)/tasks/[id]/page.tsx'],

  // Calendar pages
  'PG-083': [
    'apps/web/app/(crm)/calendar/page.tsx',
    'packages/adapters/src/integrations/calendar/*',
  ],

  // Document pages
  'PG-084': ['apps/web/app/(crm)/documents/page.tsx', 'packages/domain/src/documents/*'],
  'PG-085': ['apps/web/app/(crm)/documents/[id]/page.tsx'],

  // Email pages
  'PG-086': ['apps/web/app/(crm)/emails/page.tsx', 'packages/domain/src/communications/email/*'],
  'PG-087': ['apps/web/app/(crm)/emails/compose/page.tsx'],
  'PG-088': ['apps/web/app/(crm)/emails/templates/page.tsx'],
  'PG-089': ['apps/web/app/(crm)/emails/sequences/page.tsx'],

  // Settings pages
  'PG-090': ['apps/web/app/(settings)/settings/page.tsx'],
  'PG-091': ['apps/web/app/(settings)/settings/profile/page.tsx'],
  'PG-092': ['apps/web/app/(settings)/settings/notifications/page.tsx'],
  'PG-093': [
    'apps/web/app/(settings)/settings/integrations/page.tsx',
    'packages/adapters/src/integrations/*',
  ],
  'PG-094': ['apps/web/app/(settings)/settings/api-keys/page.tsx'],
  'PG-095': ['apps/web/app/(settings)/settings/team/page.tsx'],
  'PG-096': ['apps/web/app/(settings)/settings/branding/page.tsx'],
  'PG-097': ['apps/web/app/(settings)/settings/ai-preferences/page.tsx'],
  'PG-098': ['apps/web/app/(settings)/settings/data-export/page.tsx'],
  'PG-099': ['apps/web/app/(settings)/settings/security/page.tsx'],
  'PG-100': ['apps/web/app/(settings)/settings/ai-training/page.tsx'],

  // Report pages
  'PG-101': ['apps/web/app/(reports)/reports/page.tsx'],
  'PG-102': ['apps/web/app/(reports)/reports/builder/page.tsx'],
  'PG-103': ['apps/web/app/(reports)/reports/scheduled/page.tsx'],
  'PG-104': ['apps/web/app/(dashboard)/dashboard/page.tsx'],
  'PG-105': ['apps/web/app/(dashboard)/dashboard/widgets/page.tsx'],

  // Additional pages
  'PG-106': ['apps/web/app/(crm)/accounts/hierarchy/page.tsx'],
  'PG-107': ['apps/web/app/(onboarding)/onboarding/page.tsx'],
  'PG-108': ['apps/web/app/(admin)/admin/users/[id]/page.tsx'],
  'PG-109': ['apps/web/app/(admin)/admin/roles/page.tsx'],
  'PG-110': ['apps/web/app/(admin)/admin/permissions/page.tsx'],
  'PG-111': ['apps/web/app/(admin)/admin/teams/page.tsx'],
  'PG-112': ['apps/web/app/(crm)/activities/[id]/page.tsx'],
  'PG-113': ['apps/web/app/(developer)/api-explorer/page.tsx'],
  'PG-114': ['apps/web/app/(help)/help/page.tsx'],
  'PG-115': ['apps/web/app/(help)/tutorials/page.tsx'],
  'PG-116': ['apps/web/app/(notifications)/notifications/page.tsx'],
  'PG-117': ['apps/web/app/(sla)/sla/page.tsx'],
  'PG-118': ['apps/web/app/(automation)/automation/page.tsx', 'apps/api/src/automations/*'],
  'PG-119': ['apps/web/app/(automation)/automation/[id]/page.tsx'],
  'PG-120': ['apps/web/app/(automation)/workflows/page.tsx'],
  'PG-121': ['apps/web/app/(data)/import/page.tsx'],
  'PG-122': ['apps/web/app/(data)/export/page.tsx'],
  'PG-123': ['apps/web/app/(gdpr)/gdpr/page.tsx', 'docs/legal/gdpr-policy.md'],
  'PG-124': ['apps/web/app/(compliance)/compliance/page.tsx'],
  'PG-125': ['apps/web/app/(audit)/audit-trail/page.tsx'],
  'PG-126': ['apps/web/app/(mobile)/mobile-preview/page.tsx'],
};

// ============================================================================
// Helper Functions
// ============================================================================

function normalizeOwner(owner: string): string {
  const lowerOwner = owner.toLowerCase().trim();

  // Direct match
  if (OWNER_TO_STOA_ROLE[lowerOwner]) {
    return OWNER_TO_STOA_ROLE[lowerOwner];
  }

  // Partial matches
  for (const [pattern, role] of Object.entries(OWNER_TO_STOA_ROLE)) {
    if (lowerOwner.includes(pattern) || pattern.includes(lowerOwner)) {
      return role;
    }
  }

  // Default based on keywords
  if (lowerOwner.includes('ai') || lowerOwner.includes('ml') || lowerOwner.includes('langchain')) {
    return 'STOA-Intelligence';
  }
  if (lowerOwner.includes('security') || lowerOwner.includes('compliance')) {
    return 'STOA-Security';
  }
  if (
    lowerOwner.includes('devops') ||
    lowerOwner.includes('infra') ||
    lowerOwner.includes('automation')
  ) {
    return 'STOA-Automation';
  }
  if (
    lowerOwner.includes('qa') ||
    lowerOwner.includes('test') ||
    lowerOwner.includes('performance')
  ) {
    return 'STOA-Quality';
  }
  if (
    lowerOwner.includes('frontend') ||
    lowerOwner.includes('backend') ||
    lowerOwner.includes('domain')
  ) {
    return 'STOA-Domain';
  }

  // Fallback
  return 'STOA-Foundation';
}

function convertWildcardsToGlobs(prereqs: string): string {
  if (!prereqs) return prereqs;

  const parts = prereqs.split(';').map((p) => p.trim());
  const converted = parts.map((part) => {
    // Convert FILE:path/* to GLOB:path/*
    if (part.startsWith('FILE:') && part.includes('*')) {
      return part.replace('FILE:', 'GLOB:');
    }
    return part;
  });

  return converted.join(';');
}

function addMandatoryGovernancePrereqs(prereqs: string): string {
  const parts = prereqs
    ? prereqs
        .split(';')
        .map((p) => p.trim())
        .filter((p) => p)
    : [];

  // Add mandatory prerequisites if not already present
  for (const mandatory of MANDATORY_GOVERNANCE_PREREQS) {
    if (!parts.some((p) => p === mandatory)) {
      parts.unshift(mandatory);
    }
  }

  return parts.join(';');
}

function addPgTaskFilePrereqs(taskId: string, prereqs: string): string {
  const mapping = PG_TASK_FILE_MAPPING[taskId];
  if (!mapping) return prereqs;

  const parts = prereqs
    ? prereqs
        .split(';')
        .map((p) => p.trim())
        .filter((p) => p)
    : [];

  // Add task-specific FILE prerequisites
  for (const filePath of mapping) {
    const tag = filePath.includes('*') ? `GLOB:${filePath}` : `FILE:${filePath}`;
    if (!parts.some((p) => p === tag)) {
      parts.push(tag);
    }
  }

  return parts.join(';');
}

function hasFilePrereqs(prereqs: string): boolean {
  if (!prereqs) return false;
  return prereqs.includes('FILE:') || prereqs.includes('GLOB:');
}

// ============================================================================
// CSV Stringify
// ============================================================================

function escapeField(value: string): string {
  if (!value) return '""';
  const needsQuotes =
    value.includes(',') || value.includes('"') || value.includes('\n') || value.includes(';');
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function stringifyCsv(tasks: Record<string, string>[], headers: string[]): string {
  const headerRow = headers.map(escapeField).join(',');
  const dataRows = tasks.map((task) => headers.map((h) => escapeField(task[h] || '')).join(','));
  return [headerRow, ...dataRows].join('\n');
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('Reading CSV...');
  const csvContent = readFileSync(CSV_PATH, 'utf-8');

  console.log('Parsing CSV...');
  const tasks = parse(csvContent, { columns: true, bom: true, relax_quotes: true }) as Record<
    string,
    string
  >[];

  console.log(`Found ${tasks.length} tasks\n`);

  // Get original headers and remove deprecated columns
  const originalHeaders = Object.keys(tasks[0]);
  const headers = originalHeaders.filter(
    (h) => h !== 'CrossQuarterDeps' && h !== 'CleanDependencies'
  );

  console.log('=== Fix 1: Removing deprecated columns ===');
  console.log(`Removed: CrossQuarterDeps, CleanDependencies`);
  console.log(`Headers: ${headers.length} (was ${originalHeaders.length})\n`);

  let governanceAdded = 0;
  let wildcardsConverted = 0;
  let filelessFixed = 0;
  let ownersNormalized = 0;

  for (const task of tasks) {
    const taskId = task['Task ID'];
    let prereqs = task['Pre-requisites'] || '';

    // Fix 2: Add mandatory governance prerequisites
    const beforeGov = prereqs;
    prereqs = addMandatoryGovernancePrereqs(prereqs);
    if (prereqs !== beforeGov) {
      governanceAdded++;
    }

    // Fix 3: Add FILE prereqs for PG-* tasks
    if (taskId.startsWith('PG-') && !hasFilePrereqs(prereqs)) {
      const beforePg = prereqs;
      prereqs = addPgTaskFilePrereqs(taskId, prereqs);
      if (prereqs !== beforePg) {
        filelessFixed++;
        console.log(`Fixed FILE-less: ${taskId}`);
      }
    }

    // Fix 4: Convert wildcards to GLOB:
    const beforeGlob = prereqs;
    prereqs = convertWildcardsToGlobs(prereqs);
    if (prereqs !== beforeGlob) {
      wildcardsConverted++;
    }

    task['Pre-requisites'] = prereqs;

    // Fix 5: Normalize Owner to STOA role
    const originalOwner = task['Owner'] || '';
    const normalizedOwner = normalizeOwner(originalOwner);
    if (normalizedOwner !== originalOwner) {
      task['Owner'] = normalizedOwner;
      ownersNormalized++;
    }

    // Remove deprecated columns
    delete task['CrossQuarterDeps'];
    delete task['CleanDependencies'];
  }

  console.log('\n=== Summary ===');
  console.log(`Fix 2: Governance prerequisites added to ${governanceAdded} tasks`);
  console.log(`Fix 3: FILE-less PG-* tasks fixed: ${filelessFixed}`);
  console.log(`Fix 4: Wildcards converted to GLOB: ${wildcardsConverted}`);
  console.log(`Fix 5: Owners normalized to STOA roles: ${ownersNormalized}`);

  // Write back
  const output = stringifyCsv(tasks, headers);
  writeFileSync(CSV_PATH, output, 'utf-8');
  console.log(`\nWritten updated CSV to: ${CSV_PATH}`);

  // Verification
  console.log('\n=== Verification ===');

  // Check for tasks without FILE/GLOB prereqs
  const noFilePrereqs = tasks.filter((t) => !hasFilePrereqs(t['Pre-requisites']));
  console.log(`Tasks without FILE:/GLOB: prerequisites: ${noFilePrereqs.length}`);

  // Check governance coverage
  const missingGovernance = tasks.filter((t) => {
    const prereqs = t['Pre-requisites'] || '';
    return !prereqs.includes('Framework.md') || !prereqs.includes('audit-matrix.yml');
  });
  console.log(`Tasks missing governance prerequisites: ${missingGovernance.length}`);

  // Check Owner normalization
  const stoaRoles = new Set(tasks.map((t) => t['Owner']));
  console.log(`Unique Owner values: ${stoaRoles.size}`);
  console.log(`STOA roles: ${[...stoaRoles].sort().join(', ')}`);

  // Sample output
  console.log('\n=== Sample Tasks ===');
  tasks.slice(0, 2).forEach((t) => {
    console.log(`\n${t['Task ID']} (${t['Owner']}):`);
    console.log(`  Pre-reqs: ${t['Pre-requisites']?.substring(0, 100)}...`);
  });
}

main().catch(console.error);
