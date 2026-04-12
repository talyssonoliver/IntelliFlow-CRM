import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Domain Layer Dependency Tests
 *
 * IFC-131: Architecture Boundary Enforcement
 *
 * These tests verify that the domain layer remains pure business logic
 * with NO infrastructure dependencies. The domain layer is the innermost
 * circle in hexagonal architecture.
 *
 * Rules:
 * 1. Domain MUST NOT depend on @intelliflow/application
 * 2. Domain MUST NOT depend on @intelliflow/adapters
 * 3. Domain MUST NOT depend on infrastructure (@prisma/client, @intelliflow/db, etc.)
 * 4. Domain MUST NOT depend on framework code (express, next, react, etc.)
 * 5. Domain CAN ONLY depend on standard library and pure utility packages
 */

const projectRoot = path.resolve(__dirname, '../../');
const domainPath = path.join(projectRoot, 'packages/domain/src');

// Forbidden import patterns for domain layer
const FORBIDDEN_DOMAIN_IMPORTS = [
  // Internal packages (outer layers)
  { pattern: /@intelliflow\/application/, name: 'application layer' },
  { pattern: /@intelliflow\/adapters/, name: 'adapters layer' },
  { pattern: /@intelliflow\/db/, name: 'database package' },
  { pattern: /@intelliflow\/api-client/, name: 'API client' },
  { pattern: /@intelliflow\/platform/, name: 'platform package' },

  // Database/ORM
  { pattern: /@prisma\/client/, name: 'Prisma ORM' },
  { pattern: /^prisma$/, name: 'Prisma' },

  // HTTP/Web frameworks
  { pattern: /^express/, name: 'Express' },
  { pattern: /^fastify/, name: 'Fastify' },
  { pattern: /^koa/, name: 'Koa' },
  { pattern: /@trpc\//, name: 'tRPC' },
  { pattern: /^hono/, name: 'Hono' },

  // Frontend frameworks
  { pattern: /^react/, name: 'React' },
  { pattern: /^next/, name: 'Next.js' },
  { pattern: /^vue/, name: 'Vue' },
  { pattern: /^svelte/, name: 'Svelte' },

  // Database drivers
  { pattern: /^pg$/, name: 'PostgreSQL driver' },
  { pattern: /^mysql/, name: 'MySQL driver' },
  { pattern: /^redis/, name: 'Redis' },
  { pattern: /^ioredis/, name: 'ioredis' },
  { pattern: /^mongodb/, name: 'MongoDB' },

  // Message queues
  { pattern: /^amqplib/, name: 'RabbitMQ' },
  { pattern: /^kafka/, name: 'Kafka' },
  { pattern: /^bullmq/, name: 'BullMQ' },

  // Cloud SDKs
  { pattern: /@aws-sdk\//, name: 'AWS SDK' },
  { pattern: /@azure\//, name: 'Azure SDK' },
  { pattern: /@google-cloud\//, name: 'Google Cloud SDK' },

  // File system (should use ports)
  { pattern: /^fs-extra/, name: 'fs-extra' },
];

// Allowed imports for domain layer (pure utilities)
const ALLOWED_DOMAIN_IMPORTS = [
  'uuid',
  'lodash',
  'date-fns',
  'zod', // For validation schemas
  'typescript', // Type utilities
];

/**
 * Recursively get all TypeScript files in a directory
 */
function getTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  function traverse(currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      // Skip directories that shouldn't be checked
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.turbo' ||
        entry.name === 'coverage'
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.d.ts')
      ) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

/**
 * Extract imports from a TypeScript file
 */
function extractImports(filePath: string): Array<{ path: string; line: number }> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const imports: Array<{ path: string; line: number }> = [];

  // Match various import patterns
  const importPatterns = [
    /import\s+.*\s+from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // Dynamic imports
  ];

  lines.forEach((line, index) => {
    for (const pattern of importPatterns) {
      const matches = line.matchAll(pattern);
      for (const match of matches) {
        imports.push({
          path: match[1],
          line: index + 1,
        });
      }
    }
  });

  return imports;
}

/**
 * Check if an import violates domain layer rules
 */
function findViolations(filePath: string): Array<{ import: string; line: number; reason: string }> {
  const imports = extractImports(filePath);
  const violations: Array<{ import: string; line: number; reason: string }> = [];

  for (const imp of imports) {
    // Skip relative imports (internal to domain)
    if (imp.path.startsWith('.') || imp.path.startsWith('@/')) {
      continue;
    }

    // Check against forbidden patterns
    for (const forbidden of FORBIDDEN_DOMAIN_IMPORTS) {
      if (forbidden.pattern.test(imp.path)) {
        violations.push({
          import: imp.path,
          line: imp.line,
          reason: `Domain layer cannot depend on ${forbidden.name}`,
        });
      }
    }
  }

  return violations;
}

describe('Domain Layer Dependencies (IFC-131)', () => {
  const domainFiles = getTypeScriptFiles(domainPath);

  test('domain layer exists and has source files', () => {
    expect(domainFiles.length).toBeGreaterThan(0);
  });

  test('domain MUST NOT import from @intelliflow/application', () => {
    const violations: string[] = [];

    for (const file of domainFiles) {
      const fileViolations = findViolations(file).filter((v) =>
        /@intelliflow\/application/.test(v.import)
      );

      if (fileViolations.length > 0) {
        const relativePath = path.relative(projectRoot, file);
        fileViolations.forEach((v) => {
          violations.push(`${relativePath}:${v.line} - ${v.import}`);
        });
      }
    }

    if (violations.length > 0) {
      console.error('\nDomain layer violations (application imports):');
      violations.forEach((v) => console.error(`  - ${v}`));
    }

    expect(violations).toHaveLength(0);
  });

  test('domain MUST NOT import from @intelliflow/adapters', () => {
    const violations: string[] = [];

    for (const file of domainFiles) {
      const fileViolations = findViolations(file).filter((v) =>
        /@intelliflow\/adapters/.test(v.import)
      );

      if (fileViolations.length > 0) {
        const relativePath = path.relative(projectRoot, file);
        fileViolations.forEach((v) => {
          violations.push(`${relativePath}:${v.line} - ${v.import}`);
        });
      }
    }

    if (violations.length > 0) {
      console.error('\nDomain layer violations (adapter imports):');
      violations.forEach((v) => console.error(`  - ${v}`));
    }

    expect(violations).toHaveLength(0);
  });

  test('domain MUST NOT import from infrastructure packages', () => {
    const violations: string[] = [];

    for (const file of domainFiles) {
      const fileViolations = findViolations(file);

      if (fileViolations.length > 0) {
        const relativePath = path.relative(projectRoot, file);
        fileViolations.forEach((v) => {
          violations.push(`${relativePath}:${v.line} - ${v.import} (${v.reason})`);
        });
      }
    }

    if (violations.length > 0) {
      console.error('\nDomain layer infrastructure violations:');
      violations.forEach((v) => console.error(`  - ${v}`));
    }

    expect(violations).toHaveLength(0);
  });

  test('all domain source files are checked', () => {
    // Verify we're actually checking the expected directory structure
    const hasEntities = domainFiles.some((f) => f.includes(path.join('domain', 'src', 'crm')));
    const hasShared = domainFiles.some((f) => f.includes(path.join('domain', 'src', 'shared')));

    expect(hasEntities).toBe(true);
    expect(hasShared).toBe(true);
  });

  test('domain package.json does not list forbidden dependencies', () => {
    const pkgPath = path.join(projectRoot, 'packages/domain/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };

    const forbiddenDeps = [
      '@intelliflow/application',
      '@intelliflow/adapters',
      '@intelliflow/db',
      '@prisma/client',
      'express',
      'fastify',
      'next',
      'react',
    ];

    const violations = forbiddenDeps.filter((dep) => dep in allDeps);

    if (violations.length > 0) {
      console.error('\nForbidden dependencies in domain package.json:');
      violations.forEach((v) => console.error(`  - ${v}`));
    }

    expect(violations).toHaveLength(0);
  });
});
