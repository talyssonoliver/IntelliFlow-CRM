/**
 * ADR Service - Server-side ADR lifecycle management
 *
 * Provides functions to manage Architecture Decision Records
 * Based on tools/scripts/adr-lifecycle.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Configuration
const ADR_PATHS = ['docs/planning/adr', 'docs/architecture/adr', 'docs/shared'];

const VALID_STATUSES = ['Proposed', 'Accepted', 'Rejected', 'Deprecated', 'Superseded'] as const;
export type ADRStatus = (typeof VALID_STATUSES)[number];

const TEMPLATE_PATH = 'docs/architecture/adr/000-template.md';

export interface ADRMetadata {
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

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ADRValidation extends ADRMetadata {
  validation: ValidationResult;
}

/**
 * Get the base directory for the project
 */
function getBaseDir(): string {
  // In Next.js, process.cwd() returns the project root
  return process.cwd();
}

/**
 * Parse ADR file and extract metadata
 */
export function parseADR(filePath: string): ADRMetadata | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Extract title from first heading
    const titleMatch = /^#\s+([^\r\n]{1,500})$/m.exec(content);
    const title = titleMatch ? titleMatch[1].trim() : 'Unknown';

    // Extract ID from filename or title
    const fileName = path.basename(filePath, '.md');
    const idMatch =
      /ADR-(\d+)/.exec(title) || /ADR-(\d+)/i.exec(fileName) || /^(\d+)/.exec(fileName);
    const id = idMatch ? `ADR-${idMatch[1].padStart(3, '0')}` : fileName;

    // Extract status
    const statusMatch = /\*\*Status:\*\*\s*(.+)/i.exec(content);
    const status = statusMatch ? statusMatch[1].trim() : 'Unknown';

    // Extract date
    const dateMatch = /\*\*Date:\*\*\s*(.+)/i.exec(content);
    const date = dateMatch ? dateMatch[1].trim() : 'Unknown';

    // Extract deciders
    const decidersMatch = /\*\*Deciders:\*\*\s*(.+)/i.exec(content);
    const deciders = decidersMatch ? decidersMatch[1].trim() : 'Unknown';

    // Extract technical story
    const storyMatch = /\*\*Technical Story:\*\*\s*(.+)/i.exec(content);
    const technicalStory = storyMatch ? storyMatch[1].trim() : '';

    // Extract related ADRs from links
    const relatedADRs: string[] = [];
    const adrLinks = content.matchAll(/ADR-\d+/g);
    for (const match of adrLinks) {
      if (!relatedADRs.includes(match[0]) && match[0] !== id) {
        relatedADRs.push(match[0]);
      }
    }

    // Extract sprint
    const sprintMatch = /Sprint\s*(\d+)/i.exec(content);
    const sprint = sprintMatch ? sprintMatch[1] : 'Unknown';

    return {
      id,
      title: title.replace(/^ADR-\d+:\s*/, ''),
      status,
      date,
      deciders,
      technicalStory,
      filePath: path.relative(getBaseDir(), filePath),
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
export function getAllADRFiles(): string[] {
  const files: string[] = [];
  const baseDir = getBaseDir();

  for (const adrPath of ADR_PATHS) {
    const fullPath = path.resolve(baseDir, adrPath);
    if (fs.existsSync(fullPath)) {
      const entries = fs.readdirSync(fullPath);
      for (const entry of entries) {
        if (entry.endsWith('.md') && (entry.includes('ADR') || /^\d{3}/.exec(entry))) {
          files.push(path.join(fullPath, entry));
        }
      }
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

/**
 * Get all ADRs with metadata
 */
export function getAllADRs(): ADRMetadata[] {
  const files = getAllADRFiles();
  const adrs: ADRMetadata[] = [];

  for (const file of files) {
    const metadata = parseADR(file);
    if (
      metadata &&
      !metadata.title.includes('Template') &&
      !metadata.filePath.includes('template')
    ) {
      adrs.push(metadata);
    }
  }

  return adrs.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Search ADRs by query
 */
export function searchADRs(query: string): ADRMetadata[] {
  const adrs = getAllADRs();
  const queryLower = query.toLowerCase();
  const baseDir = getBaseDir();

  return adrs.filter((adr) => {
    const fullPath = path.resolve(baseDir, adr.filePath);
    const content = fs.readFileSync(fullPath, 'utf-8').toLowerCase();
    return (
      adr.title.toLowerCase().includes(queryLower) ||
      adr.id.toLowerCase().includes(queryLower) ||
      content.includes(queryLower)
    );
  });
}

/**
 * Validate a single ADR
 */
export function validateADR(adr: ADRMetadata): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const baseDir = getBaseDir();
  const fullPath = path.resolve(baseDir, adr.filePath);

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');

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
    if (
      !/^\d{4}-\d{2}-\d{2}$/.exec(adr.date) &&
      adr.date !== 'Unknown' &&
      !adr.date.includes('YYYY')
    ) {
      warnings.push(`Date format should be YYYY-MM-DD: ${adr.date}`);
    }

    // Check for technical story
    if (!adr.technicalStory || adr.technicalStory.includes('[')) {
      warnings.push('Technical story not specified');
    }

    // Check for related ADRs links validity
    const allFiles = getAllADRFiles();
    for (const related of adr.relatedADRs) {
      const relatedExists = allFiles.some((f) =>
        path.basename(f).includes(related.replace('ADR-', ''))
      );
      if (!relatedExists) {
        warnings.push(`Referenced ADR may not exist: ${related}`);
      }
    }
  } catch (error) {
    errors.push(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate all ADRs
 */
export function validateAllADRs(): ADRValidation[] {
  const adrs = getAllADRs();
  return adrs.map((adr) => ({
    ...adr,
    validation: validateADR(adr),
  }));
}

/**
 * Create a new ADR from template
 */
export function createADR(
  title: string,
  technicalStory?: string
): { success: boolean; path?: string; error?: string } {
  const baseDir = getBaseDir();
  const templatePath = path.resolve(baseDir, TEMPLATE_PATH);

  if (!fs.existsSync(templatePath)) {
    return { success: false, error: `ADR template not found at ${TEMPLATE_PATH}` };
  }

  try {
    // Get next ADR number
    const adrs = getAllADRs();
    const maxId = adrs.reduce((max, adr) => {
      const num = Number.parseInt(adr.id.replace('ADR-', ''), 10);
      return Number.isNaN(num) ? max : Math.max(max, num);
    }, 0);

    const nextId = (maxId + 1).toString().padStart(3, '0');
    const fileName = `ADR-${nextId}-${title
      .toLowerCase()
      .replaceAll(/\s+/g, '-')
      .replaceAll(/[^a-z0-9-]/g, '')}.md`;
    const outputPath = path.resolve(baseDir, 'docs/planning/adr', fileName);

    // Ensure directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Read and customize template
    let template = fs.readFileSync(templatePath, 'utf-8');

    // Replace placeholders
    template = template.replaceAll('ADR-XXX', `ADR-${nextId}`);
    template = template.replaceAll('[Title of Decision]', title);
    template = template.replaceAll('YYYY-MM-DD', new Date().toISOString().split('T')[0]);
    template = template.replaceAll(/\[Proposed \| Accepted.*\]/g, 'Proposed');

    if (technicalStory) {
      template = template.replaceAll(/\[Link to relevant task\/issue.*\]/g, technicalStory);
    }

    // Remove guidelines section
    const guidelinesIndex = template.indexOf('## Guidelines for Using This Template');
    if (guidelinesIndex !== -1) {
      template = template.substring(0, guidelinesIndex);
    }

    fs.writeFileSync(outputPath, template);

    return {
      success: true,
      path: path.relative(baseDir, outputPath),
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Update ADR status
 */
export function updateADRStatus(
  adrId: string,
  newStatus: string
): { success: boolean; error?: string } {
  if (!VALID_STATUSES.some((s) => newStatus.toLowerCase().startsWith(s.toLowerCase()))) {
    return {
      success: false,
      error: `Invalid status. Valid statuses: ${VALID_STATUSES.join(', ')}`,
    };
  }

  const adrs = getAllADRs();
  const adr = adrs.find((a) => a.id.toLowerCase() === adrId.toLowerCase());

  if (!adr) {
    return { success: false, error: `ADR not found: ${adrId}` };
  }

  try {
    const baseDir = getBaseDir();
    const fullPath = path.resolve(baseDir, adr.filePath);
    let content = fs.readFileSync(fullPath, 'utf-8');

    // Update status
    content = content.replace(/\*\*Status:\*\*\s*.+/i, `**Status:** ${newStatus}`);

    // Update date if accepting
    if (newStatus.toLowerCase() === 'accepted') {
      content = content.replace(
        /\*\*Date:\*\*\s*.+/i,
        `**Date:** ${new Date().toISOString().split('T')[0]}`
      );
    }

    fs.writeFileSync(fullPath, content);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Generate dependency graph in Mermaid format
 */
export function generateDependencyGraph(): string {
  const adrs = getAllADRs();
  const lines: string[] = ['graph TD'];

  for (const adr of adrs) {
    const shortTitle = adr.title.substring(0, 25);
    lines.push(`    ${adr.id}["${adr.id}: ${shortTitle}"]`);

    for (const related of adr.relatedADRs) {
      lines.push(`    ${related} --> ${adr.id}`);
    }
  }

  return lines.join('\n');
}

/**
 * Get ADR statistics
 */
export function getADRStats(): {
  total: number;
  byStatus: Record<string, number>;
  bySprint: Record<string, number>;
  validationSummary: { valid: number; withErrors: number; withWarnings: number };
} {
  const adrs = getAllADRs();
  const validations = validateAllADRs();

  const byStatus: Record<string, number> = {};
  const bySprint: Record<string, number> = {};

  for (const adr of adrs) {
    const status = adr.status.split(' ')[0] || 'Unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;

    const sprint = adr.sprint || 'Unknown';
    bySprint[sprint] = (bySprint[sprint] || 0) + 1;
  }

  const validationSummary = validations.reduce(
    (acc, v) => {
      if (v.validation.valid && v.validation.warnings.length === 0) {
        acc.valid++;
      } else if (v.validation.valid) {
        acc.withWarnings++;
      } else {
        acc.withErrors++;
      }
      return acc;
    },
    { valid: 0, withErrors: 0, withWarnings: 0 }
  );

  return {
    total: adrs.length,
    byStatus,
    bySprint,
    validationSummary,
  };
}

function appendADRSectionFull(lines: string[], adrs: ADRMetadata[]): void {
  lines.push('| ID | Title | Date | Sprint | Story |', '|----|-------|------|--------|-------|');
  for (const adr of adrs) {
    lines.push(
      `| ${adr.id} | ${adr.title} | ${adr.date} | ${adr.sprint} | ${adr.technicalStory || '-'} |`
    );
  }
}

function appendADRSectionDeprecated(lines: string[], adrs: ADRMetadata[]): void {
  lines.push('| ID | Title | Status | Date |', '|----|-------|--------|------|');
  for (const adr of adrs) {
    lines.push(`| ${adr.id} | ${adr.title} | ${adr.status} | ${adr.date} |`);
  }
}

function appendADRSectionRejected(lines: string[], adrs: ADRMetadata[]): void {
  lines.push('| ID | Title | Date |', '|----|-------|------|');
  for (const adr of adrs) {
    lines.push(`| ${adr.id} | ${adr.title} | ${adr.date} |`);
  }
}

function appendADRSection(
  lines: string[],
  heading: string,
  adrs: ADRMetadata[],
  mode: 'full' | 'deprecated' | 'rejected'
): void {
  if (adrs.length === 0) return;
  lines.push(`## ${heading}`, '');
  if (mode === 'full') appendADRSectionFull(lines, adrs);
  else if (mode === 'deprecated') appendADRSectionDeprecated(lines, adrs);
  else appendADRSectionRejected(lines, adrs);
  lines.push('');
}

/**
 * Generate ADR index markdown content
 */
export function generateADRIndex(): string {
  const adrs = getAllADRs();

  // Group by status
  const accepted = adrs.filter((a) => a.status.includes('Accepted'));
  const proposed = adrs.filter((a) => a.status.includes('Proposed'));
  const deprecated = adrs.filter(
    (a) => a.status.includes('Deprecated') || a.status.includes('Superseded')
  );
  const rejected = adrs.filter((a) => a.status.includes('Rejected'));

  const lines: string[] = [
    '# ADR Index',
    '',
    `> Auto-generated on ${new Date().toISOString().split('T')[0]}`,
    '',
    '## Summary',
    '',
    `| Status | Count |`,
    `|--------|-------|`,
    `| Accepted | ${accepted.length} |`,
    `| Proposed | ${proposed.length} |`,
    `| Deprecated/Superseded | ${deprecated.length} |`,
    `| Rejected | ${rejected.length} |`,
    `| **Total** | **${adrs.length}** |`,
    '',
  ];

  appendADRSection(lines, 'Accepted', accepted, 'full');
  appendADRSection(lines, 'Proposed', proposed, 'full');
  appendADRSection(lines, 'Deprecated / Superseded', deprecated, 'deprecated');
  appendADRSection(lines, 'Rejected', rejected, 'rejected');

  // Dependency Graph
  lines.push('## Dependency Graph', '', '```mermaid', generateDependencyGraph(), '```', '');

  // ADR Details
  lines.push('## ADR Details', '');
  for (const adr of adrs) {
    lines.push(
      `### ${adr.id}: ${adr.title}`,
      '',
      `- **Status:** ${adr.status}`,
      `- **Date:** ${adr.date}`,
      `- **Sprint:** ${adr.sprint}`,
    );
    if (adr.technicalStory) {
      lines.push(`- **Story:** ${adr.technicalStory}`);
    }
    if (adr.deciders && adr.deciders !== 'Unknown') {
      lines.push(`- **Deciders:** ${adr.deciders}`);
    }
    if (adr.relatedADRs.length > 0) {
      lines.push(`- **Related:** ${adr.relatedADRs.join(', ')}`);
    }
    lines.push(`- **File:** \`${adr.filePath}\``, '');
  }

  return lines.join('\n');
}

/**
 * Write ADR index to file
 */
export function writeADRIndex(): { success: boolean; path?: string; error?: string } {
  const baseDir = getBaseDir();
  const outputPath = path.resolve(baseDir, 'docs/shared/adr-index.md');

  try {
    const content = generateADRIndex();

    // Ensure directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, content);

    return {
      success: true,
      path: path.relative(baseDir, outputPath),
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export { VALID_STATUSES };
