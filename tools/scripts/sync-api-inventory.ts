#!/usr/bin/env npx tsx
/**
 * API Inventory Sync Script
 *
 * Scans tRPC router files and updates the baseline.json with the actual
 * endpoint catalog. This prevents drift between code and documentation.
 *
 * ## Usage
 *
 *   npx tsx tools/scripts/sync-api-inventory.ts
 *   pnpm sync:api-inventory
 *
 * ## When to run
 *
 *   - After adding/removing tRPC procedures
 *   - Before generating performance reports
 *   - As part of CI to detect drift
 *
 * ## How it works
 *
 *   1. Scans `apps/api/src/modules/` for `.router.ts` files
 *   2. Uses regex to extract procedure names and types (query/mutation)
 *   3. Generates descriptions based on common patterns (create, getById, list, etc.)
 *   4. Marks critical endpoints from a predefined set (auth, core CRM, etc.)
 *   5. Updates `artifacts/benchmarks/baseline.json` with:
 *      - `api_inventory`: Summary counts of routers, endpoints, queries, mutations
 *      - `endpoint_catalog`: Detailed endpoint list grouped by router
 *
 * ## Output structure (baseline.json)
 *
 *   {
 *     "api_inventory": {
 *       "total_routers": 23,
 *       "total_endpoints": 210,
 *       "total_queries": 102,
 *       "total_mutations": 108,
 *       "routers": [{ "name": "auth", "endpoints": 15, "queries": 2, "mutations": 13 }, ...]
 *     },
 *     "endpoint_catalog": {
 *       "auth": [{ "name": "auth.login", "method": "POST", "description": "...", "critical": true }, ...],
 *       ...
 *     }
 *   }
 *
 * ## CI Integration
 *
 *   To detect drift in CI, compare the output of this script with the committed baseline:
 *
 *   ```bash
 *   pnpm sync:api-inventory
 *   git diff --exit-code artifacts/benchmarks/baseline.json
 *   ```
 *
 * @module tools/scripts/sync-api-inventory
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// Types
interface EndpointInfo {
  name: string;
  method: string;
  description: string;
  critical?: boolean;
}

interface RouterInfo {
  name: string;
  endpoints: number;
  queries: number;
  mutations: number;
}

interface ApiInventory {
  total_routers: number;
  total_endpoints: number;
  total_queries: number;
  total_mutations: number;
  routers: RouterInfo[];
}

interface ExtractedEndpoint {
  name: string;
  type: 'query' | 'mutation';
  description?: string;
}

// Critical endpoints that should be marked as such
const CRITICAL_ENDPOINTS = new Set([
  // Auth
  'auth.login',
  'auth.logout',
  'auth.refreshSession',
  'auth.getStatus',
  // Core CRM
  'lead.create',
  'lead.getById',
  'lead.list',
  'lead.update',
  'lead.scoreWithAI',
  'contact.create',
  'contact.getById',
  'contact.list',
  'contact.update',
  'account.create',
  'account.getById',
  'account.list',
  'account.update',
  'opportunity.create',
  'opportunity.getById',
  'opportunity.list',
  'opportunity.update',
  'opportunity.forecast',
  'ticket.create',
  'ticket.getById',
  'ticket.list',
  'ticket.update',
  'task.create',
  'task.getById',
  'task.list',
  'task.update',
  // Analytics
  'analytics.dealsWonTrend',
  'analytics.growthTrends',
  'analytics.recentActivity',
  // Billing
  'billing.getSubscription',
  // AI/Agent
  'agent.listTools',
  'agent.executeTool',
  'agent.getPendingApprovals',
  'agent.approveAction',
  'conversation.create',
  'conversation.getById',
  'conversation.addMessage',
  // Pipeline
  'pipelineConfig.getAll',
  // Audit
  'audit.search',
  'audit.getSecurityEvents',
  // Health
  'health.ping',
  'health.check',
  'health.ready',
  'health.alive',
  // System
  'system.version',
  'system.metrics',
  // Timeline
  'timeline.getEvents',
  'timeline.getUpcomingDeadlines',
  // Appointments
  'appointments.create',
  'appointments.getById',
  'appointments.list',
  'appointments.update',
  'appointments.checkAvailability',
  // Documents
  'documents.create',
  'documents.getById',
  'documents.list',
  // Feedback
  'feedback.submitSimple',
  'feedback.submitCorrection',
]);

// Description templates based on common patterns
function generateDescription(routerName: string, procedureName: string, type: 'query' | 'mutation'): string {
  const action = procedureName.replace(/([A-Z])/g, ' $1').toLowerCase().trim();

  // Common patterns
  if (procedureName === 'create') return `Create new ${routerName}`;
  if (procedureName === 'getById') return `Get ${routerName} by ID`;
  if (procedureName === 'list') return `List ${routerName}s with pagination`;
  if (procedureName === 'update') return `Update ${routerName}`;
  if (procedureName === 'delete') return `Delete ${routerName}`;
  if (procedureName === 'stats') return `${routerName.charAt(0).toUpperCase() + routerName.slice(1)} statistics`;
  if (procedureName === 'search') return `Search ${routerName}s`;
  if (procedureName === 'filterOptions') return 'Get filter options';

  // Generic fallback
  return action.charAt(0).toUpperCase() + action.slice(1);
}

/**
 * Extract endpoints from a router file using regex
 *
 * Handles tRPC router patterns:
 * - `name: procedureType.query(...)`
 * - `name: procedureType.input(...).query(...)`
 * - `name: procedureType\n.input(...)\n.mutation(...)` (multi-line)
 */
