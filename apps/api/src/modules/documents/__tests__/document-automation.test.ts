/**
 * Document Automation Tests - PG-186
 *
 * Covers: loadDocumentAutomation, normalizeDocumentFilename, assertNotDeleteGuarded.
 * All tests exercise real behavior — NO `expect(true).toBe(true)` placeholders.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  loadDocumentAutomation,
  normalizeDocumentFilename,
  assertNotDeleteGuarded,
  AUTOMATION_FACTORY_DEFAULTS,
} from '../document-automation';

function buildCtx(overrides: Partial<{ existing: unknown; refExists: boolean }> = {}) {
  const existing = overrides.existing ?? null;
  const refExists = overrides.refExists ?? false;
  const findUnique = vi.fn().mockResolvedValue(existing);
  const create = vi.fn().mockImplementation(async ({ data }) => ({
    id: 'new-id',
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  const findFirst = vi.fn().mockResolvedValue(refExists ? { id: 'cd-1' } : null);

  return {
    ctx: {
      tenant: { tenantId: 'tenant-1' },
      prismaWithTenant: {
        documentAutomationSetting: { findUnique, create },
        caseDocument: { findFirst },
      },
    } as any,
    findUnique,
    create,
    findFirst,
  };
}

describe('loadDocumentAutomation', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('seeds defaults on first access (no existing row)', async () => {
    const { ctx, findUnique, create } = buildCtx({ existing: null });
    const flags = await loadDocumentAutomation(ctx);

    expect(findUnique).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
    expect(create).toHaveBeenCalledOnce();
    expect(flags).toEqual(AUTOMATION_FACTORY_DEFAULTS);
  });

  it('returns existing row without creating a new one', async () => {
    const existing = {
      id: 'row-1',
      tenantId: 'tenant-1',
      normalizeFilename: false,
      preventDeleteIfReferenced: true,
      notifyOnOwnerChange: true,
      notifyOnUpload: false,
      aiDocumentClassification: true,
      aiSensitiveDataDetection: false,
      aiSummarization: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { ctx, create } = buildCtx({ existing });
    const flags = await loadDocumentAutomation(ctx);

    expect(create).not.toHaveBeenCalled();
    expect(flags.normalizeFilename).toBe(false);
    expect(flags.notifyOnOwnerChange).toBe(true);
    expect(flags.aiDocumentClassification).toBe(true);
  });

  it('returns all 7 flag keys', async () => {
    const { ctx } = buildCtx({ existing: null });
    const flags = await loadDocumentAutomation(ctx);
    expect(Object.keys(flags).sort()).toEqual(
      [
        'aiDocumentClassification',
        'aiSensitiveDataDetection',
        'aiSummarization',
        'normalizeFilename',
        'notifyOnOwnerChange',
        'notifyOnUpload',
        'preventDeleteIfReferenced',
      ].sort()
    );
  });
});

describe('normalizeDocumentFilename', () => {
  it('normalizes to lowercase kebab-case when flag is enabled', () => {
    const result = normalizeDocumentFilename('Hello World.PDF', { normalizeFilename: true });
    expect(result).toBe('hello-world.pdf');
  });

  it('collapses spaces and punctuation to single hyphens', () => {
    const result = normalizeDocumentFilename('Q4 Report (final).docx', {
      normalizeFilename: true,
    });
    expect(result).toBe('q4-report-final.docx');
  });

  it('strips leading/trailing hyphens', () => {
    const result = normalizeDocumentFilename('  _weird_name_  .pdf', {
      normalizeFilename: true,
    });
    expect(result).toBe('weird-name.pdf');
  });

  it('preserves filenames without extension', () => {
    const result = normalizeDocumentFilename('Just A Name', { normalizeFilename: true });
    expect(result).toBe('just-a-name');
  });

  it('returns input unchanged when flag is false', () => {
    const result = normalizeDocumentFilename('UPPER Case Name.PDF', {
      normalizeFilename: false,
    });
    expect(result).toBe('UPPER Case Name.PDF');
  });

  it('lowercases the extension', () => {
    const result = normalizeDocumentFilename('file.PDF', { normalizeFilename: true });
    expect(result).toBe('file.pdf');
  });

  it('falls back to original when normalization empties the base', () => {
    const result = normalizeDocumentFilename('!!!.pdf', { normalizeFilename: true });
    expect(result).toBe('!!!.pdf');
  });

  it('handles empty string', () => {
    expect(normalizeDocumentFilename('', { normalizeFilename: true })).toBe('');
  });
});

describe('assertNotDeleteGuarded', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('throws PRECONDITION_FAILED when preventDeleteIfReferenced=true AND a CaseDocument ref exists', async () => {
    const existing = {
      id: 'row-1',
      tenantId: 'tenant-1',
      normalizeFilename: true,
      preventDeleteIfReferenced: true,
      notifyOnOwnerChange: false,
      notifyOnUpload: false,
      aiDocumentClassification: false,
      aiSensitiveDataDetection: false,
      aiSummarization: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { ctx } = buildCtx({ existing, refExists: true });

    await expect(assertNotDeleteGuarded('doc-1', ctx)).rejects.toThrow(TRPCError);
    await expect(assertNotDeleteGuarded('doc-1', ctx)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it('passes silently when no CaseDocument reference exists', async () => {
    const existing = {
      id: 'row-1',
      tenantId: 'tenant-1',
      normalizeFilename: true,
      preventDeleteIfReferenced: true,
      notifyOnOwnerChange: false,
      notifyOnUpload: false,
      aiDocumentClassification: false,
      aiSensitiveDataDetection: false,
      aiSummarization: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { ctx, findFirst } = buildCtx({ existing, refExists: false });

    await expect(assertNotDeleteGuarded('doc-1', ctx)).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledOnce();
  });

  it('skips the check when preventDeleteIfReferenced=false', async () => {
    const existing = {
      id: 'row-1',
      tenantId: 'tenant-1',
      normalizeFilename: true,
      preventDeleteIfReferenced: false,
      notifyOnOwnerChange: false,
      notifyOnUpload: false,
      aiDocumentClassification: false,
      aiSensitiveDataDetection: false,
      aiSummarization: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { ctx, findFirst } = buildCtx({ existing, refExists: true });

    await expect(assertNotDeleteGuarded('doc-1', ctx)).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('scopes the reference query by CaseDocument id (tenant isolation via tenantProcedure)', async () => {
    const existing = {
      id: 'row-1',
      tenantId: 'tenant-1',
      normalizeFilename: true,
      preventDeleteIfReferenced: true,
      notifyOnOwnerChange: false,
      notifyOnUpload: false,
      aiDocumentClassification: false,
      aiSensitiveDataDetection: false,
      aiSummarization: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { ctx, findFirst } = buildCtx({ existing, refExists: false });

    await assertNotDeleteGuarded('doc-42', ctx);
    const callArgs = findFirst.mock.calls[0]?.[0] as { where: { id: string } };
    expect(callArgs.where.id).toBe('doc-42');
  });
});

describe('AUTOMATION_FACTORY_DEFAULTS', () => {
  it('defaults AI toggles to false (opt-in privacy)', () => {
    expect(AUTOMATION_FACTORY_DEFAULTS.aiDocumentClassification).toBe(false);
    expect(AUTOMATION_FACTORY_DEFAULTS.aiSensitiveDataDetection).toBe(false);
    expect(AUTOMATION_FACTORY_DEFAULTS.aiSummarization).toBe(false);
  });

  it('defaults Cat-1 toggles to true (safe defaults)', () => {
    expect(AUTOMATION_FACTORY_DEFAULTS.normalizeFilename).toBe(true);
    expect(AUTOMATION_FACTORY_DEFAULTS.preventDeleteIfReferenced).toBe(true);
  });

  it('defaults Cat-2 (pending) toggles to false', () => {
    expect(AUTOMATION_FACTORY_DEFAULTS.notifyOnOwnerChange).toBe(false);
    expect(AUTOMATION_FACTORY_DEFAULTS.notifyOnUpload).toBe(false);
  });
});
