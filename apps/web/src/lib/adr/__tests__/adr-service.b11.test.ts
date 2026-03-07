/**
 * ADR Service - B11 coverage tests
 *
 * Targets the ~16 uncovered lines in adr-service.ts:
 * - generateADRIndex: deprecated/superseded section, rejected section,
 *   ADR detail with empty technicalStory, deciders=Unknown, no relatedADRs
 * - createADR: no technicalStory branch
 * - getADRStats: status.split(' ')[0] fallback to 'Unknown'
 * - validateADR: existing related ADR found (no warning)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('fs', async () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    __esModule: true,
    default: {
      ...actual,
      resolve: vi.fn((...segments: string[]) => segments.join('/')),
      relative: vi.fn((from: string, to: string) =>
        to.startsWith(from + '/') ? to.slice(from.length + 1) : to
      ),
      join: vi.fn((...segments: string[]) => segments.join('/')),
      basename: actual.basename,
      dirname: actual.dirname,
    },
    ...actual,
    resolve: vi.fn((...segments: string[]) => segments.join('/')),
    relative: vi.fn((from: string, to: string) =>
      to.startsWith(from + '/') ? to.slice(from.length + 1) : to
    ),
    join: vi.fn((...segments: string[]) => segments.join('/')),
  };
});

import {
  generateADRIndex,
  createADR,
  getADRStats,
  validateADR,
  type ADRMetadata,
} from '../adr-service';

const readFileSync = fs.readFileSync as any as Mock; // test-only mock;
const existsSync = fs.existsSync as any as Mock; // test-only mock;
const readdirSync = fs.readdirSync as any as Mock; // test-only mock;
const writeFileSync = fs.writeFileSync as any as Mock; // test-only mock;
const _mkdirSync = fs.mkdirSync as any as Mock; // test-only mock;
const pathResolve = path.resolve as any as Mock; // test-only mock;
const pathRelative = path.relative as any as Mock; // test-only mock;
const pathJoin = path.join as any as Mock; // test-only mock;

// ADR with Deprecated status
const DEPRECATED_ADR = `# ADR-010: Old Approach
**Status:** Deprecated by ADR-011
**Date:** 2025-06-01
**Deciders:** Unknown
**Technical Story:** IFC-001

Sprint 2

## Context and Problem Statement
Old context.
## Decision Drivers
Factors.
## Considered Options
Option A.
## Decision Outcome
Chosen approach.
`;

// ADR with Rejected status
const REJECTED_ADR = `# ADR-020: Rejected Idea
**Status:** Rejected
**Date:** 2025-07-01

Sprint 3

## Context and Problem Statement
Context.
## Decision Drivers
Drivers.
## Considered Options
Options.
## Decision Outcome
Rejected.
`;

// ADR with Superseded status
const SUPERSEDED_ADR = `# ADR-030: Superseded Plan
**Status:** Superseded by ADR-031
**Date:** 2025-08-01

Sprint 4

## Context and Problem Statement
Old plan.
## Decision Drivers
Drivers.
## Considered Options
Options.
## Decision Outcome
Was chosen, now superseded.
`;

// ADR with empty technicalStory and deciders = "Unknown"
const ACCEPTED_SIMPLE_ADR = `# ADR-005: Simple Decision
**Status:** Accepted
**Date:** 2025-05-01

Sprint 1

## Context and Problem Statement
Simple context.
## Decision Drivers
Some drivers.
## Considered Options
Options.
## Decision Outcome
Outcome.
`;

const TEMPLATE_CONTENT = `# ADR-XXX: [Title of Decision]

**Status:** [Proposed | Accepted | Rejected | Deprecated | Superseded]
**Date:** YYYY-MM-DD
**Deciders:** [List of people]
**Technical Story:** [Link to relevant task/issue or description]

## Context and Problem Statement
## Decision Drivers
## Considered Options
## Decision Outcome

## Guidelines for Using This Template
This section should be removed.
`;

describe('adr-service (b11 coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/project');
    pathResolve.mockImplementation((...segments: string[]) => segments.join('/'));
    pathRelative.mockImplementation((from: string, to: string) =>
      to.startsWith(from + '/') ? to.slice(from.length + 1) : to
    );
    pathJoin.mockImplementation((...segments: string[]) => segments.join('/'));
  });

  describe('generateADRIndex - deprecated/superseded/rejected sections', () => {
    beforeEach(() => {
      existsSync.mockReturnValue(true);
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return [
            'ADR-005-simple.md',
            'ADR-010-old.md',
            'ADR-020-rejected.md',
            'ADR-030-superseded.md',
          ];
        }
        return [];
      });
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('ADR-005')) return ACCEPTED_SIMPLE_ADR;
        if (p.includes('ADR-010')) return DEPRECATED_ADR;
        if (p.includes('ADR-020')) return REJECTED_ADR;
        if (p.includes('ADR-030')) return SUPERSEDED_ADR;
        return '';
      });
    });

    it('includes Deprecated / Superseded section with status and date columns', () => {
      const index = generateADRIndex();

      expect(index).toContain('## Deprecated / Superseded');
      expect(index).toContain('ADR-010');
      expect(index).toContain('ADR-030');
      expect(index).toContain('Deprecated');
      expect(index).toContain('Superseded');
    });

    it('includes Rejected section with date column', () => {
      const index = generateADRIndex();

      expect(index).toContain('## Rejected');
      expect(index).toContain('ADR-020');
    });

    it('omits Story detail when technicalStory is empty', () => {
      const index = generateADRIndex();

      // ADR-005 has no technicalStory, so "Story:" line should not appear for it
      const adr005Section = index.split('### ADR-005:')[1]?.split('### ADR-')[0] || '';
      expect(adr005Section).not.toContain('**Story:**');
    });

    it('omits Deciders detail when deciders is Unknown', () => {
      const index = generateADRIndex();

      // ADR-005 has deciders = Unknown, so "Deciders:" line should not appear
      const adr005Section = index.split('### ADR-005:')[1]?.split('### ADR-')[0] || '';
      expect(adr005Section).not.toContain('**Deciders:**');
    });

    it('omits Related detail when relatedADRs is empty', () => {
      const index = generateADRIndex();

      // ADR-020 has no related ADRs
      const adr020Section = index.split('### ADR-020:')[1]?.split('### ADR-')[0] || '';
      expect(adr020Section).not.toContain('**Related:**');
    });

    it('includes Related detail when relatedADRs is non-empty', () => {
      const index = generateADRIndex();

      // ADR-010 references ADR-011 in the content
      const adr010Section = index.split('### ADR-010:')[1]?.split('### ADR-')[0] || '';
      expect(adr010Section).toContain('**Related:**');
      expect(adr010Section).toContain('ADR-011');
    });
  });

  describe('createADR - without technicalStory', () => {
    it('does not replace technical story placeholder when no technicalStory provided', () => {
      let writtenContent = '';
      existsSync.mockReturnValue(true);
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('template')) return TEMPLATE_CONTENT;
        return '';
      });
      readdirSync.mockReturnValue([]);
      writeFileSync.mockImplementation((_path: string, data: string) => {
        writtenContent = String(data);
      });

      const result = createADR('No Story Decision');

      expect(result.success).toBe(true);
      // When no technicalStory is provided, the placeholder should remain
      // (the replace only runs if technicalStory is truthy)
      expect(writtenContent).toContain('[Link to relevant task/issue');
    });
  });

  describe('getADRStats - edge cases', () => {
    it('handles status with spaces (splits on first space)', () => {
      existsSync.mockReturnValue(true);
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-010-old.md'];
        }
        return [];
      });
      readFileSync.mockReturnValue(DEPRECATED_ADR);

      const stats = getADRStats();

      // Status is "Deprecated by ADR-011", split(' ')[0] = "Deprecated"
      expect(stats.byStatus['Deprecated']).toBe(1);
    });
  });

  describe('validateADR - related ADR exists (no warning)', () => {
    it('does not warn when related ADR file exists', () => {
      existsSync.mockReturnValue(true);
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-010-old.md', 'ADR-011-new.md'];
        }
        return [];
      });
      readFileSync.mockReturnValue(DEPRECATED_ADR);

      const adr: ADRMetadata = {
        id: 'ADR-010',
        title: 'Old Approach',
        status: 'Deprecated by ADR-011',
        date: '2025-06-01',
        deciders: 'Unknown',
        technicalStory: 'IFC-001',
        filePath: 'docs/planning/adr/ADR-010-old.md',
        relatedADRs: ['ADR-011'],
        sprint: '2',
      };

      const result = validateADR(adr);

      // ADR-011 exists in the file listing, so no warning should be generated
      const relatedWarnings = result.warnings.filter((w) => w.includes('ADR-011'));
      expect(relatedWarnings).toHaveLength(0);
    });
  });
});
