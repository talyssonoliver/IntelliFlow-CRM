import { extname, isAbsolute, relative, resolve } from 'node:path';
import type { CoverageMetrics } from './types';

export interface CoverageMetricValue {
  total: number;
  covered: number;
  skipped?: number;
  pct: number;
}

export interface FileCoverage {
  lines: CoverageMetricValue;
  branches: CoverageMetricValue;
  functions: CoverageMetricValue;
  statements: CoverageMetricValue;
}

export interface RawCoverageSummary {
  total?: FileCoverage;
  [filePath: string]: FileCoverage | undefined;
}

export interface CoverageThresholds {
  lines: number;
  branches: number;
  functions: number;
  statements: number;
}

export interface CoverageKpiSnapshot {
  kpi: string;
  target: string;
  actual: string;
  met: boolean;
}

export const DEFAULT_COVERAGE_THRESHOLDS: CoverageThresholds = {
  lines: 80,
  branches: 80,
  functions: 80,
  statements: 80,
};

const COVERAGE_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function normalizePath(value: string): string {
  return value
    .replaceAll('\\', '/')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();
}

/** Returns true for Windows-style absolute paths (e.g. "C:/foo" or "C:\\foo").
 *  On Linux, `path.isAbsolute` returns false for these, which breaks path
 *  resolution when coverage keys were emitted on Windows. */
function isWindowsAbsolutePath(filePath: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(filePath);
}

function resolveAbsolutePath(repoRoot: string, filePath: string): string {
  // If the platform considers it absolute, use resolve() normally.
  // If it's a Windows-style absolute path on a non-Windows host, keep it
  // as-is after normalization so coverage-key matching remains consistent.
  if (isAbsolute(filePath) || isWindowsAbsolutePath(filePath)) {
    return normalizePath(filePath);
  }
  // Relative artifact path: anchor to repoRoot.
  if (isAbsolute(repoRoot) || isWindowsAbsolutePath(repoRoot)) {
    return normalizePath(repoRoot + '/' + filePath);
  }
  return normalizePath(resolve(repoRoot, filePath));
}

function resolveRelativePath(repoRoot: string, filePath: string): string {
  const normalRoot = normalizePath(
    isAbsolute(repoRoot) || isWindowsAbsolutePath(repoRoot) ? repoRoot : resolve(repoRoot)
  );
  const normalFile = resolveAbsolutePath(repoRoot, filePath);

  // Strip the root prefix (with or without trailing slash).
  const prefix = normalRoot.endsWith('/') ? normalRoot : normalRoot + '/';
  if (normalFile.startsWith(prefix)) {
    return normalFile.slice(prefix.length);
  }

  // Fallback: let the platform handle it (both paths are native-absolute).
  if (isAbsolute(repoRoot) && isAbsolute(filePath)) {
    return normalizePath(relative(repoRoot, filePath));
  }
  return normalFile;
}

function inferCoverageMetric(kpiName: string): keyof CoverageThresholds | null {
  const normalized = kpiName.trim().toLowerCase();
  if (normalized.includes('branch')) return 'branches';
  if (normalized.includes('statement')) return 'statements';
  if (normalized.includes('function')) return 'functions';
  if (normalized.includes('line')) return 'lines';
  return null;
}

export function parsePercentage(value: string | undefined): number | null {
  if (!value) return null;
  const match = /(\d+(?:\.\d+)?)\s*%/.exec(value);
  if (!match) return null;
  return Number.parseFloat(match[1]);
}

export function extractCoverageThresholdsFromKpis(
  kpis: readonly CoverageKpiSnapshot[] | null | undefined
): CoverageThresholds {
  const thresholds = { ...DEFAULT_COVERAGE_THRESHOLDS };

  // Guard against malformed attestations (object-shaped kpi_results instead of array).
  const iterable = Array.isArray(kpis) ? kpis : [];
  for (const kpi of iterable) {
    const metric = inferCoverageMetric(kpi.kpi);
    const target = parsePercentage(kpi.target);
    if (metric && target !== null) {
      thresholds[metric] = target;
    }
  }

  return thresholds;
}

