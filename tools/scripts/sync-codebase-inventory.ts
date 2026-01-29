#!/usr/bin/env npx tsx
/**
 * Codebase Inventory Sync Script
 *
 * Extracts comprehensive codebase metadata and updates baseline.json.
 * This prevents drift between code and documentation/reports.
 *
 * ## Extracted Data
 * - Database Schema: Tables, fields, indexes, relations from Prisma
 * - Middleware Stack: Request pipeline middleware from API
 * - Background Workers: Worker definitions and job types
 * - External Integrations: Third-party service adapters
 * - Domain Events: Event-driven architecture catalog
 * - Validation Schemas: Zod schema complexity metrics
 * - Cache Configuration: Caching strategy details
 *
 * ## Usage
 *   npx tsx tools/scripts/sync-codebase-inventory.ts
 *   pnpm sync:codebase-inventory
 *
 * @module tools/scripts/sync-codebase-inventory
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// =============================================================================
// Types
// =============================================================================

interface TableInfo {
  name: string;
  fields: number;
  indexes: number;
  relations: number;
  hasEmbedding: boolean;
}

interface DatabaseInventory {
  total_tables: number;
  total_fields: number;
  total_indexes: number;
  total_relations: number;
  tables_with_embeddings: number;
  enums: number;
  tables: TableInfo[];
}

interface MiddlewareInfo {
  name: string;
  type: 'auth' | 'logging' | 'rate-limit' | 'validation' | 'error' | 'other';
  description: string;
  enabled: boolean;
}

interface MiddlewareInventory {
  total_middleware: number;
  by_type: Record<string, number>;
  middleware: MiddlewareInfo[];
}

interface WorkerInfo {
  name: string;
  type: 'events' | 'notifications' | 'ingestion' | 'other';
  jobs: string[];
  description: string;
}

interface WorkersInventory {
  total_workers: number;
  total_jobs: number;
  workers: WorkerInfo[];
}

interface IntegrationInfo {
  name: string;
  category: 'calendar' | 'email' | 'payment' | 'messaging' | 'storage' | 'erp' | 'ai' | 'other';
  provider: string;
  description: string;
}

interface IntegrationsInventory {
  total_integrations: number;
  by_category: Record<string, number>;
  integrations: IntegrationInfo[];
}

interface DomainEventInfo {
  name: string;
  eventType: string;
  aggregate: string;
  workflowEngine?: string;
}

interface DomainEventsInventory {
  total_events: number;
  by_aggregate: Record<string, number>;
  by_workflow_engine: Record<string, number>;
  events: DomainEventInfo[];
}

interface ValidatorInfo {
  name: string;
  file: string;
  schemas: number;
  complexity: 'simple' | 'moderate' | 'complex';
}

interface ValidatorsInventory {
  total_validators: number;
  total_schemas: number;
  by_complexity: Record<string, number>;
  validators: ValidatorInfo[];
}

interface CacheKeyInfo {
  pattern: string;
  purpose: string;
  ttl?: string;
}

interface CacheInventory {
  enabled: boolean;
  provider: string;
  total_key_patterns: number;
  keys: CacheKeyInfo[];
}

interface CodebaseInventory {
  database: DatabaseInventory;
  middleware: MiddlewareInventory;
  workers: WorkersInventory;
  integrations: IntegrationsInventory;
  domain_events: DomainEventsInventory;
  validators: ValidatorsInventory;
  cache: CacheInventory;
}

// =============================================================================
// Extractors
// =============================================================================

/**
 * Extract database schema inventory from Prisma schema
 */
