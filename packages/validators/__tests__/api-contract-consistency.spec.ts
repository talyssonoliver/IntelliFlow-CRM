/**
 * API Contract Consistency Validator
 *
 * Ensures that tRPC router implementations match the contracts defined in
 * docs/api/contracts/api-contracts.yaml
 *
 * This test validates:
 * 1. Procedure types match (tenantProcedure vs protectedProcedure)
 * 2. Owner filtering is consistent across related endpoints
 * 3. Stats endpoints match list endpoint scopes
 *
 * @see docs/api/contracts/api-contracts.yaml - Source of truth
 * @see tests/architecture/README.md - Architecture test patterns
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Contract types
interface EndpointContract {
  procedure: string;
  type: 'query' | 'mutation';
  ownerFilter: boolean;
  inputs: string[];
  consistency?: {
    mustMatchScope: string[];
    reason?: string;
  };
}

interface RouterContract {
  description: string;
  defaultProcedure: string;
  endpoints: Record<string, EndpointContract>;
  status?: 'stub' | 'active';
  note?: string;
  accessControl?: string;
}

interface ApiContracts {
  version: string;
  procedures: Record<string, { scope: string; filter?: { tenantId: string; ownerId: string } }>;
  routers: Record<string, RouterContract>;
  validationRules: Record<string, { rule: string; affectedRouters: string[] }>;
  knownViolations: Array<{
    id: string;
    severity: string;
    router: string;
    endpoint: string;
    issue: string;
    file: string;
    line: number;
  }>;
  resolvedViolations?: Array<{
    id: string;
    severity: string;
    router: string;
    endpoint: string;
    issue: string;
    resolution: string;
    resolvedAt: string;
    file: string;
    line: number;
  }>;
}

// Router analysis types
interface AnalyzedEndpoint {
  name: string;
  procedure: string;
  hasOwnerFilter: boolean;
  lineNumber: number;
}

interface AnalyzedRouter {
  name: string;
  filePath: string;
  endpoints: AnalyzedEndpoint[];
}

// Paths
const CONTRACTS_PATH = path.resolve(__dirname, '../../../docs/api/contracts/api-contracts.yaml');
const ROUTERS_DIR = path.resolve(__dirname, '../../../apps/api/src/modules');

/**
 * Load API contracts from YAML
 */
function loadContracts(): ApiContracts {
  const content = fs.readFileSync(CONTRACTS_PATH, 'utf-8');
  return yaml.load(content) as ApiContracts;
}

/**
 * Analyze a router file to extract endpoint information
 */
function analyzeRouterFile(filePath: string): AnalyzedEndpoint[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const endpoints: AnalyzedEndpoint[] = [];

  // Patterns to detect procedure types and endpoint definitions
  const procedurePatterns = {
    publicProcedure: /publicProcedure/,
    protectedProcedure: /protectedProcedure/,
    tenantProcedure: /tenantProcedure/,
    adminProcedure: /adminProcedure/,
  };

  // Pattern to detect endpoint definition: endpointName: procedureType
  const endpointPattern = /^\s*(\w+):\s*(public|protected|tenant|admin)Procedure/;

  // Pattern to detect createTenantWhereClause usage (indicates owner filtering)
  const ownerFilterPattern = /createTenantWhereClause|prismaWithTenant/;

  let currentEndpoint: string | null = null;
  let currentProcedure: string | null = null;
  let currentLineNumber = 0;
  let hasOwnerFilter = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Check for endpoint definition
    const endpointMatch = line.match(endpointPattern);
    if (endpointMatch) {
      // Save previous endpoint if exists
      if (currentEndpoint && currentProcedure) {
        endpoints.push({
          name: currentEndpoint,
          procedure: currentProcedure,
          hasOwnerFilter,
          lineNumber: currentLineNumber,
        });
      }

      currentEndpoint = endpointMatch[1];
      currentProcedure = `${endpointMatch[2]}Procedure`;
      currentLineNumber = lineNumber;
      hasOwnerFilter = false;
      braceDepth = 0;
    }

    // Track brace depth to know when we're inside an endpoint
    if (currentEndpoint) {
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;

      // Check for owner filtering patterns
      if (ownerFilterPattern.test(line)) {
        hasOwnerFilter = true;
      }

      // End of endpoint (back to depth 0 or next endpoint)
      if (braceDepth <= 0 && line.includes('}')) {
        endpoints.push({
          name: currentEndpoint,
          procedure: currentProcedure!,
          hasOwnerFilter,
          lineNumber: currentLineNumber,
        });
        currentEndpoint = null;
        currentProcedure = null;
        hasOwnerFilter = false;
      }
    }
  }

  return endpoints;
}

