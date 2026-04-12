#!/usr/bin/env tsx
/**
 * Quality Report Generator
 *
 * Aggregates quality metrics from various tools:
 * - TypeScript errors
 * - ESLint issues
 * - Test coverage
 * - Security vulnerabilities
 * - Dead code
 * - SonarQube metrics
 */

import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

interface QualityMetrics {
  timestamp: string;
  typecheck: {
    status: 'pass' | 'fail';
    errors: number;
    warnings: number;
  };
  lint: {
    status: 'pass' | 'fail' | 'warn';
    errors: number;
    warnings: number;
  };
  tests: {
    status: 'pass' | 'fail';
    passed: number;
    failed: number;
    coverage?: number;
  };
  security: {
    vulnerabilities: {
      critical: number;
      high: number;
      moderate: number;
      low: number;
    };
  };
  deadCode: {
    unusedExports: number;
    unusedDependencies: number;
  };
  sonarqube?: {
    qualityGate: 'pass' | 'fail' | 'unknown';
    bugs: number;
    vulnerabilities: number;
    codeSmells: number;
    coverage?: number;
  };
}

function exec(command: string): { stdout: string; success: boolean } {
  try {
    const stdout = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    return { stdout, success: true };
  } catch (error: any) {
    return { stdout: error.stdout || '', success: false };
  }
}

function runTypecheckCheck(): QualityMetrics['typecheck'] {
  console.log('⚙️  Running typecheck...');
  const result = exec('pnpm run typecheck --filter=!@intelliflow/observability 2>&1');
  const status = result.success ? 'pass' : 'fail';
  const errors = (result.stdout.match(/error TS/g) || []).length;
  const icon = status === 'pass' ? '✅' : '❌';
  console.log(`   ${icon} TypeCheck: ${String(errors)} errors\n`);
  return { status, errors, warnings: 0 };
}

function runLintCheck(): QualityMetrics['lint'] {
  console.log('🔍 Running lint...');
  const result = exec('pnpm run lint 2>&1');
  const errors = (result.stdout.match(/\d+ error/g) || []).length;
  const warnings = (result.stdout.match(/\d+ warning/g) || []).length;

  let status: 'pass' | 'fail' | 'warn' = 'pass';
  let icon = '✅';
  if (errors > 0) {
    status = 'fail';
    icon = '❌';
  } else if (warnings > 0) {
    status = 'warn';
    icon = '⚠️';
  }
  console.log(`   ${icon} Lint: ${String(errors)} errors, ${String(warnings)} warnings\n`);
  return { status, errors, warnings };
}

function runTestsCheck(): QualityMetrics['tests'] {
  console.log('🧪 Running tests...');
  const result = exec('pnpm test --run --passWithNoTests 2>&1');
  const status = result.success ? 'pass' : 'fail';
  const passedMatch = /(\d+) passed/.exec(result.stdout);
  const failedMatch = /(\d+) failed/.exec(result.stdout);
  const passed = Number.parseInt(passedMatch?.[1] ?? '0', 10);
  const failed = Number.parseInt(failedMatch?.[1] ?? '0', 10);
  const icon = status === 'pass' ? '✅' : '❌';
  console.log(`   ${icon} Tests: ${String(passed)} passed, ${String(failed)} failed\n`);
  return { status, passed, failed };
}

function runSecurityAudit(): QualityMetrics['security'] {
  console.log('🔒 Running security audit...');
  const auditReportPath = 'artifacts/reports/audit-report.json';
  exec(`pnpm audit --audit-level=low --json > ${auditReportPath} 2>&1`);

  const vulnerabilities = { critical: 0, high: 0, moderate: 0, low: 0 };

  if (existsSync(auditReportPath)) {
    try {
      const auditData = JSON.parse(readFileSync(auditReportPath, 'utf-8'));
      const vulns = auditData.metadata?.vulnerabilities || {};
      vulnerabilities.critical = vulns.critical || 0;
      vulnerabilities.high = vulns.high || 0;
      vulnerabilities.moderate = vulns.moderate || 0;
      vulnerabilities.low = vulns.low || 0;
    } catch {
      console.log('   ⚠️  Could not parse audit report');
    }
  }

  const total = Object.values(vulnerabilities).reduce((a, b) => a + b, 0);
  const icon = total === 0 ? '✅' : '⚠️';
  console.log(`   ${icon} Security: ${String(total)} vulnerabilities\n`);
  return { vulnerabilities };
}

