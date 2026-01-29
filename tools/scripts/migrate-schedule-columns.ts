/**
 * Migration Script: Add PMBOK Schedule Columns to Sprint_plan.csv
 *
 * Adds 5 new columns for PMBOK-compliant scheduling:
 * - Estimate (O/M/P): Three-point estimate in minutes
 * - Planned Start: Planned start date (YYYY-MM-DD)
 * - Planned Finish: Planned finish date (YYYY-MM-DD)
 * - Percent Complete: Task progress (0-100)
 * - Dependency Types: Enhanced dependencies with relationship types
 *
 * Run with: npx tsx tools/scripts/migrate-schedule-columns.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

const CSV_PATH = path.join(
  process.cwd(),
  'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
);
const BACKUP_PATH = CSV_PATH.replace('.csv', '.backup.csv');

interface SprintPlanRow {
  'Task ID': string;
  Section: string;
  Description: string;
  Owner: string;
  Dependencies: string;
  'Pre-requisites': string;
  'Definition of Done': string;
  Status: string;
  KPIs: string;
  'Target Sprint': string;
  'Artifacts To Track': string;
  'Validation Method': string;
  // New columns
  'Estimate (O/M/P)'?: string;
  'Planned Start'?: string;
  'Planned Finish'?: string;
  'Percent Complete'?: string;
  'Dependency Types'?: string;
}

function getPercentComplete(status: string): string {
  const normalizedStatus = status.toLowerCase().trim();
  if (normalizedStatus === 'completed' || normalizedStatus === 'done') return '100';
  if (normalizedStatus === 'in progress') return '50';
  if (normalizedStatus === 'blocked') return '25';
  return '0';
}

function convertDependenciesToTypes(dependencies: string): string {
  if (!dependencies || dependencies.trim() === '') return '';

  // Split dependencies and add default FS type
  const deps = dependencies.split(',').map((d) => d.trim()).filter(Boolean);
  return deps.map((dep) => `${dep}:FS`).join(',');
}

async function migrate() {
  console.log('🚀 Starting PMBOK Schedule Column Migration...\n');

  // Check if file exists
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV file not found: ${CSV_PATH}`);
    process.exit(1);
  }

  // Create backup
  console.log('📦 Creating backup...');
  fs.copyFileSync(CSV_PATH, BACKUP_PATH);
  console.log(`   Backup saved to: ${BACKUP_PATH}\n`);

  // Read CSV
  console.log('📖 Reading CSV...');
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const parseResult = Papa.parse<SprintPlanRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  if (parseResult.errors.length > 0) {
    console.error('❌ CSV parse errors:', parseResult.errors);
    process.exit(1);
  }

  const rows = parseResult.data;
  console.log(`   Found ${rows.length} tasks\n`);

  // Check if columns already exist
  const headers = parseResult.meta.fields || [];
  if (headers.includes('Estimate (O/M/P)')) {
    console.log('⚠️  Schedule columns already exist. Skipping migration.');
    return;
  }

  // Add new columns
  console.log('✏️  Adding schedule columns...');
  const migratedRows = rows.map((row) => ({
    ...row,
    'Estimate (O/M/P)': '', // Will be filled during planning
    'Planned Start': '',    // Will be calculated
    'Planned Finish': '',   // Will be calculated
    'Percent Complete': getPercentComplete(row.Status),
    'Dependency Types': convertDependenciesToTypes(row.Dependencies),
  }));

  // Convert back to CSV
  const newCsv = Papa.unparse(migratedRows, {
    header: true,
    quotes: true,
  });

  // Write file
  console.log('💾 Writing updated CSV...');
  fs.writeFileSync(CSV_PATH, newCsv, 'utf-8');

  // Summary
  const completedCount = migratedRows.filter((r) => r['Percent Complete'] === '100').length;
  const inProgressCount = migratedRows.filter((r) => r['Percent Complete'] === '50').length;
  const notStartedCount = migratedRows.filter((r) => r['Percent Complete'] === '0').length;
  const withDepsCount = migratedRows.filter((r) => r['Dependency Types']).length;

  console.log('\n✅ Migration complete!\n');
  console.log('📊 Summary:');
  console.log(`   Total tasks: ${rows.length}`);
  console.log(`   Completed (100%): ${completedCount}`);
  console.log(`   In Progress (50%): ${inProgressCount}`);
  console.log(`   Not Started (0%): ${notStartedCount}`);
  console.log(`   Tasks with dependencies: ${withDepsCount}`);
  console.log('\n📝 New columns added:');
  console.log('   - Estimate (O/M/P): Empty (to be filled during planning)');
  console.log('   - Planned Start: Empty (to be calculated by scheduler)');
  console.log('   - Planned Finish: Empty (to be calculated by scheduler)');
  console.log('   - Percent Complete: Derived from Status');
  console.log('   - Dependency Types: Converted from Dependencies with FS type');
}

migrate().catch(console.error);
