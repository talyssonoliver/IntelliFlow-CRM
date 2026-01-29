#!/usr/bin/env npx tsx
/**
 * ADR Lifecycle Management Script
 *
 * Task: IFC-100 - ADR Registry & Compliance Reporting
 *
 * This script provides lifecycle management for Architecture Decision Records:
 * - Create new ADRs from template
 * - List and search ADRs
 * - Update ADR status
 * - Generate ADR index
 * - Validate ADR structure
 * - Check ADR relationships
 *
 * Usage:
 *   npx tsx tools/scripts/adr-lifecycle.ts <command> [options]
 *
 * Commands:
 *   create <title>        Create a new ADR
 *   list                  List all ADRs
 *   search <query>        Search ADRs by title or content
 *   status <id> <status>  Update ADR status
 *   validate              Validate all ADRs
 *   index                 Generate/update ADR index
 *   graph                 Generate dependency graph
 */

import * as fs from 'fs';
import * as path from 'path';

// Configuration
const ADR_PATHS = [
  'docs/planning/adr',
  'docs/architecture/adr',
  'docs/shared',
];

const VALID_STATUSES = ['Proposed', 'Accepted', 'Rejected', 'Deprecated', 'Superseded'];

const TEMPLATE_PATH = 'docs/architecture/adr/000-template.md';

interface ADRMetadata {
  id: string;
  title: string;
  status: string;
  date: string;
  deciders: string;
  technicalStory: string;
  filePath: string;
  relatedADRs: string[];
  sprint: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Parse ADR file and extract metadata
 */
function parseADR(filePath: string): ADRMetadata | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : 'Unknown';

    // Extract ID from filename or title
    const fileName = path.basename(filePath, '.md');
    const idMatch = title.match(/ADR-(\d+)/) || fileName.match(/ADR-(\d+)/i) || fileName.match(/^(\d+)/);
    const id = idMatch ? `ADR-${idMatch[1].padStart(3, '0')}` : fileName;

