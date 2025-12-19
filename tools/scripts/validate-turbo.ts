#!/usr/bin/env node

/**
 * Turborepo Cache Validation Script
 *
 * Validates Turborepo configuration and cache behavior to ensure:
 * - Pipeline definitions are correct
 * - Cache is working properly
 * - Remote caching is configured
 * - Input/output definitions are accurate
 * - Dependencies are properly configured
 *
 * Usage:
 *   tsx tools/scripts/validate-turbo.ts
 *   tsx tools/scripts/validate-turbo.ts --verbose
 *   tsx tools/scripts/validate-turbo.ts --check-cache
 *   tsx tools/scripts/validate-turbo.ts --report
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { glob } from 'glob';

// Configuration
const CONFIG = {
  rootDir: process.cwd(),
  turboJsonPath: 'turbo.json',
  reportPath: 'artifacts/reports/turbo-validation.json',
  cacheDir: '.turbo',
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

interface TurboConfig {
  $schema?: string;
  globalDependencies?: string[];
  globalEnv?: string[];
  globalPassThroughEnv?: string[];
  tasks?: {
    [key: string]: {
      dependsOn?: string[];
      inputs?: string[];
      outputs?: string[];
      env?: string[];
      cache?: boolean;
      persistent?: boolean;
      outputLogs?: string;
    };
  };
  remoteCache?: {
    signature?: boolean;
  };
}

interface ValidationReport {
  timestamp: string;
  turboVersion: string;
  results: ValidationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  cacheStats?: {
    cacheHitRate?: number;
    totalTasks?: number;
    cachedTasks?: number;
  };
}

/**
 * Main validator class
 */
class TurboValidator {
  private results: ValidationResult[] = [];
  private turboConfig: TurboConfig | null = null;
  private verbose: boolean = false;

  constructor(options: { verbose?: boolean } = {}) {
    this.verbose = options.verbose || false;
  }

  /**
   * Run all validations
   */
  async validate(): Promise<ValidationReport> {
    console.log(`${colors.cyan}🔍 Turborepo Configuration Validator${colors.reset}\n`);

    // Load turbo.json
    await this.loadTurboConfig();

    // Run validations
    await this.validateTurboJsonExists();
    await this.validateTurboJsonSchema();
    await this.validateTaskDefinitions();
    await this.validateInputOutputDefinitions();
    await this.validateDependencies();
    await this.validateRemoteCacheConfig();
    await this.validateCacheDirectory();
    await this.validateGlobalEnv();

    // Print results
    this.printResults();

    // Generate report
    const report = this.generateReport();
    await this.saveReport(report);

    return report;
  }

  /**
   * Check cache hit rate
   */
  async checkCacheHitRate(): Promise<void> {
    console.log(`${colors.cyan}📊 Analyzing Turbo Cache Performance${colors.reset}\n`);

    try {
      // Get turbo run output with --dry-run to analyze cache status
      const dryRun = execSync('npx turbo run build --dry-run=json 2>&1', {
        encoding: 'utf-8',
        cwd: CONFIG.rootDir,
      });

      // Parse output for cache information
      const lines = dryRun.split('\n');
      const jsonLine = lines.find((line) => line.trim().startsWith('{'));

      if (jsonLine) {
        const dryRunData = JSON.parse(jsonLine);
        const tasks = dryRunData.tasks || [];

        const totalTasks = tasks.length;
        const cachedTasks = tasks.filter((t: any) => t.cache?.status === 'HIT').length;

        console.log(`Total Tasks: ${totalTasks}`);
        console.log(`Cached Tasks: ${cachedTasks}`);
        console.log(
          `Cache Hit Rate: ${totalTasks > 0 ? ((cachedTasks / totalTasks) * 100).toFixed(2) : 0}%\n`
        );
      }
    } catch (error) {
      console.log(
        `${colors.yellow}⚠ Could not analyze cache (may need to run builds first)${colors.reset}\n`
      );
    }
  }

