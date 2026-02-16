/**
 * ADR Service Tests
 *
 * Unit tests for Architecture Decision Record lifecycle management.
 * Uses vi.spyOn to mock `fs` module functions.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// We need to spy on individual fs/path functions BEFORE importing the module under test.
// Use vi.mock with factory to control what gets exported.
vi.mock('fs', async () => {
  return {
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    __esModule: true,
    default: {
      ...actual,
      resolve: vi.fn((...segments: string[]) => segments.join('/')),
      relative: vi.fn((from: string, to: string) => {
        if (to.startsWith(from + '/')) {
          return to.slice(from.length + 1);
        }
        return to;
      }),
      join: vi.fn((...segments: string[]) => segments.join('/')),
    },
    ...actual,
    resolve: vi.fn((...segments: string[]) => segments.join('/')),
    relative: vi.fn((from: string, to: string) => {
      if (to.startsWith(from + '/')) {
        return to.slice(from.length + 1);
      }
      return to;
    }),
    join: vi.fn((...segments: string[]) => segments.join('/')),
  };
});

// Import the module under test after mocks are set up
import {
  parseADR,
  getAllADRFiles,
  getAllADRs,
  searchADRs,
  validateADR,
  validateAllADRs,
  createADR,
  updateADRStatus,
  generateDependencyGraph,
  getADRStats,
  generateADRIndex,
  writeADRIndex,
  VALID_STATUSES,
  type ADRMetadata,
} from '../adr-service';

// Cast to Mock type for convenience
const readFileSync = fs.readFileSync as unknown as Mock;
const existsSync = fs.existsSync as unknown as Mock;
const readdirSync = fs.readdirSync as unknown as Mock;
const writeFileSync = fs.writeFileSync as unknown as Mock;
const mkdirSync = fs.mkdirSync as unknown as Mock;
const pathResolve = path.resolve as unknown as Mock;
const pathRelative = path.relative as unknown as Mock;
const pathJoin = path.join as unknown as Mock;

const SAMPLE_ADR_CONTENT = `# ADR-001: Use TypeScript for Backend

**Status:** Accepted
**Date:** 2025-12-15
**Deciders:** Engineering Team
**Technical Story:** IFC-001

## Context and Problem Statement

We need to decide on a backend language.

## Decision Drivers

- Type safety
- Developer productivity

## Considered Options

- TypeScript
- Python
- Go

## Decision Outcome

Chose TypeScript for end-to-end type safety.

Sprint 1 task.

See also ADR-002 and ADR-003.
`;

const SAMPLE_ADR_CONTENT_MINIMAL = `# ADR-002: Use PostgreSQL

**Status:** Proposed
**Date:** 2025-12-20

## Context and Problem Statement

We need a database.

## Decision Drivers

- Reliability

## Considered Options

- PostgreSQL

## Decision Outcome

Chose PostgreSQL.
`;

const SAMPLE_TEMPLATE_CONTENT = `# ADR-XXX: [Title of Decision]

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

describe('adr-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock process.cwd()
    vi.spyOn(process, 'cwd').mockReturnValue('/project');
    // Reset path mocks to consistent behavior
    pathResolve.mockImplementation((...segments: string[]) => segments.join('/'));
    pathRelative.mockImplementation((from: string, to: string) => {
      if (to.startsWith(from + '/')) {
        return to.slice(from.length + 1);
      }
      return to;
    });
    pathJoin.mockImplementation((...segments: string[]) => segments.join('/'));
  });

  describe('VALID_STATUSES', () => {
    it('should contain all expected ADR statuses', () => {
      expect(VALID_STATUSES).toEqual([
        'Proposed',
        'Accepted',
        'Rejected',
        'Deprecated',
        'Superseded',
      ]);
    });
  });

  describe('parseADR', () => {
    it('should parse a complete ADR file and extract metadata', () => {
      readFileSync.mockReturnValue(SAMPLE_ADR_CONTENT);

      const result = parseADR('/project/docs/planning/adr/ADR-001-use-typescript.md');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('ADR-001');
      expect(result!.title).toBe('Use TypeScript for Backend');
      expect(result!.status).toBe('Accepted');
      expect(result!.date).toBe('2025-12-15');
      expect(result!.deciders).toBe('Engineering Team');
      expect(result!.technicalStory).toBe('IFC-001');
      expect(result!.sprint).toBe('1');
      expect(result!.relatedADRs).toContain('ADR-002');
      expect(result!.relatedADRs).toContain('ADR-003');
      // Should not include self-reference
      expect(result!.relatedADRs).not.toContain('ADR-001');
    });

    it('should extract ID from title when present', () => {
      readFileSync.mockReturnValue(
        '# ADR-005: Some Decision\n\n**Status:** Proposed\n**Date:** 2025-01-01'
      );

      const result = parseADR('/project/docs/planning/adr/ADR-005-some-decision.md');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('ADR-005');
    });

    it('should extract ID from filename when not in title', () => {
      readFileSync.mockReturnValue(
        '# Some Decision Without ID\n\n**Status:** Proposed\n**Date:** 2025-01-01'
      );

      const result = parseADR('/project/docs/planning/adr/ADR-010-some-decision.md');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('ADR-010');
    });

    it('should extract numeric ID from filename starting with digits', () => {
      readFileSync.mockReturnValue('# Some Decision\n\n**Status:** Proposed\n**Date:** 2025-01-01');

      const result = parseADR('/project/docs/planning/adr/005-some-decision.md');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('ADR-005');
    });

    it('should use filename as ID when no numeric pattern found', () => {
      readFileSync.mockReturnValue('# Some Decision\n\n**Status:** Proposed\n**Date:** 2025-01-01');

      const result = parseADR('/project/docs/planning/adr/some-decision.md');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('some-decision');
    });

    it('should handle missing metadata fields gracefully', () => {
      readFileSync.mockReturnValue('# Just a Title\n\nSome content.');

      const result = parseADR('/project/docs/planning/adr/test.md');

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Just a Title');
      expect(result!.status).toBe('Unknown');
      expect(result!.date).toBe('Unknown');
      expect(result!.deciders).toBe('Unknown');
      expect(result!.technicalStory).toBe('');
      expect(result!.sprint).toBe('Unknown');
      expect(result!.relatedADRs).toEqual([]);
    });

    it('should return null when file cannot be read', () => {
      readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = parseADR('/project/docs/planning/adr/nonexistent.md');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should strip ADR-NNN prefix from title', () => {
      readFileSync.mockReturnValue('# ADR-001: My Cool Decision\n\n**Status:** Accepted');

      const result = parseADR('/project/docs/planning/adr/ADR-001.md');

      expect(result!.title).toBe('My Cool Decision');
    });

    it('should not duplicate related ADRs', () => {
      readFileSync.mockReturnValue(
        '# ADR-001: Test\n\n**Status:** Accepted\n\nReferences ADR-002 and also ADR-002 again.'
      );

      const result = parseADR('/project/docs/planning/adr/ADR-001.md');

      expect(result!.relatedADRs).toEqual(['ADR-002']);
    });

    it('should pad ID to 3 digits', () => {
      readFileSync.mockReturnValue('# ADR-1: Short ID\n\n**Status:** Proposed');

      const result = parseADR('/project/docs/planning/adr/ADR-1.md');

      expect(result!.id).toBe('ADR-001');
    });
  });

  describe('getAllADRFiles', () => {
    it('should collect .md files with ADR or numeric prefix from all configured paths', () => {
      existsSync.mockReturnValue(true);
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-001-typescript.md', 'ADR-002-postgres.md', 'readme.md'];
        }
        if (p.includes('docs/architecture/adr')) {
          return ['003-caching.md', 'notes.txt'];
        }
        if (p.includes('docs/shared')) {
          return ['adr-index.md', 'other.md'];
        }
        return [];
      });

      const files = getAllADRFiles();

      // Should include ADR-001, ADR-002, 003 but not readme.md, notes.txt, other.md
      expect(files.length).toBe(3);
    });

    it('should skip directories that do not exist', () => {
      existsSync.mockReturnValue(false);

      const files = getAllADRFiles();

      expect(files).toEqual([]);
      expect(readdirSync).not.toHaveBeenCalled();
    });

    it('should return sorted file list', () => {
      existsSync.mockReturnValue(true);
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-002-b.md', 'ADR-001-a.md'];
        }
        return [];
      });

      const files = getAllADRFiles();

      // Files should be sorted
      expect(files[0]).toContain('ADR-001');
      expect(files[1]).toContain('ADR-002');
    });
  });

  describe('getAllADRs', () => {
    beforeEach(() => {
      existsSync.mockReturnValue(true);
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-001-typescript.md', 'ADR-002-postgres.md'];
        }
        return [];
      });
    });

    it('should return parsed ADR metadata excluding templates', () => {
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('ADR-001')) return SAMPLE_ADR_CONTENT;
        if (p.includes('ADR-002')) return SAMPLE_ADR_CONTENT_MINIMAL;
        return '';
      });

      const adrs = getAllADRs();

      expect(adrs.length).toBe(2);
      expect(adrs[0].id).toBe('ADR-001');
      expect(adrs[1].id).toBe('ADR-002');
    });

    it('should filter out template files', () => {
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-000-template.md', 'ADR-001-typescript.md'];
        }
        return [];
      });
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('template')) return '# ADR Template\n\n**Status:** Proposed';
        if (p.includes('ADR-001')) return SAMPLE_ADR_CONTENT;
        return '';
      });

      const adrs = getAllADRs();

      // Template should be excluded (title contains "Template" or filePath contains "template")
      const templateAdr = adrs.find((a) => a.title.includes('Template'));
      expect(templateAdr).toBeUndefined();
    });

    it('should skip unparseable files', () => {
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-001-typescript.md'];
        }
        return [];
      });
      readFileSync.mockImplementation(() => {
        throw new Error('Cannot read');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const adrs = getAllADRs();

      expect(adrs).toEqual([]);
      consoleSpy.mockRestore();
    });

    it('should sort ADRs by id', () => {
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-002-postgres.md', 'ADR-001-typescript.md'];
        }
        return [];
      });
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('ADR-001')) return SAMPLE_ADR_CONTENT;
        if (p.includes('ADR-002')) return SAMPLE_ADR_CONTENT_MINIMAL;
        return '';
      });

      const adrs = getAllADRs();

      expect(adrs[0].id).toBe('ADR-001');
      expect(adrs[1].id).toBe('ADR-002');
    });
  });

  describe('searchADRs', () => {
    beforeEach(() => {
      existsSync.mockReturnValue(true);
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-001-typescript.md', 'ADR-002-postgres.md'];
        }
        return [];
      });
    });

    it('should find ADRs matching by title', () => {
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('ADR-001')) return SAMPLE_ADR_CONTENT;
        if (p.includes('ADR-002')) return SAMPLE_ADR_CONTENT_MINIMAL;
        return '';
      });

      const results = searchADRs('TypeScript');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.title.includes('TypeScript'))).toBe(true);
    });

    it('should find ADRs matching by ID', () => {
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('ADR-001')) return SAMPLE_ADR_CONTENT;
        if (p.includes('ADR-002')) return SAMPLE_ADR_CONTENT_MINIMAL;
        return '';
      });

      const results = searchADRs('ADR-002');

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should find ADRs matching by content', () => {
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('ADR-001')) return SAMPLE_ADR_CONTENT;
        if (p.includes('ADR-002')) return SAMPLE_ADR_CONTENT_MINIMAL;
        return '';
      });

      const results = searchADRs('end-to-end type safety');

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should be case-insensitive', () => {
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('ADR-001')) return SAMPLE_ADR_CONTENT;
        if (p.includes('ADR-002')) return SAMPLE_ADR_CONTENT_MINIMAL;
        return '';
      });

      const results = searchADRs('typescript');

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty array when no matches', () => {
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('ADR-001')) return SAMPLE_ADR_CONTENT;
        if (p.includes('ADR-002')) return SAMPLE_ADR_CONTENT_MINIMAL;
        return '';
      });

      const results = searchADRs('nonexistent-technology-xyz');

      expect(results).toEqual([]);
    });
  });

  describe('validateADR', () => {
    const createMockADR = (overrides: Partial<ADRMetadata> = {}): ADRMetadata => ({
      id: 'ADR-001',
      title: 'Test Decision',
      status: 'Accepted',
      date: '2025-12-15',
      deciders: 'Team',
      technicalStory: 'IFC-001',
      filePath: 'docs/planning/adr/ADR-001.md',
      relatedADRs: [],
      sprint: '1',
      ...overrides,
    });

    it('should validate a complete ADR as valid', () => {
      readFileSync.mockReturnValue(SAMPLE_ADR_CONTENT);
      existsSync.mockReturnValue(true);
      readdirSync.mockReturnValue([]);

      const adr = createMockADR();
      const result = validateADR(adr);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report missing required sections as errors', () => {
      readFileSync.mockReturnValue('# Test\n\nNo required sections here.');
      existsSync.mockReturnValue(true);
      readdirSync.mockReturnValue([]);

      const adr = createMockADR();
      const result = validateADR(adr);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing section: Context and Problem Statement');
      expect(result.errors).toContain('Missing section: Decision Drivers');
      expect(result.errors).toContain('Missing section: Considered Options');
      expect(result.errors).toContain('Missing section: Decision Outcome');
    });

    it('should report invalid status as error', () => {
      readFileSync.mockReturnValue(SAMPLE_ADR_CONTENT);
      existsSync.mockReturnValue(true);
      readdirSync.mockReturnValue([]);

      const adr = createMockADR({ status: 'InvalidStatus' });
      const result = validateADR(adr);

      expect(result.errors).toContain('Invalid status: InvalidStatus');
    });

    it('should warn about incorrect date format', () => {
      readFileSync.mockReturnValue(SAMPLE_ADR_CONTENT);
      existsSync.mockReturnValue(true);
      readdirSync.mockReturnValue([]);

      const adr = createMockADR({ date: 'Dec 15, 2025' });
      const result = validateADR(adr);

      expect(result.warnings.some((w) => w.includes('Date format'))).toBe(true);
    });

    it('should not warn about Unknown date', () => {
      readFileSync.mockReturnValue(SAMPLE_ADR_CONTENT);
      existsSync.mockReturnValue(true);
      readdirSync.mockReturnValue([]);

      const adr = createMockADR({ date: 'Unknown' });
      const result = validateADR(adr);

      expect(result.warnings.filter((w) => w.includes('Date format'))).toHaveLength(0);
    });

    it('should not warn about YYYY-MM-DD placeholder date', () => {
      readFileSync.mockReturnValue(SAMPLE_ADR_CONTENT);
      existsSync.mockReturnValue(true);
      readdirSync.mockReturnValue([]);

      const adr = createMockADR({ date: 'YYYY-MM-DD' });
      const result = validateADR(adr);

      expect(result.warnings.filter((w) => w.includes('Date format'))).toHaveLength(0);
    });

    it('should warn about missing technical story', () => {
      readFileSync.mockReturnValue(SAMPLE_ADR_CONTENT);
      existsSync.mockReturnValue(true);
      readdirSync.mockReturnValue([]);

      const adr = createMockADR({ technicalStory: '' });
      const result = validateADR(adr);

      expect(result.warnings).toContain('Technical story not specified');
    });

    it('should warn about technical story with placeholder brackets', () => {
      readFileSync.mockReturnValue(SAMPLE_ADR_CONTENT);
      existsSync.mockReturnValue(true);
      readdirSync.mockReturnValue([]);

      const adr = createMockADR({ technicalStory: '[Link to task]' });
      const result = validateADR(adr);

      expect(result.warnings).toContain('Technical story not specified');
    });

    it('should warn about non-existent related ADRs', () => {
      readFileSync.mockReturnValue(SAMPLE_ADR_CONTENT);
      existsSync.mockReturnValue(true);
      readdirSync.mockReturnValue([]);

      const adr = createMockADR({ relatedADRs: ['ADR-999'] });
      const result = validateADR(adr);

      expect(result.warnings.some((w) => w.includes('ADR-999'))).toBe(true);
    });

    it('should report error when file cannot be read', () => {
      readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      existsSync.mockReturnValue(true);
      readdirSync.mockReturnValue([]);

      const adr = createMockADR();
      const result = validateADR(adr);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Failed to read file'))).toBe(true);
    });

    it('should accept valid YYYY-MM-DD date format', () => {
      readFileSync.mockReturnValue(SAMPLE_ADR_CONTENT);
      existsSync.mockReturnValue(true);
      readdirSync.mockReturnValue([]);

      const adr = createMockADR({ date: '2025-12-15' });
      const result = validateADR(adr);

      expect(result.warnings.filter((w) => w.includes('Date format'))).toHaveLength(0);
    });
  });

  describe('validateAllADRs', () => {
    it('should return validation results for all ADRs', () => {
      existsSync.mockReturnValue(true);
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-001-typescript.md'];
        }
        return [];
      });
      readFileSync.mockReturnValue(SAMPLE_ADR_CONTENT);

      const results = validateAllADRs();

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]).toHaveProperty('validation');
      expect(results[0].validation).toHaveProperty('valid');
      expect(results[0].validation).toHaveProperty('errors');
      expect(results[0].validation).toHaveProperty('warnings');
    });
  });

  describe('createADR', () => {
    it('should create a new ADR from template', () => {
      existsSync.mockImplementation((p: string) => {
        const filePath = String(p);
        if (filePath.includes('000-template.md') || filePath.includes('template')) return true;
        if (filePath.includes('docs/planning/adr')) return true;
        return false;
      });
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('template')) return SAMPLE_TEMPLATE_CONTENT;
        return '';
      });
      readdirSync.mockReturnValue([]);
      writeFileSync.mockImplementation(() => {});

      const result = createADR('My New Decision', 'IFC-042');

      expect(result.success).toBe(true);
      expect(result.path).toBeDefined();
      expect(result.path).toContain('ADR-001');
      expect(result.path).toContain('my-new-decision');
    });

    it('should increment ID based on existing ADRs', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('template')) return SAMPLE_TEMPLATE_CONTENT;
        if (p.includes('ADR-005'))
          return '# ADR-005: Existing\n\n**Status:** Accepted\n**Date:** 2025-01-01';
        return '';
      });
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) return ['ADR-005-existing.md'];
        return [];
      });
      writeFileSync.mockImplementation(() => {});

      const result = createADR('Another Decision');

      expect(result.success).toBe(true);
      expect(result.path).toContain('ADR-006');
    });

    it('should fail when template is not found', () => {
      existsSync.mockReturnValue(false);

      const result = createADR('Some Decision');

      expect(result.success).toBe(false);
      expect(result.error).toContain('template not found');
    });

    it('should replace placeholders in template', () => {
      let writtenContent = '';
      existsSync.mockReturnValue(true);
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('template')) return SAMPLE_TEMPLATE_CONTENT;
        return '';
      });
      readdirSync.mockReturnValue([]);
      writeFileSync.mockImplementation((_path: string, data: string) => {
        writtenContent = String(data);
      });

      createADR('My Decision', 'IFC-100');

      expect(writtenContent).toContain('ADR-001');
      expect(writtenContent).toContain('My Decision');
      expect(writtenContent).toContain('Proposed');
      expect(writtenContent).toContain('IFC-100');
      expect(writtenContent).not.toContain('YYYY-MM-DD');
      expect(writtenContent).not.toContain('ADR-XXX');
      // Guidelines section should be removed
      expect(writtenContent).not.toContain('Guidelines for Using This Template');
    });

    it('should sanitize the title for filename', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('template')) return SAMPLE_TEMPLATE_CONTENT;
        return '';
      });
      readdirSync.mockReturnValue([]);
      writeFileSync.mockImplementation(() => {});

      const result = createADR('Use Redis for Caching!');

      expect(result.success).toBe(true);
      expect(result.path).toContain('use-redis-for-caching');
      expect(result.path).not.toContain('!');
    });

    it('should create output directory if it does not exist', () => {
      existsSync.mockImplementation((p: string) => {
        const filePath = String(p);
        if (filePath.includes('template')) return true;
        return false;
      });
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('template')) return SAMPLE_TEMPLATE_CONTENT;
        return '';
      });
      readdirSync.mockReturnValue([]);
      writeFileSync.mockImplementation(() => {});
      mkdirSync.mockImplementation(() => undefined);

      createADR('Test Decision');

      expect(mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('should handle write errors gracefully', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('template')) return SAMPLE_TEMPLATE_CONTENT;
        return '';
      });
      readdirSync.mockReturnValue([]);
      writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = createADR('Failing Decision');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('updateADRStatus', () => {
    beforeEach(() => {
      existsSync.mockReturnValue(true);
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-001-typescript.md'];
        }
        return [];
      });
      readFileSync.mockReturnValue(SAMPLE_ADR_CONTENT);
      writeFileSync.mockImplementation(() => {});
    });

    it('should update ADR status successfully', () => {
      const result = updateADRStatus('ADR-001', 'Deprecated');

      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const result = updateADRStatus('ADR-001', 'InvalidStatus');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid status');
      expect(result.error).toContain('Proposed');
    });

    it('should return error when ADR is not found', () => {
      const result = updateADRStatus('ADR-999', 'Accepted');

      expect(result.success).toBe(false);
      expect(result.error).toContain('ADR not found');
    });

    it('should update date when accepting', () => {
      let writtenContent = '';
      writeFileSync.mockImplementation((_path: string, data: string) => {
        writtenContent = String(data);
      });

      updateADRStatus('ADR-001', 'Accepted');

      expect(writtenContent).toContain('**Status:** Accepted');
      // Should also update the date
      expect(writtenContent).toMatch(/\*\*Date:\*\* \d{4}-\d{2}-\d{2}/);
    });

    it('should not update date for non-Accepted status', () => {
      let writtenContent = '';
      writeFileSync.mockImplementation((_path: string, data: string) => {
        writtenContent = String(data);
      });

      updateADRStatus('ADR-001', 'Rejected');

      expect(writtenContent).toContain('**Status:** Rejected');
      // Date should remain original
      expect(writtenContent).toContain('**Date:** 2025-12-15');
    });

    it('should be case-insensitive for ADR ID lookup', () => {
      const result = updateADRStatus('adr-001', 'Proposed');

      expect(result.success).toBe(true);
    });

    it('should handle file write errors', () => {
      writeFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });

      const result = updateADRStatus('ADR-001', 'Deprecated');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Disk full');
    });
  });

  describe('generateDependencyGraph', () => {
    beforeEach(() => {
      existsSync.mockReturnValue(true);
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-001-typescript.md', 'ADR-002-postgres.md'];
        }
        return [];
      });
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('ADR-001')) return SAMPLE_ADR_CONTENT;
        if (p.includes('ADR-002')) return SAMPLE_ADR_CONTENT_MINIMAL;
        return '';
      });
    });

    it('should generate valid Mermaid graph syntax', () => {
      const graph = generateDependencyGraph();

      expect(graph).toContain('graph TD');
      expect(graph).toContain('ADR-001');
    });

    it('should include node definitions for each ADR', () => {
      const graph = generateDependencyGraph();

      expect(graph).toContain('ADR-001["ADR-001:');
      expect(graph).toContain('ADR-002["ADR-002:');
    });

    it('should include dependency edges for related ADRs', () => {
      const graph = generateDependencyGraph();

      // ADR-001 references ADR-002 and ADR-003, so edges should be drawn
      expect(graph).toContain('ADR-002 --> ADR-001');
      expect(graph).toContain('ADR-003 --> ADR-001');
    });
  });

  describe('getADRStats', () => {
    beforeEach(() => {
      existsSync.mockReturnValue(true);
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-001-typescript.md', 'ADR-002-postgres.md'];
        }
        return [];
      });
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('ADR-001')) return SAMPLE_ADR_CONTENT;
        if (p.includes('ADR-002')) return SAMPLE_ADR_CONTENT_MINIMAL;
        return '';
      });
    });

    it('should return correct total count', () => {
      const stats = getADRStats();

      expect(stats.total).toBe(2);
    });

    it('should group by status correctly', () => {
      const stats = getADRStats();

      expect(stats.byStatus['Accepted']).toBe(1);
      expect(stats.byStatus['Proposed']).toBe(1);
    });

    it('should group by sprint correctly', () => {
      const stats = getADRStats();

      // ADR-001 has Sprint 1, ADR-002 has Unknown sprint
      expect(stats.bySprint['1']).toBe(1);
      expect(stats.bySprint['Unknown']).toBe(1);
    });

    it('should include validation summary', () => {
      const stats = getADRStats();

      expect(stats.validationSummary).toHaveProperty('valid');
      expect(stats.validationSummary).toHaveProperty('withErrors');
      expect(stats.validationSummary).toHaveProperty('withWarnings');
      expect(
        stats.validationSummary.valid +
          stats.validationSummary.withErrors +
          stats.validationSummary.withWarnings
      ).toBe(stats.total);
    });
  });

  describe('generateADRIndex', () => {
    beforeEach(() => {
      existsSync.mockReturnValue(true);
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-001-typescript.md', 'ADR-002-postgres.md'];
        }
        return [];
      });
      readFileSync.mockImplementation((filePath: string) => {
        const p = String(filePath);
        if (p.includes('ADR-001')) return SAMPLE_ADR_CONTENT;
        if (p.includes('ADR-002')) return SAMPLE_ADR_CONTENT_MINIMAL;
        return '';
      });
    });

    it('should generate markdown with ADR Index title', () => {
      const index = generateADRIndex();

      expect(index).toContain('# ADR Index');
    });

    it('should include summary table', () => {
      const index = generateADRIndex();

      expect(index).toContain('## Summary');
      expect(index).toContain('| Status | Count |');
      expect(index).toContain('Accepted');
      expect(index).toContain('Proposed');
    });

    it('should include Accepted section when there are accepted ADRs', () => {
      const index = generateADRIndex();

      expect(index).toContain('## Accepted');
      expect(index).toContain('ADR-001');
    });

    it('should include Proposed section when there are proposed ADRs', () => {
      const index = generateADRIndex();

      expect(index).toContain('## Proposed');
      expect(index).toContain('ADR-002');
    });

    it('should include Mermaid dependency graph', () => {
      const index = generateADRIndex();

      expect(index).toContain('## Dependency Graph');
      expect(index).toContain('```mermaid');
      expect(index).toContain('graph TD');
    });

    it('should include ADR Details section', () => {
      const index = generateADRIndex();

      expect(index).toContain('## ADR Details');
      expect(index).toContain('### ADR-001:');
      expect(index).toContain('### ADR-002:');
    });

    it('should include auto-generated date', () => {
      const index = generateADRIndex();

      expect(index).toMatch(/Auto-generated on \d{4}-\d{2}-\d{2}/);
    });
  });

  describe('writeADRIndex', () => {
    beforeEach(() => {
      existsSync.mockReturnValue(true);
      readdirSync.mockImplementation((dirPath: string) => {
        const p = String(dirPath);
        if (p.includes('docs/planning/adr')) {
          return ['ADR-001-typescript.md'];
        }
        return [];
      });
      readFileSync.mockReturnValue(SAMPLE_ADR_CONTENT);
      writeFileSync.mockImplementation(() => {});
    });

    it('should write ADR index to file and return success', () => {
      const result = writeADRIndex();

      expect(result.success).toBe(true);
      expect(result.path).toContain('adr-index.md');
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should create output directory if it does not exist', () => {
      existsSync.mockImplementation((p: string) => {
        const filePath = String(p);
        // ADR paths exist but output dir does not
        if (filePath.includes('docs/shared')) return false;
        return true;
      });
      mkdirSync.mockImplementation(() => undefined);

      writeADRIndex();

      expect(mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('should handle write errors gracefully', () => {
      writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      const result = writeADRIndex();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Write failed');
    });
  });
});