function extractEndpointsFromFile(filePath: string, routerName: string): ExtractedEndpoint[] {
  const content = readFileSync(filePath, 'utf-8');
  const endpoints: ExtractedEndpoint[] = [];

  // First, find the router body (content inside createTRPCRouter({ ... }))
  const routerMatch = content.match(/(?:createTRPCRouter|router)\s*\(\s*\{([\s\S]*)\}\s*\)/);

  if (!routerMatch) {
    // No router found
    return endpoints;
  }

  const routerBody = routerMatch[1];

  // Strategy: Find all procedure names by looking for pattern `name: [any]Procedure`
  // Then search forward to find .query or .mutation
  const procedureDefPattern = /(\w+)\s*:\s*(?:protected|tenant|admin|public)?[Pp]rocedure/g;

  let match;
  while ((match = procedureDefPattern.exec(routerBody)) !== null) {
    const procName = match[1];

    // Skip internal helpers
    if (!procName || procName.startsWith('_') || ['router', 'procedure'].includes(procName.toLowerCase())) {
      continue;
    }

    // Look forward in the content to find .query( or .mutation(
    // We need to search until we hit the next procedure definition or end
    const startIdx = match.index + match[0].length;

    // Find the next procedure definition (if any)
    const nextProcMatch = routerBody.slice(startIdx).match(/\n\s+\w+\s*:\s*(?:protected|tenant|admin|public)?[Pp]rocedure/);
    const endIdx = nextProcMatch
      ? startIdx + (nextProcMatch.index ?? routerBody.length)
      : routerBody.length;

    const procedureSection = routerBody.slice(startIdx, endIdx);

    // Look for .query( or .mutation( in this section
    const queryMatch = procedureSection.match(/\.\s*query\s*\(/);
    const mutationMatch = procedureSection.match(/\.\s*mutation\s*\(/);

    if (mutationMatch) {
      endpoints.push({
        name: procName,
        type: 'mutation',
      });
    } else if (queryMatch) {
      endpoints.push({
        name: procName,
        type: 'query',
      });
    }
    // If neither found, skip (might be a middleware or incomplete)
  }

  // Deduplicate
  const seen = new Set<string>();
  return endpoints.filter((ep) => {
    if (seen.has(ep.name)) return false;
    seen.add(ep.name);
    return true;
  });
}

/**
 * Scan all router files in the modules directory
 */
function scanRouters(modulesDir: string): Map<string, ExtractedEndpoint[]> {
  const routers = new Map<string, ExtractedEndpoint[]>();

  if (!existsSync(modulesDir)) {
    console.error(`Modules directory not found: ${modulesDir}`);
    return routers;
  }

  // Get all subdirectories (modules)
  const modules = readdirSync(modulesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const module of modules) {
    const moduleDir = join(modulesDir, module);

    // Look for router files
    const files = readdirSync(moduleDir).filter((f) => f.endsWith('.router.ts'));

    for (const file of files) {
      const filePath = join(moduleDir, file);
      const routerName = file.replace('.router.ts', '');

      // Convert kebab-case to camelCase
      const camelName = routerName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

      const endpoints = extractEndpointsFromFile(filePath, camelName);

      if (endpoints.length > 0) {
        routers.set(camelName, endpoints);
      }
    }
  }

  return routers;
}

/**
 * Build the endpoint catalog structure
 */
function buildEndpointCatalog(
  routers: Map<string, ExtractedEndpoint[]>
): Record<string, EndpointInfo[]> {
  const catalog: Record<string, EndpointInfo[]> = {};

  for (const [routerName, endpoints] of routers) {
    catalog[routerName] = endpoints.map((ep) => {
      const fullName = `${routerName}.${ep.name}`;
      return {
        name: fullName,
        method: ep.type === 'query' ? 'GET' : 'POST',
        description: generateDescription(routerName, ep.name, ep.type),
        ...(CRITICAL_ENDPOINTS.has(fullName) ? { critical: true } : {}),
      };
    });
  }

  return catalog;
}

/**
 * Build the API inventory summary
 */
function buildApiInventory(routers: Map<string, ExtractedEndpoint[]>): ApiInventory {
  const routerInfos: RouterInfo[] = [];
  let totalQueries = 0;
  let totalMutations = 0;

  for (const [routerName, endpoints] of routers) {
    const queries = endpoints.filter((e) => e.type === 'query').length;
    const mutations = endpoints.filter((e) => e.type === 'mutation').length;

    totalQueries += queries;
    totalMutations += mutations;

    routerInfos.push({
      name: routerName,
      endpoints: endpoints.length,
      queries,
      mutations,
    });
  }

  // Sort by endpoint count descending
  routerInfos.sort((a, b) => b.endpoints - a.endpoints);

  return {
    total_routers: routers.size,
    total_endpoints: totalQueries + totalMutations,
    total_queries: totalQueries,
    total_mutations: totalMutations,
    routers: routerInfos,
  };
}

/**
 * Update baseline.json with the extracted API inventory
 */
function updateBaselineJson(
  baselinePath: string,
  inventory: ApiInventory,
  catalog: Record<string, EndpointInfo[]>
): void {
  if (!existsSync(baselinePath)) {
    console.error(`Baseline file not found: ${baselinePath}`);
    return;
  }

  const content = readFileSync(baselinePath, 'utf-8');
  const baseline = JSON.parse(content);

  // Update the inventory and catalog
  baseline.api_inventory = inventory;
  baseline.endpoint_catalog = catalog;

  // Update timestamp
  baseline.timestamp = new Date().toISOString();

  // Write back
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
}

/**
 * Main function
 */
async function main() {
  const baseDir = process.cwd();
  const modulesDir = join(baseDir, 'apps', 'api', 'src', 'modules');
  const baselinePath = join(baseDir, 'artifacts', 'benchmarks', 'baseline.json');

  console.log('='.repeat(60));
  console.log('API Inventory Sync');
  console.log('='.repeat(60));
  console.log();

  // Scan routers
  console.log(`Scanning routers in: ${modulesDir}`);
  const routers = scanRouters(modulesDir);
  console.log(`  Found ${routers.size} routers`);
  console.log();

  // Build inventory
  console.log('Building API inventory...');
  const inventory = buildApiInventory(routers);
  console.log(`  Total endpoints: ${inventory.total_endpoints}`);
  console.log(`  Queries (GET): ${inventory.total_queries}`);
  console.log(`  Mutations (POST): ${inventory.total_mutations}`);
  console.log();

  // Build catalog
  console.log('Building endpoint catalog...');
  const catalog = buildEndpointCatalog(routers);

  // Show breakdown
  console.log('Router breakdown:');
  for (const router of inventory.routers) {
    console.log(`  ${router.name.padEnd(20)} ${router.endpoints} endpoints (${router.queries} GET, ${router.mutations} POST)`);
  }
  console.log();

  // Update baseline.json
  console.log(`Updating: ${baselinePath}`);
  updateBaselineJson(baselinePath, inventory, catalog);
  console.log('  Done!');

  console.log();
  console.log('='.repeat(60));
  console.log('API Inventory synced successfully!');
  console.log('='.repeat(60));
  console.log();
  console.log('Next steps:');
  console.log('  1. Run: npx tsx artifacts/benchmarks/generate-performance-report.ts');
  console.log('  2. Open: artifacts/benchmarks/performance-report.html');
}

// Run
main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
