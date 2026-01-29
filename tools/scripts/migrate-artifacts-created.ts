#!/usr/bin/env npx tsx
/**
 * Migration Script: Fix artifacts.created format
 *
 * This script converts artifacts.created arrays from string[] to object[]
 * to match the updated schema which requires:
 * {
 *   path: string,
 *   sha256: string (64 hex chars),
 *   created_at: string (ISO 8601)
 * }
 *
 * Usage: npx tsx tools/scripts/migrate-artifacts-created.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { glob } from 'glob';

// Get repo root
const fileUrl = new URL(import.meta.url);
const scriptPath =
  process.platform === 'win32'
    ? fileUrl.pathname.replace(/^\/([A-Za-z]):/, '$1:')
    : fileUrl.pathname;
const REPO_ROOT = join(dirname(scriptPath), '..', '..');
const REPO_ROOT_POSIX = REPO_ROOT.replace(/\\/g, '/');

// Placeholder SHA256 for files that don't exist
const PLACEHOLDER_SHA256 = '0'.repeat(64);

interface ArtifactEntry {
  path: string;
  sha256: string;
  created_at: string;
}

interface TaskFile {
  task_id?: string;
  completed_at?: string;
  started_at?: string;
  artifacts?: {
    expected?: string[];
    created?: (string | ArtifactEntry)[];
    missing?: string[];
  };
  [key: string]: unknown;
}

function computeSha256(filePath: string): string {
  const fullPath = join(REPO_ROOT, filePath);
  if (existsSync(fullPath)) {
    try {
      const content = readFileSync(fullPath);
      return createHash('sha256').update(content).digest('hex');
    } catch {
      return PLACEHOLDER_SHA256;
    }
  }
  return PLACEHOLDER_SHA256;
}

function isStringArray(arr: unknown[]): arr is string[] {
  return arr.length > 0 && typeof arr[0] === 'string';
}

async function migrateFile(filePath: string): Promise<{ migrated: boolean; count: number }> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const data: TaskFile = JSON.parse(content);

    // Check if migration is needed
    if (!data.artifacts?.created || data.artifacts.created.length === 0) {
      return { migrated: false, count: 0 };
    }

    // Check if already migrated (first item is object)
    if (typeof data.artifacts.created[0] === 'object') {
      return { migrated: false, count: 0 };
    }

    // Need to migrate string array to object array
    const stringPaths = data.artifacts.created as string[];
    const defaultTimestamp = data.completed_at || data.started_at || new Date().toISOString();

    const newCreated: ArtifactEntry[] = stringPaths.map((pathStr) => ({
      path: pathStr,
      sha256: computeSha256(pathStr),
      created_at: defaultTimestamp,
    }));

    data.artifacts.created = newCreated;

    // Write back with pretty formatting
    writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');

    return { migrated: true, count: stringPaths.length };
  } catch (error) {
    console.error(`  Error processing ${filePath}:`, error);
    return { migrated: false, count: 0 };
  }
}

async function main(): Promise<void> {
  console.log('Migrating artifacts.created format from string[] to object[]...\n');

  // Find all task JSON files
  const patterns = [
    'apps/project-tracker/docs/metrics/sprint-*/phase-*/*.json',
    'apps/project-tracker/docs/metrics/sprint-*/*.json',
  ];

  const ignorePatterns = [
    '**/node_modules/**',
    '**/_phase-summary.json',
    '**/_summary.json',
    '**/schemas/**',
    '**/_global/**',
  ];

  let totalMigrated = 0;
  let totalArtifacts = 0;
  const migratedFiles: string[] = [];

  for (const pattern of patterns) {
    const fullPattern = REPO_ROOT_POSIX + '/' + pattern;
    const files = await glob(fullPattern, {
      nodir: true,
      ignore: ignorePatterns.map((p) => REPO_ROOT_POSIX + '/' + p),
    });

    for (const file of files) {
      const result = await migrateFile(file);
      if (result.migrated) {
        totalMigrated++;
        totalArtifacts += result.count;
        migratedFiles.push(file.replace(REPO_ROOT, '.'));
        console.log(`  ✓ Migrated: ${file.replace(REPO_ROOT, '.')} (${result.count} artifacts)`);
      }
    }
  }

  console.log(`\n=== Migration Summary ===`);
  console.log(`Files migrated: ${totalMigrated}`);
  console.log(`Total artifacts converted: ${totalArtifacts}`);

  if (totalMigrated > 0) {
    console.log(`\n✅ Migration complete!`);
    console.log(`Run 'pnpm run validate:schemas' to verify.`);
  } else {
    console.log(`\nNo files needed migration.`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
