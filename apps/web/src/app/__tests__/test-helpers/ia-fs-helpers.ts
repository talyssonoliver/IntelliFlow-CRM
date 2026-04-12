import * as fs from 'node:fs';
import * as path from 'node:path';

/** Recursively find all page.tsx files under a directory */
export function findPageFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPageFiles(fullPath));
    } else if (entry.name === 'page.tsx') {
      results.push(fullPath);
    }
  }
  return results;
}

/** Recursively find all FLOW-*.md files under a directory */
export function findFlowFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFlowFiles(fullPath));
    } else if (/^FLOW-\d+\.md$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}
