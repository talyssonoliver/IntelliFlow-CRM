import { describe, expect, it } from 'vitest';
import {
  buildCoverageMetricsFromAttestedKpis,
  collectScopedCoverageArtifacts,
  extractCoverageThresholdsFromKpis,
  selectTaskScopedCoverage,
  type RawCoverageSummary,
} from '../../lib/task-coverage';

describe('task coverage scoping', () => {
  it('scopes live coverage to task artifacts instead of the whole package', () => {
    const coverageSummary: RawCoverageSummary = {
      total: {
        lines: { total: 1000, covered: 800, pct: 80 },
        branches: { total: 400, covered: 280, pct: 70 },
        functions: { total: 200, covered: 150, pct: 75 },
        statements: { total: 1100, covered: 825, pct: 75 },
      },
      'C:/repo/apps/web/src/app/(public)/privacy/page.tsx': {
        lines: { total: 100, covered: 95, pct: 95 },
        branches: { total: 50, covered: 40, pct: 80 },
        functions: { total: 10, covered: 10, pct: 100 },
        statements: { total: 120, covered: 114, pct: 95 },
      },
      'C:/repo/apps/web/src/lib/legal/consent-tracker.ts': {
        lines: { total: 70, covered: 63, pct: 90 },
        branches: { total: 20, covered: 18, pct: 90 },
        functions: { total: 5, covered: 4, pct: 80 },
        statements: { total: 80, covered: 72, pct: 90 },
      },
      'C:/repo/apps/web/src/components/other-task.tsx': {
        lines: { total: 400, covered: 280, pct: 70 },
        branches: { total: 100, covered: 50, pct: 50 },
        functions: { total: 40, covered: 20, pct: 50 },
        statements: { total: 420, covered: 294, pct: 70 },
      },
    };

    const metrics = selectTaskScopedCoverage(coverageSummary, {
      repoRoot: 'C:/repo',
      declaredArtifacts: [
        'apps/web/src/app/(public)/privacy/page.tsx',
        'apps/web/src/lib/legal/consent-tracker.ts',
      ],
      thresholds: {
        lines: 90,
        branches: 80,
        functions: 90,
        statements: 90,
      },
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.lines.pct).toBe(92.94);
    expect(metrics?.branches.pct).toBe(82.86);
    expect(metrics?.functions.pct).toBe(93.33);
    expect(metrics?.statements?.pct).toBe(93);
    expect(metrics?.scope).toEqual({
      source: 'task-files',
      matchedFiles: 2,
      requestedFiles: 2,
    });
  });

  it('returns null when no task artifacts appear in the coverage report', () => {
    const coverageSummary: RawCoverageSummary = {
      total: {
        lines: { total: 100, covered: 80, pct: 80 },
        branches: { total: 20, covered: 10, pct: 50 },
        functions: { total: 10, covered: 5, pct: 50 },
        statements: { total: 100, covered: 80, pct: 80 },
      },
      'C:/repo/apps/web/src/components/unrelated.tsx': {
        lines: { total: 100, covered: 80, pct: 80 },
        branches: { total: 20, covered: 10, pct: 50 },
        functions: { total: 10, covered: 5, pct: 50 },
        statements: { total: 100, covered: 80, pct: 80 },
      },
    };

    const metrics = selectTaskScopedCoverage(coverageSummary, {
      repoRoot: 'C:/repo',
      declaredArtifacts: ['apps/web/src/app/(public)/privacy/page.tsx'],
    });

    expect(metrics).toBeNull();
  });

  it('falls back to attested task coverage snapshots when live scoped files are unavailable', () => {
    const kpis = [
      { kpi: 'Scoped branch coverage', target: '>=80%', actual: '82.6%', met: true },
      { kpi: 'Scoped statement coverage', target: '>=90%', actual: '94.23%', met: true },
      { kpi: 'Scoped function coverage', target: '>=90%', actual: '100%', met: true },
      { kpi: 'Scoped line coverage', target: '>=90%', actual: '94.11%', met: true },
    ];

    const thresholds = extractCoverageThresholdsFromKpis(kpis);
    const metrics = buildCoverageMetricsFromAttestedKpis(kpis, thresholds);

    expect(metrics).not.toBeNull();
    expect(metrics?.lines.pct).toBe(94.11);
    expect(metrics?.branches.pct).toBe(82.6);
    expect(metrics?.functions.pct).toBe(100);
    expect(metrics?.statements?.pct).toBe(94.23);
    expect(metrics?.scope?.source).toBe('attestation-kpis');
  });

  it('filters task scope candidates down to unique source artifacts', () => {
    const scopedArtifacts = collectScopedCoverageArtifacts(
      [
        'apps/web/src/app/(public)/privacy/page.tsx',
        'apps/web/src/app/(public)/privacy/__tests__/page.test.tsx',
        'docs/shared/privacy-content.md',
      ],
      ['apps/web/src/app/(public)/privacy/page.tsx', 'apps/web/src/lib/legal/consent-tracker.ts']
    );

    expect(scopedArtifacts).toEqual([
      'apps/web/src/app/(public)/privacy/page.tsx',
      'apps/web/src/lib/legal/consent-tracker.ts',
    ]);
  });
});