  /**
   * Load turbo.json configuration
   */
  private async loadTurboConfig(): Promise<void> {
    try {
      const configPath = path.join(CONFIG.rootDir, CONFIG.turboJsonPath);
      const content = await fs.readFile(configPath, 'utf-8');
      this.turboConfig = JSON.parse(content);
      this.log(`Loaded turbo.json from ${configPath}`);
    } catch (error) {
      this.turboConfig = null;
      this.log(`Failed to load turbo.json: ${error}`, 'error');
    }
  }

  /**
   * Validate turbo.json exists
   */
  private async validateTurboJsonExists(): Promise<void> {
    const exists = this.turboConfig !== null;

    this.addResult({
      name: 'turbo.json exists',
      passed: exists,
      message: exists
        ? 'turbo.json found at root of monorepo'
        : 'turbo.json not found - create it to configure Turborepo',
    });
  }

  /**
   * Validate turbo.json has correct schema
   */
  private async validateTurboJsonSchema(): Promise<void> {
    if (!this.turboConfig) {
      this.addResult({
        name: 'Schema validation',
        passed: false,
        message: 'Cannot validate schema - turbo.json not loaded',
      });
      return;
    }

    const hasSchema = !!this.turboConfig.$schema;
    const correctSchema = this.turboConfig.$schema === 'https://turbo.build/schema.json';

    this.addResult({
      name: 'Schema reference',
      passed: hasSchema && correctSchema,
      message:
        hasSchema && correctSchema
          ? 'Correct schema reference found'
          : 'Missing or incorrect schema reference',
      details: {
        schema: this.turboConfig.$schema,
        expected: 'https://turbo.build/schema.json',
      },
    });
  }

  /**
   * Validate task definitions
   */
  private async validateTaskDefinitions(): Promise<void> {
    if (!this.turboConfig || !this.turboConfig.tasks) {
      this.addResult({
        name: 'Task definitions',
        passed: false,
        message: 'No task definitions found in turbo.json',
      });
      return;
    }

    const tasks = this.turboConfig.tasks;
    const taskNames = Object.keys(tasks);

    // Check for essential tasks
    const essentialTasks = ['build', 'lint', 'typecheck', 'test'];
    const missingTasks = essentialTasks.filter((t) => !taskNames.includes(t));

    if (missingTasks.length > 0) {
      this.addResult({
        name: 'Essential tasks',
        passed: false,
        message: `Missing essential tasks: ${missingTasks.join(', ')}`,
        details: { missingTasks },
      });
    } else {
      this.addResult({
        name: 'Essential tasks',
        passed: true,
        message: `All essential tasks defined (${essentialTasks.join(', ')})`,
        details: { taskCount: taskNames.length },
      });
    }

    // Validate each task has appropriate configuration
    for (const [taskName, taskConfig] of Object.entries(tasks)) {
      this.validateTaskConfig(taskName, taskConfig);
    }
  }

  /**
   * Validate individual task configuration
   */
  private validateTaskConfig(taskName: string, taskConfig: any): void {
    // Tasks that produce output should have outputs defined
    const buildTasks = ['build', 'test', 'typecheck', 'test:unit', 'test:integration'];

    if (buildTasks.some((t) => taskName.includes(t))) {
      if (!taskConfig.outputs && taskConfig.cache !== false) {
        this.addResult({
          name: `Task outputs: ${taskName}`,
          passed: false,
          message: `Build task "${taskName}" should define outputs for caching`,
          details: { taskName, taskConfig },
        });
      }
    }

    // Tasks should have inputs defined for better cache invalidation
    if (taskConfig.cache !== false && !taskConfig.inputs) {
      this.addResult({
        name: `Task inputs: ${taskName}`,
        passed: false,
        message: `Task "${taskName}" should define inputs for accurate cache invalidation`,
        details: { taskName },
      });
    }
  }

