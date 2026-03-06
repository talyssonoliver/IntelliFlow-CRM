/**
 * migrate-manual-review.ts
 *
 * One-time migration: replaces all AUDIT:manual-review tokens in Sprint_plan.csv
 * with appropriate VALIDATE: commands based on task category.
 *
 * Usage:
 *   npx tsx tools/scripts/migrate-manual-review.ts --dry-run   # Preview changes
 *   npx tsx tools/scripts/migrate-manual-review.ts              # Apply changes
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dirname, '../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv');

const dryRun = process.argv.includes('--dry-run');

// ── Category → VALIDATE command mapping ──────────────────────────────

function getValidateCommands(
  taskId: string,
  owner: string,
  description: string,
  section: string
): string[] {
  // Order matters — more specific rules first

  // PG-* pages → web typecheck + test
  if (taskId.startsWith('PG-')) {
    return [
      'VALIDATE:pnpm --filter @intelliflow/web typecheck',
      'VALIDATE:pnpm --filter @intelliflow/web test --run',
    ];
  }

  // DOC-* documentation tasks → lint
  if (taskId.startsWith('DOC-')) {
    return ['VALIDATE:pnpm lint'];
  }

  // EXP-REPORTS-* → lint
  if (taskId.startsWith('EXP-REPORTS-')) {
    return ['VALIDATE:pnpm lint'];
  }

  // EXP-* (other) → typecheck
  if (taskId.startsWith('EXP-')) {
    return ['VALIDATE:pnpm typecheck'];
  }

  // TRACK-* → project-tracker typecheck
  if (taskId.startsWith('TRACK-')) {
    return ['VALIDATE:pnpm --filter project-tracker typecheck'];
  }

  // AI-SETUP-* → typecheck
  if (taskId.startsWith('AI-SETUP-')) {
    return ['VALIDATE:pnpm typecheck'];
  }

  // ENV-*-AI → typecheck
  if (taskId.startsWith('ENV-')) {
    return ['VALIDATE:pnpm typecheck'];
  }

  // IFC-* — subcategories
  if (taskId.startsWith('IFC-')) {
    const ownerLower = owner.toLowerCase();
    const descLower = description.toLowerCase();
    const sectionLower = section.toLowerCase();

    // Decision gates
    if (/\b(ceo|cfo|board|leadership)\b/i.test(owner)) {
      return ['VALIDATE:pnpm lint'];
    }

    // Documentation tasks
    if (/\b(documentation|knowledge base|docusaurus|template)\b/i.test(description)) {
      return ['VALIDATE:pnpm lint'];
    }

    // Security tasks
    if (/\bsecurity\b/i.test(owner) || sectionLower === 'security') {
      return ['VALIDATE:pnpm typecheck', 'VALIDATE:pnpm test'];
    }

    // Code features — detect FE vs BE vs multi
    if (ownerLower.includes('frontend')) {
      return [
        'VALIDATE:pnpm --filter @intelliflow/web typecheck',
        'VALIDATE:pnpm --filter @intelliflow/web test --run',
      ];
    }
    if (ownerLower.includes('backend')) {
      return [
        'VALIDATE:pnpm --filter @intelliflow/api typecheck',
        'VALIDATE:pnpm --filter @intelliflow/api test --run',
      ];
    }

    // Multi-package / catch-all for IFC
    return ['VALIDATE:pnpm typecheck'];
  }

  // EP-*, EXC-*, AUTOMATION-* and any remaining → typecheck
  return ['VALIDATE:pnpm typecheck'];
}

// ── CSV parsing (handles quoted fields with embedded commas) ─────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function csvEscapeField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function fieldsToLine(fields: string[]): string {
  return fields.map(csvEscapeField).join(',');
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  const raw = readFileSync(CSV_PATH, 'utf-8');
  // Strip BOM if present
  const content = raw.replace(/^\uFEFF/, '');
  const lines = content.split('\n');

  const headerLine = lines[0];
  const headerFields = parseCsvLine(headerLine);

  // Find column indices
  const colIdx = {
    taskId: headerFields.indexOf('Task ID'),
    section: headerFields.indexOf('Section'),
    description: headerFields.indexOf('Description'),
    owner: headerFields.indexOf('Owner'),
    validationMethod: headerFields.indexOf('Validation Method'),
  };

  if (colIdx.validationMethod === -1) {
    console.error('ERROR: "Validation Method" column not found in CSV header');
    process.exit(1);
  }

  let changeCount = 0;
  const changes: Array<{
    taskId: string;
    before: string;
    after: string;
  }> = [];

  const outputLines: string[] = [headerLine];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      outputLines.push(line);
      continue;
    }

    const fields = parseCsvLine(line);
    const vm = fields[colIdx.validationMethod] || '';

    if (!vm.includes('AUDIT:manual-review')) {
      outputLines.push(line);
      continue;
    }

    const taskId = (fields[colIdx.taskId] || '').trim();
    const owner = fields[colIdx.owner] || '';
    const description = fields[colIdx.description] || '';
    const section = fields[colIdx.section] || '';

    // Parse existing tokens (semicolon-separated)
    const tokens = vm
      .split(';')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    // Remove AUDIT:manual-review
    const remaining = tokens.filter((t) => t !== 'AUDIT:manual-review');

    // Check if any VALIDATE: tokens already exist
    const hasExistingValidate = remaining.some((t) => t.startsWith('VALIDATE:'));

    if (!hasExistingValidate) {
      // Add category-appropriate VALIDATE commands
      const newValidates = getValidateCommands(taskId, owner, description, section);
      remaining.push(...newValidates);
    }

    const newVm = remaining.join(';');
    fields[colIdx.validationMethod] = newVm;

    changes.push({ taskId, before: vm, after: newVm });
    changeCount++;

    outputLines.push(fieldsToLine(fields));
  }

  // Output summary
  console.log(`\n${'='.repeat(70)}`);
  console.log(dryRun ? 'DRY RUN — No files modified' : 'MIGRATION: Replace AUDIT:manual-review');
  console.log('='.repeat(70));
  console.log(`Tasks to update: ${changeCount}`);
  console.log('');

  // Group changes by category for display
  const categories: Record<string, number> = {};
  for (const c of changes) {
    const prefix = c.taskId.split('-')[0];
    categories[prefix] = (categories[prefix] || 0) + 1;
  }
  console.log('Changes by prefix:');
  for (const [prefix, count] of Object.entries(categories).sort()) {
    console.log(`  ${prefix}: ${count}`);
  }

  // Show sample changes
  console.log('\nSample changes (first 10):');
  for (const c of changes.slice(0, 10)) {
    console.log(`  ${c.taskId}:`);
    console.log(`    BEFORE: ${c.before}`);
    console.log(`    AFTER:  ${c.after}`);
  }
  if (changes.length > 10) {
    console.log(`  ... and ${changes.length - 10} more`);
  }

  if (!dryRun) {
    writeFileSync(CSV_PATH, outputLines.join('\n'), 'utf-8');
    console.log(`\nWrote ${CSV_PATH}`);
    console.log('Run: npx tsx tools/scripts/split-sprint-plan.ts  to regenerate splits');
  }

  console.log('='.repeat(70));
}

main();
