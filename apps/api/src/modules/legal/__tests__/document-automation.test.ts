/**
 * Document Automation Helper Tests - PG-186
 *
 * Verifies the runtime consumers of the DocumentAutomationSetting policy:
 * normalizeFilename, assertNotDeleteGuarded, assertCanCreateDocumentTag.
 */

import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  AUTOMATION_FACTORY_DEFAULTS,
  assertCanCreateDocumentTag,
  assertNotDeleteGuarded,
  normalizeFilename,
} from '../document-automation';

const tenantId = 'tenant-1';

describe('normalizeFilename', () => {
  it('returns the raw value when normalization is off', () => {
    expect(normalizeFilename('My File.PDF', { normalizeFilename: false })).toBe('My File.PDF');
  });

  it('lowercases, replaces spaces with _, and strips unsafe chars when on', () => {
    expect(normalizeFilename('My File (v2)!.PDF', { normalizeFilename: true })).toBe(
      'my_file_v2.pdf'
    );
  });
});

describe('assertCanCreateDocumentTag', () => {
  it('passes when restriction is off', () => {
    expect(() =>
      assertCanCreateDocumentTag({ user: { role: 'USER' } }, { restrictTagCreationToAdmins: false })
    ).not.toThrow();
  });

  it('passes for ADMIN when restriction is on', () => {
    expect(() =>
      assertCanCreateDocumentTag({ user: { role: 'ADMIN' } }, { restrictTagCreationToAdmins: true })
    ).not.toThrow();
  });

  it('passes for OWNER when restriction is on', () => {
    expect(() =>
      assertCanCreateDocumentTag({ user: { role: 'OWNER' } }, { restrictTagCreationToAdmins: true })
    ).not.toThrow();
  });

  it('throws FORBIDDEN for non-admin when restriction is on', () => {
    expect(() =>
      assertCanCreateDocumentTag({ user: { role: 'USER' } }, { restrictTagCreationToAdmins: true })
    ).toThrowError(TRPCError);
  });
});

describe('assertNotDeleteGuarded', () => {
  const buildCtx = (findFirst: ReturnType<typeof vi.fn>): any => ({
    tenant: { tenantId },
    prismaWithTenant: { caseDocument: { findFirst } },
  });

  it('no-op when toggle is off (does not query Prisma)', async () => {
    const findFirst = vi.fn();
    await expect(
      assertNotDeleteGuarded(buildCtx(findFirst), 'doc-1', { preventDeleteIfReferenced: false })
    ).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('no-op when document has neither a case nor contact reference', async () => {
    const findFirst = vi.fn().mockResolvedValue({ relatedCaseId: null, relatedContactId: null });
    await expect(
      assertNotDeleteGuarded(buildCtx(findFirst), 'doc-1', { preventDeleteIfReferenced: true })
    ).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1', tenantId },
        select: { relatedCaseId: true, relatedContactId: true },
      })
    );
  });

  it('throws PRECONDITION_FAILED when document is referenced by a case', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValue({ relatedCaseId: 'case-9', relatedContactId: null });
    await expect(
      assertNotDeleteGuarded(buildCtx(findFirst), 'doc-1', { preventDeleteIfReferenced: true })
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('throws PRECONDITION_FAILED when document is referenced by a contact', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValue({ relatedCaseId: null, relatedContactId: 'contact-9' });
    await expect(
      assertNotDeleteGuarded(buildCtx(findFirst), 'doc-1', { preventDeleteIfReferenced: true })
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('throws PRECONDITION_FAILED when both case and contact references are set', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValue({ relatedCaseId: 'case-9', relatedContactId: 'contact-9' });
    await expect(
      assertNotDeleteGuarded(buildCtx(findFirst), 'doc-1', { preventDeleteIfReferenced: true })
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('no-op (silent) when the document is not found — caller throws NOT_FOUND elsewhere', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(
      assertNotDeleteGuarded(buildCtx(findFirst), 'doc-missing', {
        preventDeleteIfReferenced: true,
      })
    ).resolves.toBeUndefined();
  });
});

describe('AUTOMATION_FACTORY_DEFAULTS', () => {
  it('keeps Cat-1 hygiene/safety toggles ON', () => {
    expect(AUTOMATION_FACTORY_DEFAULTS.normalizeFilename).toBe(true);
    expect(AUTOMATION_FACTORY_DEFAULTS.preventDeleteIfReferenced).toBe(true);
  });

  it('keeps notify-on-owner-change OFF (opt-in until IFC-311 ships)', () => {
    expect(AUTOMATION_FACTORY_DEFAULTS.notifyOnOwnerChange).toBe(false);
  });

  it('keeps every AI / Cat-2 toggle OFF (opt-in privacy)', () => {
    const aiKeys = [
      'autoVersionOnCollision',
      'autoDetectDuplicates',
      'autoExtractText',
      'autoClassifyCategory',
      'autoDetectPii',
      'aiTagSuggestions',
      'aiInsightGeneration',
    ] as const;
    for (const k of aiKeys) {
      expect(AUTOMATION_FACTORY_DEFAULTS[k]).toBe(false);
    }
  });
});
