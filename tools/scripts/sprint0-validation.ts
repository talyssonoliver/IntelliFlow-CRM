#!/usr/bin/env tsx

/**
 * Sprint 0 Validation Script for IntelliFlow CRM
 *
 * This script validates that all Sprint 0 tasks are complete and the
 * development environment is properly configured.
 *
 * Validation Categories:
 * - Environment setup (monorepo, packages, dependencies)
 * - Configuration files (TypeScript, ESLint, Prettier, etc.)
 * - Testing infrastructure (Vitest, Playwright)
 * - Build system (Turbo, tsconfig references)
 * - Development tools (Git hooks, scripts)
 * - Documentation structure
 * - Artifact directories
 *
 * Exit Codes:
 * - 0: All validations passed
 * - 1: One or more validations failed
 *
 * @module tools/scripts/sprint0-validation
 */

import fs from 'node:fs';
import path from 'node:path';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
  category: string;
}

const results: ValidationResult[] = [];

/**
 * Log validation result
 */
function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Check if file exists
 */
function fileExists(filePath: string): boolean {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

/**
 * Check if directory exists
 */
function dirExists(dirPath: string): boolean {
  const fullPath = path.join(process.cwd(), dirPath);
  return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
}

/**
 * Check if package.json has a specific dependency
 */
function hasDependency(packagePath: string, depName: string): boolean {
  const pkgPath = path.join(process.cwd(), packagePath);
  if (!fs.existsSync(pkgPath)) return false;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  return !!(
    pkg.dependencies?.[depName] ||
    pkg.devDependencies?.[depName] ||
    pkg.peerDependencies?.[depName]
  );
}

/**
 * Run a validation check
 */
function validate(
  name: string,
  category: string,
  checkFn: () => boolean,
  successMsg: string,
  failMsg: string
): void {
  try {
    const passed = checkFn();
    results.push({ name, category, passed, message: passed ? successMsg : failMsg });
    log(
      `${passed ? '✅' : '❌'} ${name}: ${passed ? successMsg : failMsg}`,
      passed ? 'green' : 'red'
    );
  } catch (error) {
    results.push({
      name,
      category,
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    log(`❌ ${name}: Error - ${error instanceof Error ? error.message : String(error)}`, 'red');
  }
}

/**
 * Validate monorepo structure
 */
function validateMonorepoStructure() {
  log('\n📦 Validating Monorepo Structure...', 'cyan');

  validate(
    'Root package.json',
    'monorepo',
    () => fileExists('package.json'),
    'Root package.json exists',
    'Root package.json missing'
  );

  validate(
    'pnpm-workspace.yaml',
    'monorepo',
    () => fileExists('pnpm-workspace.yaml'),
    'pnpm workspace configuration exists',
    'pnpm-workspace.yaml missing'
  );

  validate(
    'turbo.json',
    'monorepo',
    () => fileExists('turbo.json'),
    'Turbo configuration exists',
    'turbo.json missing'
  );

  validate(
    'Apps directory',
    'monorepo',
    () => dirExists('apps'),
    'Apps directory exists',
    'Apps directory missing'
  );

  validate(
    'Packages directory',
    'monorepo',
    () => dirExists('packages'),
    'Packages directory exists',
    'Packages directory missing'
  );

  validate(
    'Tests directory',
    'monorepo',
    () => dirExists('tests'),
    'Tests directory exists',
    'Tests directory missing'
  );
}

/**
 * Validate configuration files
 */
function validateConfigFiles() {
  log('\n⚙️  Validating Configuration Files...', 'cyan');

  const configFiles = [
    'tsconfig.json',
    'vitest.config.ts',
    'playwright.config.ts',
    '.eslintrc.js',
    '.prettierrc',
    '.gitignore',
    '.env.example',
  ];

  for (const file of configFiles) {
    validate(file, 'config', () => fileExists(file), `${file} exists`, `${file} missing`);
  }
}

/**
 * Validate test infrastructure
 */
function validateTestInfrastructure() {
  log('\n🧪 Validating Test Infrastructure...', 'cyan');

  validate(
    'Unit test setup',
    'testing',
    () => fileExists('tests/setup.ts'),
    'Unit test setup file exists',
    'tests/setup.ts missing'
  );

  validate(
    'Integration test setup',
    'testing',
    () => fileExists('tests/integration/setup.ts'),
    'Integration test setup file exists',
    'tests/integration/setup.ts missing'
  );

  validate(
    'Integration API tests',
    'testing',
    () => fileExists('tests/integration/api.test.ts'),
    'API integration tests exist',
    'tests/integration/api.test.ts missing'
  );

  validate(
    'Integration DB tests',
    'testing',
    () => fileExists('tests/integration/db.test.ts'),
    'Database integration tests exist',
    'tests/integration/db.test.ts missing'
  );

  validate(
    'E2E smoke tests',
    'testing',
    () => fileExists('tests/e2e/smoke.spec.ts'),
    'E2E smoke tests exist',
    'tests/e2e/smoke.spec.ts missing'
  );

  validate(
    'E2E global setup',
    'testing',
    () => fileExists('tests/e2e/global-setup.ts'),
    'E2E global setup exists',
    'tests/e2e/global-setup.ts missing'
  );

  validate(
    'Vitest dependency',
    'testing',
    () => hasDependency('package.json', 'vitest'),
    'Vitest is installed',
    'Vitest dependency missing'
  );

  validate(
    'Playwright dependency',
    'testing',
    () => hasDependency('package.json', '@playwright/test'),
    'Playwright is installed',
    'Playwright dependency missing'
  );
}

/**
 * Validate artifact directories
 */
function validateArtifactDirectories() {
  log('\n📁 Validating Artifact Directories...', 'cyan');

  const artifactDirs = [
    'artifacts',
    'artifacts/benchmarks',
    'artifacts/coverage',
    'artifacts/lighthouse',
    'artifacts/logs',
    'artifacts/metrics',
    'artifacts/misc',
    'artifacts/reports',
    'artifacts/test-results',
  ];

  for (const dir of artifactDirs) {
    validate(
      dir,
      'artifacts',
      () => dirExists(dir),
      `${dir} directory exists`,
      `${dir} directory missing`
    );
  }
}

/**
 * Validate package structure
 */
function validatePackages() {
  log('\n📚 Validating Package Structure...', 'cyan');

  const requiredPackages = [
    'packages/domain',
    'packages/validators',
    'packages/db',
    'packages/observability',
  ];

  for (const pkg of requiredPackages) {
    validate(pkg, 'packages', () => dirExists(pkg), `${pkg} exists`, `${pkg} missing`);

    const packageJsonPath = `${pkg}/package.json`;
    validate(
      `${pkg}/package.json`,
      'packages',
      () => fileExists(packageJsonPath),
      `${packageJsonPath} exists`,
      `${packageJsonPath} missing`
    );
  }
}

/**
 * Validate documentation structure
 */
function validateDocumentation() {
  log('\n📖 Validating Documentation...', 'cyan');

  validate(
    'README.md',
    'docs',
    () => fileExists('README.md'),
    'README.md exists',
    'README.md missing'
  );

  validate(
    'CLAUDE.md',
    'docs',
    () => fileExists('CLAUDE.md'),
    'CLAUDE.md exists',
    'CLAUDE.md missing'
  );

  validate(
    'Sprint_plan.csv',
    'docs',
    () => fileExists('apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'),
    'Sprint_plan.csv exists in correct location',
    'Sprint_plan.csv missing from apps/project-tracker/docs/metrics/_global/'
  );

  validate(
    'Docs directory',
    'docs',
    () => dirExists('docs'),
    'docs/ directory exists',
    'docs/ directory missing'
  );
}

/**
 * Validate scripts
 */
function validateScripts() {
  log('\n🔧 Validating Scripts...', 'cyan');

  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  const requiredScripts = [
    'dev',
    'build',
    'test',
    'test:unit',
    'test:integration',
    'test:e2e',
    'lint',
    'typecheck',
  ];

  for (const script of requiredScripts) {
    validate(
      `Script: ${script}`,
      'scripts',
      () => !!pkg.scripts?.[script],
      `${script} script defined`,
      `${script} script missing`
    );
  }
}

/**
 * Validate Git setup
 */
function validateGitSetup() {
  log('\n🌳 Validating Git Setup...', 'cyan');

  validate(
    '.git directory',
    'git',
    () => dirExists('.git'),
    'Git repository initialized',
    'Git repository not initialized'
  );

  validate(
    '.gitignore',
    'git',
    () => fileExists('.gitignore'),
    '.gitignore exists',
    '.gitignore missing'
  );
}

/**
 * Validate TypeScript configuration
 */
function validateTypeScriptConfig() {
  log('\n🔷 Validating TypeScript Configuration...', 'cyan');

  validate(
    'Root tsconfig.json',
    'typescript',
    () => fileExists('tsconfig.json'),
    'Root tsconfig.json exists',
    'Root tsconfig.json missing (package-level configs available)'
  );

  validate(
    'TypeScript dependency',
    'typescript',
    () => hasDependency('package.json', 'typescript'),
    'TypeScript is installed',
    'TypeScript dependency missing'
  );
}

/**
 * Validate task metrics
 */
function validateTaskMetrics() {
  log('\n📊 Validating Task Metrics...', 'cyan');

  validate(
    'Project tracker app',
    'metrics',
    () => dirExists('apps/project-tracker'),
    'Project tracker app exists',
    'Project tracker app missing'
  );

  validate(
    'Sprint 0 metrics directory',
    'metrics',
    () => dirExists('apps/project-tracker/docs/metrics/sprint-0'),
    'Sprint 0 metrics directory exists',
    'Sprint 0 metrics directory missing'
  );

  validate(
    'ENV-017-AI metrics',
    'metrics',
    () =>
      fileExists('apps/project-tracker/docs/metrics/sprint-0/phase-4-final-setup/ENV-017-AI.json'),
    'ENV-017-AI metrics file exists',
    'ENV-017-AI metrics file missing'
  );

  validate(
    'ENV-018-AI metrics',
    'metrics',
    () =>
      fileExists('apps/project-tracker/docs/metrics/sprint-0/phase-5-completion/ENV-018-AI.json'),
    'ENV-018-AI metrics file exists',
    'ENV-018-AI metrics file missing'
  );
}

/**
 * Print summary
 */
function printSummary() {
  log('\n' + '='.repeat(70), 'bold');
  log('Sprint 0 Validation Summary', 'bold');
  log('='.repeat(70) + '\n', 'bold');

  const categories = Array.from(new Set(results.map((r) => r.category)));

  for (const category of categories) {
    const categoryResults = results.filter((r) => r.category === category);
    const passed = categoryResults.filter((r) => r.passed).length;
    const total = categoryResults.length;
    const status = passed === total ? '✅' : '❌';

    log(
      `${status} ${category.toUpperCase()}: ${passed}/${total} passed`,
      passed === total ? 'green' : 'red'
    );
  }

  const totalPassed = results.filter((r) => r.passed).length;
  const totalTests = results.length;
  const passRate = ((totalPassed / totalTests) * 100).toFixed(1);

  log('\n' + '-'.repeat(70), 'bold');
  log(
    `Total: ${totalPassed}/${totalTests} validations passed (${passRate}%)`,
    totalPassed === totalTests ? 'green' : 'yellow'
  );
  log('-'.repeat(70) + '\n', 'bold');

  if (totalPassed === totalTests) {
    log('🎉 Sprint 0 is complete! All validations passed.', 'green');
  } else {
    log('⚠️  Sprint 0 has incomplete items. See failures above.', 'yellow');
  }
}

/**
 * Main execution
 */
function main() {
  log('='.repeat(70), 'bold');
  log('IntelliFlow CRM - Sprint 0 Validation', 'bold');
  log('='.repeat(70), 'bold');

  validateMonorepoStructure();
  validateConfigFiles();
  validateTestInfrastructure();
  validateArtifactDirectories();
  validatePackages();
  validateDocumentation();
  validateScripts();
  validateGitSetup();
  validateTypeScriptConfig();
  validateTaskMetrics();

  printSummary();

  // Exit with error if any validations failed
  const allPassed = results.every((r) => r.passed);
  process.exit(allPassed ? 0 : 1);
}

// Run validation
main();
