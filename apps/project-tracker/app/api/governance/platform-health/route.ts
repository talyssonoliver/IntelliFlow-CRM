/**
 * GET /api/governance/platform-health
 * Returns platform health validation results for the Platform Health sub-tab.
 *
 * Reads artifacts/metrics/self-service-metrics.json, validates structure,
 * then runs evidence, provenance, and consistency checks.
 * Also computes maturity level, trend history, codebase health stats, and recommendations.
 */

import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const dynamic = 'force-dynamic';

interface HealthCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface GoldenPathResult {
  name: string;
  entrypoint: string;
  docExists: boolean;
  contentVerified: boolean;
}

interface MaturityCriterion {
  id: string;
  name: string;
  passed: boolean;
}

interface MaturityLevel {
  level: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  name: string;
  color: string;
  score: number;
  criteria: MaturityCriterion[];
  nextLevel: string | null;
  nextRequirements: string[];
  progressToNext: number;
}

interface Recommendation {
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  estimatedTime: string;
  action: string;
}

interface TrendPoint {
  timestamp: string;
  metrics: Record<string, number | null>;
}

function getRoot(): string {
  let root = process.cwd();
  if (root.includes('project-tracker')) {
    root = resolve(root, '..', '..');
  }
  return root;
}

function computeMaturity(
  metrics: Record<string, any>,
  goldenPaths: GoldenPathResult[],
  provenanceFresh: boolean,
  evidencePassed: number,
  evidenceTotal: number
): MaturityLevel {
  const deploy = metrics.self_service_deploy_metrics || {};
  const ci = metrics.standardized_workflows?.ci_pipeline || {};
  const turbo = metrics.turborepo_integration || {};
  const codebase = metrics.codebase_health || {};

  // Bronze criteria: basic operational requirements
  const bronzeCriteria: MaturityCriterion[] = [
    { id: 'ci_configured', name: 'CI pipeline configured', passed: !!ci.file },
    { id: 'env_docs', name: 'Environment documentation exists', passed: evidencePassed > 0 },
    { id: 'golden_paths_defined', name: 'Golden paths defined', passed: goldenPaths.length >= 1 },
    { id: 'deploy_enabled', name: 'Self-service deploys enabled', passed: !!deploy.enabled },
  ];

  // Silver criteria: production-ready
  const silverCriteria: MaturityCriterion[] = [
    {
      id: 'deploy_95',
      name: 'Deploy success rate >= 95%',
      passed: (deploy.success_rate_percent ?? 0) >= 95,
    },
    { id: 'ci_pass_90', name: 'CI pass rate >= 90%', passed: (ci.pass_rate_percent ?? 0) >= 90 },
    { id: 'provenance_fresh', name: 'Metrics not stale', passed: provenanceFresh },
    {
      id: 'golden_paths_verified',
      name: 'All golden path docs verified',
      passed: goldenPaths.every((g) => g.contentVerified),
    },
    { id: 'cache_enabled', name: 'Build cache enabled', passed: !!turbo.cache_enabled },
  ];

  // Gold criteria: SRE excellence
  const goldCriteria: MaturityCriterion[] = [
    {
      id: 'deploy_98',
      name: 'Deploy success rate >= 98%',
      passed: (deploy.success_rate_percent ?? 0) >= 98,
    },
    {
      id: 'cache_hit_80',
      name: 'Cache hit rate >= 80%',
      passed: (turbo.cache_hit_rate_percent ?? 0) >= 80,
    },
    { id: 'ci_pass_95', name: 'CI pass rate >= 95%', passed: (ci.pass_rate_percent ?? 0) >= 95 },
    {
      id: 'test_coverage_80',
      name: 'Test coverage >= 80%',
      passed: (codebase.test_coverage_pct ?? 0) >= 80,
    },
    {
      id: 'all_evidence',
      name: 'All evidence checks pass',
      passed: evidencePassed === evidenceTotal,
    },
  ];

  // Platinum criteria: world class
  const platinumCriteria: MaturityCriterion[] = [
    {
      id: 'deploy_99',
      name: 'Deploy success rate >= 99%',
      passed: (deploy.success_rate_percent ?? 0) >= 99,
    },
    {
      id: 'cache_hit_90',
      name: 'Cache hit rate >= 90%',
      passed: (turbo.cache_hit_rate_percent ?? 0) >= 90,
    },
    { id: 'ci_pass_98', name: 'CI pass rate >= 98%', passed: (ci.pass_rate_percent ?? 0) >= 98 },
    {
      id: 'test_coverage_90',
      name: 'Test coverage >= 90%',
      passed: (codebase.test_coverage_pct ?? 0) >= 90,
    },
    {
      id: 'auto_provenance',
      name: 'Automated provenance collection',
      passed: metrics.provenance?.collection_method === 'automated_scan',
    },
  ];

  const levels = [
    {
      level: 'BRONZE' as const,
      name: 'Bronze - Basic Operations',
      color: '#CD7F32',
      criteria: bronzeCriteria,
    },
    {
      level: 'SILVER' as const,
      name: 'Silver - Production Ready',
      color: '#C0C0C0',
      criteria: silverCriteria,
    },
    {
      level: 'GOLD' as const,
      name: 'Gold - SRE Excellence',
      color: '#FFD700',
      criteria: goldCriteria,
    },
    {
      level: 'PLATINUM' as const,
      name: 'Platinum - World Class',
      color: '#E5E4E2',
      criteria: platinumCriteria,
    },
  ];

  // Find the highest level where all criteria pass
  let currentIdx = -1;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i].criteria.every((c) => c.passed)) {
      currentIdx = i;
    } else {
      break;
    }
  }

  const _currentLevel = currentIdx >= 0 ? levels[currentIdx] : levels[0];
  const nextLevelDef = currentIdx < levels.length - 1 ? levels[currentIdx + 1] : null;

  // Compute score (weighted across all levels)
  const allCriteria = levels.flatMap((l) => l.criteria);
  const totalPassed = allCriteria.filter((c) => c.passed).length;
  const score = Math.round((totalPassed / allCriteria.length) * 100);

  // Progress to next level
  let progressToNext = 100;
  const nextReqs: string[] = [];
  if (nextLevelDef) {
    const nextPassed = nextLevelDef.criteria.filter((c) => c.passed).length;
    progressToNext = Math.round((nextPassed / nextLevelDef.criteria.length) * 100);
    for (const c of nextLevelDef.criteria) {
      if (!c.passed) nextReqs.push(c.name);
    }
  }

  return {
    level: currentIdx >= 0 ? levels[currentIdx].level : 'BRONZE',
    name: currentIdx >= 0 ? levels[currentIdx].name : 'Not yet Bronze',
    color: currentIdx >= 0 ? levels[currentIdx].color : '#888888',
    score,
    criteria: allCriteria,
    nextLevel: nextLevelDef?.name ?? null,
    nextRequirements: nextReqs,
    progressToNext,
  };
}