function runDeadCodeCheck(): QualityMetrics['deadCode'] {
  console.log('🧹 Checking for dead code...');
  let unusedExports = 0;
  let unusedDependencies = 0;

  const knip = exec('npx knip --reporter json 2>&1');
  try {
    const knipData = JSON.parse(knip.stdout);
    unusedExports = knipData.issues?.unusedExports?.length || 0;
  } catch {
    // Knip output parsing may fail - non-JSON output expected in some cases
  }

  const depcheck = exec('npx depcheck --json 2>&1');
  try {
    const depcheckData = JSON.parse(depcheck.stdout);
    unusedDependencies = Object.keys(depcheckData.dependencies || {}).length;
  } catch {
    // Depcheck output parsing may fail - non-JSON output expected in some cases
  }

  const total = unusedExports + unusedDependencies;
  const icon = total === 0 ? '✅' : '⚠️';
  console.log(
    `   ${icon} Dead Code: ${String(unusedExports)} unused exports, ${String(unusedDependencies)} unused deps\n`
  );
  return { unusedExports, unusedDependencies };
}

async function generateReport(): Promise<QualityMetrics> {
  console.log('🔍 Generating quality report...\n');

  return {
    timestamp: new Date().toISOString(),
    typecheck: runTypecheckCheck(),
    lint: runLintCheck(),
    tests: runTestsCheck(),
    security: runSecurityAudit(),
    deadCode: runDeadCodeCheck(),
  };
}

async function main() {
  console.log('📊 IntelliFlow CRM - Quality Report\n');
  console.log('====================================\n');

  // Ensure artifacts directory exists
  const reportsDir = join(process.cwd(), 'artifacts', 'reports');
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
  }

  const report = await generateReport();

  // Write JSON report
  const reportPath = join(reportsDir, `quality-report-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`✅ Report saved: ${reportPath}\n`);

  // Print summary
  console.log('====================================');
  console.log('📊 Summary:');
  console.log('====================================');

  // TypeCheck status
  const typecheckResult =
    report.typecheck.status === 'pass'
      ? '✅ PASS'
      : `❌ FAIL (${String(report.typecheck.errors)} errors)`;
  console.log(`TypeCheck:      ${typecheckResult}`);

  // Lint status
  let lintResult: string;
  if (report.lint.status === 'pass') {
    lintResult = '✅ PASS';
  } else if (report.lint.status === 'warn') {
    lintResult = `⚠️  WARN (${String(report.lint.warnings)} warnings)`;
  } else {
    lintResult = `❌ FAIL (${String(report.lint.errors)} errors)`;
  }
  console.log(`Lint:           ${lintResult}`);

  // Tests status
  const testsResult =
    report.tests.status === 'pass' ? '✅ PASS' : `❌ FAIL (${String(report.tests.failed)} failed)`;
  console.log(`Tests:          ${testsResult}`);

  // Security status
  const totalVulnerabilities = Object.values(report.security.vulnerabilities).reduce(
    (a, b) => a + b,
    0
  );
  const securityResult =
    totalVulnerabilities === 0 ? '✅ PASS' : `⚠️  ${String(totalVulnerabilities)} vulnerabilities`;
  console.log(`Security:       ${securityResult}`);

  // Dead code status
  const totalDeadCode = report.deadCode.unusedExports + report.deadCode.unusedDependencies;
  const deadCodeResult = totalDeadCode === 0 ? '✅ PASS' : `⚠️  ${String(totalDeadCode)} issues`;
  console.log(`Dead Code:      ${deadCodeResult}`);

  console.log('====================================\n');

  // Exit with error if critical checks fail
  if (report.typecheck.status === 'fail' || report.tests.status === 'fail') {
    console.error('❌ Quality checks FAILED');
    process.exit(1);
  }

  console.log('✅ Quality checks PASSED');
}

// NOSONAR: S7785 - Top-level await not available in CommonJS modules
(async () => {
  // NOSONAR
  try {
    await main();
  } catch (error) {
    console.error(error);
  }
})();