export function extractArtifactTagPaths(rawArtifacts: string | undefined): string[] {
  if (!rawArtifacts) return [];

  return rawArtifacts
    .split(';')
    .map((item) => item.trim())
    .filter((item) => item.startsWith('ARTIFACT:'))
    .map((item) => item.slice('ARTIFACT:'.length).trim())
    .filter(Boolean);
}

export function isCoverageEligibleArtifactPath(filePath: string): boolean {
  const normalized = normalizePath(filePath.trim());
  if (!normalized) return false;

  if (
    normalized.includes('/__tests__/') ||
    normalized.includes('/__mocks__/') ||
    /\.test\.[a-z0-9]+$/i.test(normalized) ||
    /\.spec\.[a-z0-9]+$/i.test(normalized)
  ) {
    return false;
  }

  return COVERAGE_SOURCE_EXTENSIONS.has(extname(normalized));
}

export function collectScopedCoverageArtifacts(
  declaredArtifacts: readonly string[] = [],
  attestedArtifacts: readonly string[] = []
): string[] {
  return [...new Set([...declaredArtifacts, ...attestedArtifacts])]
    .map((filePath) => filePath.trim())
    .filter(isCoverageEligibleArtifactPath);
}

export function buildCoverageMetrics(
  coverage: FileCoverage,
  thresholds: CoverageThresholds,
  scope?: CoverageMetrics['scope']
): CoverageMetrics {
  return {
    lines: {
      pct: coverage.lines?.pct ?? 0,
      covered: coverage.lines?.covered ?? 0,
      total: coverage.lines?.total ?? 0,
      met: (coverage.lines?.pct ?? 0) >= thresholds.lines,
    },
    branches: {
      pct: coverage.branches?.pct ?? 0,
      covered: coverage.branches?.covered ?? 0,
      total: coverage.branches?.total ?? 0,
      met: (coverage.branches?.pct ?? 0) >= thresholds.branches,
    },
    functions: {
      pct: coverage.functions?.pct ?? 0,
      covered: coverage.functions?.covered ?? 0,
      total: coverage.functions?.total ?? 0,
      met: (coverage.functions?.pct ?? 0) >= thresholds.functions,
    },
    statements: coverage.statements
      ? {
          pct: coverage.statements.pct ?? 0,
          covered: coverage.statements.covered ?? 0,
          total: coverage.statements.total ?? 0,
          met: (coverage.statements.pct ?? 0) >= thresholds.statements,
        }
      : undefined,
    overall: {
      pct: coverage.lines?.pct ?? 0,
      met: (coverage.lines?.pct ?? 0) >= thresholds.lines,
    },
    scope,
  };
}

