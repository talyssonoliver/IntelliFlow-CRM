#!/usr/bin/env tsx
/**
 * Unified security audit report generator.
 *
 * Runs `pnpm audit --json` and emits both CSV and JSON reports under
 * `artifacts/reports/security/audit-YYYY-MM-DD.{csv,json}`.
 *
 * Report schema is SOC 2 / ISO 27001 friendly: each row is one finding with
 * category, severity, affected asset, CVE, patched_versions, dep path, and
 * remediation recommendation. Non-zero exit code if any critical/high
 * findings remain.
 *
 * Usage:
 *   pnpm audit:report              # generate dated reports
 *   pnpm audit:report --fail-on=critical   # only fail on critical
 *   pnpm audit:report --fail-on=high       # fail on high or critical (default)
 *   pnpm audit:report --fail-on=none       # never fail (report only)
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

interface PnpmAdvisoryFinding {
  version: string;
  paths: string[];
}

interface PnpmAdvisory {
  id: number;
  module_name: string;
  severity: Severity;
  title: string;
  url: string;
  cves: string[];
  vulnerable_versions: string;
  patched_versions: string;
  recommendation: string;
  findings: PnpmAdvisoryFinding[];
  cwe?: string[];
  cvss?: { score: number; vectorString: string | null };
}

interface PnpmAuditOutput {
  advisories: Record<string, PnpmAdvisory>;
  metadata: {
    vulnerabilities: Record<Severity, number>;
    dependencies: number;
    totalDependencies: number;
  };
}

interface Finding {
  category: 'dependency-cve';
  severity: Severity;
  module: string;
  vulnerable_range: string;
  patched_range: string;
  cves: string;
  cwe: string;
  cvss_score: number | null;
  dep_paths: string[];
  title: string;
  remediation: string;
  advisory_url: string;
  advisory_id: number;
}

interface Report {
  generated_at: string;
  project: string;
  source: 'pnpm audit';
  summary: {
    total_dependencies: number;
    vulnerabilities: Record<Severity, number>;
    total_findings: number;
  };
  findings: Finding[];
}

function runPnpmAudit(): PnpmAuditOutput {
  try {
    const stdout = execSync('pnpm audit --json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout) as PnpmAuditOutput;
  } catch (err: unknown) {
    // pnpm audit exits non-zero when vulnerabilities are found; stdout still holds JSON
    const e = err as { stdout?: string | Buffer };
    if (e.stdout) {
      const text = typeof e.stdout === 'string' ? e.stdout : e.stdout.toString('utf8');
      return JSON.parse(text) as PnpmAuditOutput;
    }
    throw err;
  }
}

function toFindings(audit: PnpmAuditOutput): Finding[] {
  const advisories = Object.values(audit.advisories ?? {});
  return advisories.map((a) => ({
    category: 'dependency-cve',
    severity: a.severity,
    module: a.module_name,
    vulnerable_range: a.vulnerable_versions,
    patched_range: a.patched_versions,
    cves: (a.cves ?? []).join('; '),
    cwe: (a.cwe ?? []).join('; '),
    cvss_score: a.cvss?.score ?? null,
    dep_paths: (a.findings ?? []).flatMap((f) => f.paths ?? []),
    title: a.title,
    remediation: a.recommendation,
    advisory_url: a.url,
    advisory_id: a.id,
  }));
}

function csvEscape(value: unknown): string {
  if (value == null) return '';
  const s = Array.isArray(value) ? value.join('|') : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(findings: Finding[]): string {
  const header = [
    'severity',
    'module',
    'vulnerable_range',
    'patched_range',
    'cves',
    'cwe',
    'cvss_score',
    'title',
    'remediation',
    'advisory_url',
    'advisory_id',
    'dep_paths',
  ];
  const rows = findings.map((f) =>
    [
      f.severity,
      f.module,
      f.vulnerable_range,
      f.patched_range,
      f.cves,
      f.cwe,
      f.cvss_score,
      f.title,
      f.remediation,
      f.advisory_url,
      f.advisory_id,
      f.dep_paths,
    ]
      .map(csvEscape)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n') + '\n';
}

function sortFindings(findings: Finding[]): Finding[] {
  const order: Record<Severity, number> = {
    critical: 0,
    high: 1,
    moderate: 2,
    low: 3,
    info: 4,
  };
  return [...findings].sort((a, b) => {
    const s = order[a.severity] - order[b.severity];
    if (s !== 0) return s;
    return a.module.localeCompare(b.module);
  });
}

function parseFailOn(argv: string[]): Severity | 'none' {
  const arg = argv.find((a) => a.startsWith('--fail-on='));
  if (!arg) return 'high';
  const v = arg.slice('--fail-on='.length) as Severity | 'none';
  const valid: Array<Severity | 'none'> = ['none', 'low', 'moderate', 'high', 'critical'];
  if (!valid.includes(v)) {
    console.error(`Invalid --fail-on value: ${v}. Expected one of ${valid.join(', ')}`);
    process.exit(2);
  }
  return v;
}

function main(): void {
  const failOn = parseFailOn(process.argv.slice(2));
  console.log('🔎 Running pnpm audit…');
  const audit = runPnpmAudit();
  const findings = sortFindings(toFindings(audit));

  const report: Report = {
    generated_at: new Date().toISOString(),
    project: 'intelliflow-crm',
    source: 'pnpm audit',
    summary: {
      total_dependencies: audit.metadata?.totalDependencies ?? 0,
      vulnerabilities: audit.metadata?.vulnerabilities ?? {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
      },
      total_findings: findings.length,
    },
    findings,
  };

  const date = new Date().toISOString().slice(0, 10);
  const outDir = resolve(process.cwd(), 'artifacts', 'reports', 'security');
  const jsonPath = resolve(outDir, `audit-${date}.json`);
  const csvPath = resolve(outDir, `audit-${date}.csv`);
  const latestJson = resolve(outDir, 'audit-latest.json');
  const latestCsv = resolve(outDir, 'audit-latest.csv');

  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(csvPath, toCsv(findings));
  writeFileSync(latestJson, JSON.stringify(report, null, 2));
  writeFileSync(latestCsv, toCsv(findings));

  const v = report.summary.vulnerabilities;
  console.log('');
  console.log('📊 Audit summary');
  console.log(`   critical: ${v.critical}`);
  console.log(`   high:     ${v.high}`);
  console.log(`   moderate: ${v.moderate}`);
  console.log(`   low:      ${v.low}`);
  console.log(`   total findings: ${findings.length}`);
  console.log('');
  console.log(`📝 Report written:`);
  console.log(`   ${jsonPath}`);
  console.log(`   ${csvPath}`);
  console.log(`   (symlink copies at audit-latest.*)`);

  if (failOn === 'none') process.exit(0);
  const severityRank: Record<Severity, number> = {
    critical: 4,
    high: 3,
    moderate: 2,
    low: 1,
    info: 0,
  };
  const threshold = severityRank[failOn];
  const blockingCount = findings.filter((f) => severityRank[f.severity] >= threshold).length;
  if (blockingCount > 0) {
    console.error('');
    console.error(`❌ ${blockingCount} finding(s) at severity >= ${failOn}`);
    process.exit(1);
  }
  console.log('');
  console.log(`✅ No findings at severity >= ${failOn}`);
}

main();
