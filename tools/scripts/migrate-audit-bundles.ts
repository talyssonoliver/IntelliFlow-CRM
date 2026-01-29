#!/usr/bin/env npx tsx
/**
 * Migrate old audit bundles from artifacts/reports/system-audit/
 * to the new sprint-based location .specify/sprints/sprint-{N}/execution/{taskId}/{runId}/matop/
 */

import { readdir, readFile, rename, rm } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const REPO_ROOT = process.cwd();
const OLD_DIR = join(REPO_ROOT, 'artifacts', 'reports', 'system-audit');
const SPRINT_CSV = join(REPO_ROOT, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');

async function getSprintForTask(taskId: string): Promise<number> {
  const content = await readFile(SPRINT_CSV, 'utf-8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.includes(taskId)) {
      // Find Target Sprint column (usually column index varies)
      const parts = line.split(',');
      // Look for the task ID match and extract sprint
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].includes(taskId)) {
          // Target Sprint is typically around column 8-10
          // Parse the line more carefully
          const match = line.match(/,(\d+),/g);
          if (match) {
            // Find the sprint number (single or double digit in its own column)
            for (const m of match) {
              const num = parseInt(m.replace(/,/g, ''), 10);
              if (num >= 0 && num <= 50) {
                return num;
              }
            }
          }
        }
      }
    }
  }
  
  // Default to sprint 0 if not found
  console.warn(`  Warning: Could not find sprint for ${taskId}, defaulting to 0`);
  return 0;
}

async function migrate() {
  console.log('Migrating audit bundles to sprint-based paths...\n');
  
  if (!existsSync(OLD_DIR)) {
    console.log('No old audit bundles to migrate.');
    return;
  }

  const entries = await readdir(OLD_DIR, { withFileTypes: true });
  const runDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
  
  console.log(`Found ${runDirs.length} bundles to migrate.\n`);
  
  for (const runId of runDirs) {
    const oldPath = join(OLD_DIR, runId);
    const summaryPath = join(oldPath, 'summary.json');
    
    if (!existsSync(summaryPath)) {
      console.log(`Skipping ${runId} - no summary.json`);
      continue;
    }
    
    try {
      const summary = JSON.parse(await readFile(summaryPath, 'utf-8'));
      const taskId = summary.taskId;
      
      if (!taskId) {
        console.log(`Skipping ${runId} - no taskId in summary`);
        continue;
      }
      
      const sprintNumber = await getSprintForTask(taskId);
      const newPath = join(
        REPO_ROOT,
        '.specify', 'sprints', `sprint-${sprintNumber}`,
        'execution', taskId, runId, 'matop'
      );
      
      console.log(`Migrating ${runId}:`);
      console.log(`  Task: ${taskId}, Sprint: ${sprintNumber}`);
      console.log(`  From: ${oldPath}`);
      console.log(`  To:   ${newPath}`);
      
      // Create parent directory
      mkdirSync(dirname(newPath), { recursive: true });
      
      // Move the directory
      await rename(oldPath, newPath);
      
      console.log(`  ✓ Migrated successfully\n`);
    } catch (err) {
      console.error(`  ✗ Failed to migrate ${runId}:`, err);
    }
  }
  
  // Check if old directory is now empty
  const remaining = await readdir(OLD_DIR);
  if (remaining.length === 0) {
    console.log('Old directory is empty, removing...');
    await rm(OLD_DIR, { recursive: true });
    console.log('✓ Removed empty artifacts/reports/system-audit/');
  } else {
    console.log(`\nNote: ${remaining.length} items remain in old directory.`);
  }
  
  console.log('\nMigration complete!');
}

migrate().catch(console.error);
