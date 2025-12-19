#!/usr/bin/env node

/**
 * Artifact Path Linter for IntelliFlow CRM
 *
 * Validates that artifacts are placed in correct directories and follow
 * naming conventions. Enforces security best practices.
 *
 * Usage:
 *   pnpm tsx tools/lint/artifact-paths.ts
 *   pnpm tsx tools/lint/artifact-paths.ts --fix
 *   pnpm tsx tools/lint/artifact-paths.ts --audit
 */

import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const CONFIG = {
  rootDir: process.cwd(),
  artifactsDir: 'artifacts',
  maxFileSizeMB: {
    logs: 10,
    reportsHtml: 5,
    reportsJson: 20,
    screenshots: 2,
    default: 5,
  },
  retentionDays: {
    development: 7,
    cicd: 30,
    production: 90,
  },
  // Files/patterns excluded from secret scanning (documentation that discusses security concepts)
  secretScanExclusions: [
    'docs/**/*',
    '**/*.md',
    '**/Sprint_plan.csv',
    '**/Sprint_plan.json',
    '**/task-status.schema.json',
    '**/*.schema.json',
    '**/CLAUDE.md',
    '**/copilot-instructions.md',
    'apps/project-tracker/**/*',
    '**/docker-compose*.yml',
    '**/docker-compose*.yaml',
    'artifacts/misc/*.yml',
    'artifacts/misc/*.yaml',
    'logs/**/*',
    'artifacts/logs/**/*',
    '**/*.log',
  ],
};

