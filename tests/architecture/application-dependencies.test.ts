import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Application Layer Dependency Tests
 *
 * IFC-131: Architecture Boundary Enforcement
 *
 * These tests verify that the application layer only depends on the domain layer.
 * The application layer contains use cases and ports (interfaces) that define
 * how the outside world interacts with the domain.
 *
 * Rules:
 * 1. Application CAN depend on @intelliflow/domain
 * 2. Application MUST NOT depend on @intelliflow/adapters
 * 3. Application MUST NOT depend on infrastructure (@prisma/client, etc.)
 * 4. Application defines PORTS (interfaces) that adapters implement
 */

const projectRoot = path.resolve(__dirname, '../../');
const applicationPath = path.join(projectRoot, 'packages/application/src');

// Forbidden import patterns for application layer
const FORBIDDEN_APPLICATION_IMPORTS = [
  // Outer layers (adapters is forbidden)
  { pattern: /@intelliflow\/adapters/, name: 'adapters layer' },
  { pattern: /@intelliflow\/db/, name: 'database package' },
  { pattern: /@intelliflow\/api-client/, name: 'API client' },

  // Database/ORM (should use repository ports)
  { pattern: /@prisma\/client/, name: 'Prisma ORM' },
  { pattern: /^prisma$/, name: 'Prisma' },

  // HTTP/Web frameworks (should be in adapters)
  { pattern: /^express/, name: 'Express' },
  { pattern: /^fastify/, name: 'Fastify' },
  { pattern: /^koa/, name: 'Koa' },
  { pattern: /@trpc\/server/, name: 'tRPC server' },
  { pattern: /^hono/, name: 'Hono' },

  // Frontend frameworks (shouldn't be in application layer)
  { pattern: /^react/, name: 'React' },
  { pattern: /^next/, name: 'Next.js' },

  // Database drivers
  { pattern: /^pg$/, name: 'PostgreSQL driver' },
  { pattern: /^mysql/, name: 'MySQL driver' },
  { pattern: /^redis/, name: 'Redis' },
  { pattern: /^ioredis/, name: 'ioredis' },
  { pattern: /^mongodb/, name: 'MongoDB' },

  // Cloud SDKs (should be wrapped in adapters)
  { pattern: /@aws-sdk\//, name: 'AWS SDK' },
  { pattern: /@azure\//, name: 'Azure SDK' },
  { pattern: /@google-cloud\//, name: 'Google Cloud SDK' },
];

// Required imports - application SHOULD depend on domain
const REQUIRED_DOMAIN_DEPENDENCY = /@intelliflow\/domain/;

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

  const importPatterns = [
    /import\s+.*\s+from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
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
 * Check if an import violates application layer rules
 */
function findViolations(filePath: string): Array<{ import: string; line: number; reason: string }> {
  const imports = extractImports(filePath);
  const violations: Array<{ import: string; line: number; reason: string }> = [];

  for (const imp of imports) {
    // Skip relative imports
    if (imp.path.startsWith('.') || imp.path.startsWith('@/')) {
      continue;
    }

    for (const forbidden of FORBIDDEN_APPLICATION_IMPORTS) {
      if (forbidden.pattern.test(imp.path)) {
        violations.push({
          import: imp.path,
          line: imp.line,
          reason: `Application layer cannot depend on ${forbidden.name}`,
        });
      }
    }
  }

  return violations;
}

/**
 * Check if file has domain imports (positive test)
 */
function hasDomainImports(filePath: string): boolean {
  const imports = extractImports(filePath);
  return imports.some((imp) => REQUIRED_DOMAIN_DEPENDENCY.test(imp.path));
}

describe('Application Layer Dependencies (IFC-131)', () => {
  const applicationFiles = getTypeScriptFiles(applicationPath);

  test('application layer exists and has source files', () => {
    expect(applicationFiles.length).toBeGreaterThan(0);
  });

  test('application MUST NOT import from @intelliflow/adapters', () => {
    const violations: string[] = [];

    for (const file of applicationFiles) {
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
      console.error('\nApplication layer violations (adapter imports):');
      violations.forEach((v) => console.error(`  - ${v}`));
    }

    expect(violations).toHaveLength(0);
  });

  test('application MUST NOT import from infrastructure packages', () => {
    const violations: string[] = [];

    for (const file of applicationFiles) {
      const fileViolations = findViolations(file);

      if (fileViolations.length > 0) {
        const relativePath = path.relative(projectRoot, file);
        fileViolations.forEach((v) => {
          violations.push(`${relativePath}:${v.line} - ${v.import} (${v.reason})`);
        });
      }
    }

    if (violations.length > 0) {
      console.error('\nApplication layer infrastructure violations:');
      violations.forEach((v) => console.error(`  - ${v}`));
    }

    expect(violations).toHaveLength(0);
  });

  test('application CAN depend on @intelliflow/domain (positive test)', () => {
    // Filter out index files which may not have direct domain imports
    const nonIndexFiles = applicationFiles.filter(
      (f) => !f.endsWith('index.ts') && !f.includes('__tests__')
    );

    const filesWithDomainImports = nonIndexFiles.filter((file) => hasDomainImports(file));

    // At least some use case files should import from domain
    const useCaseFiles = nonIndexFiles.filter((f) => f.includes('usecases'));
    const useCasesWithDomainImports = useCaseFiles.filter((file) => hasDomainImports(file));

    if (useCaseFiles.length > 0) {
      expect(useCasesWithDomainImports.length).toBeGreaterThan(0);
    }
  });

  test('application has ports directory defining interfaces', () => {
    const portsDir = path.join(applicationPath, 'ports');
    expect(fs.existsSync(portsDir)).toBe(true);

    const portFiles = getTypeScriptFiles(portsDir);
    expect(portFiles.length).toBeGreaterThan(0);
  });

  test('application has usecases directory', () => {
    const usecasesDir = path.join(applicationPath, 'usecases');
    expect(fs.existsSync(usecasesDir)).toBe(true);

    const usecaseFiles = getTypeScriptFiles(usecasesDir);
    expect(usecaseFiles.length).toBeGreaterThan(0);
  });

  test('application package.json does not list forbidden dependencies', () => {
    const pkgPath = path.join(projectRoot, 'packages/application/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };

    const forbiddenDeps = [
      '@intelliflow/adapters',
      '@intelliflow/db',
      '@prisma/client',
      'express',
      'fastify',
    ];

    const violations = forbiddenDeps.filter((dep) => dep in allDeps);

    if (violations.length > 0) {
      console.error('\nForbidden dependencies in application package.json:');
      violations.forEach((v) => console.error(`  - ${v}`));
    }

    expect(violations).toHaveLength(0);
  });

  test('application package.json has @intelliflow/domain as dependency', () => {
    const pkgPath = path.join(projectRoot, 'packages/application/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    const allDeps = {
      ...(pkg.dependencies || {}),
    };

    expect('@intelliflow/domain' in allDeps).toBe(true);
  });
});