function extractDatabaseInventory(schemaPath: string): DatabaseInventory {
  if (!existsSync(schemaPath)) {
    console.log('  Prisma schema not found, using defaults');
    return {
      total_tables: 0,
      total_fields: 0,
      total_indexes: 0,
      total_relations: 0,
      tables_with_embeddings: 0,
      enums: 0,
      tables: [],
    };
  }

  const content = readFileSync(schemaPath, 'utf-8');
  const tables: TableInfo[] = [];
  let totalFields = 0;
  let totalIndexes = 0;
  let totalRelations = 0;
  let tablesWithEmbeddings = 0;

  // Count enums
  const enumMatches = content.match(/^enum\s+\w+\s*\{/gm);
  const enums = enumMatches?.length ?? 0;

  // Extract models
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = modelRegex.exec(content)) !== null) {
    const modelName = match[1];
    const modelBody = match[2];

    // Count fields (lines that don't start with @@ and aren't empty)
    const fieldLines = modelBody
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('@@') && !trimmed.startsWith('//');
      });
    const fields = fieldLines.length;

    // Count indexes (@@index, @@unique, @unique, @id)
    const indexMatches = modelBody.match(/@@index|@@unique|@unique|@id/g);
    const indexes = indexMatches?.length ?? 0;

    // Count relations (@relation)
    const relationMatches = modelBody.match(/@relation/g);
    const relations = relationMatches?.length ?? 0;

    // Check for embedding
    const hasEmbedding = modelBody.includes('vector(');

    tables.push({
      name: modelName,
      fields,
      indexes,
      relations,
      hasEmbedding,
    });

    totalFields += fields;
    totalIndexes += indexes;
    totalRelations += relations;
    if (hasEmbedding) tablesWithEmbeddings++;
  }

  // Sort by field count descending
  tables.sort((a, b) => b.fields - a.fields);

  return {
    total_tables: tables.length,
    total_fields: totalFields,
    total_indexes: totalIndexes,
    total_relations: totalRelations,
    tables_with_embeddings: tablesWithEmbeddings,
    enums,
    tables,
  };
}

/**
 * Extract middleware stack from API middleware directory
 */
function extractMiddlewareInventory(middlewareDir: string): MiddlewareInventory {
  const middleware: MiddlewareInfo[] = [];

  if (!existsSync(middlewareDir)) {
    console.log('  Middleware directory not found');
    return { total_middleware: 0, by_type: {}, middleware: [] };
  }

  // Read index.ts to find exported middleware
  const indexPath = join(middlewareDir, 'index.ts');
  if (existsSync(indexPath)) {
    const content = readFileSync(indexPath, 'utf-8');

    // Extract middleware names from exports
    const exportMatches = content.match(/export\s*\{([^}]+)\}/g);
    if (exportMatches) {
      for (const exportBlock of exportMatches) {
        const names = exportBlock
          .replace(/export\s*\{/, '')
          .replace(/\}/, '')
          .split(',')
          .map((n) => n.trim())
          .filter((n) => n && !n.startsWith('//'));

        for (const name of names) {
          if (name.includes('Middleware') || name.includes('middleware')) {
            let type: MiddlewareInfo['type'] = 'other';
            if (name.toLowerCase().includes('auth')) type = 'auth';
            else if (name.toLowerCase().includes('log') || name.toLowerCase().includes('performance')) type = 'logging';
            else if (name.toLowerCase().includes('rate')) type = 'rate-limit';
            else if (name.toLowerCase().includes('valid')) type = 'validation';
            else if (name.toLowerCase().includes('error')) type = 'error';

            // Check if it's commented out (disabled)
            const isCommented = content.includes(`// ${name}`) || content.includes(`//${name}`);

            middleware.push({
              name,
              type,
              description: generateMiddlewareDescription(name),
              enabled: !isCommented,
            });
          }
        }
      }
    }
  }

  // Count by type
  const byType: Record<string, number> = {};
  for (const mw of middleware) {
    byType[mw.type] = (byType[mw.type] || 0) + 1;
  }

  return {
    total_middleware: middleware.length,
    by_type: byType,
    middleware,
  };
}

function generateMiddlewareDescription(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('auth')) return 'Authentication and authorization';
  if (lower.includes('admin')) return 'Admin role verification';
  if (lower.includes('manager')) return 'Manager role verification';
  if (lower.includes('logging')) return 'Request/response logging';
  if (lower.includes('performance')) return 'Performance monitoring and metrics';
  if (lower.includes('error')) return 'Error tracking and reporting';
  if (lower.includes('ratelimit') || lower.includes('rate')) return 'Rate limiting';
  return 'Custom middleware';
}

