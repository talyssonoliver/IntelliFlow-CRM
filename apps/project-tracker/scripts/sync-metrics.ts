#!/usr/bin/env ts-node

import { syncMetricsFromCSV, formatSyncResult, validateMetricsConsistency } from '../lib/data-sync';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

// Resolve paths relative to this script's location (works from any cwd)
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectTrackerRoot = join(__dirname, '..');

const csvPath = join(projectTrackerRoot, 'docs', 'metrics', '_global', 'Sprint_plan.csv');
const metricsDir = join(projectTrackerRoot, 'docs', 'metrics');

// Validate paths exist before proceeding
if (!existsSync(csvPath)) {
  console.error(`❌ CSV file not found: ${csvPath}`);
  process.exit(1);
}
if (!existsSync(metricsDir)) {
  console.error(`❌ Metrics directory not found: ${metricsDir}`);
  process.exit(1);
}

console.log('Starting metrics synchronization...\n');
console.log(`CSV Source: ${csvPath}`);
console.log(`Metrics Directory: ${metricsDir}\n`);

const result = syncMetricsFromCSV(csvPath, metricsDir);

console.log(formatSyncResult(result));

if (result.success) {
  console.log('🔍 Validating data consistency...\n');
  const validation = validateMetricsConsistency(csvPath, metricsDir);

  if (validation.warnings.length > 0) {
    console.log('⚠️  WARNINGS:');
    for (const warning of validation.warnings) {
      console.log(`   ${warning}`);
    }
    console.log('');
  }

  if (!validation.passed) {
    console.log('❌ VALIDATION FAILED:');
    for (const error of validation.errors) {
      console.log(`   ${error}`);
    }
    console.log('');
    process.exit(1);
  }

  console.log('✅ Data consistency validated!\n');
}

process.exit(result.success ? 0 : 1);
