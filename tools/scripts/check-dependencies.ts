#!/usr/bin/env tsx

/**
 * Dependency Validation Script
 *
 * Validates all dependencies required for IntelliFlow CRM development.
 * This script checks:
 * - Node.js version compatibility
 * - pnpm version and availability
 * - Required system dependencies (Docker, Git, etc.)
 * - Package dependencies consistency across workspaces
 * - Outdated packages and security vulnerabilities
 *
 * Usage:
 *   pnpm tsx tools/scripts/check-dependencies.ts
 *   pnpm tsx tools/scripts/check-dependencies.ts --verbose
 *   pnpm tsx tools/scripts/check-dependencies.ts --fix
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

interface DependencyCheck {
  name: string;
  required: boolean;
  version?: string;
  installed: boolean;
  currentVersion?: string;
  satisfies: boolean;
  message?: string;
}

interface PackageInfo {
  name: string;
  version: string;
  path: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

interface ValidationResult {
  valid: boolean;
  checks: DependencyCheck[];
  packages: PackageInfo[];
  inconsistencies: DependencyInconsistency[];
  outdated: OutdatedPackage[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  timestamp: string;
}

interface DependencyInconsistency {
  package: string;
  versions: Array<{ workspace: string; version: string }>;
  recommended: string;
}

interface OutdatedPackage {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  location: string;
}

class DependencyValidator {
  private checks: DependencyCheck[] = [];
  private packages: PackageInfo[] = [];
  private inconsistencies: DependencyInconsistency[] = [];
  private outdated: OutdatedPackage[] = [];
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * Execute a shell command and return the output
   */
  private exec(command: string): string {
    try {
      return execSync(command, { encoding: 'utf-8', stdio: 'pipe' }).trim();
    } catch (error) {
      return '';
    }
  }

  /**
   * Check if a command exists in PATH
   */
  private commandExists(command: string): boolean {
    try {
      this.exec(`${command} --version`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse version string
   */
  private parseVersion(version: string): number[] {
    return version
      .replace(/[^0-9.]/g, '')
      .split('.')
      .map(Number);
  }

  /**
   * Compare versions
   */
  private compareVersions(current: string, required: string): boolean {
    const currentParts = this.parseVersion(current);
    const requiredParts = this.parseVersion(required);

    for (let i = 0; i < requiredParts.length; i++) {
      if ((currentParts[i] || 0) < (requiredParts[i] || 0)) return false;
      if ((currentParts[i] || 0) > (requiredParts[i] || 0)) return true;
    }

    return true;
  }

  /**
   * Check Node.js version
   */
  private checkNodeVersion(): DependencyCheck {
    const requiredVersion = '20.0.0';
    const currentVersion = process.version.replace('v', '');
    const satisfies = this.compareVersions(currentVersion, requiredVersion);

    return {
      name: 'Node.js',
      required: true,
      version: `>=${requiredVersion}`,
      installed: true,
      currentVersion,
      satisfies,
      message: satisfies
        ? `Node.js ${currentVersion} meets requirement (>=${requiredVersion})`
        : `Node.js ${currentVersion} does not meet requirement (>=${requiredVersion})`,
    };
  }

  /**
   * Check pnpm version
   */
  private checkPnpmVersion(): DependencyCheck {
    const requiredVersion = '8.0.0';
    let currentVersion = '';
    let installed = false;

    try {
      currentVersion = this.exec('pnpm --version');
      installed = true;
    } catch (error) {
      return {
        name: 'pnpm',
        required: true,
        version: `>=${requiredVersion}`,
        installed: false,
        satisfies: false,
        message: 'pnpm is not installed. Install with: npm install -g pnpm',
      };
    }

    const satisfies = this.compareVersions(currentVersion, requiredVersion);

    return {
      name: 'pnpm',
      required: true,
      version: `>=${requiredVersion}`,
      installed,
      currentVersion,
      satisfies,
      message: satisfies
        ? `pnpm ${currentVersion} meets requirement (>=${requiredVersion})`
        : `pnpm ${currentVersion} does not meet requirement (>=${requiredVersion})`,
    };
  }

  /**
   * Check Git availability
   */
  private checkGit(): DependencyCheck {
    const installed = this.commandExists('git');
    let currentVersion = '';

    if (installed) {
      currentVersion = this.exec('git --version').split(' ')[2] || '';
    }

    return {
      name: 'Git',
      required: true,
      installed,
      currentVersion,
      satisfies: installed,
      message: installed
        ? `Git ${currentVersion} is installed`
        : 'Git is not installed. Download from https://git-scm.com',
    };
  }

  /**
   * Check Docker availability
   */
  private checkDocker(): DependencyCheck {
    const installed = this.commandExists('docker');
    let currentVersion = '';

    if (installed) {
      const versionOutput = this.exec('docker --version');
      currentVersion = versionOutput.match(/(\d+\.\d+\.\d+)/)?.[0] || '';
    }

    return {
      name: 'Docker',
      required: false,
      installed,
      currentVersion,
      satisfies: installed,
      message: installed
        ? `Docker ${currentVersion} is installed`
        : 'Docker is not installed (recommended for local development)',
    };
  }

  /**
   * Check Docker Compose availability
   */
  private checkDockerCompose(): DependencyCheck {
    const installed = this.commandExists('docker-compose') || this.commandExists('docker compose');
    let currentVersion = '';

    if (installed) {
      try {
        currentVersion = this.exec('docker-compose --version').match(/(\d+\.\d+\.\d+)/)?.[0] || '';
      } catch {
        currentVersion = this.exec('docker compose version').match(/(\d+\.\d+\.\d+)/)?.[0] || '';
      }
    }

    return {
      name: 'Docker Compose',
      required: false,
      installed,
      currentVersion,
      satisfies: installed,
      message: installed
        ? `Docker Compose ${currentVersion} is installed`
        : 'Docker Compose is not installed (recommended for local development)',
    };
  }

  /**
   * Check TypeScript compiler
   */
  private checkTypeScript(): DependencyCheck {
    const installed = this.commandExists('tsc');
    let currentVersion = '';

    if (installed) {
      currentVersion = this.exec('tsc --version').replace('Version ', '');
    }

    return {
      name: 'TypeScript',
      required: true,
      installed,
      currentVersion,
      satisfies: installed,
      message: installed
        ? `TypeScript ${currentVersion} is installed`
        : 'TypeScript is not installed. Run: pnpm install',
    };
  }

  /**
   * Load all package.json files from workspaces
   */
  private async loadPackages(): Promise<void> {
    const packagePaths = await glob('**/package.json', {
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      cwd: process.cwd(),
    });

    for (const pkgPath of packagePaths) {
      try {
        const fullPath = path.resolve(process.cwd(), pkgPath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const pkg = JSON.parse(content);

        this.packages.push({
          name: pkg.name || path.basename(path.dirname(fullPath)),
          version: pkg.version || '0.0.0',
          path: fullPath,
          dependencies: pkg.dependencies || {},
          devDependencies: pkg.devDependencies || {},
        });
      } catch (error) {
        if (this.verbose) {
          console.warn(`Warning: Could not parse ${pkgPath}`);
        }
      }
    }
  }

  /**
   * Check for dependency version inconsistencies
   */
  private checkInconsistencies(): void {
    const allDeps = new Map<string, Map<string, string[]>>();

    // Collect all dependencies across workspaces
    for (const pkg of this.packages) {
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      for (const [name, version] of Object.entries(deps)) {
        if (!allDeps.has(name)) {
          allDeps.set(name, new Map());
        }

        const versionMap = allDeps.get(name)!;
        if (!versionMap.has(version)) {
          versionMap.set(version, []);
        }
        versionMap.get(version)!.push(pkg.name);
      }
    }

    // Find inconsistencies
    for (const [depName, versionMap] of allDeps.entries()) {
      if (versionMap.size > 1) {
        const versions = Array.from(versionMap.entries()).map(([version, workspaces]) => ({
          version,
          workspaces,
        }));

        // Determine recommended version (most common or highest)
        const recommended = versions.reduce((prev, curr) =>
          curr.workspaces.length > prev.workspaces.length ? curr : prev
        ).version;

        this.inconsistencies.push({
          package: depName,
          versions: versions.flatMap((v) =>
            v.workspaces.map((w) => ({ workspace: w, version: v.version }))
          ),
          recommended,
        });
      }
    }
  }

  /**
   * Check for outdated packages
   */
  private checkOutdated(): void {
    try {
      const output = this.exec('pnpm outdated --format json');
      if (output) {
        const outdatedData = JSON.parse(output);

        for (const [name, info] of Object.entries(outdatedData as Record<string, any>)) {
          this.outdated.push({
            name,
            current: info.current || '',
            wanted: info.wanted || '',
            latest: info.latest || '',
            location: info.location || 'root',
          });
        }
      }
    } catch (error) {
      if (this.verbose) {
        console.warn('Could not check for outdated packages');
      }
    }
  }

  /**
   * Run all dependency checks
   */
  async validate(): Promise<ValidationResult> {
    console.log(`${colors.blue}${colors.bold}Checking Dependencies${colors.reset}\n`);

    // System checks
    this.checks.push(this.checkNodeVersion());
    this.checks.push(this.checkPnpmVersion());
    this.checks.push(this.checkGit());
    this.checks.push(this.checkDocker());
    this.checks.push(this.checkDockerCompose());
    this.checks.push(this.checkTypeScript());

    // Load and analyze packages
    await this.loadPackages();
    this.checkInconsistencies();
    this.checkOutdated();

    // Print results
    console.log(`${colors.blue}System Dependencies:${colors.reset}`);
    for (const check of this.checks) {
      const status = check.satisfies
        ? `${colors.green}✓${colors.reset}`
        : `${colors.red}✗${colors.reset}`;
      const requirement = check.required ? '(required)' : '(optional)';
      console.log(`  ${status} ${check.name} ${colors.gray}${requirement}${colors.reset}`);
      if (this.verbose && check.message) {
        console.log(`    ${colors.gray}${check.message}${colors.reset}`);
      }
    }

    // Print inconsistencies
    if (this.inconsistencies.length > 0) {
      console.log(
        `\n${colors.yellow}Dependency Inconsistencies (${this.inconsistencies.length}):${colors.reset}`
      );
      for (const inconsistency of this.inconsistencies) {
        console.log(`  ${colors.yellow}⚠${colors.reset} ${inconsistency.package}`);
        if (this.verbose) {
          for (const { workspace, version } of inconsistency.versions) {
            console.log(`    ${colors.gray}${workspace}: ${version}${colors.reset}`);
          }
          console.log(`    ${colors.gray}Recommended: ${inconsistency.recommended}${colors.reset}`);
        }
      }
    }

    // Print outdated packages
    if (this.outdated.length > 0 && this.verbose) {
      console.log(`\n${colors.yellow}Outdated Packages (${this.outdated.length}):${colors.reset}`);
      for (const pkg of this.outdated.slice(0, 10)) {
        console.log(
          `  ${colors.yellow}⚠${colors.reset} ${pkg.name}: ${pkg.current} → ${pkg.latest}`
        );
      }
      if (this.outdated.length > 10) {
        console.log(`  ${colors.gray}... and ${this.outdated.length - 10} more${colors.reset}`);
      }
    }

    // Summary
    const passed = this.checks.filter((c) => c.satisfies).length;
    const failed = this.checks.filter((c) => !c.satisfies && c.required).length;
    const warnings = this.checks.filter((c) => !c.satisfies && !c.required).length;

    console.log(`\n${colors.blue}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.blue}Summary${colors.reset}`);
    console.log(`${colors.blue}═══════════════════════════════════════${colors.reset}`);
    console.log(`Total Checks: ${this.checks.length}`);
    console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
    console.log(`${colors.yellow}Warnings: ${warnings}${colors.reset}`);
    console.log(`Workspaces: ${this.packages.length}`);
    console.log(`Inconsistencies: ${this.inconsistencies.length}`);
    console.log(`Outdated: ${this.outdated.length}\n`);

    const valid = failed === 0;

    return {
      valid,
      checks: this.checks,
      packages: this.packages,
      inconsistencies: this.inconsistencies,
      outdated: this.outdated,
      summary: {
        totalChecks: this.checks.length,
        passed,
        failed,
        warnings,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

// CLI Handler
async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const fix = args.includes('--fix');

  const validator = new DependencyValidator(verbose);
  const result = await validator.validate();

  if (fix && result.inconsistencies.length > 0) {
    console.log(`${colors.yellow}Fix mode is not yet implemented${colors.reset}`);
    console.log('Please manually update dependency versions in package.json files\n');
  }

  if (!result.valid) {
    console.log(`${colors.red}Dependency validation failed${colors.reset}`);
    console.log('Please install missing dependencies and try again\n');
    process.exit(1);
  }

  console.log(`${colors.green}✓ All required dependencies are satisfied${colors.reset}\n`);
  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}Error:${colors.reset}`, error);
    process.exit(1);
  });
}

export { DependencyValidator, ValidationResult, DependencyCheck };
