#!/usr/bin/env node

/**
 * Runtime Artifact Path Linter for IntelliFlow CRM
 *
 * Prevents artifact hygiene regressions by enforcing runtime path policies:
 * - Detects files in forbidden paths (including git-ignored files)
 * - Enforces canonical file uniqueness (Sprint_plan.csv, etc.)
 * - Validates policy-pending items against deadlines
 * - Supports local vs CI enforcement modes
 *
 * Usage:
 *   pnpm tsx tools/audit/runtime-path-linter.ts
 *   pnpm tsx tools/audit/runtime-path-linter.ts --strict
 *   pnpm tsx tools/audit/runtime-path-linter.ts --fix
 *   pnpm tsx tools/audit/runtime-path-linter.ts --format json
 *
 * @see tools/audit/policies/runtime-path-policy.yml
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as yaml from 'js-yaml';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

interface PolicyConfig {
  schema_version: string;
  canonical: CanonicalFile[];
  forbidden: ForbiddenPattern[];
  policy_pending: PolicyPendingItem[];
  allowed: AllowedPattern[];
  duplicate_rules: DuplicateRule[];
  strict_mode: StrictModeConfig;
  enforcement: EnforcementConfig;
  remediation: RemediationConfig;
  reporting: ReportingConfig;
}

interface CanonicalFile {
  path: string;
  description: string;
  referenced_by?: string[];
  generated_by?: string;
}

interface ForbiddenPattern {
  pattern: string;
  exceptions: string[];
  severity: 'error' | 'warning' | 'info';
  message: string;
  fix: string;
}

interface PolicyPendingItem {
  pattern: string;
  deadline: string;
  severity_local: 'error' | 'warning' | 'info';
  severity_ci: 'error' | 'warning' | 'info';
  reason: string;
  migration_target: string;
  tracking_issue?: string;
  responsible: string;
  message: string;
  fix: string;
}

interface AllowedPattern {
  pattern: string;
  description: string;
  exclude_patterns?: string[];
  gitignore_required?: boolean;
}

interface DuplicateRule {
  filename: string;
  max_copies: number;
  canonical_path: string;
  severity: 'error' | 'warning';
  message: string;
}

interface StrictModeConfig {
  enabled_by: string[];
  policy_pending_as_failure: boolean;
  warnings_as_failure: boolean;
  max_warnings: number;
  require_canonical_files: boolean;
  fail_on_duplicates: boolean;
  scan_gitignore: boolean;
  max_policy_pending_age_days: number;
}

interface EnforcementConfig {
  detection: {
    git_tracked: boolean;
    git_ignored: boolean;
    git_untracked: boolean;
    command: string;
  };
  exit_codes: Record<string, number>;
  output: {
    console: boolean;
    json_report: string;
    markdown_summary: string;
  };
}

interface RemediationConfig {
  autofix_enabled: boolean;
  dry_run_default: boolean;
  strategies: {
    move_to_artifacts?: {
      enabled: boolean;
      target_mapping: Record<string, string>;
    };
    delete_runtime_artifacts?: {
      enabled: boolean;
      patterns: string[];
    };
    update_gitignore?: {
      enabled: boolean;
      add_patterns: string[];
    };
  };
}

interface ReportingConfig {
  verbosity: Record<string, number>;
  group_by: string[];
  include_stats: boolean;
  stats: string[];
  pr_mode: {
    enabled: boolean;
    only_changed_files: boolean;
    git_diff_base: string;
  };
}

interface Violation {
  file: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  fix?: string;
  pattern?: string;
  deadline?: string;
}

interface LintStats {
  total_files_scanned: number;
  forbidden_violations: number;
  duplicate_violations: number;
  policy_pending_items: number;
  canonical_files_status: Record<string, boolean>;
  ignored_files_scanned: number;
  errors: number;
  warnings: number;
  infos: number;
}

interface LintResult {
  violations: Violation[];
  stats: LintStats;
  passed: boolean;
}

// -----------------------------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------------------------

const ROOT_DIR = process.cwd();
const POLICY_PATH = path.join(ROOT_DIR, 'tools/audit/policies/runtime-path-policy.yml');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// -----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * Load and parse YAML policy file
 */