  /**
   * Validate input/output definitions
   */
  private async validateInputOutputDefinitions(): Promise<void> {
    if (!this.turboConfig || !this.turboConfig.tasks) return;

    const tasks = this.turboConfig.tasks;
    let totalInputs = 0;
    let totalOutputs = 0;

    for (const [taskName, taskConfig] of Object.entries(tasks)) {
      if (taskConfig.inputs) totalInputs += taskConfig.inputs.length;
      if (taskConfig.outputs) totalOutputs += taskConfig.outputs.length;
    }

    this.addResult({
      name: 'Input/output coverage',
      passed: totalInputs > 0 && totalOutputs > 0,
      message: `Found ${totalInputs} input patterns and ${totalOutputs} output patterns`,
      details: {
        totalInputs,
        totalOutputs,
      },
    });
  }

  /**
   * Validate dependencies
   */
  private async validateDependencies(): Promise<void> {
    if (!this.turboConfig || !this.turboConfig.tasks) return;

    const tasks = this.turboConfig.tasks;
    const taskNames = Object.keys(tasks);

    // Check for circular dependencies
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (task: string): boolean => {
      if (!visited.has(task)) {
        visited.add(task);
        recursionStack.add(task);

        const deps = tasks[task]?.dependsOn || [];
        for (const dep of deps) {
          const depTask = dep.replace('^', '');
          if (taskNames.includes(depTask)) {
            if (!visited.has(depTask) && hasCycle(depTask)) {
              return true;
            } else if (recursionStack.has(depTask)) {
              return true;
            }
          }
        }
      }
      recursionStack.delete(task);
      return false;
    };

    let circularDepsFound = false;
    for (const task of taskNames) {
      if (hasCycle(task)) {
        circularDepsFound = true;
        break;
      }
    }

    this.addResult({
      name: 'Dependency graph',
      passed: !circularDepsFound,
      message: circularDepsFound
        ? 'Circular dependencies detected in task graph'
        : 'No circular dependencies detected',
    });
  }

  /**
   * Validate remote cache configuration
   */
  private async validateRemoteCacheConfig(): Promise<void> {
    if (!this.turboConfig) return;

    const hasRemoteCache = !!this.turboConfig.remoteCache;
    const hasSignature = this.turboConfig.remoteCache?.signature === true;

    this.addResult({
      name: 'Remote cache config',
      passed: hasRemoteCache && hasSignature,
      message:
        hasRemoteCache && hasSignature
          ? 'Remote cache configured with signature verification'
          : 'Remote cache not fully configured',
      details: {
        enabled: hasRemoteCache,
        signature: hasSignature,
      },
    });
  }

  /**
   * Validate cache directory
   */
  private async validateCacheDirectory(): Promise<void> {
    const cachePath = path.join(CONFIG.rootDir, CONFIG.cacheDir);

    try {
      const stats = await fs.stat(cachePath);
      const isDirectory = stats.isDirectory();

      if (isDirectory) {
        // Count cache entries
        const entries = await fs.readdir(cachePath);

        this.addResult({
          name: 'Cache directory',
          passed: true,
          message: `Cache directory exists with ${entries.length} entries`,
          details: {
            path: cachePath,
            entries: entries.length,
          },
        });
      } else {
        this.addResult({
          name: 'Cache directory',
          passed: false,
          message: '.turbo exists but is not a directory',
        });
      }
    } catch (error) {
      this.addResult({
        name: 'Cache directory',
        passed: true,
        message: 'Cache directory not yet created (will be created on first run)',
        details: { note: 'This is normal for new projects' },
      });
    }
  }

  /**
   * Validate global environment variables
   */
  private async validateGlobalEnv(): Promise<void> {
    if (!this.turboConfig) return;

    const globalEnv = this.turboConfig.globalEnv || [];
    const globalPassThrough = this.turboConfig.globalPassThroughEnv || [];

    const essentialEnvVars = ['NODE_ENV'];
    const hasEssentials = essentialEnvVars.every(
      (v) => globalEnv.includes(v) || globalPassThrough.includes(v)
    );

    this.addResult({
      name: 'Global environment variables',
      passed: hasEssentials,
      message: hasEssentials
        ? `${globalEnv.length + globalPassThrough.length} environment variables configured`
        : 'Missing essential environment variables',
      details: {
        globalEnv: globalEnv.length,
        globalPassThrough: globalPassThrough.length,
      },
    });
  }