/**
 * Find router file path for a given router name
 */
function findRouterFile(routerName: string): string | null {
  const possiblePaths = [
    path.join(ROUTERS_DIR, routerName, `${routerName}.router.ts`),
    path.join(ROUTERS_DIR, routerName, 'router.ts'),
    path.join(ROUTERS_DIR, `${routerName}.router.ts`),
    // Special cases
    path.join(ROUTERS_DIR, 'misc', `${routerName}.router.ts`),
    path.join(ROUTERS_DIR, 'legal', `${routerName}.router.ts`),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

describe('API Contract Consistency', () => {
  let contracts: ApiContracts;

  beforeAll(() => {
    contracts = loadContracts();
  });

  describe('Contract file validity', () => {
    it('should load contracts from YAML', () => {
      expect(contracts).toBeDefined();
      expect(contracts.version).toBeDefined();
      expect(contracts.routers).toBeDefined();
    });

    it('should have all required procedure definitions', () => {
      expect(contracts.procedures.publicProcedure).toBeDefined();
      expect(contracts.procedures.protectedProcedure).toBeDefined();
      expect(contracts.procedures.tenantProcedure).toBeDefined();
      expect(contracts.procedures.adminProcedure).toBeDefined();
    });

    it('should define all 19 routers', () => {
      const expectedRouters = [
        'lead', 'contact', 'account', 'opportunity', 'task', 'ticket',
        'analytics', 'agent', 'conversation', 'feedback',
        'appointments', 'documents', 'health', 'auth', 'billing', 'timeline',
        'system', 'upload', 'cases'
      ];

      expect(expectedRouters.length).toBe(19);

      for (const router of expectedRouters) {
        expect(contracts.routers[router], `Router ${router} should be defined`).toBeDefined();
      }
    });
  });

  describe('Scope consistency validation', () => {
    it('lead.stats should use tenantProcedure (same as lead.list)', () => {
      const leadRouter = contracts.routers.lead;
      expect(leadRouter.endpoints.stats.procedure).toBe('tenantProcedure');
      expect(leadRouter.endpoints.stats.ownerFilter).toBe(true);
      expect(leadRouter.endpoints.list.ownerFilter).toBe(leadRouter.endpoints.stats.ownerFilter);
    });

    it('contact.stats should match contact.list scope', () => {
      const router = contracts.routers.contact;
      expect(router.endpoints.stats.procedure).toBe(router.endpoints.list.procedure);
      expect(router.endpoints.stats.ownerFilter).toBe(router.endpoints.list.ownerFilter);
    });

    it('account.stats should match account.list scope', () => {
      const router = contracts.routers.account;
      expect(router.endpoints.stats.procedure).toBe(router.endpoints.list.procedure);
      expect(router.endpoints.stats.ownerFilter).toBe(router.endpoints.list.ownerFilter);
    });

    it('opportunity.stats should match opportunity.list scope', () => {
      const router = contracts.routers.opportunity;
      expect(router.endpoints.stats.procedure).toBe(router.endpoints.list.procedure);
      expect(router.endpoints.stats.ownerFilter).toBe(router.endpoints.list.ownerFilter);
    });

    it('task.stats should match task.list scope', () => {
      const router = contracts.routers.task;
      expect(router.endpoints.stats.procedure).toBe(router.endpoints.list.procedure);
      expect(router.endpoints.stats.ownerFilter).toBe(router.endpoints.list.ownerFilter);
    });

    it('ticket.stats should match ticket.list scope', () => {
      const router = contracts.routers.ticket;
      expect(router.endpoints.stats.procedure).toBe(router.endpoints.list.procedure);
      expect(router.endpoints.stats.ownerFilter).toBe(router.endpoints.list.ownerFilter);
    });
  });

  describe('CRUD consistency validation', () => {
    const crmRouters = ['lead', 'contact', 'account', 'opportunity', 'task'];

    for (const routerName of crmRouters) {
      describe(`${routerName} router`, () => {
        it('should use consistent procedure for CRUD operations', () => {
          const router = contracts.routers[routerName];
          const crudEndpoints = ['create', 'getById', 'list', 'update', 'delete'];
          const procedures = crudEndpoints
            .filter(e => router.endpoints[e])
            .map(e => router.endpoints[e].procedure);

          const uniqueProcedures = new Set(procedures);
          expect(uniqueProcedures.size,
            `${routerName} CRUD endpoints should use same procedure: ${[...uniqueProcedures].join(', ')}`
          ).toBe(1);
        });

        it('should have consistent ownerFilter for CRUD operations', () => {
          const router = contracts.routers[routerName];
          const crudEndpoints = ['create', 'getById', 'list', 'update', 'delete'];
          const filters = crudEndpoints
            .filter(e => router.endpoints[e])
            .map(e => router.endpoints[e].ownerFilter);

          const uniqueFilters = new Set(filters);
          expect(uniqueFilters.size,
            `${routerName} CRUD endpoints should have consistent ownerFilter`
          ).toBe(1);
        });
      });
    }
  });

  describe('Violations tracking', () => {
    it('should have no known violations (all resolved)', () => {
      expect(contracts.knownViolations).toEqual([]);
    });

    it('should track resolved violations in history', () => {
      const resolved = contracts.resolvedViolations?.find(v => v.id === 'VIOLATION-001');
      expect(resolved).toBeDefined();
      expect(resolved?.router).toBe('lead');
      expect(resolved?.endpoint).toBe('stats');
      expect(resolved?.resolution).toContain('tenantProcedure');
    });

    it('should track violation file locations for any known violations', () => {
      for (const violation of contracts.knownViolations) {
        expect(violation.file).toBeDefined();
        expect(violation.line).toBeGreaterThan(0);
      }
    });
  });

  describe('Role-based filtering rules', () => {
    it('tenantProcedure should define role filtering behavior', () => {
      const tenantProc = contracts.procedures.tenantProcedure;
      expect(tenantProc.scope).toBe('tenant_with_owner');
      expect(tenantProc.filter?.ownerId).toBe('by_role');
    });

    it('protectedProcedure should only filter by tenant', () => {
      const protectedProc = contracts.procedures.protectedProcedure;
      expect(protectedProc.scope).toBe('tenant_only');
      expect(protectedProc.filter?.ownerId).toBe('none');
    });
  });

  describe('Metadata validation', () => {
    it('should have accurate router count', () => {
      const routerCount = Object.keys(contracts.routers).length;
      expect(routerCount).toBeGreaterThanOrEqual(19);
    });

    it('should track total endpoints', () => {
      let totalEndpoints = 0;
      for (const router of Object.values(contracts.routers)) {
        totalEndpoints += Object.keys(router.endpoints).length;
      }
      expect(totalEndpoints).toBeGreaterThan(160);
    });

    it('should handle stub routers', () => {
      const casesRouter = contracts.routers.cases;
      expect(casesRouter).toBeDefined();
      expect(casesRouter.status).toBe('stub');
      expect(Object.keys(casesRouter.endpoints).length).toBe(0);
    });
  });
});

describe('Code-to-Contract Validation', () => {
  let contracts: ApiContracts;

  beforeAll(() => {
    contracts = loadContracts();
  });

  describe('Lead router implementation', () => {
    it('should verify lead.router.ts exists', () => {
      const filePath = findRouterFile('lead');
      expect(filePath).not.toBeNull();
    });

        it('lead.stats should use tenantProcedure in code', () => {
      const filePath = findRouterFile('lead');
      if (!filePath) {
        throw new Error('Lead router file not found');
      }

      const endpoints = analyzeRouterFile(filePath);
      const statsEndpoint = endpoints.find(e => e.name === 'stats');

      expect(statsEndpoint).toBeDefined();
      expect(statsEndpoint?.procedure).toBe('tenantProcedure');
      expect(statsEndpoint?.hasOwnerFilter).toBe(true);
    });

    it('lead.list should use tenantProcedure in code', () => {
      const filePath = findRouterFile('lead');
      if (!filePath) {
        throw new Error('Lead router file not found');
      }

      const endpoints = analyzeRouterFile(filePath);
      const listEndpoint = endpoints.find(e => e.name === 'list');

      if (listEndpoint) {
        expect(listEndpoint.procedure).toBe('tenantProcedure');
      }
    });
  });

  describe('Contact router implementation', () => {
    it('should verify contact.router.ts exists', () => {
      const filePath = findRouterFile('contact');
      expect(filePath).not.toBeNull();
    });
  });
});

/**
 * Helper to generate violation report
 */
export function generateViolationReport(contracts: ApiContracts): string {
  const lines: string[] = [
    '# API Contract Violations Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Known Violations',
    '',
  ];

  for (const violation of contracts.knownViolations) {
    lines.push(`### ${violation.id} (${violation.severity})`);
    lines.push(`- **Router**: ${violation.router}`);
    lines.push(`- **Endpoint**: ${violation.endpoint}`);
    lines.push(`- **Issue**: ${violation.issue}`);
    lines.push(`- **Location**: ${violation.file}:${violation.line}`);
    lines.push('');
  }

  return lines.join('\n');
}
