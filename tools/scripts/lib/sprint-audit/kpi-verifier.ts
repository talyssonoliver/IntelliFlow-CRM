/**
 * KPI Verification Module
 *
 * Parses KPI strings from Sprint_plan.csv and attempts to measure
 * actual values against targets.
 *
 * @module tools/scripts/lib/sprint-audit/kpi-verifier
 */

import { spawn } from 'child_process';
import type { KpiResult, ParsedKpi, KpiOperator } from './types';

// =============================================================================
// KPI Parsing
// =============================================================================

/**
 * Common KPI patterns and their extraction regex
 */
const KPI_PATTERNS: Array<{
  pattern: RegExp;
  extract: (match: RegExpExecArray) => Partial<ParsedKpi>;
}> = [
  // Coverage >90%, Coverage ≥90%, Coverage >= 90%
  {
    pattern: /(?:test\s+)?coverage\s*([><=!]+)\s*(\d+(?:\.\d+)?)\s*%/i,
    extract: (m) => ({
      metric: 'coverage',
      operator: normalizeOperator(m[1]),
      target: parseFloat(m[2]),
      unit: '%',
      measureCommand: 'pnpm test:coverage',
    }),
  },
  // Response <200ms, Latency <100ms
  {
    pattern: /(?:response|latency)\s*(?:time)?\s*([><=!]+)\s*(\d+(?:\.\d+)?)\s*(ms|s|sec)/i,
    extract: (m) => ({
      metric: 'response_time',
      operator: normalizeOperator(m[1]),
      target: parseFloat(m[2]),
      unit: m[3].toLowerCase(),
      measureCommand: null, // Manual or benchmark
    }),
  },
  // Load time <1s, First Contentful Paint <1s
  {
    pattern: /(?:load\s+time|fcp|lcp|first\s+contentful\s+paint)\s*([><=!]+)\s*(\d+(?:\.\d+)?)\s*(ms|s|sec)/i,
    extract: (m) => ({
      metric: 'load_time',
      operator: normalizeOperator(m[1]),
      target: parseFloat(m[2]),
      unit: m[3].toLowerCase(),
      measureCommand: null,
    }),
  },
  // Build time <3min, Build <180s
  {
    pattern: /(?:build\s+time|build)\s*([><=!]+)\s*(\d+(?:\.\d+)?)\s*(min|minutes?|s|sec)/i,
    extract: (m) => ({
      metric: 'build_time',
      operator: normalizeOperator(m[1]),
      target: parseFloat(m[2]),
      unit: m[3].toLowerCase(),
      measureCommand: 'pnpm build',
    }),
  },
  // Lighthouse >90, Lighthouse score ≥90
  {
    pattern: /lighthouse\s*(?:score)?\s*([><=!]+)\s*(\d+)/i,
    extract: (m) => ({
      metric: 'lighthouse',
      operator: normalizeOperator(m[1]),
      target: parseFloat(m[2]),
      unit: null,
      measureCommand: null, // Manual Lighthouse run
    }),
  },
  // Type errors = 0, Zero type errors
  {
    pattern: /(?:type\s+errors?|typescript\s+errors?)\s*([><=!]+|=)\s*(\d+)/i,
    extract: (m) => ({
      metric: 'type_errors',
      operator: normalizeOperator(m[1]),
      target: parseFloat(m[2]),
      unit: null,
      measureCommand: 'pnpm typecheck',
    }),
  },
  // Zero type errors (alternate form)
  {
    pattern: /zero\s+(?:type\s+)?errors?/i,
    extract: () => ({
      metric: 'type_errors',
      operator: '=',
      target: 0,
      unit: null,
      measureCommand: 'pnpm typecheck',
    }),
  },
  // Lint errors = 0
  {
    pattern: /(?:lint\s+errors?|eslint\s+errors?)\s*([><=!]+|=)\s*(\d+)/i,
    extract: (m) => ({
      metric: 'lint_errors',
      operator: normalizeOperator(m[1]),
      target: parseFloat(m[2]),
      unit: null,
      measureCommand: 'pnpm lint',
    }),
  },
  // Setup time <10 minutes
  {
    pattern: /(?:setup\s+time|setup)\s*([><=!]+)\s*(\d+(?:\.\d+)?)\s*(min|minutes?|s|sec)/i,
    extract: (m) => ({
      metric: 'setup_time',
      operator: normalizeOperator(m[1]),
      target: parseFloat(m[2]),
      unit: m[3].toLowerCase(),
      measureCommand: null,
    }),
  },
  // API calls <N
  {
    pattern: /(?:api\s+)?calls?\s*([><=!]+)\s*(\d+)/i,
    extract: (m) => ({
      metric: 'api_calls',
      operator: normalizeOperator(m[1]),
      target: parseFloat(m[2]),
      unit: null,
      measureCommand: null,
    }),
  },
  // Uptime >99.9%
  {
    pattern: /uptime\s*([><=!]+)\s*(\d+(?:\.\d+)?)\s*%/i,
    extract: (m) => ({
      metric: 'uptime',
      operator: normalizeOperator(m[1]),
      target: parseFloat(m[2]),
      unit: '%',
      measureCommand: null,
    }),
  },
  // Generic percentage: X >90%
  {
    pattern: /(\w+(?:\s+\w+)?)\s*([><=!]+)\s*(\d+(?:\.\d+)?)\s*%/i,
    extract: (m) => ({
      metric: m[1].toLowerCase().replace(/\s+/g, '_'),
      operator: normalizeOperator(m[2]),
      target: parseFloat(m[3]),
      unit: '%',
      measureCommand: null,
    }),
  },
  // Generic numeric: X <100
  {
    pattern: /(\w+(?:\s+\w+)?)\s*([><=!]+)\s*(\d+(?:\.\d+)?)\s*$/i,
    extract: (m) => ({
      metric: m[1].toLowerCase().replace(/\s+/g, '_'),
      operator: normalizeOperator(m[2]),
      target: parseFloat(m[3]),
      unit: null,
      measureCommand: null,
    }),
  },
];

