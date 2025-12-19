#!/usr/bin/env ts-node

import { syncMetricsFromCSV, formatSyncResult, validateMetricsConsistency } from '../lib/data-sync';
import { join } from 'node:path';

const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');
const metricsDir = join(process.cwd(), 'docs', 'metrics');

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