// Validation rules
const RULES = {
  allowedArtifactPaths: [
    'artifacts/logs/**/*',
    'artifacts/reports/**/*',
    'artifacts/metrics/**/*',
    'artifacts/misc/**/*',
    'artifacts/attestations/**/*',
  ],
  allowedBuildOutputs: [
    'dist/**/*',
    '.next/**/*',
    '.turbo/**/*',
    'node_modules/.cache/**/*',
    '**/.tsbuildinfo',
  ],
  prohibitedPatterns: [
    '**/*.secret.*',
    '**/*.private.*',
    '**/*credential*',
    '**/*.pem',
    '**/*.key',
    '**/.env',
    '!**/.env.example',
  ],
  prohibitedLocations: [
    'src/**/*.log',
    'src/**/*.coverage',
    'packages/*/src/**/*.log',
    'apps/*/src/**/*.log',
    'docs/**/*.log',
    'docs/**/*.coverage',
    '.github/**/*.log',
    'infra/**/*.log',
  ],
  secretPatterns: [
    /(?:api[_-]?key|apikey)[\s:=]+['"]?([a-z0-9]{32,})['"]?/gi,
    /AKIA[0-9A-Z]{16}/g, // AWS Access Key
    /-----BEGIN (?:RSA )?PRIVATE KEY-----/g,
    /(?:password|passwd|pwd)[\s:=]+['"]?([^\s'"]+)['"]?/gi,
    /sk-[a-zA-Z0-9]{48,}/g, // OpenAI API keys
    /ghp_[a-zA-Z0-9]{36,}/g, // GitHub personal access tokens
    /postgresql:\/\/[^:]+:[^@]+@/g, // DB connection strings with passwords
  ],
  piiPatterns: [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // Phone numbers (US format)
    /\b\d{3}-\d{2}-\d{4}\b/g, // SSN (US format)
  ],
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

interface LintResult {
  file: string;
  violations: Violation[];
}

interface Violation {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  line?: number;
}

interface LintStats {
  totalFiles: number;
  violations: number;
  errors: number;
  warnings: number;
  filesWithViolations: number;
}

/**
 * Main linter class
 */
class ArtifactPathLinter {
  private results: LintResult[] = [];
  private stats: LintStats = {
    totalFiles: 0,
    violations: 0,
    errors: 0,
    warnings: 0,
    filesWithViolations: 0,
  };

  /**
   * Run the linter
   */
  async run(options: { fix?: boolean; audit?: boolean } = {}): Promise<boolean> {
    console.log(`${colors.cyan}🔍 IntelliFlow CRM - Artifact Path Linter${colors.reset}\n`);

    if (options.audit) {
      return this.runAudit();
    }

    const files = await this.findFiles();
    this.stats.totalFiles = files.length;

    console.log(`Found ${files.length} files to check\n`);

    for (const file of files) {
      await this.lintFile(file);
    }

    this.printResults();

    if (options.fix) {
      this.applyFixes();
    }

    return this.stats.errors === 0;
  }

  /**
   * Find all files to lint (excluding node_modules, .git, etc.)
   */
  private async findFiles(): Promise<string[]> {
    const patterns = [
      '**/*.log',
      '**/*.html',
      '**/*.json',
      '**/*.csv',
      '**/*.txt',
      'artifacts/**/*',
    ];

    const ignore = [
      '**/node_modules/**',
      '**/.git/**',
      '**/.next/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/pnpm-lock.yaml',
      '**/package-lock.json',
    ];

    const allFiles: string[] = [];

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: CONFIG.rootDir,
        ignore,
        nodir: true,
      });
      allFiles.push(...files);
    }

    // Remove duplicates
    return [...new Set(allFiles)];
  }

  /**
   * Lint a single file
   */
  private async lintFile(file: string): Promise<void> {
    const violations: Violation[] = [];

    // Check if file is in prohibited location
    if (this.isProhibitedLocation(file)) {
      violations.push({
        rule: 'prohibited-location',
        severity: 'error',
        message: `Artifact file in prohibited location. Move to artifacts/ directory.`,
      });
    }

    // Check for prohibited patterns in filename
    if (this.hasProhibitedPattern(file)) {
      violations.push({
        rule: 'prohibited-pattern',
        severity: 'error',
        message: `Filename contains prohibited pattern (secret, credential, .key, .pem, .env)`,
      });
    }

    // Check if artifact is in wrong category
    if (file.startsWith('artifacts/') && !this.isValidArtifactPath(file)) {
      violations.push({
        rule: 'invalid-artifact-path',
        severity: 'warning',
        message: `Artifact not in standard category (logs/, reports/, metrics/, misc/)`,
      });
    }

    // Check file size
    const sizeViolation = await this.checkFileSize(file);
    if (sizeViolation) {
      violations.push(sizeViolation);
    }

    // Check file contents for secrets
    const secretViolations = await this.scanForSecrets(file);
    violations.push(...secretViolations);

    // Check file contents for PII
    const piiViolations = await this.scanForPII(file);
    violations.push(...piiViolations);

    if (violations.length > 0) {
      this.results.push({ file, violations });
      this.stats.filesWithViolations++;
      this.stats.violations += violations.length;
      this.stats.errors += violations.filter((v) => v.severity === 'error').length;
      this.stats.warnings += violations.filter((v) => v.severity === 'warning').length;
    }
  }

  /**
   * Check if file is in a prohibited location
   */
  private isProhibitedLocation(file: string): boolean {
    // Files in artifacts/ are allowed
    if (file.startsWith('artifacts/')) {
      return false;
    }

    // Build outputs are allowed
    for (const pattern of RULES.allowedBuildOutputs) {
      const regex = this.globToRegex(pattern);
      if (regex.test(file)) {
        return false;
      }
    }

    // Check against prohibited locations
    for (const pattern of RULES.prohibitedLocations) {
      const regex = this.globToRegex(pattern);
      if (regex.test(file)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if filename has prohibited patterns
   */
  private hasProhibitedPattern(file: string): boolean {
    const basename = path.basename(file);

    // Check for prohibited patterns
    const prohibited = [/\.secret\./i, /\.private\./i, /credential/i, /\.pem$/, /\.key$/];

    // Special case: .env files are prohibited except .env.example
    if (basename === '.env' || (basename.startsWith('.env.') && !basename.endsWith('.example'))) {
      return true;
    }

    return prohibited.some((pattern) => pattern.test(basename));
  }

  /**
   * Check if artifact is in valid path
   */
  private isValidArtifactPath(file: string): boolean {
    const validCategories = ['logs/', 'reports/', 'metrics/', 'misc/'];
    const relativePath = file.replace(/^artifacts\//, '');

    return validCategories.some((category) => relativePath.startsWith(category));
  }

  /**
   * Check file size
   */
  private async checkFileSize(file: string): Promise<Violation | null> {
    try {
      const stats = await fs.promises.stat(path.join(CONFIG.rootDir, file));
      const sizeMB = stats.size / (1024 * 1024);

      let maxSize = CONFIG.maxFileSizeMB.default;

      if (file.endsWith('.log')) {
        maxSize = CONFIG.maxFileSizeMB.logs;
      } else if (file.endsWith('.html')) {
        maxSize = CONFIG.maxFileSizeMB.reportsHtml;
      } else if (file.endsWith('.json')) {
        maxSize = CONFIG.maxFileSizeMB.reportsJson;
      } else if (file.match(/\.(png|jpg|jpeg|gif)$/)) {
        maxSize = CONFIG.maxFileSizeMB.screenshots;
      }

      if (sizeMB > maxSize) {
        return {
          rule: 'file-size',
          severity: 'warning',
          message: `File size (${sizeMB.toFixed(2)}MB) exceeds limit (${maxSize}MB). Consider compressing or splitting.`,
        };
      }
    } catch (error) {
      // File doesn't exist or can't be read, skip
    }

    return null;
  }

  /**
   * Check if file should be excluded from secret scanning
   */
  private isExcludedFromSecretScan(file: string): boolean {
    // Normalize path to forward slashes for consistent matching
    const normalizedFile = file.replace(/\\/g, '/');
    for (const pattern of CONFIG.secretScanExclusions) {
      const regex = this.globToRegex(pattern);
      if (regex.test(normalizedFile)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Scan file contents for secrets
   */
  private async scanForSecrets(file: string): Promise<Violation[]> {
    const violations: Violation[] = [];

    // Only scan text files
    if (!this.isTextFile(file)) {
      return violations;
    }

    // Skip excluded files (documentation that discusses security concepts)
    if (this.isExcludedFromSecretScan(file)) {
      return violations;
    }

    try {
      const content = await fs.promises.readFile(path.join(CONFIG.rootDir, file), 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const pattern of RULES.secretPatterns) {
          if (pattern.test(line)) {
            violations.push({
              rule: 'secret-detected',
              severity: 'error',
              message: `Potential secret detected: ${pattern.source.substring(0, 50)}...`,
              line: i + 1,
            });
          }
        }
      }
    } catch (error) {
      // Can't read file, skip
    }

    return violations;
  }

  /**
   * Scan file contents for PII
   */
  private async scanForPII(file: string): Promise<Violation[]> {
    const violations: Violation[] = [];

    // Only scan text files
    if (!this.isTextFile(file)) {
      return violations;
    }

    // Don't scan log files for PII (too many false positives)
    if (file.endsWith('.log')) {
      return violations;
    }

    try {
      const content = await fs.promises.readFile(path.join(CONFIG.rootDir, file), 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const pattern of RULES.piiPatterns) {
          if (pattern.test(line)) {
            violations.push({
              rule: 'pii-detected',
              severity: 'warning',
              message: `Potential PII detected. Review and sanitize if needed.`,
              line: i + 1,
            });
            break; // Only report once per line
          }
        }
      }
    } catch (error) {
      // Can't read file, skip
    }

    return violations;
  }

  /**
   * Check if file is likely a text file
   */
  private isTextFile(file: string): boolean {
    const textExtensions = [
      '.log',
      '.txt',
      '.json',
      '.html',
      '.xml',
      '.csv',
      '.md',
      '.yml',
      '.yaml',
    ];
    return textExtensions.some((ext) => file.endsWith(ext));
  }

  /**
   * Convert glob pattern to regex
   */
  private globToRegex(pattern: string): RegExp {
    let regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '§§') // Temporary placeholder
      .replace(/\*/g, '[^/]*')
      .replace(/§§/g, '.*')
      .replace(/\?/g, '[^/]');

    return new RegExp(`^${regex}$`);
  }

  /**
   * Print linting results
   */
  private printResults(): void {
    console.log('\n' + '='.repeat(80));
    console.log('LINTING RESULTS');
    console.log('='.repeat(80) + '\n');

    if (this.results.length === 0) {
      console.log(`${colors.green}✓ No violations found!${colors.reset}\n`);
      this.printStats();
      return;
    }

    for (const result of this.results) {
      const errorCount = result.violations.filter((v) => v.severity === 'error').length;
      const warningCount = result.violations.filter((v) => v.severity === 'warning').length;

      const fileColor = errorCount > 0 ? colors.red : colors.yellow;
      console.log(`${fileColor}${result.file}${colors.reset}`);

      for (const violation of result.violations) {
        const icon = violation.severity === 'error' ? '✗' : '⚠';
        const color = violation.severity === 'error' ? colors.red : colors.yellow;
        const location = violation.line ? `:${violation.line}` : '';

        console.log(
          `  ${color}${icon} [${violation.rule}]${location} ${violation.message}${colors.reset}`
        );
      }

      console.log('');
    }

    this.printStats();

    if (this.stats.errors > 0) {
      console.log(
        `${colors.red}✗ Linting failed with ${this.stats.errors} error(s)${colors.reset}\n`
      );
    } else {
      console.log(
        `${colors.yellow}⚠ Linting passed with ${this.stats.warnings} warning(s)${colors.reset}\n`
      );
    }
  }

  /**
   * Print statistics
   */
  private printStats(): void {
    console.log('Statistics:');
    console.log(`  Total files checked: ${this.stats.totalFiles}`);
    console.log(`  Files with violations: ${this.stats.filesWithViolations}`);
    console.log(`  Total violations: ${this.stats.violations}`);
    console.log(`  Errors: ${colors.red}${this.stats.errors}${colors.reset}`);
    console.log(`  Warnings: ${colors.yellow}${this.stats.warnings}${colors.reset}`);
    console.log('');
  }

  /**
   * Apply automatic fixes (placeholder for future implementation)
   */
  private applyFixes(): void {
    console.log(`${colors.blue}ℹ Auto-fix not yet implemented${colors.reset}\n`);
    console.log('Suggestions:');
    console.log('  1. Move misplaced artifacts to artifacts/ directory');
    console.log('  2. Remove files with prohibited patterns');
    console.log('  3. Compress files exceeding size limits');
    console.log('  4. Sanitize files containing secrets/PII');
    console.log('');
  }

  /**
   * Run audit mode (generate migration map)
   */
  private async runAudit(): Promise<boolean> {
    console.log(`${colors.cyan}Running audit mode...${colors.reset}\n`);

    const files = await this.findFiles();
    const misplacedFiles: Array<{ from: string; to: string; reason: string }> = [];

    for (const file of files) {
      if (this.isProhibitedLocation(file) && !file.startsWith('artifacts/')) {
        const suggestedPath = this.suggestArtifactPath(file);
        misplacedFiles.push({
          from: file,
          to: suggestedPath,
          reason: 'File in prohibited location',
        });
      }
    }

    if (misplacedFiles.length === 0) {
      console.log(`${colors.green}✓ No misplaced artifacts found${colors.reset}\n`);
      return true;
    }

    console.log(`Found ${misplacedFiles.length} misplaced artifacts\n`);

    // Generate migration CSV
    const migrationMapPath = path.join(CONFIG.rootDir, 'scripts/migration/artifact-move-map.csv');
    await this.generateMigrationMap(misplacedFiles, migrationMapPath);

    console.log(`${colors.green}✓ Migration map generated: ${migrationMapPath}${colors.reset}\n`);

    return true;
  }

  /**
   * Suggest correct artifact path for a file
   */
  private suggestArtifactPath(file: string): string {
    const basename = path.basename(file);
    const ext = path.extname(file);

    if (ext === '.log') {
      return `artifacts/logs/migration/${basename}`;
    } else if (ext === '.html' || ext === '.json') {
      return `artifacts/reports/migration/${basename}`;
    } else if (ext === '.csv') {
      return `artifacts/metrics/migration/${basename}`;
    } else {
      return `artifacts/misc/migration/${basename}`;
    }
  }

  /**
   * Generate migration map CSV
   */
  private async generateMigrationMap(
    files: Array<{ from: string; to: string; reason: string }>,
    outputPath: string
  ): Promise<void> {
    const csv = [
      'from,to,reason,status',
      ...files.map((f) => `"${f.from}","${f.to}","${f.reason}",pending`),
    ].join('\n');

    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.promises.writeFile(outputPath, csv, 'utf-8');
  }
}

// CLI Entry Point
async function main() {
  const args = process.argv.slice(2);
  const options = {
    fix: args.includes('--fix'),
    audit: args.includes('--audit'),
  };

  const linter = new ArtifactPathLinter();
  const success = await linter.run(options);

  process.exit(success ? 0 : 1);
}

// Export for testing
export { ArtifactPathLinter, RULES, CONFIG };

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
  });
}