/**
 * Extract background workers inventory
 */
function extractWorkersInventory(workersDir: string): WorkersInventory {
  const workers: WorkerInfo[] = [];

  if (!existsSync(workersDir)) {
    console.log('  Workers directory not found');
    return { total_workers: 0, total_jobs: 0, workers: [] };
  }

  const workerDirs = readdirSync(workersDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.endsWith('-worker'))
    .map((d) => d.name);

  for (const workerDir of workerDirs) {
    const workerPath = join(workersDir, workerDir);
    const mainPath = join(workerPath, 'src', 'main.ts');
    const jobs: string[] = [];

    // Determine worker type
    let type: WorkerInfo['type'] = 'other';
    if (workerDir.includes('event')) type = 'events';
    else if (workerDir.includes('notification')) type = 'notifications';
    else if (workerDir.includes('ingestion')) type = 'ingestion';

    // Try to find job files
    const jobsDir = join(workerPath, 'src', 'jobs');
    if (existsSync(jobsDir)) {
      const jobFiles = readdirSync(jobsDir).filter((f) => f.endsWith('.job.ts'));
      jobs.push(...jobFiles.map((f) => f.replace('.job.ts', '')));
    }

    // Also check for outbox patterns
    const outboxDir = join(workerPath, 'src', 'outbox');
    if (existsSync(outboxDir)) {
      const outboxFiles = readdirSync(outboxDir).filter((f) => f.endsWith('.ts') && !f.includes('.test'));
      jobs.push(...outboxFiles.map((f) => f.replace('.ts', '')));
    }

    // Check channels for notification worker
    const channelsDir = join(workerPath, 'src', 'channels');
    if (existsSync(channelsDir)) {
      const channelFiles = readdirSync(channelsDir).filter((f) => f.endsWith('.ts') && !f.includes('.test'));
      jobs.push(...channelFiles.map((f) => `channel:${f.replace('.ts', '')}`));
    }

    workers.push({
      name: workerDir.replace('-worker', ''),
      type,
      jobs,
      description: generateWorkerDescription(workerDir),
    });
  }

  const totalJobs = workers.reduce((sum, w) => sum + w.jobs.length, 0);

  return {
    total_workers: workers.length,
    total_jobs: totalJobs,
    workers,
  };
}

function generateWorkerDescription(name: string): string {
  if (name.includes('event')) return 'Domain event processing and outbox polling';
  if (name.includes('notification')) return 'Multi-channel notification delivery';
  if (name.includes('ingestion')) return 'Document ingestion and text extraction';
  return 'Background job processing';
}

/**
 * Extract external integrations inventory
 */
function extractIntegrationsInventory(adaptersDir: string): IntegrationsInventory {
  const integrations: IntegrationInfo[] = [];

  if (!existsSync(adaptersDir)) {
    console.log('  Adapters directory not found');
    return { total_integrations: 0, by_category: {}, integrations: [] };
  }

  // Define integration categories and their paths
  const integrationPaths: Array<{ path: string; category: IntegrationInfo['category']; provider: string }> = [
    { path: 'calendar/google', category: 'calendar', provider: 'Google Calendar' },
    { path: 'calendar/microsoft', category: 'calendar', provider: 'Microsoft Outlook' },
    { path: 'email/gmail', category: 'email', provider: 'Gmail' },
    { path: 'email/outlook', category: 'email', provider: 'Outlook' },
    { path: 'payments/stripe', category: 'payment', provider: 'Stripe' },
    { path: 'payments/paypal', category: 'payment', provider: 'PayPal' },
    { path: 'messaging/slack', category: 'messaging', provider: 'Slack' },
    { path: 'messaging/teams', category: 'messaging', provider: 'Microsoft Teams' },
    { path: 'erp/sap', category: 'erp', provider: 'SAP' },
    { path: 'storage', category: 'storage', provider: 'Supabase Storage' },
    { path: 'memory/zep', category: 'ai', provider: 'Zep Memory' },
    { path: 'antivirus', category: 'other', provider: 'ClamAV' },
  ];

  for (const { path, category, provider } of integrationPaths) {
    const fullPath = join(adaptersDir, path);
    if (existsSync(fullPath)) {
      integrations.push({
        name: provider.toLowerCase().replace(/\s+/g, '-'),
        category,
        provider,
        description: generateIntegrationDescription(category, provider),
      });
    }
  }

  // Count by category
  const byCategory: Record<string, number> = {};
  for (const int of integrations) {
    byCategory[int.category] = (byCategory[int.category] || 0) + 1;
  }

  return {
    total_integrations: integrations.length,
    by_category: byCategory,
    integrations,
  };
}

