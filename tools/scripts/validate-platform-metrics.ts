#!/usr/bin/env npx tsx
/**
 * Platform Metrics Validation Script
 *
 * Validates artifacts/metrics/self-service-metrics.json against Zod schema
 * AND verifies evidence sources, provenance, and staleness.
 *
 * Task: IFC-078 Platform Engineering Foundation
 *
 * Usage:
 *   pnpm run validate:platform-metrics
 *   npx tsx tools/scripts/validate-platform-metrics.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Import schema from validators package
import {
  selfServiceMetricsSchema,
  safeValidateSelfServiceMetrics,
} from '../../packages/validators/src/platform-metrics';

import type { SelfServiceMetrics } from '../../packages/validators/src/platform-metrics';

const METRICS_FILE = resolve(
  process.cwd(),
  'artifacts/metrics/self-service-metrics.json'
);

const ROOT = process.cwd();

interface EvidenceCheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

/**
 * Verify that evidence source files referenced in provenance actually exist
 * AND that golden path documentation contains substantive content for each path.
 */
function checkEvidenceSources(metrics: SelfServiceMetrics): EvidenceCheckResult[] {
  const results: EvidenceCheckResult[] = [];

  // Build a map of doc file -> golden path names that reference it
  const docPathMap = new Map<string, string[]>();
  for (const path of metrics.platform_engineering_foundation.golden_paths.paths) {
    const abs = resolve(ROOT, path.documentation);
    if (!docPathMap.has(abs)) docPathMap.set(abs, []);
    docPathMap.get(abs)!.push(path.name);
  }

  // For each unique doc file, check existence AND content coverage
  for (const [absPath, pathNames] of docPathMap) {
    const relPath = pathNames.length > 0
      ? metrics.platform_engineering_foundation.golden_paths.paths.find(
          (p) => resolve(ROOT, p.documentation) === absPath
        )?.documentation ?? absPath
      : absPath;

    if (!existsSync(absPath)) {
      for (const name of pathNames) {
        results.push({
          name: `golden_path_doc:${name}`,
          passed: false,
          detail: `MISSING: ${relPath}`,
        });
      }
      continue;
    }

    const content = readFileSync(absPath, 'utf-8').toLowerCase();

    for (const name of pathNames) {
      // Check the doc actually mentions this golden path (by name or key terms)
      const searchTerms = name.split('-'); // e.g. "web-app-development" -> ["web","app","development"]
      const hasSubstantiveContent =
        content.includes(name) ||
        searchTerms.every((term) => content.includes(term));

      // Also check the doc has the entrypoint command for this path
      const entryPoint = metrics.platform_engineering_foundation.golden_paths.paths
        .find((p) => p.name === name)?.entry_point ?? '';
      const hasEntryPoint = entryPoint ? content.includes(entryPoint.toLowerCase()) : true;

      const passed = hasSubstantiveContent && hasEntryPoint;
      results.push({
        name: `golden_path_doc:${name}`,
        passed,
        detail: passed
          ? `${relPath} documents "${name}" with entrypoint`
          : `STALE: ${relPath} exists but missing content for "${name}"${!hasEntryPoint ? ` (entrypoint "${entryPoint}" not found)` : ''}`,
      });
    }
  }

  // Check CI workflow file if referenced
  const ciFile = metrics.standardized_workflows.ci_pipeline.file;
  if (ciFile) {
    const ciPath = resolve(ROOT, ciFile);
    const exists = existsSync(ciPath);
    results.push({
      name: 'ci_workflow_file',
      passed: exists,
      detail: exists ? `${ciFile} exists` : `MISSING: ${ciFile}`,
    });
  }

  // Check env documentation reference
  const envDoc = metrics.environment_management.configuration.documentation;
  if (envDoc) {
    // Check common locations for env example files
    const candidates = [
      resolve(ROOT, envDoc),
      resolve(ROOT, `.${envDoc}`),
      resolve(ROOT, `apps/web/${envDoc}`),
      resolve(ROOT, `apps/web/.${envDoc}`),
      resolve(ROOT, `packages/db/${envDoc}`),
      resolve(ROOT, `packages/db/.${envDoc}`),
    ];
    const found = candidates.some((c) => existsSync(c));
    results.push({
      name: 'env_documentation',
      passed: found,
      detail: found
        ? `${envDoc} found in codebase`
        : `WARN: ${envDoc} not found (checked common locations)`,
    });
  }

  return results;
}

