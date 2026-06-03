import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Web Tier — Worker-Only Service Boundary Enforcement
 *
 * Root cause of the Vercel 500-on-every-route production incident:
 *
 *   apps/web/api/trpc/[trpc]/route.ts
 *     → @intelliflow/api/context  (intentional — serves tRPC procedures)
 *     → apps/api/src/container.ts (module-level createServices() at import time)
 *     → new QueueAIService({ eagerInit: true })
 *     → getBullMQConnectionOptions() [EAGER, at construction time]
 *     → requiredProdEnv('REDIS_HOST', undefined, 'localhost') [THROWS in prod]
 *     → 500 on EVERY route
 *
 * The fix (lazy connection factory in QueueAIService) prevents the throw, but
 * these tests enforce the architectural intent: apps/web source files must
 * never DIRECTLY import the worker-only modules.  If the pattern returns, the
 * import will be caught here and fail CI before it reaches Vercel.
 *
 * What is allowed:
 *   - apps/web importing @intelliflow/api/context and @intelliflow/api/router
 *     (intentional, the web tRPC route uses these)
 *
 * What is FORBIDDEN (these tests catch violations):
 *   - Direct imports of the queue service module
 *   - Direct imports of the queue connection helper (requiredProdEnv REDIS_HOST)
 *   - Direct imports of bullmq
 */

const projectRoot = path.join(__dirname, '../../');

function getTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];

  function traverse(currentPath: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return; // dir may not exist in some checkout configs
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.next' ||
        entry.name === '.turbo' ||
        entry.name.startsWith('__tests__')
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

function getDirectImports(filePath: string): string[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const imports: string[] = [];
  const importRegex = /import\s+(?:.*\s+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function isTestFile(filePath: string): boolean {
  return (
    filePath.includes('__tests__') ||
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('__mocks__')
  );
}

describe('Web Tier Boundary — no direct worker-only module imports', () => {
  const webSrcPath = path.join(projectRoot, 'apps/web/src');

  test('web/src exists and has source files', () => {
    expect(fs.existsSync(webSrcPath)).toBe(true);
    const files = getTypeScriptFiles(webSrcPath);
    expect(files.length).toBeGreaterThan(0);
  });

  test('web MUST NOT directly import the QueueAIService module', () => {
    // Pattern: apps/api/src/services/queue
    // Rationale: QueueAIService's constructor calls getBullMQConnectionOptions()
    // which calls requiredProdEnv('REDIS_HOST') — throws in prod if REDIS_HOST
    // is not set, causing a 500 on every Vercel route.
    const webFiles = getTypeScriptFiles(webSrcPath).filter((f) => !isTestFile(f));

    const violations: { file: string; imports: string[] }[] = [];
    const forbidden = [/apps\/api\/src\/services\/queue/, /services\/queue\/QueueAIService/];

    for (const file of webFiles) {
      const imports = getDirectImports(file);
      const bad = imports.filter((imp) => forbidden.some((re) => re.test(imp)));
      if (bad.length > 0) {
        violations.push({ file: path.relative(projectRoot, file), imports: bad });
      }
    }

    if (violations.length > 0) {
      console.error('Web tier direct imports of worker-only queue modules (FORBIDDEN):');
      for (const v of violations) {
        console.error(`  ${v.file}:`);
        for (const imp of v.imports) console.error(`    import '${imp}'`);
      }
    }

    expect(violations).toHaveLength(0);
  });

  test('web MUST NOT directly import the BullMQ queue connection helper', () => {
    // Pattern: @intelliflow/platform/queues/connection
    // Rationale: getDefaultConnectionConfig() calls requiredProdEnv('REDIS_HOST')
    // at call time. The web tier has no Redis.
    const webFiles = getTypeScriptFiles(webSrcPath).filter((f) => !isTestFile(f));

    const violations: { file: string; imports: string[] }[] = [];
    const forbidden = [/@intelliflow\/platform\/queues\/connection/];

    for (const file of webFiles) {
      const imports = getDirectImports(file);
      const bad = imports.filter((imp) => forbidden.some((re) => re.test(imp)));
      if (bad.length > 0) {
        violations.push({ file: path.relative(projectRoot, file), imports: bad });
      }
    }

    if (violations.length > 0) {
      console.error('Web tier direct imports of queue connection helper (FORBIDDEN):');
      for (const v of violations) {
        console.error(`  ${v.file}:`);
        for (const imp of v.imports) console.error(`    import '${imp}'`);
      }
    }

    expect(violations).toHaveLength(0);
  });

  test('web MUST NOT directly import bullmq', () => {
    // Rationale: bullmq itself is only safe to run in the api/worker processes
    // which have Redis available. Importing it in the web tier risks indirect
    // Redis connection attempts that crash the Vercel serverless runtime.
    const webFiles = getTypeScriptFiles(webSrcPath).filter((f) => !isTestFile(f));

    const violations: { file: string; imports: string[] }[] = [];
    const forbidden = [/^bullmq$/, /^bullmq\//];

    for (const file of webFiles) {
      const imports = getDirectImports(file);
      const bad = imports.filter((imp) => forbidden.some((re) => re.test(imp)));
      if (bad.length > 0) {
        violations.push({ file: path.relative(projectRoot, file), imports: bad });
      }
    }

    if (violations.length > 0) {
      console.error(
        'Web tier direct bullmq imports (FORBIDDEN — Redis not available on Vercel web tier):'
      );
      for (const v of violations) {
        console.error(`  ${v.file}:`);
        for (const imp of v.imports) console.error(`    import '${imp}'`);
      }
    }

    expect(violations).toHaveLength(0);
  });
});