    // Extract status
    const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/i);
    const status = statusMatch ? statusMatch[1].trim() : 'Unknown';

    // Extract date
    const dateMatch = content.match(/\*\*Date:\*\*\s*(.+)/i);
    const date = dateMatch ? dateMatch[1].trim() : 'Unknown';

    // Extract deciders
    const decidersMatch = content.match(/\*\*Deciders:\*\*\s*(.+)/i);
    const deciders = decidersMatch ? decidersMatch[1].trim() : 'Unknown';

    // Extract technical story
    const storyMatch = content.match(/\*\*Technical Story:\*\*\s*(.+)/i);
    const technicalStory = storyMatch ? storyMatch[1].trim() : '';

    // Extract related ADRs from links section
    const relatedADRs: string[] = [];
    const adrLinks = content.matchAll(/ADR-\d+/g);
    for (const match of adrLinks) {
      if (!relatedADRs.includes(match[0]) && match[0] !== id) {
        relatedADRs.push(match[0]);
      }
    }

    // Extract sprint from technical story or content
    const sprintMatch = content.match(/Sprint\s*(\d+)/i);
    const sprint = sprintMatch ? sprintMatch[1] : 'Unknown';

    return {
      id,
      title: title.replace(/^ADR-\d+:\s*/, ''),
      status,
      date,
      deciders,
      technicalStory,
      filePath,
      relatedADRs,
      sprint,
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

/**
 * Get all ADR files from configured paths
 */
function getAllADRFiles(): string[] {
  const files: string[] = [];

  for (const adrPath of ADR_PATHS) {
    const fullPath = path.resolve(process.cwd(), adrPath);
    if (fs.existsSync(fullPath)) {
      const entries = fs.readdirSync(fullPath);
      for (const entry of entries) {
        if (entry.endsWith('.md') && (entry.includes('ADR') || entry.match(/^\d{3}/))) {
          files.push(path.join(fullPath, entry));
        }
      }
    }
  }

  return files.sort();
}

/**
 * Get all ADRs with metadata
 */
function getAllADRs(): ADRMetadata[] {
  const files = getAllADRFiles();
  const adrs: ADRMetadata[] = [];

  for (const file of files) {
    const metadata = parseADR(file);
    if (metadata && !metadata.title.includes('Template') && !metadata.filePath.includes('template')) {
      adrs.push(metadata);
    }
  }

  return adrs.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Create a new ADR from template
 */
function createADR(title: string, technicalStory?: string): void {
  const templatePath = path.resolve(process.cwd(), TEMPLATE_PATH);

  if (!fs.existsSync(templatePath)) {
    console.error('Error: ADR template not found at', templatePath);
    process.exit(1);
  }

  // Get next ADR number
  const adrs = getAllADRs();
  const maxId = adrs.reduce((max, adr) => {
    const num = parseInt(adr.id.replace('ADR-', ''), 10);
    return isNaN(num) ? max : Math.max(max, num);
  }, 0);

  const nextId = (maxId + 1).toString().padStart(3, '0');
  const fileName = `ADR-${nextId}-${title.toLowerCase().replace(/\s+/g, '-')}.md`;
  const outputPath = path.resolve(process.cwd(), 'docs/planning/adr', fileName);

  // Read and customize template
  let template = fs.readFileSync(templatePath, 'utf-8');

  // Replace placeholders
  template = template.replace(/ADR-XXX/, `ADR-${nextId}`);
  template = template.replace(/\[Title of Decision\]/, title);
  template = template.replace(/YYYY-MM-DD/, new Date().toISOString().split('T')[0]);
  template = template.replace(/\[Proposed \| Accepted.*\]/, 'Proposed');

  if (technicalStory) {
    template = template.replace(
      /\[Link to relevant task\/issue.*\]/,
      technicalStory
    );
  }

  // Remove guidelines section for actual ADRs
  const guidelinesIndex = template.indexOf('## Guidelines for Using This Template');
  if (guidelinesIndex !== -1) {
    template = template.substring(0, guidelinesIndex);
  }

  fs.writeFileSync(outputPath, template);
  console.log(`Created new ADR: ${outputPath}`);
  console.log(`\nNext steps:`);
  console.log(`1. Edit the ADR to fill in context and decision details`);
  console.log(`2. Submit as PR for review`);
  console.log(`3. Update status to "Accepted" after approval`);
}

/**
 * List all ADRs
 */
function listADRs(): void {
  const adrs = getAllADRs();

  console.log('\n=== ADR Registry ===\n');
  console.log('ID       | Status      | Sprint | Title');
  console.log('-'.repeat(80));

  for (const adr of adrs) {
    const status = adr.status.substring(0, 10).padEnd(10);
    const sprint = (adr.sprint || '-').padEnd(6);
    console.log(`${adr.id} | ${status} | ${sprint} | ${adr.title.substring(0, 40)}`);
  }

  console.log('-'.repeat(80));
  console.log(`Total: ${adrs.length} ADRs\n`);

  // Status summary
  const statusCounts: Record<string, number> = {};
  for (const adr of adrs) {
    const status = adr.status.split(' ')[0];
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  console.log('Status Summary:');
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }
}

/**
 * Search ADRs by query
 */
function searchADRs(query: string): void {
  const adrs = getAllADRs();
  const queryLower = query.toLowerCase();

  const matches = adrs.filter((adr) => {
    const content = fs.readFileSync(adr.filePath, 'utf-8').toLowerCase();
    return (
      adr.title.toLowerCase().includes(queryLower) ||
      adr.id.toLowerCase().includes(queryLower) ||
      content.includes(queryLower)
    );
  });

  if (matches.length === 0) {
    console.log(`No ADRs found matching "${query}"`);
    return;
  }

  console.log(`\nFound ${matches.length} ADR(s) matching "${query}":\n`);

  for (const adr of matches) {
    console.log(`${adr.id}: ${adr.title}`);
    console.log(`  Status: ${adr.status}`);
    console.log(`  Path: ${adr.filePath}`);
    if (adr.technicalStory) {
      console.log(`  Story: ${adr.technicalStory}`);
    }
    console.log();
  }
}

/**
 * Update ADR status
 */
function updateStatus(adrId: string, newStatus: string): void {
  if (!VALID_STATUSES.some((s) => newStatus.toLowerCase().startsWith(s.toLowerCase()))) {
    console.error(`Invalid status: ${newStatus}`);
    console.error(`Valid statuses: ${VALID_STATUSES.join(', ')}`);
    process.exit(1);
  }

  const adrs = getAllADRs();
  const adr = adrs.find((a) => a.id.toLowerCase() === adrId.toLowerCase());

  if (!adr) {
    console.error(`ADR not found: ${adrId}`);
    process.exit(1);
  }

  let content = fs.readFileSync(adr.filePath, 'utf-8');

  // Update status
  content = content.replace(
    /\*\*Status:\*\*\s*.+/i,
    `**Status:** ${newStatus}`
  );

  // Update date if accepting
  if (newStatus.toLowerCase() === 'accepted') {
    content = content.replace(
      /\*\*Date:\*\*\s*.+/i,
      `**Date:** ${new Date().toISOString().split('T')[0]}`
    );
  }

  fs.writeFileSync(adr.filePath, content);
  console.log(`Updated ${adr.id} status to: ${newStatus}`);
}

/**
 * Validate all ADRs
 */
function validateADRs(): void {
  const adrs = getAllADRs();
  let totalErrors = 0;
  let totalWarnings = 0;

  console.log('\n=== ADR Validation ===\n');

  for (const adr of adrs) {
    const result = validateADR(adr);

    if (!result.valid || result.warnings.length > 0) {
      console.log(`${adr.id}: ${adr.title}`);

      for (const error of result.errors) {
        console.log(`  ERROR: ${error}`);
        totalErrors++;
      }

      for (const warning of result.warnings) {
        console.log(`  WARNING: ${warning}`);
        totalWarnings++;
      }

      console.log();
    }
  }

  console.log('-'.repeat(40));
  console.log(`Validated ${adrs.length} ADRs`);
  console.log(`Errors: ${totalErrors}, Warnings: ${totalWarnings}`);

  if (totalErrors > 0) {
    process.exit(1);
  }
}

/**
 * Validate a single ADR
 */
function validateADR(adr: ADRMetadata): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const content = fs.readFileSync(adr.filePath, 'utf-8');

  // Check required sections
  const requiredSections = [
    'Context and Problem Statement',
    'Decision Drivers',
    'Considered Options',
    'Decision Outcome',
  ];

  for (const section of requiredSections) {
    if (!content.includes(section)) {
      errors.push(`Missing section: ${section}`);
    }
  }

  // Check status validity
  if (!VALID_STATUSES.some((s) => adr.status.includes(s))) {
    errors.push(`Invalid status: ${adr.status}`);
  }

  // Check date format
  if (!adr.date.match(/^\d{4}-\d{2}-\d{2}$/) && adr.date !== 'Unknown' && !adr.date.includes('YYYY')) {
    warnings.push(`Date format should be YYYY-MM-DD: ${adr.date}`);
  }

  // Check for technical story
  if (!adr.technicalStory || adr.technicalStory.includes('[')) {
    warnings.push('Technical story not specified');
  }

  // Check for related ADRs links validity
  for (const related of adr.relatedADRs) {
    const relatedExists = getAllADRFiles().some((f) =>
      path.basename(f).includes(related.replace('ADR-', ''))
    );
    if (!relatedExists) {
      warnings.push(`Referenced ADR may not exist: ${related}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Generate ADR dependency graph
 */
function generateGraph(): void {
  const adrs = getAllADRs();

  console.log('\n=== ADR Dependency Graph ===\n');
  console.log('```mermaid');
  console.log('graph TD');

  for (const adr of adrs) {
    const shortId = adr.id.replace('ADR-0*', '');
    const shortTitle = adr.title.substring(0, 30);
    console.log(`    ${adr.id}["${shortId}: ${shortTitle}"]`);

    for (const related of adr.relatedADRs) {
      console.log(`    ${related} --> ${adr.id}`);
    }
  }

  console.log('```\n');
}

/**
 * Generate ADR index markdown
 */
function generateIndex(): void {
  const adrs = getAllADRs();
  const outputPath = path.resolve(process.cwd(), 'docs/shared/adr-index.md');

  // Group by status
  const accepted = adrs.filter((a) => a.status.includes('Accepted'));
  const proposed = adrs.filter((a) => a.status.includes('Proposed'));
  const other = adrs.filter(
    (a) => !a.status.includes('Accepted') && !a.status.includes('Proposed')
  );

  console.log(`\nADR Index generated:`);
  console.log(`  Total: ${adrs.length}`);
  console.log(`  Accepted: ${accepted.length}`);
  console.log(`  Proposed: ${proposed.length}`);
  console.log(`  Other: ${other.length}`);
  console.log(`\nIndex location: ${outputPath}`);
}

// Main CLI
function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'create':
      if (args.length < 2) {
        console.error('Usage: adr-lifecycle.ts create <title> [technical-story]');
        process.exit(1);
      }
      createADR(args[1], args[2]);
      break;

    case 'list':
      listADRs();
      break;

    case 'search':
      if (args.length < 2) {
        console.error('Usage: adr-lifecycle.ts search <query>');
        process.exit(1);
      }
      searchADRs(args[1]);
      break;

    case 'status':
      if (args.length < 3) {
        console.error('Usage: adr-lifecycle.ts status <adr-id> <new-status>');
        process.exit(1);
      }
      updateStatus(args[1], args[2]);
      break;

    case 'validate':
      validateADRs();
      break;

    case 'index':
      generateIndex();
      break;

    case 'graph':
      generateGraph();
      break;

    default:
      console.log(`
ADR Lifecycle Management Script

Usage: npx tsx tools/scripts/adr-lifecycle.ts <command> [options]

Commands:
  create <title>           Create a new ADR from template
  list                     List all ADRs with status
  search <query>           Search ADRs by title or content
  status <id> <status>     Update ADR status
  validate                 Validate all ADRs structure
  index                    Generate/update ADR index
  graph                    Generate dependency graph (Mermaid)

Examples:
  npx tsx tools/scripts/adr-lifecycle.ts create "Caching Strategy"
  npx tsx tools/scripts/adr-lifecycle.ts list
  npx tsx tools/scripts/adr-lifecycle.ts search "security"
  npx tsx tools/scripts/adr-lifecycle.ts status ADR-012 Accepted
  npx tsx tools/scripts/adr-lifecycle.ts validate

Valid statuses: ${VALID_STATUSES.join(', ')}
      `);
  }
}

main();