/**
 * Verify provenance fields are present and metrics are not stale.
 * Uses Zod-validated SelfServiceMetrics type (provenance is part of the schema).
 */
function checkProvenance(metrics: SelfServiceMetrics): EvidenceCheckResult[] {
  const results: EvidenceCheckResult[] = [];
  const prov = metrics.provenance;
  const now = new Date();

  // Check staleness
  const lastCollected = new Date(prov.last_collected_at);
  const daysSinceCollection = Math.floor(
    (now.getTime() - lastCollected.getTime()) / (1000 * 60 * 60 * 24)
  );
  const isStale = daysSinceCollection > prov.staleness_threshold_days;

  results.push({
    name: 'metrics_staleness',
    passed: !isStale,
    detail: isStale
      ? `STALE: Last collected ${daysSinceCollection} days ago (threshold: ${prov.staleness_threshold_days} days)`
      : `Fresh: Last collected ${daysSinceCollection} days ago (threshold: ${prov.staleness_threshold_days} days)`,
  });

  // Check that next_collection_due is in the future or reasonable past
  const nextDue = new Date(prov.next_collection_due);
  const overdueDays = Math.floor(
    (now.getTime() - nextDue.getTime()) / (1000 * 60 * 60 * 24)
  );
  results.push({
    name: 'collection_schedule',
    passed: overdueDays <= 30,
    detail:
      overdueDays > 0
        ? `Collection overdue by ${overdueDays} days (due: ${prov.next_collection_due})`
        : `Next collection due: ${prov.next_collection_due}`,
  });

  // Check all source sections have high or medium confidence
  for (const [key, source] of Object.entries(prov.sources)) {
    results.push({
      name: `source_confidence:${key}`,
      passed: source.confidence !== 'low',
      detail: `${key}: confidence=${source.confidence}, method=${source.collection_method}`,
    });
  }

  // Check collected_by is not empty/generic
  results.push({
    name: 'collector_identity',
    passed: prov.collected_by.length > 3,
    detail: `Collected by: ${prov.collected_by}`,
  });

  return results;
}

/**
 * Cross-validate metric consistency (e.g., deploy counts add up).
 */
function checkMetricConsistency(metrics: SelfServiceMetrics): EvidenceCheckResult[] {
  const results: EvidenceCheckResult[] = [];
  const deploy = metrics.self_service_deploy_metrics;

  // Deploy counts must add up
  const expectedTotal = deploy.successful_deploys + deploy.failed_deploys;
  results.push({
    name: 'deploy_count_consistency',
    passed: deploy.total_self_service_deploys === expectedTotal,
    detail:
      deploy.total_self_service_deploys === expectedTotal
        ? `Total ${deploy.total_self_service_deploys} = ${deploy.successful_deploys} success + ${deploy.failed_deploys} failed`
        : `MISMATCH: total=${deploy.total_self_service_deploys} != ${deploy.successful_deploys}+${deploy.failed_deploys}=${expectedTotal}`,
  });

  // Success rate must match actual numbers
  const computedRate =
    deploy.total_self_service_deploys > 0
      ? (deploy.successful_deploys / deploy.total_self_service_deploys) * 100
      : 0;
  const rateMatch =
    Math.abs(deploy.success_rate_percent - computedRate) < 0.2;
  results.push({
    name: 'deploy_rate_consistency',
    passed: rateMatch,
    detail: rateMatch
      ? `Success rate ${deploy.success_rate_percent}% matches computed ${computedRate.toFixed(1)}%`
      : `MISMATCH: reported=${deploy.success_rate_percent}% vs computed=${computedRate.toFixed(1)}%`,
  });

  // Cached build time should be less than fresh build time
  const turbo = metrics.turborepo_integration;
  results.push({
    name: 'cache_speedup_plausible',
    passed: turbo.average_cached_build_time_seconds < turbo.average_fresh_build_time_seconds,
    detail: `Cached=${turbo.average_cached_build_time_seconds}s < Fresh=${turbo.average_fresh_build_time_seconds}s`,
  });

  return results;
}