/**
 * Normalizes comparison operators to standard forms
 */
function normalizeOperator(op: string): KpiOperator {
  const normalized = op.replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/≠/g, '!=');
  const valid: KpiOperator[] = ['>', '<', '>=', '<=', '=', '!='];
  return valid.includes(normalized as KpiOperator) ? (normalized as KpiOperator) : '=';
}

/**
 * Parses a single KPI string
 */
export function parseKpi(kpiString: string): ParsedKpi | null {
  const trimmed = kpiString.trim();
  if (!trimmed) return null;

  for (const { pattern, extract } of KPI_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      const extracted = extract(match);
      return {
        description: trimmed,
        metric: extracted.metric || 'unknown',
        operator: extracted.operator || '=',
        target: extracted.target ?? 0,
        unit: extracted.unit || null,
        measureCommand: extracted.measureCommand || null,
      };
    }
  }

  // Return unparseable KPI for manual verification
  return {
    description: trimmed,
    metric: 'manual',
    operator: '=',
    target: 0,
    unit: null,
    measureCommand: null,
  };
}

/**
 * Parses all KPIs from a comma/semicolon-separated string
 */
export function parseKpis(kpisString: string): ParsedKpi[] {
  if (!kpisString || kpisString.trim() === '') {
    return [];
  }

  const kpis = kpisString
    .split(/[,;]/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  return kpis.map(parseKpi).filter((k): k is ParsedKpi => k !== null);
}

// =============================================================================
// KPI Measurement
// =============================================================================

/**
 * Measures a KPI by running its measurement command
 */
export async function measureKpi(
  kpi: ParsedKpi,
  repoRoot: string,
  timeoutMs: number = 60_000
): Promise<{ value: number | null; raw: string; error?: string }> {
  if (!kpi.measureCommand) {
    return {
      value: null,
      raw: 'No measurement command available',
      error: 'Manual verification required',
    };
  }

  try {
    const result = await runMeasurementCommand(kpi.measureCommand, repoRoot, timeoutMs);

    // Extract numeric value from output based on metric type
    const value = extractMetricValue(kpi.metric, result.stdout + result.stderr);

    return {
      value,
      raw: result.stdout.slice(0, 1000),
    };
  } catch (error) {
    return {
      value: null,
      raw: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Runs a measurement command and captures output
 */
function runMeasurementCommand(
  command: string,
  cwd: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', command] : ['-c', command];

    let stdout = '';
    let stderr = '';

    const proc = spawn(shell, shellArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Measurement timeout'));
    }, timeoutMs);

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Extracts metric value from command output
 */
function extractMetricValue(metric: string, output: string): number | null {
  const patterns: Record<string, RegExp[]> = {
    coverage: [
      /All files[^|]*\|\s*(\d+(?:\.\d+)?)/,
      /Statements\s*:\s*(\d+(?:\.\d+)?)/,
      /Coverage\s*:\s*(\d+(?:\.\d+)?)/,
      /(\d+(?:\.\d+)?)\s*%\s*coverage/i,
    ],
    type_errors: [
      /Found\s+(\d+)\s+errors?/i,
      /(\d+)\s+errors?/i,
      // Zero errors = successful exit with no error count
    ],
    lint_errors: [
      /(\d+)\s+problems?/i,
      /(\d+)\s+errors?/i,
    ],
  };

  const metricPatterns = patterns[metric] || [];

  for (const pattern of metricPatterns) {
    const match = pattern.exec(output);
    if (match) {
      return parseFloat(match[1]);
    }
  }

  // For type_errors and lint_errors, if no match and no error text, assume 0
  if ((metric === 'type_errors' || metric === 'lint_errors') && !output.includes('error')) {
    return 0;
  }

  return null;
}

// =============================================================================
// KPI Comparison
// =============================================================================

/**
 * Compares actual value against target using operator
 */
export function compareKpiValue(
  actual: number,
  target: number,
  operator: KpiOperator
): boolean {
  switch (operator) {
    case '>':
      return actual > target;
    case '<':
      return actual < target;
    case '>=':
      return actual >= target;
    case '<=':
      return actual <= target;
    case '=':
      return actual === target;
    case '!=':
      return actual !== target;
    default:
      return false;
  }
}

// =============================================================================
// KPI Verification
// =============================================================================

/**
 * Verifies a single KPI
 */
export async function verifyKpi(
  kpi: ParsedKpi,
  repoRoot: string,
  skipMeasurement: boolean = false
): Promise<KpiResult> {
  const targetStr = `${kpi.operator} ${kpi.target}${kpi.unit || ''}`;

  if (skipMeasurement || !kpi.measureCommand) {
    return {
      kpi: kpi.description,
      target: targetStr,
      actual: null,
      met: false, // Can't determine without measurement
      measurementCommand: kpi.measureCommand,
      evidence: 'Manual verification required',
    };
  }

  const measurement = await measureKpi(kpi, repoRoot);

  if (measurement.value === null) {
    return {
      kpi: kpi.description,
      target: targetStr,
      actual: null,
      met: false,
      measurementCommand: kpi.measureCommand,
      evidence: measurement.error || 'Could not extract value from output',
    };
  }

  const met = compareKpiValue(measurement.value, kpi.target, kpi.operator);

  return {
    kpi: kpi.description,
    target: targetStr,
    actual: `${measurement.value}${kpi.unit || ''}`,
    met,
    measurementCommand: kpi.measureCommand,
    evidence: met
      ? `Actual: ${measurement.value}${kpi.unit || ''} meets target ${targetStr}`
      : `Actual: ${measurement.value}${kpi.unit || ''} does NOT meet target ${targetStr}`,
  };
}

/**
 * Verifies all KPIs for a task
 */
export async function verifyTaskKpis(
  taskId: string,
  kpisString: string,
  repoRoot: string,
  skipMeasurement: boolean = false
): Promise<KpiResult[]> {
  const parsedKpis = parseKpis(kpisString);
  const results: KpiResult[] = [];

  for (const kpi of parsedKpis) {
    const result = await verifyKpi(kpi, repoRoot, skipMeasurement);
    results.push(result);
  }

  return results;
}

// =============================================================================
// Summary Generation
// =============================================================================

/**
 * Generates a summary of KPI results
 */
export function generateKpiSummary(results: KpiResult[]): {
  total: number;
  met: number;
  notMet: number;
  unmeasurable: number;
  allMet: boolean;
} {
  const summary = {
    total: results.length,
    met: 0,
    notMet: 0,
    unmeasurable: 0,
    allMet: true,
  };

  for (const r of results) {
    if (r.actual === null) {
      summary.unmeasurable++;
      // Unmeasurable doesn't fail allMet (needs human)
    } else if (r.met) {
      summary.met++;
    } else {
      summary.notMet++;
      summary.allMet = false;
    }
  }

  return summary;
}

/**
 * Gets KPIs that were not met
 */
export function getFailedKpis(results: KpiResult[]): KpiResult[] {
  return results.filter((r) => r.actual !== null && !r.met);
}

/**
 * Gets KPIs that need manual verification
 */
export function getManualKpis(results: KpiResult[]): KpiResult[] {
  return results.filter((r) => r.actual === null);
}
