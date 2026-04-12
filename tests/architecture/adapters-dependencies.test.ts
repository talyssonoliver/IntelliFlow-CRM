import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Adapters Layer Dependency Tests
 *
 * IFC-131: Architecture Boundary Enforcement
 *
 * These tests verify that the adapters layer correctly implements the ports
 * defined in the application layer. Adapters are the outermost layer and
 * CAN depend on infrastructure, but must implement the contracts from
 * the application layer.
 *
 * Rules:
 * 1. Adapters CAN depend on @intelliflow/domain
 * 2. Adapters CAN depend on @intelliflow/application (to implement ports)
 * 3. Adapters CAN depend on infrastructure packages (Prisma, Redis, etc.)
 * 4. Adapters SHOULD implement port interfaces defined in application
 */

const projectRoot = path.resolve(__dirname, '../../');
const adaptersPath = path.join(projectRoot, 'packages/adapters/src');
const applicationPath = path.join(projectRoot, 'packages/application/src');

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
 * Check if file imports from a specific package
 */
function hasImportFrom(filePath: string, pattern: RegExp): boolean {
  const imports = extractImports(filePath);
  return imports.some((imp) => pattern.test(imp.path));
}

/**
 * Extract interfaces defined in a file
 */
function extractInterfaces(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const interfacePattern = /export\s+interface\s+(\w+)/g;
  const interfaces: string[] = [];

  const matches = content.matchAll(interfacePattern);
  for (const match of matches) {
    interfaces.push(match[1]);
  }

  return interfaces;
}

/**
 * Check if a class implements an interface
 */
function classImplementsInterface(filePath: string, interfaceName: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  const implementsPattern = new RegExp(
    `class\\s+\\w+\\s+implements\\s+[^{]*\\b${interfaceName}\\b`
  );
  return implementsPattern.test(content);
}

describe('Adapters Layer Dependencies (IFC-131)', () => {
  const adaptersFiles = getTypeScriptFiles(adaptersPath);

  test('adapters layer exists and has source files', () => {
    expect(adaptersFiles.length).toBeGreaterThan(0);
  });

  test('adapters CAN depend on @intelliflow/domain (positive test)', () => {
    // At least one adapter file should import from domain
    const filesWithDomainImports = adaptersFiles.filter((file) =>
      hasImportFrom(file, /@intelliflow\/domain/)
    );

    expect(filesWithDomainImports.length).toBeGreaterThan(0);
  });

  test('adapters CAN depend on @intelliflow/application (positive test)', () => {
    // Repository adapters should import ports from application
    const repositoryFiles = adaptersFiles.filter((f) => f.includes('repositories'));
    const nonIndexFiles = repositoryFiles.filter((f) => !f.endsWith('index.ts'));

    if (nonIndexFiles.length > 0) {
      const filesWithApplicationImports = nonIndexFiles.filter((file) =>
        hasImportFrom(file, /@intelliflow\/application/)
      );

      // At least some repository files should import from application (to implement ports)
      expect(filesWithApplicationImports.length).toBeGreaterThan(0);
    }
  });

  test('adapters has repositories directory', () => {
    const repositoriesDir = path.join(adaptersPath, 'repositories');
    expect(fs.existsSync(repositoriesDir)).toBe(true);

    const repoFiles = getTypeScriptFiles(repositoriesDir);
    expect(repoFiles.length).toBeGreaterThan(0);
  });

  test('adapters has external services directory', () => {
    const externalDir = path.join(adaptersPath, 'external');
    expect(fs.existsSync(externalDir)).toBe(true);

    const externalFiles = getTypeScriptFiles(externalDir);
    expect(externalFiles.length).toBeGreaterThan(0);
  });

  test('adapters package.json has correct dependencies', () => {
    const pkgPath = path.join(projectRoot, 'packages/adapters/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    const allDeps = {
      ...(pkg.dependencies || {}),
    };

    // Should depend on domain and application
    expect('@intelliflow/domain' in allDeps).toBe(true);
    expect('@intelliflow/application' in allDeps).toBe(true);
  });

  test('Prisma repository adapters implement repository ports', () => {
    // Get repository port interfaces from application layer
    const portsDir = path.join(applicationPath, 'ports/repositories');
    if (!fs.existsSync(portsDir)) {
      // Skip if ports directory doesn't exist yet
      return;
    }

    const portFiles = getTypeScriptFiles(portsDir);
    const portInterfaces: string[] = [];

    portFiles.forEach((file) => {
      const interfaces = extractInterfaces(file);
      portInterfaces.push(...interfaces);
    });

    // Get Prisma repository adapters
    const repositoriesDir = path.join(adaptersPath, 'repositories');
    const adapterFiles = getTypeScriptFiles(repositoriesDir).filter(
      (f) => f.includes('Prisma') && !f.endsWith('index.ts')
    );

    // Check that Prisma adapters implement the port interfaces
    if (adapterFiles.length > 0 && portInterfaces.length > 0) {
      let hasImplementations = false;

      for (const adapterFile of adapterFiles) {
        for (const portInterface of portInterfaces) {
          if (classImplementsInterface(adapterFile, portInterface)) {
            hasImplementations = true;
            break;
          }
        }
        if (hasImplementations) break;
      }

      // At least one adapter should implement a port
      expect(hasImplementations).toBe(true);
    }
  });

  test('InMemory adapters exist for testing', () => {
    const repositoriesDir = path.join(adaptersPath, 'repositories');
    const inMemoryFiles = getTypeScriptFiles(repositoriesDir).filter(
      (f) => f.includes('InMemory') && !f.endsWith('index.ts')
    );

    // Should have at least one in-memory implementation for testing
    expect(inMemoryFiles.length).toBeGreaterThan(0);
  });
});