function generateIntegrationDescription(category: string, provider: string): string {
  switch (category) {
    case 'calendar':
      return `${provider} calendar sync and event management`;
    case 'email':
      return `${provider} email sending and receiving`;
    case 'payment':
      return `${provider} payment processing`;
    case 'messaging':
      return `${provider} team messaging integration`;
    case 'erp':
      return `${provider} ERP system integration`;
    case 'storage':
      return `${provider} file storage`;
    case 'ai':
      return `${provider} AI memory/context management`;
    default:
      return `${provider} integration`;
  }
}

/**
 * Extract domain events inventory
 */
function extractDomainEventsInventory(eventsDir: string): DomainEventsInventory {
  const events: DomainEventInfo[] = [];

  // Check multiple possible event locations
  const eventPaths = [
    eventsDir,
    join(eventsDir, '..', 'legal', 'cases'),
    join(eventsDir, '..', 'crm'),
  ];

  for (const eventPath of eventPaths) {
    if (!existsSync(eventPath)) continue;

    const files = readdirSync(eventPath).filter(
      (f) => (f.includes('Event') || f.includes('event')) && f.endsWith('.ts') && !f.includes('.test')
    );

    for (const file of files) {
      const filePath = join(eventPath, file);
      const content = readFileSync(filePath, 'utf-8');

      // Extract event classes
      const eventClassRegex = /class\s+(\w+Event)\s+extends\s+DomainEvent/g;
      let match;

      while ((match = eventClassRegex.exec(content)) !== null) {
        const eventName = match[1];

        // Try to find eventType
        const typeMatch = content.match(new RegExp(`${eventName}[\\s\\S]*?eventType\\s*=\\s*['"]([^'"]+)['"]`));
        const eventType = typeMatch?.[1] ?? eventName;

        // Determine aggregate from event type or file name
        let aggregate = 'unknown';
        if (eventType.includes('.')) {
          aggregate = eventType.split('.')[0];
        } else if (file.includes('case')) {
          aggregate = 'case';
        } else if (file.includes('lead')) {
          aggregate = 'lead';
        }

        events.push({
          name: eventName,
          eventType,
          aggregate,
        });
      }
    }
  }

  // Look for workflow routing mapping
  const caseEventsPath = join(eventsDir, 'case-events.ts');
  if (existsSync(caseEventsPath)) {
    const content = readFileSync(caseEventsPath, 'utf-8');
    const routingMatch = content.match(/CASE_EVENT_WORKFLOW_ROUTING[^{]*\{([^}]+)\}/s);

    if (routingMatch) {
      const routingContent = routingMatch[1];
      for (const event of events) {
        const engineMatch = routingContent.match(new RegExp(`'${event.eventType}'\\s*:\\s*'(\\w+)'`));
        if (engineMatch) {
          event.workflowEngine = engineMatch[1];
        }
      }
    }
  }

  // Count by aggregate
  const byAggregate: Record<string, number> = {};
  const byWorkflowEngine: Record<string, number> = {};

  for (const event of events) {
    byAggregate[event.aggregate] = (byAggregate[event.aggregate] || 0) + 1;
    if (event.workflowEngine) {
      byWorkflowEngine[event.workflowEngine] = (byWorkflowEngine[event.workflowEngine] || 0) + 1;
    }
  }

  return {
    total_events: events.length,
    by_aggregate: byAggregate,
    by_workflow_engine: byWorkflowEngine,
    events,
  };
}