function loadPolicy(): PolicyConfig {
  try {
    const content = fs.readFileSync(POLICY_PATH, 'utf8');
    return yaml.load(content) as PolicyConfig;
  } catch (error) {
    console.error(`${colors.red}Error loading policy file:${colors.reset}`, error);
    process.exit(4);
  }
}

/**
 * Convert glob pattern to regex
 */
function globToRegex(pattern: string): RegExp {
  let regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*')
    .replace(/\?/g, '[^/]');

  return new RegExp(`^${regex}$`);
}

/**
 * Check if file matches glob pattern
 */
function matchesPattern(file: string, pattern: string): boolean {
  const regex = globToRegex(pattern);
  const normalizedFile = file.replace(/\\/g, '/');
  return regex.test(normalizedFile);
}

/**
 * Check if strict mode is enabled
 */
function isStrictMode(policy: PolicyConfig, args: string[]): boolean {
  // Check command-line args
  if (args.includes('--strict')) return true;

  // Check environment variables
  for (const trigger of policy.strict_mode.enabled_by) {
    if (trigger === 'CI' && process.env.CI === 'true') return true;
    if (trigger === 'STRICT_VALIDATION' && process.env.STRICT_VALIDATION === 'true') return true;
    if (trigger === 'PRE_COMMIT_HOOK' && process.env.PRE_COMMIT_HOOK === 'true') return true;
  }

  return false;
}

/**
 * Get all tracked files
 */