function buildRecommendations(
  metrics: Record<string, any>,
  goldenPaths: GoldenPathResult[],
  provenanceFresh: boolean,
  daysSinceCollection: number,
  evidenceChecks: HealthCheck[],
  maturity: MaturityLevel
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Stale metrics
  if (!provenanceFresh || daysSinceCollection > 30) {
    recs.push({
      title: 'Regenerate platform metrics',
      description: `Metrics are ${daysSinceCollection} days old. Click "Regenerate Metrics" to auto-collect fresh data from the codebase.`,
      severity: daysSinceCollection > 60 ? 'high' : 'medium',
      estimatedTime: '< 30 seconds',
      action: 'regenerate',
    });
  }

  // Missing golden path docs
  const unverifiedPaths = goldenPaths.filter((g) => !g.contentVerified);
  if (unverifiedPaths.length > 0) {
    recs.push({
      title: `Verify ${unverifiedPaths.length} golden path doc(s)`,
      description: `The engineering playbook is missing content for: ${unverifiedPaths.map((g) => g.name).join(', ')}. Add entry_point commands and path descriptions.`,
      severity: 'medium',
      estimatedTime: '~15 minutes per path',
      action: 'docs',
    });
  }

  // Missing CI workflow file
  const ciMissing = evidenceChecks.find((c) => c.name === 'ci_workflow_file' && !c.passed);
  if (ciMissing) {
    recs.push({
      title: 'Create CI workflow file',
      description:
        'The CI workflow file (.github/workflows/ci.yml) is missing. This is required for Bronze maturity.',
      severity: 'high',
      estimatedTime: '~30 minutes',
      action: 'ci',
    });
  }

  // Low cache hit rate
  const cacheRate = metrics.turborepo_integration?.cache_hit_rate_percent ?? 0;
  if (cacheRate < 80) {
    recs.push({
      title: 'Improve Turborepo cache hit rate',
      description: `Current cache hit rate is ${cacheRate}% (target: 80%+). Enable remote caching, pin dependency versions, and ensure deterministic builds.`,
      severity: 'low',
      estimatedTime: '~2 hours',
      action: 'cache',
    });
  }

  // No test coverage data
  if (!metrics.codebase_health?.test_coverage_pct) {
    recs.push({
      title: 'Generate test coverage report',
      description:
        'No test coverage data available. Run `pnpm run test:coverage` to generate artifacts/coverage/coverage-summary.json.',
      severity: 'medium',
      estimatedTime: '~5 minutes',
      action: 'coverage',
    });
  }

  // Next maturity level hints
  if (maturity.nextRequirements.length > 0) {
    recs.push({
      title: `Advance to ${maturity.nextLevel}`,
      description: `${maturity.nextRequirements.length} criteria remaining: ${maturity.nextRequirements.join('; ')}`,
      severity: 'low',
      estimatedTime: 'varies',
      action: 'maturity',
    });
  }

  return recs;
}

