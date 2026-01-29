#!/usr/bin/env npx tsx
/**
 * Platform Metrics Validation Script
 *
 * Validates artifacts/metrics/self-service-metrics.json against Zod schema.
 * Task: IFC-078 Platform Engineering Foundation
 *
 * Usage:
 *   pnpm run validate:platform-metrics
 *   npx tsx tools/scripts/validate-platform-metrics.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Import schema from validators package
// Note: Using relative import to avoid build dependency issues
import {
  selfServiceMetricsSchema,
  safeValidateSelfServiceMetrics,
} from '../../packages/validators/src/platform-metrics';

const METRICS_FILE = resolve(
  process.cwd(),
  'artifacts/metrics/self-service-metrics.json'
);

function main(): void {
  console.log('Platform Metrics Validation');
  console.log('============================');
  console.log(`File: ${METRICS_FILE}\n`);

  // Read JSON file
  let jsonData: unknown;
  try {
    const content = readFileSync(METRICS_FILE, 'utf-8');
    jsonData = JSON.parse(content);
    console.log('JSON parsing: PASS');
  } catch (error) {
    console.error('JSON parsing: FAIL');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // Validate against schema
  const result = safeValidateSelfServiceMetrics(jsonData);

  if (result.success) {
    console.log('Schema validation: PASS\n');

    // Print summary
    const metrics = result.data;
    console.log('Summary:');
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
    console.log('\nKPI Status:');
    const kpis = metrics.kpis;
    let allKpisMet = true;

    for (const [key, kpi] of Object.entries(kpis)) {
      const status = kpi.met ? 'PASS' : 'FAIL';
      console.log(`  ${key}: ${status} (target: ${kpi.target}, actual: ${kpi.actual})`);
      if (!kpi.met) allKpisMet = false;
    }

    console.log(`\nAll KPIs Met: ${allKpisMet ? 'YES' : 'NO'}`);
    console.log('\nValidation Result: SUCCESS');
    process.exit(0);
  } else {
    console.error('Schema validation: FAIL\n');
    console.error('Errors:');

    // Format Zod errors
    const formatted = result.error.format();
    console.error(JSON.stringify(formatted, null, 2));

    process.exit(1);
  }
}

main();