function getTrackedFiles(): string[] {
  try {
    const output = execSync('git ls-files', { cwd: ROOT_DIR, encoding: 'utf8' });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get all ignored files (drift detection)
 */
function getIgnoredFiles(): string[] {
  try {
    const output = execSync('git ls-files -o -i --exclude-standard', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get all untracked files
 */
function getUntrackedFiles(): string[] {
  try {
    const output = execSync('git ls-files -o --exclude-standard', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get changed files in PR mode
 */
function getChangedFiles(base: string): string[] {
  try {
    const output = execSync(`git diff --name-only ${base}...HEAD`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Calculate days until deadline
 */
function daysUntilDeadline(deadline: string): number {
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const diffTime = deadlineDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// -----------------------------------------------------------------------------
// LINTER CORE
// -----------------------------------------------------------------------------

/**
 * Main linter class
 */
class RuntimePathLinter {
  private policy: PolicyConfig;
  private strict: boolean;
  private violations: Violation[] = [];
  private stats: LintStats = {
    total_files_scanned: 0,
    forbidden_violations: 0,
    duplicate_violations: 0,
    policy_pending_items: 0,
    canonical_files_status: {},
    ignored_files_scanned: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
  };

  constructor(policy: PolicyConfig, strict: boolean) {
    this.policy = policy;
    this.strict = strict;
  }

  /**
   * Run the linter
   */
  async run(args: string[]): Promise<LintResult> {
    console.log(`${colors.cyan}🔍 Runtime Artifact Path Linter${colors.reset}`);
    console.log(`${colors.gray}Policy: ${POLICY_PATH}${colors.reset}`);
    console.log(`${colors.gray}Mode: ${this.strict ? 'STRICT (CI)' : 'LOCAL'}${colors.reset}\n`);

    // Collect files to scan
    const files = this.collectFiles(args);
    this.stats.total_files_scanned = files.length;

    console.log(`Scanning ${files.length} files...\n`);

    // Run checks
    this.checkCanonicalFiles();
    this.checkDuplicates(files);
    this.checkForbiddenPaths(files);
    this.checkPolicyPending(files);

    // Aggregate stats
    this.aggregateStats();

    // Return result
    return {
      violations: this.violations,
      stats: this.stats,
      passed: this.isPassed(),
    };
  }

  /**
   * Collect files based on detection configuration
   */
  private collectFiles(args: string[]): string[] {
    const files = new Set<string>();

    // PR mode - only changed files
    if (this.policy.reporting.pr_mode.enabled && process.env.GITHUB_EVENT_NAME === 'pull_request') {
      const changedFiles = getChangedFiles(this.policy.reporting.pr_mode.git_diff_base);
      changedFiles.forEach((f) => files.add(f));
      console.log(`${colors.gray}PR mode: Scanning ${changedFiles.length} changed files${colors.reset}`);
    } else {
      // Full scan
      if (this.policy.enforcement.detection.git_tracked) {
        const tracked = getTrackedFiles();
        tracked.forEach((f) => files.add(f));
      }

      if (this.policy.enforcement.detection.git_ignored && this.strict) {
        const ignored = getIgnoredFiles();
        ignored.forEach((f) => files.add(f));
        this.stats.ignored_files_scanned = ignored.length;
      }

      if (this.policy.enforcement.detection.git_untracked) {
        const untracked = getUntrackedFiles();
        untracked.forEach((f) => files.add(f));
      }
    }

    return Array.from(files);
  }

  /**
   * Check that all canonical files exist and are unique
   */
  private checkCanonicalFiles(): void {
    for (const canonical of this.policy.canonical) {
      const exists = fs.existsSync(path.join(ROOT_DIR, canonical.path));
      this.stats.canonical_files_status[canonical.path] = exists;

      if (!exists && this.policy.strict_mode.require_canonical_files && this.strict) {
        this.violations.push({
          file: canonical.path,
          rule: 'canonical-missing',
          severity: 'error',
          message: `Canonical file missing: ${canonical.description}`,
          fix: 'Restore canonical file from backup or regenerate',
        });
      }
    }
  }

  /**
   * Check for duplicate canonical files
   */
  private checkDuplicates(files: string[]): void {
    for (const rule of this.policy.duplicate_rules) {
      const matches = files.filter((f) => {
        const basename = path.basename(f);
        return basename === rule.filename;
      });

      if (matches.length > rule.max_copies) {
        this.stats.duplicate_violations += matches.length - rule.max_copies;

        for (const file of matches) {
          if (file !== rule.canonical_path) {
            this.violations.push({
              file,
              rule: 'duplicate-violation',
              severity: rule.severity,
              message: rule.message,
              fix: `Delete duplicate - canonical copy is at ${rule.canonical_path}`,
            });
          }
        }
      }
    }
  }

  /**
   * Check for files in forbidden paths
   */
  private checkForbiddenPaths(files: string[]): void {
    for (const file of files) {
      const normalizedFile = file.replace(/\\/g, '/');

      for (const forbidden of this.policy.forbidden) {
        if (matchesPattern(normalizedFile, forbidden.pattern)) {
          // Check exceptions
          const isException = forbidden.exceptions.some((ex) => matchesPattern(normalizedFile, ex));
          if (isException) continue;

          this.stats.forbidden_violations++;
          this.violations.push({
            file,
            rule: 'forbidden-path',
            severity: forbidden.severity,
            message: forbidden.message,
            fix: forbidden.fix,
            pattern: forbidden.pattern,
          });
        }
      }
    }
  }

  /**
   * Check policy-pending items
   */
  private checkPolicyPending(files: string[]): void {
    for (const file of files) {
      const normalizedFile = file.replace(/\\/g, '/');

      for (const pending of this.policy.policy_pending) {
        if (matchesPattern(normalizedFile, pending.pattern)) {
          const daysLeft = daysUntilDeadline(pending.deadline);
          const isExpired = daysLeft <= 0;
          const isExpiringSoon = daysLeft <= 30 && daysLeft > 0;

          // Determine severity
          let severity = this.strict ? pending.severity_ci : pending.severity_local;

          // Override if expired
          if (isExpired && this.policy.strict_mode.policy_pending_as_failure && this.strict) {
            severity = 'error';
          }

          this.stats.policy_pending_items++;
          this.violations.push({
            file,
            rule: 'policy-pending',
            severity,
            message: `${pending.message} (Deadline: ${pending.deadline}, ${daysLeft} days ${isExpired ? 'OVERDUE' : 'remaining'})`,
            fix: pending.fix,
            pattern: pending.pattern,
            deadline: pending.deadline,
          });
        }
      }
    }
  }

  /**
   * Aggregate statistics
   */
  private aggregateStats(): void {
    for (const violation of this.violations) {
      if (violation.severity === 'error') this.stats.errors++;
      else if (violation.severity === 'warning') this.stats.warnings++;
      else if (violation.severity === 'info') this.stats.infos++;
    }
  }

  /**
   * Determine if linter passed
   */
  private isPassed(): boolean {
    if (this.stats.errors > 0) return false;

    if (this.strict) {
      if (this.policy.strict_mode.warnings_as_failure && this.stats.warnings > 0) return false;
      if (this.stats.warnings > this.policy.strict_mode.max_warnings) return false;
    }

    return true;
  }

  /**
   * Print results to console
   */
  printResults(): void {
    console.log('\n' + '='.repeat(80));
    console.log('RESULTS');
    console.log('='.repeat(80) + '\n');

    if (this.violations.length === 0) {
      console.log(`${colors.green}✓ No violations found!${colors.reset}\n`);
      this.printStats();
      return;
    }

    // Group violations by severity
    const grouped = {
      error: this.violations.filter((v) => v.severity === 'error'),
      warning: this.violations.filter((v) => v.severity === 'warning'),
      info: this.violations.filter((v) => v.severity === 'info'),
    };

    // Print errors
    if (grouped.error.length > 0) {
      console.log(`${colors.red}ERRORS (${grouped.error.length})${colors.reset}\n`);
      for (const violation of grouped.error) {
        this.printViolation(violation);
      }
      console.log('');
    }

    // Print warnings
    if (grouped.warning.length > 0) {
      console.log(`${colors.yellow}WARNINGS (${grouped.warning.length})${colors.reset}\n`);
      for (const violation of grouped.warning) {
        this.printViolation(violation);
      }
      console.log('');
    }

    // Print info
    if (grouped.info.length > 0 && process.argv.includes('--verbose')) {
      console.log(`${colors.blue}INFO (${grouped.info.length})${colors.reset}\n`);
      for (const violation of grouped.info) {
        this.printViolation(violation);
      }
      console.log('');
    }

    this.printStats();

    // Summary
    if (this.stats.errors > 0) {
      console.log(`${colors.red}✗ Linting failed with ${this.stats.errors} error(s)${colors.reset}\n`);
    } else if (this.stats.warnings > 0) {
      console.log(`${colors.yellow}⚠ Linting passed with ${this.stats.warnings} warning(s)${colors.reset}\n`);
    } else {
      console.log(`${colors.green}✓ Linting passed${colors.reset}\n`);
    }
  }

  /**
   * Print a single violation
   */
  private printViolation(violation: Violation): void {
    const icon = violation.severity === 'error' ? '✗' : violation.severity === 'warning' ? '⚠' : 'ℹ';
    const color =
      violation.severity === 'error'
        ? colors.red
        : violation.severity === 'warning'
          ? colors.yellow
          : colors.blue;

    console.log(`  ${color}${icon} ${violation.file}${colors.reset}`);
    console.log(`    ${colors.gray}[${violation.rule}]${colors.reset} ${violation.message}`);
    if (violation.fix) {
      console.log(`    ${colors.cyan}Fix:${colors.reset} ${violation.fix}`);
    }
  }

  /**
   * Print statistics
   */
  private printStats(): void {
    console.log('Statistics:');
    console.log(`  Files scanned: ${this.stats.total_files_scanned}`);
    if (this.stats.ignored_files_scanned > 0) {
      console.log(`  Ignored files scanned: ${this.stats.ignored_files_scanned}`);
    }
    console.log(`  Forbidden violations: ${this.stats.forbidden_violations}`);
    console.log(`  Duplicate violations: ${this.stats.duplicate_violations}`);
    console.log(`  Policy pending items: ${this.stats.policy_pending_items}`);
    console.log(`  Errors: ${colors.red}${this.stats.errors}${colors.reset}`);
    console.log(`  Warnings: ${colors.yellow}${this.stats.warnings}${colors.reset}`);
    console.log(`  Info: ${colors.blue}${this.stats.infos}${colors.reset}`);

    // Canonical files status
    const canonicalOk = Object.values(this.stats.canonical_files_status).every((v) => v === true);
    const statusColor = canonicalOk ? colors.green : colors.red;
    console.log(`  Canonical files: ${statusColor}${canonicalOk ? 'OK' : 'MISSING'}${colors.reset}`);
    console.log('');
  }

  /**
   * Write JSON report
   */
  async writeJsonReport(result: LintResult): Promise<void> {
    const reportPath = path.join(ROOT_DIR, this.policy.enforcement.output.json_report);
    await fs.promises.mkdir(path.dirname(reportPath), { recursive: true });

    const report = {
      meta: {
        generated_at: new Date().toISOString(),
        schema_version: this.policy.schema_version,
        mode: this.strict ? 'strict' : 'local',
        policy_file: POLICY_PATH,
      },
      result: {
        passed: result.passed,
        violations: result.violations,
        stats: result.stats,
      },
    };

    await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`${colors.gray}JSON report written to: ${reportPath}${colors.reset}`);
  }

  /**
   * Write markdown summary
   */
  async writeMarkdownSummary(result: LintResult): Promise<void> {
    const summaryPath = path.join(ROOT_DIR, this.policy.enforcement.output.markdown_summary);
    await fs.promises.mkdir(path.dirname(summaryPath), { recursive: true });

    const lines: string[] = [];
    lines.push('# Runtime Path Lint Report\n');
    lines.push(`**Generated:** ${new Date().toISOString()}  `);
    lines.push(`**Mode:** ${this.strict ? 'STRICT (CI)' : 'LOCAL'}  `);
    lines.push(`**Status:** ${result.passed ? '✓ PASSED' : '✗ FAILED'}  \n`);

    lines.push('## Summary\n');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Files Scanned | ${result.stats.total_files_scanned} |`);
    lines.push(`| Errors | ${result.stats.errors} |`);
    lines.push(`| Warnings | ${result.stats.warnings} |`);
    lines.push(`| Info | ${result.stats.infos} |`);
    lines.push(`| Forbidden Violations | ${result.stats.forbidden_violations} |`);
    lines.push(`| Duplicate Violations | ${result.stats.duplicate_violations} |`);
    lines.push(`| Policy Pending | ${result.stats.policy_pending_items} |\n`);

    if (result.violations.length > 0) {
      lines.push('## Violations\n');

      const grouped = {
        error: result.violations.filter((v) => v.severity === 'error'),
        warning: result.violations.filter((v) => v.severity === 'warning'),
        info: result.violations.filter((v) => v.severity === 'info'),
      };

      if (grouped.error.length > 0) {
        lines.push('### Errors\n');
        for (const v of grouped.error) {
          lines.push(`- **${v.file}**`);
          lines.push(`  - Rule: \`${v.rule}\``);
          lines.push(`  - Message: ${v.message}`);
          if (v.fix) lines.push(`  - Fix: ${v.fix}`);
          lines.push('');
        }
      }

      if (grouped.warning.length > 0) {
        lines.push('### Warnings\n');
        for (const v of grouped.warning) {
          lines.push(`- **${v.file}**`);
          lines.push(`  - Rule: \`${v.rule}\``);
          lines.push(`  - Message: ${v.message}`);
          if (v.fix) lines.push(`  - Fix: ${v.fix}`);
          lines.push('');
        }
      }
    }

    await fs.promises.writeFile(summaryPath, lines.join('\n'));
    console.log(`${colors.gray}Markdown summary written to: ${summaryPath}${colors.reset}\n`);
  }
}

// -----------------------------------------------------------------------------
// CLI ENTRY POINT
// -----------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  // Load policy
  const policy = loadPolicy();

  // Determine mode
  const strict = isStrictMode(policy, args);

  // Create linter
  const linter = new RuntimePathLinter(policy, strict);

  // Run linter
  const result = await linter.run(args);

  // Print results
  linter.printResults();

  // Write reports
  if (args.includes('--format=json') || args.includes('--format=all')) {
    await linter.writeJsonReport(result);
  }

  if (args.includes('--format=markdown') || args.includes('--format=all')) {
    await linter.writeMarkdownSummary(result);
  }

  // Exit with appropriate code
  if (!result.passed) {
    if (result.stats.errors > 0) {
      process.exit(policy.enforcement.exit_codes.forbidden_violation);
    } else if (result.stats.duplicate_violations > 0) {
      process.exit(policy.enforcement.exit_codes.duplicate_violation);
    } else {
      process.exit(policy.enforcement.exit_codes.policy_pending_strict);
    }
  }

  process.exit(policy.enforcement.exit_codes.success);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(4);
  });
}

// Export for testing
export { RuntimePathLinter, loadPolicy, globToRegex, matchesPattern };
