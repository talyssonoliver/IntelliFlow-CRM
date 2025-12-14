#!/usr/bin/env ts-node

import { syncMetricsFromCSV, formatSyncResult } from '../lib/data-sync';
import { join } from 'node:path';

const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');
const metricsDir = join(process.cwd(), 'docs', 'metrics');

console.log('Starting metrics synchronization...\n');
console.log(`CSV Source: ${csvPath}`);
console.log(`Metrics Directory: ${metricsDir}\n`);

const result = syncMetricsFromCSV(csvPath, metricsDir);

console.log(formatSyncResult(result));

process.exit(result.success ? 0 : 1);