  /**
   * Add validation result
   */
  private addResult(result: ValidationResult): void {
    this.results.push(result);

    if (this.verbose) {
      const icon = result.passed ? '✓' : '✗';
      const color = result.passed ? colors.green : colors.red;
      console.log(`${color}${icon} ${result.name}: ${result.message}${colors.reset}`);

      if (result.details && this.verbose) {
        console.log(`${colors.dim}  ${JSON.stringify(result.details, null, 2)}${colors.reset}`);
      }
    }
  }

  /**
   * Print results
   */
  private printResults(): void {
    console.log('\n' + '='.repeat(80));
    console.log('VALIDATION RESULTS');
    console.log('='.repeat(80) + '\n');

    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const total = this.results.length;

    for (const result of this.results) {
      const icon = result.passed ? '✓' : '✗';
      const color = result.passed ? colors.green : colors.red;
      console.log(`${color}${icon} ${result.name}${colors.reset}`);
      console.log(`  ${result.message}`);

      if (!result.passed && result.details) {
        console.log(
          `${colors.dim}  Details: ${JSON.stringify(result.details, null, 2)}${colors.reset}`
        );
      }
      console.log();
    }

    console.log('='.repeat(80));
    console.log(`Summary: ${passed}/${total} checks passed`);

    if (failed === 0) {
      console.log(`${colors.green}✓ All validations passed!${colors.reset}`);
    } else {
      console.log(`${colors.red}✗ ${failed} validation(s) failed${colors.reset}`);
    }
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Generate validation report
   */
  private generateReport(): ValidationReport {
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;

    let turboVersion = 'unknown';
    try {
      turboVersion = execSync('npx turbo --version', {
        encoding: 'utf-8',
        cwd: CONFIG.rootDir,
      }).trim();
    } catch (error) {
      // Ignore error
    }

    return {
      timestamp: new Date().toISOString(),
      turboVersion,
      results: this.results,
      summary: {
        total: this.results.length,
        passed,
        failed,
        warnings: 0,
      },
    };
  }

  /**
   * Save report to file
   */
  private async saveReport(report: ValidationReport): Promise<void> {
    const reportPath = path.join(CONFIG.rootDir, CONFIG.reportPath);
    const reportDir = path.dirname(reportPath);

    try {
      // Ensure directory exists
      await fs.mkdir(reportDir, { recursive: true });

      // Write report
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');

      console.log(
        `${colors.green}✓ Validation report saved to: ${CONFIG.reportPath}${colors.reset}\n`
      );
    } catch (error) {
      console.log(`${colors.red}✗ Failed to save report: ${error}${colors.reset}\n`);
    }
  }

  /**
   * Log message
   */
  private log(message: string, level: 'info' | 'error' = 'info'): void {
    if (this.verbose) {
      const color = level === 'error' ? colors.red : colors.dim;
      console.log(`${color}[LOG] ${message}${colors.reset}`);
    }
  }
}

/**
 * CLI Entry Point
 */
async function main() {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    checkCache: args.includes('--check-cache'),
    report: args.includes('--report'),
  };

  const validator = new TurboValidator({ verbose: options.verbose });

  if (options.checkCache) {
    await validator.checkCacheHitRate();
  } else {
    const report = await validator.validate();

    if (options.report) {
      console.log('\nValidation Report:');
      console.log(JSON.stringify(report, null, 2));
    }

    // Exit with error code if validation failed
    process.exit(report.summary.failed > 0 ? 1 : 0);
  }
}

// Export for testing
export { TurboValidator, CONFIG };

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
  });
}
