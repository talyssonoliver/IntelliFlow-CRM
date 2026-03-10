/**
 * Architecture Enforcement Test: tenantProcedure Usage
 *
 * IFC-194: Ensures all tenant-scoped routers use tenantProcedure middleware
 * and no router defines manual getTenantId/getUserId helper functions.
 *
 * This test prevents regression to the manual helper pattern.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROUTER_DIR = path.resolve(__dirname, '../../apps/api/src/modules');

/**
 * Routers that legitimately use protectedProcedure/publicProcedure/adminProcedure
 * without needing tenantProcedure (e.g., auth, billing, system, stubs).
 */
const ALLOWLISTED_ROUTERS = new Set([
  'auth.router.ts',
  'health.router.ts',
  'system.router.ts',
  'billing.router.ts',
  'user.router.ts',
  'timeline.router.ts',
  'workflow.router.ts',
  'audit.router.ts',
  'webhooks.router.ts',
  'upload.router.ts',
  'agent.router.ts',
  'conversation.router.ts',
  'calendar-webhook.router.ts',
  'dsar.router.ts',
  'queues.router.ts',
  // These routers use protectedProcedure legitimately and are tracked
  // for future migration outside IFC-194 scope:
  'integrations.router.ts',
  'appointments.router.ts',
  'documents.router.ts',
  'subscription.router.ts',
]);

function findRouterFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== '__tests__' && entry.name !== 'node_modules') {
      files.push(...findRouterFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.router.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('tenantProcedure enforcement', () => {
  const routerFiles = findRouterFiles(ROUTER_DIR);

  it('should find router files to scan', () => {
    expect(routerFiles.length).toBeGreaterThan(0);
  });

  it('should not have any router file defining a getTenantId helper function', () => {
    const violations: string[] = [];
    for (const file of routerFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      // Match function declarations like: function getTenantId(
      // Also match: async function getTenantId(
      if (/(?:async\s+)?function\s+getTenantId\s*\(/.test(content)) {
        violations.push(path.relative(ROUTER_DIR, file));
      }
    }
    expect(violations, `Router files with getTenantId helper: ${violations.join(', ')}`).toEqual([]);
  });

  it('should not have any router file defining a getUserId helper function', () => {
    const violations: string[] = [];
    for (const file of routerFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (/(?:async\s+)?function\s+getUserId\s*\(/.test(content)) {
        violations.push(path.relative(ROUTER_DIR, file));
      }
    }
    expect(violations, `Router files with getUserId helper: ${violations.join(', ')}`).toEqual([]);
  });

  it('should not use ctx.user?.tenantId or ctx.user!.tenantId in routers that import tenantProcedure', () => {
    const violations: string[] = [];
    for (const file of routerFiles) {
      const basename = path.basename(file);
      if (ALLOWLISTED_ROUTERS.has(basename)) continue;

      const content = fs.readFileSync(file, 'utf-8');
      // Only check routers that import tenantProcedure
      if (!content.includes('tenantProcedure')) continue;

      // Find instances of ctx.user?.tenantId or ctx.user!.tenantId in procedure bodies
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments and import lines
        if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.includes('import')) continue;
        if (/ctx\.user[\?!]?\.tenantId/.test(line)) {
          violations.push(`${path.relative(ROUTER_DIR, file)}:${i + 1}`);
        }
      }
    }
    expect(violations, `Routers using ctx.user.tenantId instead of ctx.tenant.tenantId: ${violations.join(', ')}`).toEqual([]);
  });

  it('should have tenantProcedure imported in non-allowlisted routers that use tenant-scoped data', () => {
    const violations: string[] = [];
    for (const file of routerFiles) {
      const basename = path.basename(file);
      if (ALLOWLISTED_ROUTERS.has(basename)) continue;

      const content = fs.readFileSync(file, 'utf-8');
      // If a router uses protectedProcedure but not tenantProcedure, it might be missing tenant middleware
      if (content.includes('protectedProcedure') && !content.includes('tenantProcedure')) {
        violations.push(path.relative(ROUTER_DIR, file));
      }
    }
    expect(violations, `Non-allowlisted routers using protectedProcedure without tenantProcedure: ${violations.join(', ')}`).toEqual([]);
  });
});