export function selectTaskScopedCoverage(
  coverageSummary: RawCoverageSummary,
  options: {
    repoRoot: string;
    declaredArtifacts?: readonly string[];
    attestedArtifacts?: readonly string[];
    thresholds?: CoverageThresholds;
  }
): CoverageMetrics | null {
  const scopedArtifacts = collectScopedCoverageArtifacts(
    options.declaredArtifacts,
    options.attestedArtifacts
  );

  if (scopedArtifacts.length === 0) {
    return null;
  }

  const absoluteScopePaths = new Set(
    scopedArtifacts.map((filePath) => resolveAbsolutePath(options.repoRoot, filePath))
  );
  const relativeScopePaths = new Set(
    scopedArtifacts.map((filePath) => resolveRelativePath(options.repoRoot, filePath))
  );

  const aggregated = {
    lines: { total: 0, covered: 0 },
    branches: { total: 0, covered: 0 },
    functions: { total: 0, covered: 0 },
    statements: { total: 0, covered: 0 },
  };

  let matchedFiles = 0;

  for (const [filePath, fileCoverage] of Object.entries(coverageSummary)) {
    if (filePath === 'total' || !fileCoverage) continue;

    const absoluteCoveragePath = resolveAbsolutePath(options.repoRoot, filePath);
    const relativeCoveragePath = resolveRelativePath(options.repoRoot, filePath);
    const matchesScope =
      absoluteScopePaths.has(absoluteCoveragePath) || relativeScopePaths.has(relativeCoveragePath);

    if (!matchesScope) continue;

    matchedFiles++;
    aggregated.lines.total += fileCoverage.lines?.total ?? 0;
    aggregated.lines.covered += fileCoverage.lines?.covered ?? 0;
    aggregated.branches.total += fileCoverage.branches?.total ?? 0;
    aggregated.branches.covered += fileCoverage.branches?.covered ?? 0;
    aggregated.functions.total += fileCoverage.functions?.total ?? 0;
    aggregated.functions.covered += fileCoverage.functions?.covered ?? 0;
    aggregated.statements.total += fileCoverage.statements?.total ?? 0;
    aggregated.statements.covered += fileCoverage.statements?.covered ?? 0;
  }

  if (matchedFiles === 0) {
    return null;
  }

  const calcPct = (covered: number, total: number) =>
    total > 0 ? Math.round((covered / total) * 10000) / 100 : 0;

  return buildCoverageMetrics(
    {
      lines: {
        total: aggregated.lines.total,
        covered: aggregated.lines.covered,
        pct: calcPct(aggregated.lines.covered, aggregated.lines.total),
      },
      branches: {
        total: aggregated.branches.total,
        covered: aggregated.branches.covered,
        pct: calcPct(aggregated.branches.covered, aggregated.branches.total),
      },
      functions: {
        total: aggregated.functions.total,
        covered: aggregated.functions.covered,
        pct: calcPct(aggregated.functions.covered, aggregated.functions.total),
      },
      statements: {
        total: aggregated.statements.total,
        covered: aggregated.statements.covered,
        pct: calcPct(aggregated.statements.covered, aggregated.statements.total),
      },
    },
    options.thresholds ?? DEFAULT_COVERAGE_THRESHOLDS,
    {
      source: 'task-files',
      matchedFiles,
      requestedFiles: scopedArtifacts.length,
    }
  );
}

export function buildCoverageMetricsFromAttestedKpis(
  kpis: readonly CoverageKpiSnapshot[] | null | undefined,
  thresholds: CoverageThresholds = DEFAULT_COVERAGE_THRESHOLDS
): CoverageMetrics | null {
  const metrics = new Map<keyof CoverageThresholds, CoverageKpiSnapshot>();

  // Guard against malformed attestations (object-shaped kpi_results instead of array).
  const iterable = Array.isArray(kpis) ? kpis : [];
  for (const kpi of iterable) {
    const metric = inferCoverageMetric(kpi.kpi);
    if (metric) {
      metrics.set(metric, kpi);
    }
  }

  if (metrics.size === 0) {
    return null;
  }

  const lines = metrics.get('lines');
  const branches = metrics.get('branches');
  const functions = metrics.get('functions');
  const statements = metrics.get('statements');

  const buildMetric = (
    metric: CoverageKpiSnapshot | undefined,
    threshold: number
  ): CoverageMetrics['lines'] => {
    const pct = parsePercentage(metric?.actual) ?? 0;
    return {
      pct,
      covered: 0,
      total: 0,
      met: metric?.met ?? pct >= threshold,
    };
  };

  return {
    lines: buildMetric(lines, thresholds.lines),
    branches: buildMetric(branches, thresholds.branches),
    functions: buildMetric(functions, thresholds.functions),
    statements: statements ? buildMetric(statements, thresholds.statements) : undefined,
    overall: {
      pct:
        parsePercentage(lines?.actual) ??
        parsePercentage(statements?.actual) ??
        parsePercentage(branches?.actual) ??
        parsePercentage(functions?.actual) ??
        0,
      met: lines?.met ?? statements?.met ?? branches?.met ?? functions?.met ?? false,
    },
    scope: {
      source: 'attestation-kpis',
    },
  };
}