function main(): void {
  console.log('Platform Metrics Validation (Enhanced)');
  console.log('=======================================');
  console.log(`File: ${METRICS_FILE}\n`);

  // Read JSON file
  let jsonData: unknown;
  try {
    const content = readFileSync(METRICS_FILE, 'utf-8');
    jsonData = JSON.parse(content);
    console.log('1. JSON parsing: PASS');
  } catch (error) {
    console.error('1. JSON parsing: FAIL');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // Validate against schema
  const result = safeValidateSelfServiceMetrics(jsonData);

  if (!result.success) {
    console.error('2. Schema validation: FAIL\n');
    console.error('Errors:');
    const formatted = result.error.format();
    console.error(JSON.stringify(formatted, null, 2));
    process.exit(1);
  }

  console.log('2. Schema validation: PASS');

  const metrics = result.data;

  // Print summary
  console.log('\n--- Summary ---');
  console.log(`  Task ID: ${metrics.task_id}`);
  console.log(`  Sprint: ${metrics.sprint}`);
  console.log(`  Generated: ${metrics.generated_at}`);
  console.log(
    `  IDP Status: ${metrics.platform_engineering_foundation.internal_developer_platform.status}`
  );
  console.log(
    `  Golden Paths: ${metrics.platform_engineering_foundation.golden_paths.paths.length}`
  );
  console.log(
    `  Deploy Success Rate: ${metrics.self_service_deploy_metrics.success_rate_percent}%`
  );

  // Check KPIs
  console.log('\n--- KPI Status ---');
  const kpis = metrics.kpis;
  let allKpisMet = true;

  for (const [key, kpi] of Object.entries(kpis)) {
    const status = kpi.met ? 'PASS' : 'FAIL';
    console.log(`  ${key}: ${status} (target: ${kpi.target}, actual: ${kpi.actual})`);
    if (!kpi.met) allKpisMet = false;
  }
  console.log(`  All KPIs Met: ${allKpisMet ? 'YES' : 'NO'}`);

  // Evidence source checks
  console.log('\n--- 3. Evidence Source Verification ---');
  const evidenceResults = checkEvidenceSources(metrics);
  let evidencePass = true;
  for (const r of evidenceResults) {
    const icon = r.passed ? 'PASS' : 'WARN';
    console.log(`  ${r.name}: ${icon} — ${r.detail}`);
    if (!r.passed) evidencePass = false;
  }

  // Provenance checks
  console.log('\n--- 4. Provenance Verification ---');
  const provenanceResults = checkProvenance(metrics);
  let provenancePass = true;
  for (const r of provenanceResults) {
    const icon = r.passed ? 'PASS' : 'WARN';
    console.log(`  ${r.name}: ${icon} — ${r.detail}`);
    if (!r.passed) provenancePass = false;
  }

  // Metric consistency checks
  console.log('\n--- 5. Metric Consistency ---');
  const consistencyResults = checkMetricConsistency(metrics);
  let consistencyPass = true;
  for (const r of consistencyResults) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  ${r.name}: ${icon} — ${r.detail}`);
    if (!r.passed) consistencyPass = false;
  }

  // Final verdict
  console.log('\n=======================================');
  console.log('RESULTS:');
  console.log(`  Schema:       ${result.success ? 'PASS' : 'FAIL'}`);
  console.log(`  KPIs:         ${allKpisMet ? 'PASS' : 'FAIL'}`);
  console.log(`  Evidence:     ${evidencePass ? 'PASS' : 'WARN'}`);
  console.log(`  Provenance:   ${provenancePass ? 'PASS' : 'WARN'}`);
  console.log(`  Consistency:  ${consistencyPass ? 'PASS' : 'FAIL'}`);

  const overallPass = result.success && allKpisMet && consistencyPass;
  const hasWarnings = !evidencePass || !provenancePass;

  if (overallPass && !hasWarnings) {
    console.log('\nValidation Result: SUCCESS');
    process.exit(0);
  } else if (overallPass && hasWarnings) {
    console.log('\nValidation Result: SUCCESS (with warnings)');
    process.exit(0);
  } else {
    console.log('\nValidation Result: FAIL');
    process.exit(1);
  }
}

main();