/**
 * Extract validation schemas inventory
 */
function extractValidatorsInventory(validatorsDir: string): ValidatorsInventory {
  const validators: ValidatorInfo[] = [];

  if (!existsSync(validatorsDir)) {
    console.log('  Validators directory not found');
    return { total_validators: 0, total_schemas: 0, by_complexity: {}, validators: [] };
  }

  const srcDir = join(validatorsDir, 'src');
  const targetDir = existsSync(srcDir) ? srcDir : validatorsDir;

  const files = readdirSync(targetDir).filter(
    (f) => f.endsWith('.ts') && !f.includes('.test') && !f.includes('index') && !f.startsWith('__')
  );

  let totalSchemas = 0;

  for (const file of files) {
    const filePath = join(targetDir, file);
    const content = readFileSync(filePath, 'utf-8');

    // Count z.object, z.string, z.enum, etc. definitions
    const schemaMatches = content.match(/(?:export\s+)?const\s+\w+(?:Schema)?\s*=\s*z\./g);
    const schemas = schemaMatches?.length ?? 0;

    // Determine complexity based on file size and nesting
    let complexity: ValidatorInfo['complexity'] = 'simple';
    const lines = content.split('\n').length;
    const nestedObjects = (content.match(/z\.object\s*\(\s*\{/g) || []).length;

    if (lines > 200 || nestedObjects > 5) {
      complexity = 'complex';
    } else if (lines > 50 || nestedObjects > 2) {
      complexity = 'moderate';
    }

    validators.push({
      name: file.replace('.ts', ''),
      file,
      schemas,
      complexity,
    });

    totalSchemas += schemas;
  }

  // Sort by schema count descending
  validators.sort((a, b) => b.schemas - a.schemas);

  // Count by complexity
  const byComplexity: Record<string, number> = {};
  for (const v of validators) {
    byComplexity[v.complexity] = (byComplexity[v.complexity] || 0) + 1;
  }

  return {
    total_validators: validators.length,
    total_schemas: totalSchemas,
    by_complexity: byComplexity,
    validators,
  };
}

/**
 * Extract cache configuration inventory
 */
function extractCacheInventory(baseDir: string): CacheInventory {
  const keys: CacheKeyInfo[] = [];

  // Common cache key patterns to look for
  const cachePatterns = [
    { pattern: 'session:*', purpose: 'User session data', ttl: '24h' },
    { pattern: 'rate-limit:*', purpose: 'Rate limiting counters', ttl: '1m' },
    { pattern: 'ai-score:*', purpose: 'AI scoring cache', ttl: '1h' },
    { pattern: 'user:*', purpose: 'User profile cache', ttl: '15m' },
    { pattern: 'tenant:*', purpose: 'Tenant configuration cache', ttl: '5m' },
  ];

  // Check if Redis is configured
  const envPath = join(baseDir, '.env.example');
  let hasRedis = false;

  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    hasRedis = envContent.includes('REDIS_URL') || envContent.includes('UPSTASH');
  }

  // Also check package.json for redis dependencies
  const packagePath = join(baseDir, 'package.json');
  if (existsSync(packagePath)) {
    const packageContent = readFileSync(packagePath, 'utf-8');
    if (packageContent.includes('ioredis') || packageContent.includes('@upstash/redis')) {
      hasRedis = true;
    }
  }

  if (hasRedis) {
    keys.push(...cachePatterns);
  }

  return {
    enabled: hasRedis,
    provider: hasRedis ? 'Redis (Upstash)' : 'None',
    total_key_patterns: keys.length,
    keys,
  };
}

// =============================================================================
// Main
// =============================================================================

/**
 * Update baseline.json with codebase inventory
 */
function updateBaselineJson(baselinePath: string, inventory: CodebaseInventory): void {
  if (!existsSync(baselinePath)) {
    console.error(`Baseline file not found: ${baselinePath}`);
    return;
  }

  const content = readFileSync(baselinePath, 'utf-8');
  const baseline = JSON.parse(content);

  // Update inventory sections
  baseline.database_inventory = inventory.database;
  baseline.middleware_inventory = inventory.middleware;
  baseline.workers_inventory = inventory.workers;
  baseline.integrations_inventory = inventory.integrations;
  baseline.domain_events_inventory = inventory.domain_events;
  baseline.validators_inventory = inventory.validators;
  baseline.cache_inventory = inventory.cache;

  // Update timestamp
  baseline.timestamp = new Date().toISOString();

  // Write back
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
}

async function main() {
  const baseDir = process.cwd();

  console.log('='.repeat(60));
  console.log('Codebase Inventory Sync');
  console.log('='.repeat(60));
  console.log();

  // 1. Database Schema
  console.log('1. Extracting Database Schema Inventory...');
  const database = extractDatabaseInventory(join(baseDir, 'packages', 'db', 'prisma', 'schema.prisma'));
  console.log(`   Tables: ${database.total_tables}, Fields: ${database.total_fields}, Indexes: ${database.total_indexes}`);

  // 2. Middleware Stack
  console.log('2. Extracting Middleware Stack...');
  const middleware = extractMiddlewareInventory(join(baseDir, 'apps', 'api', 'src', 'middleware'));
  console.log(`   Middleware: ${middleware.total_middleware}`);

  // 3. Background Workers
  console.log('3. Extracting Background Workers...');
  const workers = extractWorkersInventory(join(baseDir, 'apps', 'workers'));
  console.log(`   Workers: ${workers.total_workers}, Jobs: ${workers.total_jobs}`);

  // 4. External Integrations
  console.log('4. Extracting External Integrations...');
  const integrations = extractIntegrationsInventory(join(baseDir, 'packages', 'adapters', 'src'));
  console.log(`   Integrations: ${integrations.total_integrations}`);

  // 5. Domain Events
  console.log('5. Extracting Domain Events...');
  const domainEvents = extractDomainEventsInventory(join(baseDir, 'packages', 'domain', 'src', 'events'));
  console.log(`   Events: ${domainEvents.total_events}`);

  // 6. Validation Schemas
  console.log('6. Extracting Validation Schemas...');
  const validators = extractValidatorsInventory(join(baseDir, 'packages', 'validators'));
  console.log(`   Validators: ${validators.total_validators}, Schemas: ${validators.total_schemas}`);

  // 7. Cache Configuration
  console.log('7. Extracting Cache Configuration...');
  const cache = extractCacheInventory(baseDir);
  console.log(`   Cache enabled: ${cache.enabled}, Provider: ${cache.provider}`);

  console.log();

  // Build inventory
  const inventory: CodebaseInventory = {
    database,
    middleware,
    workers,
    integrations,
    domain_events: domainEvents,
    validators,
    cache,
  };

  // Update baseline.json
  const baselinePath = join(baseDir, 'artifacts', 'benchmarks', 'baseline.json');
  console.log(`Updating: ${baselinePath}`);
  updateBaselineJson(baselinePath, inventory);
  console.log('  Done!');

  console.log();
  console.log('='.repeat(60));
  console.log('Codebase Inventory synced successfully!');
  console.log('='.repeat(60));
  console.log();
  console.log('Summary:');
  console.log(`  Database:     ${database.total_tables} tables, ${database.total_fields} fields, ${database.enums} enums`);
  console.log(`  Middleware:   ${middleware.total_middleware} (${middleware.middleware.filter((m) => m.enabled).length} enabled)`);
  console.log(`  Workers:      ${workers.total_workers} workers, ${workers.total_jobs} jobs`);
  console.log(`  Integrations: ${integrations.total_integrations} external services`);
  console.log(`  Events:       ${domainEvents.total_events} domain events`);
  console.log(`  Validators:   ${validators.total_validators} files, ${validators.total_schemas} schemas`);
  console.log(`  Cache:        ${cache.enabled ? 'Enabled' : 'Disabled'} (${cache.provider})`);
}

// Run
main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
