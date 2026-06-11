import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Architecture Boundary Tests
 * Enforces hexagonal architecture rules:
 * 1. Domain MUST NOT depend on application or adapters
 * 2. Application CAN depend on domain only
 * 3. Adapters CAN depend on domain and application
 */

const projectRoot = path.join(__dirname, '../../');

// Helper to recursively get all .ts files in a directory
function getTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];

  function traverse(currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      // Skip node_modules, dist, and test directories
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.turbo' ||
        entry.name.startsWith('__tests__')
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

// Helper to check if file contains imports from forbidden packages
function hasImportsFrom(filePath: string, forbiddenPatterns: RegExp[]): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Match import statements
  const importRegex = /import\s[^'"]*\bfrom\s+['"]([^'"]+)['"]/g;
  const matches = content.matchAll(importRegex);

  for (const match of matches) {
    const importPath = match[1];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(importPath)) {
        return true;
      }
    }
  }

  return false;
}

describe('Architecture Boundary Tests', () => {
  describe('Domain Layer', () => {
    test('domain MUST NOT depend on application layer', () => {
      const domainPath = path.join(projectRoot, 'packages/domain/src');
      const domainFiles = getTypeScriptFiles(domainPath);

      const violations: string[] = [];
      const forbiddenPatterns = [/@intelliflow\/application/];

      for (const file of domainFiles) {
        if (hasImportsFrom(file, forbiddenPatterns)) {
          const relativePath = path.relative(projectRoot, file);
          violations.push(relativePath);
        }
      }

      expect(violations).toHaveLength(0);

      if (violations.length > 0) {
        console.error('Domain layer violations:');
        violations.forEach((v) => console.error(`  - ${v}`));
      }
    });

    test('domain MUST NOT depend on adapters layer', () => {
      const domainPath = path.join(projectRoot, 'packages/domain/src');
      const domainFiles = getTypeScriptFiles(domainPath);

      const violations: string[] = [];
      const forbiddenPatterns = [/@intelliflow\/adapters/];

      for (const file of domainFiles) {
        if (hasImportsFrom(file, forbiddenPatterns)) {
          const relativePath = path.relative(projectRoot, file);
          violations.push(relativePath);
        }
      }

      expect(violations).toHaveLength(0);

      if (violations.length > 0) {
        console.error('Domain layer violations:');
        violations.forEach((v) => console.error(`  - ${v}`));
      }
    });

    test('domain MUST NOT depend on infrastructure (Prisma, etc.)', () => {
      const domainPath = path.join(projectRoot, 'packages/domain/src');
      const domainFiles = getTypeScriptFiles(domainPath);

      const violations: string[] = [];
      const forbiddenPatterns = [
        /@prisma\/client/,
        /@intelliflow\/db/,
        /^prisma$/,
        /^redis$/,
        /^ioredis$/,
        /^pg$/,
        /^mysql/,
      ];

      for (const file of domainFiles) {
        if (hasImportsFrom(file, forbiddenPatterns)) {
          const relativePath = path.relative(projectRoot, file);
          violations.push(relativePath);
        }
      }

      expect(violations).toHaveLength(0);

      if (violations.length > 0) {
        console.error('Domain layer infrastructure violations:');
        violations.forEach((v) => console.error(`  - ${v}`));
      }
    });
  });

  describe('Application Layer', () => {
    test('application MUST NOT depend on adapters layer', () => {
      const applicationPath = path.join(projectRoot, 'packages/application/src');
      const applicationFiles = getTypeScriptFiles(applicationPath);

      const violations: string[] = [];
      const forbiddenPatterns = [/@intelliflow\/adapters/];

      for (const file of applicationFiles) {
        if (hasImportsFrom(file, forbiddenPatterns)) {
          const relativePath = path.relative(projectRoot, file);
          violations.push(relativePath);
        }
      }

      expect(violations).toHaveLength(0);

      if (violations.length > 0) {
        console.error('Application layer violations:');
        violations.forEach((v) => console.error(`  - ${v}`));
      }
    });

    test('application MUST NOT depend on infrastructure (Prisma, etc.)', () => {
      const applicationPath = path.join(projectRoot, 'packages/application/src');
      const applicationFiles = getTypeScriptFiles(applicationPath);

      const violations: string[] = [];
      const forbiddenPatterns = [
        /@prisma\/client/,
        /@intelliflow\/db/,
        /^prisma$/,
        /^redis$/,
        /^ioredis$/,
        /^pg$/,
        /^mysql/,
      ];

      for (const file of applicationFiles) {
        if (hasImportsFrom(file, forbiddenPatterns)) {
          const relativePath = path.relative(projectRoot, file);
          violations.push(relativePath);
        }
      }

      expect(violations).toHaveLength(0);

      if (violations.length > 0) {
        console.error('Application layer infrastructure violations:');
        violations.forEach((v) => console.error(`  - ${v}`));
      }
    });

    test('application CAN depend on domain (positive test)', () => {
      const applicationPath = path.join(projectRoot, 'packages/application/src');
      const applicationFiles = getTypeScriptFiles(applicationPath);

      // At least one file should import from domain
      const hasDomainImports = applicationFiles.some((file) => {
        const content = fs.readFileSync(file, 'utf-8');
        return content.includes('@intelliflow/domain');
      });

      expect(hasDomainImports).toBe(true);
    });
  });

  describe('Adapters Layer', () => {
    test('adapters CAN depend on domain (positive test)', () => {
      const adaptersPath = path.join(projectRoot, 'packages/adapters/src');
      const adaptersFiles = getTypeScriptFiles(adaptersPath);

      // At least one file should import from domain
      const hasDomainImports = adaptersFiles.some((file) => {
        const content = fs.readFileSync(file, 'utf-8');
        return content.includes('@intelliflow/domain');
      });

      expect(hasDomainImports).toBe(true);
    });

    test('adapters CAN depend on application (positive test)', () => {
      const adaptersPath = path.join(projectRoot, 'packages/adapters/src');
      const adaptersFiles = getTypeScriptFiles(adaptersPath);

      // At least one file should import from application
      const hasApplicationImports = adaptersFiles.some((file) => {
        const content = fs.readFileSync(file, 'utf-8');
        return content.includes('@intelliflow/application');
      });

      expect(hasApplicationImports).toBe(true);
    });
  });

  describe('Web Tier Boundary (worker-only services)', () => {
    /**
     * Enforce that apps/web source files never directly import worker-only
     * modules (BullMQ queues, AI provider services requiring REDIS_HOST /
     * OLLAMA_BASE_URL / LITELLM_BASE_URL).
     *
     * Root cause of the Vercel 500-on-every-route incident:
     *   apps/web/api/trpc/[trpc]/route.ts
     *     → @intelliflow/api/context
     *     → apps/api/src/container.ts (module-level singleton createServices())
     *     → new QueueAIService({ eagerInit: true })
     *     → getBullMQConnectionOptions() [EAGER, at construction time]
     *     → requiredProdEnv('REDIS_HOST', undefined, 'localhost') [THROWS in prod]
     *
     * The fix (lazy connection factory in QueueAIService) prevents the throw,
     * but this test ensures the web tier never DIRECTLY imports the worker
     * modules — providing a second layer of defence and documenting intent.
     *
     * Note: the web's /api/trpc route.ts MUST import @intelliflow/api/context
     * and @intelliflow/api/router to serve its tRPC procedures — those imports
     * are intentional and are NOT forbidden here.  What IS forbidden is any
     * direct import of the queue service module, the queue connection helper,
     * or the AI provider service modules from the web package's own source.
     */
    test('web MUST NOT directly import the QueueAIService module', () => {
      const webSrcPath = path.join(projectRoot, 'apps/web/src');
      const webFiles = getTypeScriptFiles(webSrcPath);

      const violations: string[] = [];
      // Match direct imports of the queue service module — these should never
      // appear in web source files (the api container wires them internally).
      const forbiddenPatterns = [
        /apps\/api\/src\/services\/queue/,
        /@intelliflow\/platform\/queues\/connection/,
      ];

      for (const file of webFiles) {
        // Skip test files (they mock everything anyway)
        if (file.includes('__tests__') || file.includes('.test.') || file.includes('.spec.')) {
          continue;
        }
        if (hasImportsFrom(file, forbiddenPatterns)) {
          const relativePath = path.relative(projectRoot, file);
          violations.push(relativePath);
        }
      }

      if (violations.length > 0) {
        console.error(
          'Web tier direct imports of worker-only queue modules (FORBIDDEN — causes Vercel 500s):'
        );
        violations.forEach((v) => console.error(`  - ${v}`));
      }

      expect(violations).toHaveLength(0);
    });

    test('web MUST NOT directly import bullmq', () => {
      const webSrcPath = path.join(projectRoot, 'apps/web/src');
      const webFiles = getTypeScriptFiles(webSrcPath);

      const violations: string[] = [];
      const forbiddenPatterns = [/^bullmq$/];

      for (const file of webFiles) {
        if (file.includes('__tests__') || file.includes('.test.') || file.includes('.spec.')) {
          continue;
        }
        if (hasImportsFrom(file, forbiddenPatterns)) {
          const relativePath = path.relative(projectRoot, file);
          violations.push(relativePath);
        }
      }

      if (violations.length > 0) {
        console.error(
          'Web tier direct bullmq imports (FORBIDDEN — Redis not available on Vercel web tier):'
        );
        violations.forEach((v) => console.error(`  - ${v}`));
      }

      expect(violations).toHaveLength(0);
    });
  });
});