function loadTrendHistory(root: string): TrendPoint[] {
  const historyPath = resolve(root, 'artifacts/metrics/platform-health-history.jsonl');
  if (!existsSync(historyPath)) return [];

  try {
    const content = readFileSync(historyPath, 'utf-8');
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const parsed = JSON.parse(line);
        return { timestamp: parsed.timestamp, metrics: parsed.metrics };
      })
      .slice(-30); // Last 30 snapshots
  } catch {
    return [];
  }
}

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const root = getRoot();
    const metricsPath = resolve(root, 'artifacts/metrics/self-service-metrics.json');

    if (!existsSync(metricsPath)) {
      return NextResponse.json(
        {
          source: 'missing',
          timestamp,
          pattern: 'RSI',
          status: 'failing',
          error: 'self-service-metrics.json not found',
          detail: `Expected at: ${metricsPath}`,
        },
        {
          status: 404,
          headers: { 'Cache-Control': 'no-store, no-cache, max-age=0' },
        }
      );
    }

    // Read and parse metrics
    let rawData: unknown;
    try {
      const content = readFileSync(metricsPath, 'utf-8');
      rawData = JSON.parse(content);
    } catch {
      return NextResponse.json(
        {
          source: 'error',
          timestamp,
          pattern: 'RSI',
          status: 'failing',
          error: 'Failed to parse self-service-metrics.json',
        },
        {
          status: 500,
          headers: { 'Cache-Control': 'no-store, no-cache, max-age=0' },
        }
      );
    }

    // Inline structural validation
    const metrics = rawData as Record<string, any>;
    const requiredKeys = [
      'task_id',
      'sprint',
      'provenance',
      'platform_engineering_foundation',
      'self_service_deploy_metrics',
      'standardized_workflows',
      'turborepo_integration',
      'environment_management',
      'kpis',
    ];
    const missingKeys = requiredKeys.filter((k) => !(k in metrics));
    const schemaStatus = missingKeys.length === 0 ? 'PASS' : 'FAIL';

    // --- KPI checks ---
    const kpiEntries: Array<{ name: string; target: string; actual: string; met: boolean }> = [];
    let kpisMet = 0;
    if (metrics.kpis) {
      for (const [key, kpi] of Object.entries(metrics.kpis) as [string, any][]) {
        kpiEntries.push({
          name: key.replaceAll('_', ' '),
          target: kpi.target,
          actual: kpi.actual,
          met: kpi.met,
        });
        if (kpi.met) kpisMet++;
      }
    }

    // --- Golden Paths ---
    const goldenPaths: GoldenPathResult[] = [];
    if (metrics.platform_engineering_foundation?.golden_paths?.paths) {
      for (const path of metrics.platform_engineering_foundation.golden_paths.paths) {
        const docPath = resolve(root, path.documentation);
        const docExists = existsSync(docPath);
        let contentVerified = false;

        if (docExists) {
          try {
            const content = readFileSync(docPath, 'utf-8').toLowerCase();
            const searchTerms = path.name.split('-');
            const hasContent =
              content.includes(path.name) ||
              searchTerms.every((term: string) => content.includes(term));
            const hasEntryPoint = path.entry_point
              ? content.includes(path.entry_point.toLowerCase())
              : true;
            contentVerified = hasContent && hasEntryPoint;
          } catch {
            contentVerified = false;
          }
        }

        goldenPaths.push({
          name: path.name,
          entrypoint: path.entry_point,
          docExists,
          contentVerified,
        });
      }
    }

    // --- Evidence checks ---
    const evidenceChecks: HealthCheck[] = [];

    for (const gp of goldenPaths) {
      evidenceChecks.push({
        name: `golden_path_doc:${gp.name}`,
        passed: gp.docExists && gp.contentVerified,
        detail: !gp.docExists
          ? 'Documentation file missing'
          : gp.contentVerified
            ? 'Documentation verified with entrypoint'
            : 'Documentation exists but missing content for this path',
      });
    }

    const ciFile = metrics.standardized_workflows?.ci_pipeline?.file;
    if (ciFile) {
      const ciExists = existsSync(resolve(root, ciFile));
      evidenceChecks.push({
        name: 'ci_workflow_file',
        passed: ciExists,
        detail: ciExists ? `${ciFile} exists` : `MISSING: ${ciFile}`,
      });
    }

    const envDoc = metrics.environment_management?.configuration?.documentation;
    if (envDoc) {
      const candidates = [
        resolve(root, envDoc),
        resolve(root, `.${envDoc}`),
        resolve(root, `apps/web/${envDoc}`),
        resolve(root, `apps/web/.${envDoc}`),
        resolve(root, `packages/db/${envDoc}`),
        resolve(root, `packages/db/.${envDoc}`),
      ];
      const found = candidates.some((c) => existsSync(c));
      evidenceChecks.push({
        name: 'env_documentation',
        passed: found,
        detail: found
          ? `${envDoc} found in codebase`
          : `${envDoc} not found (checked common locations)`,
      });
    }

    const evidencePassed = evidenceChecks.filter((c) => c.passed).length;
    const evidenceWarnings = evidenceChecks.filter((c) => !c.passed).map((c) => c.detail);

    // --- Provenance checks ---
    const provenanceChecks: HealthCheck[] = [];
    let daysSinceCollection = 0;
    let provenanceFresh = true;
    let nextDue = '';

    if (metrics.provenance) {
      const prov = metrics.provenance;
      const now = new Date();
      const lastCollected = new Date(prov.last_collected_at);
      daysSinceCollection = Math.floor(
        (now.getTime() - lastCollected.getTime()) / (1000 * 60 * 60 * 24)
      );
      const isStale = daysSinceCollection > prov.staleness_threshold_days;
      provenanceFresh = !isStale;
      nextDue = prov.next_collection_due;

      provenanceChecks.push({
        name: 'metrics_staleness',
        passed: !isStale,
        detail: isStale
          ? `Last collected ${daysSinceCollection} days ago (threshold: ${prov.staleness_threshold_days} days)`
          : `Fresh: Last collected ${daysSinceCollection} days ago (threshold: ${prov.staleness_threshold_days} days)`,
      });

      const nextDueDate = new Date(prov.next_collection_due);
      const overdueDays = Math.floor(
        (now.getTime() - nextDueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      provenanceChecks.push({
        name: 'collection_schedule',
        passed: overdueDays <= 30,
        detail:
          overdueDays > 0
            ? `Collection overdue by ${overdueDays} days (due: ${prov.next_collection_due})`
            : `Next collection due: ${prov.next_collection_due}`,
      });

      if (prov.sources) {
        for (const [key, source] of Object.entries(prov.sources) as [string, any][]) {
          provenanceChecks.push({
            name: `source_confidence:${key}`,
            passed: source.confidence !== 'low',
            detail: `${key}: confidence=${source.confidence}, method=${source.collection_method}`,
          });
        }
      }

      provenanceChecks.push({
        name: 'collector_identity',
        passed: prov.collected_by.length > 3,
        detail: `Collected by: ${prov.collected_by}`,
      });
    }

    // --- Consistency checks ---
    const consistencyChecks: HealthCheck[] = [];

    if (metrics.self_service_deploy_metrics) {
      const deploy = metrics.self_service_deploy_metrics;
      const expectedTotal = deploy.successful_deploys + deploy.failed_deploys;
      consistencyChecks.push({
        name: 'deploy_count_consistency',
        passed: deploy.total_self_service_deploys === expectedTotal,
        detail:
          deploy.total_self_service_deploys === expectedTotal
            ? `Total ${deploy.total_self_service_deploys} = ${deploy.successful_deploys} success + ${deploy.failed_deploys} failed`
            : `MISMATCH: total=${deploy.total_self_service_deploys} != ${deploy.successful_deploys}+${deploy.failed_deploys}=${expectedTotal}`,
      });

      const computedRate =
        deploy.total_self_service_deploys > 0
          ? (deploy.successful_deploys / deploy.total_self_service_deploys) * 100
          : 0;
      const rateMatch = Math.abs(deploy.success_rate_percent - computedRate) < 0.2;
      consistencyChecks.push({
        name: 'deploy_rate_consistency',
        passed: rateMatch,
        detail: rateMatch
          ? `Success rate ${deploy.success_rate_percent}% matches computed ${computedRate.toFixed(1)}%`
          : `MISMATCH: reported=${deploy.success_rate_percent}% vs computed=${computedRate.toFixed(1)}%`,
      });
    }

    if (metrics.turborepo_integration) {
      const turbo = metrics.turborepo_integration;
      consistencyChecks.push({
        name: 'cache_speedup_plausible',
        passed: turbo.average_cached_build_time_seconds < turbo.average_fresh_build_time_seconds,
        detail: `Cached=${turbo.average_cached_build_time_seconds}s < Fresh=${turbo.average_fresh_build_time_seconds}s`,
      });
    }

    const consistencyPassed = consistencyChecks.filter((c) => c.passed).length;
    const consistencyFailures = consistencyChecks.filter((c) => !c.passed).map((c) => c.detail);

    // --- Overall status ---
    const allKpisMet = kpiEntries.every((k) => k.met);
    const allConsistencyPassed = consistencyChecks.every((c) => c.passed);
    const allProvenancePassed = provenanceChecks.every((c) => c.passed);
    const allEvidencePassed = evidenceChecks.every((c) => c.passed);

    let status: 'passing' | 'failing' | 'degraded' = 'passing';
    if (schemaStatus === 'FAIL' || !allKpisMet || !allConsistencyPassed) {
      status = 'failing';
    } else if (!allProvenancePassed || !allEvidencePassed) {
      status = 'degraded';
    }

    // --- Maturity level ---
    const maturity = computeMaturity(
      metrics,
      goldenPaths,
      provenanceFresh,
      evidencePassed,
      evidenceChecks.length
    );

    // --- Recommendations ---
    const recommendations = buildRecommendations(
      metrics,
      goldenPaths,
      provenanceFresh,
      daysSinceCollection,
      evidenceChecks,
      maturity
    );

    // --- Trend history ---
    const trendHistory = loadTrendHistory(root);

    // --- Codebase health (from auto-collected data) ---
    const codebaseHealth = metrics.codebase_health || null;

    return NextResponse.json(
      {
        source: 'fresh',
        timestamp,
        pattern: 'RSI',
        status,
        summary: {
          schema: schemaStatus,
          kpis: { total: kpiEntries.length, met: kpisMet, allMet: allKpisMet },
          evidence: {
            total: evidenceChecks.length,
            passed: evidencePassed,
            warnings: evidenceWarnings,
          },
          provenance: {
            fresh: provenanceFresh,
            daysSinceCollection,
            threshold: metrics.provenance?.staleness_threshold_days ?? 90,
            nextDue,
          },
          consistency: {
            total: consistencyChecks.length,
            passed: consistencyPassed,
            failures: consistencyFailures,
          },
        },
        maturity,
        recommendations,
        trendHistory,
        codebaseHealth,
        goldenPaths,
        kpis: kpiEntries,
        evidenceChecks,
        provenanceChecks,
        consistencyChecks,
        metrics: {
          taskId: metrics.task_id,
          sprint: metrics.sprint,
          generatedAt: metrics.generated_at,
          idpStatus: metrics.platform_engineering_foundation?.internal_developer_platform?.status,
          deploySuccessRate: metrics.self_service_deploy_metrics?.success_rate_percent,
          totalDeploys: metrics.self_service_deploy_metrics?.total_self_service_deploys,
          cacheHitRate: metrics.turborepo_integration?.cache_hit_rate_percent,
          ciPassRate: metrics.standardized_workflows?.ci_pipeline?.pass_rate_percent,
        },
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, max-age=0' } }
    );
  } catch (error) {
    console.error('Error in platform-health API:', error);
    return NextResponse.json(
      {
        source: 'error',
        timestamp,
        pattern: 'RSI',
        status: 'failing',
        error: 'Failed to validate platform health',
        details: String(error),
      },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, max-age=0' } }
    );
  }
}
