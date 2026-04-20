/**
 * Document Policy Enforcement Tests — PG-186 Finding #1 remediation
 *
 * Covers loadDocumentPolicies / assertMimeAllowed / assertSizeAllowed /
 * assertRequiredFieldsPresent / enforceDocumentPolicies — the runtime
 * consumers that gate create/upload on tenant-configured Document
 * Settings. Runs entirely against in-memory mocks; no DB.
 */

import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  POLICY_FACTORY_DEFAULTS,
  loadDocumentPolicies,
  assertMimeAllowed,
  assertSizeAllowed,
  assertRequiredFieldsPresent,
  enforceDocumentPolicies,
} from '../document-policies';

function makeCtx(
  overrides: {
    general?: unknown;
    required?: ReadonlyArray<{ fieldKey: string; isRequired: boolean }>;
  } = {}
) {
  return {
    tenant: { tenantId: 'tenant-1' },
    prismaWithTenant: {
      documentGeneralConfig: {
        findUnique: vi.fn().mockResolvedValue(overrides.general ?? null),
      },
      documentRequiredField: {
        findMany: vi
          .fn()
          .mockResolvedValue(
            (overrides.required ?? []).map((r, i) => ({ id: `r-${i}`, tenantId: 't', ...r }))
          ),
      },
    },
  } as any;
}

describe('loadDocumentPolicies', () => {
  it('returns factory defaults when no tenant row exists', async () => {
    const snapshot = await loadDocumentPolicies(makeCtx());
    expect(snapshot.general).toEqual(POLICY_FACTORY_DEFAULTS);
    expect(snapshot.requiredFields).toEqual([]);
  });

  it('returns tenant row fields when present', async () => {
    const snapshot = await loadDocumentPolicies(
      makeCtx({
        general: {
          id: 'g-1',
          tenantId: 'tenant-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          allowedMimeTypes: ['application/pdf'],
          maxUploadSizeMb: 25,
          enableAntivirusScan: false,
          quarantineOnDetect: false,
          blockOnScanFailure: false,
          defaultRetentionDays: 90,
        },
        required: [{ fieldKey: 'title', isRequired: true }],
      })
    );
    expect(snapshot.general.allowedMimeTypes).toEqual(['application/pdf']);
    expect(snapshot.general.maxUploadSizeMb).toBe(25);
    expect(snapshot.requiredFields).toEqual([{ fieldKey: 'title', isRequired: true }]);
  });
});

describe('assertMimeAllowed', () => {
  it('passes when allowlist is empty (tenant not yet configured)', () => {
    expect(() => assertMimeAllowed('application/zip', { allowedMimeTypes: [] })).not.toThrow();
  });

  it('passes when MIME is in the allowlist', () => {
    expect(() =>
      assertMimeAllowed('application/pdf', { allowedMimeTypes: ['application/pdf'] })
    ).not.toThrow();
  });

  it('throws BAD_REQUEST when MIME is missing from allowlist', () => {
    expect(() =>
      assertMimeAllowed('application/x-malware', { allowedMimeTypes: ['application/pdf'] })
    ).toThrow(TRPCError);
  });
});

describe('assertSizeAllowed', () => {
  it('passes when size ≤ limit', () => {
    expect(() => assertSizeAllowed(10 * 1024 * 1024, { maxUploadSizeMb: 20 })).not.toThrow();
  });

  it('passes at exactly the limit', () => {
    expect(() => assertSizeAllowed(20 * 1024 * 1024, { maxUploadSizeMb: 20 })).not.toThrow();
  });

  it('throws PAYLOAD_TOO_LARGE when over limit', () => {
    const error = (() => {
      try {
        assertSizeAllowed(25 * 1024 * 1024, { maxUploadSizeMb: 20 });
      } catch (e) {
        return e as TRPCError;
      }
      throw new Error('should have thrown');
    })();
    expect(error).toBeInstanceOf(TRPCError);
    expect(error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('assertRequiredFieldsPresent', () => {
  const requiredFields = [
    { fieldKey: 'title', isRequired: true },
    { fieldKey: 'description', isRequired: false },
    { fieldKey: 'documentType', isRequired: true },
  ];

  it('passes when all required fields are present', () => {
    expect(() =>
      assertRequiredFieldsPresent({ title: 'My Doc', documentType: 'CONTRACT' }, { requiredFields })
    ).not.toThrow();
  });

  it('throws when a required string field is an empty string', () => {
    expect(() =>
      assertRequiredFieldsPresent({ title: '   ', documentType: 'CONTRACT' }, { requiredFields })
    ).toThrow(TRPCError);
  });

  it('throws when a required field is missing entirely', () => {
    expect(() =>
      assertRequiredFieldsPresent({ documentType: 'CONTRACT' }, { requiredFields })
    ).toThrow(TRPCError);
  });

  it('treats empty arrays as missing for required array fields', () => {
    const requiredWithTags = [{ fieldKey: 'tags', isRequired: true }];
    expect(() =>
      assertRequiredFieldsPresent({ tags: [] }, { requiredFields: requiredWithTags })
    ).toThrow(TRPCError);
    expect(() =>
      assertRequiredFieldsPresent({ tags: ['a'] }, { requiredFields: requiredWithTags })
    ).not.toThrow();
  });

  it('does not enforce fields marked isRequired=false', () => {
    expect(() =>
      assertRequiredFieldsPresent({ title: 'x', documentType: 'CONTRACT' }, { requiredFields })
    ).not.toThrow();
  });
});

describe('enforceDocumentPolicies', () => {
  it('runs all three guards and returns the snapshot on success', async () => {
    const ctx = makeCtx({
      general: {
        id: 'g',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        allowedMimeTypes: ['application/pdf'],
        maxUploadSizeMb: 50,
        enableAntivirusScan: true,
        quarantineOnDetect: true,
        blockOnScanFailure: true,
        defaultRetentionDays: 365,
      },
      required: [{ fieldKey: 'title', isRequired: true }],
    });
    const snapshot = await enforceDocumentPolicies(ctx, {
      title: 'Quarterly Report',
      mimeType: 'application/pdf',
      sizeBytes: 5 * 1024 * 1024,
    });
    expect(snapshot.general.maxUploadSizeMb).toBe(50);
  });

  it('blocks when MIME is not allowed', async () => {
    const ctx = makeCtx({
      general: {
        id: 'g',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        allowedMimeTypes: ['application/pdf'],
        maxUploadSizeMb: 50,
        enableAntivirusScan: true,
        quarantineOnDetect: true,
        blockOnScanFailure: true,
        defaultRetentionDays: 365,
      },
    });
    await expect(
      enforceDocumentPolicies(ctx, {
        title: 'x',
        mimeType: 'application/x-malware',
        sizeBytes: 10,
      })
    ).rejects.toThrow(TRPCError);
  });

  it('blocks when oversized', async () => {
    const ctx = makeCtx({
      general: {
        id: 'g',
        tenantId: 'tenant-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        allowedMimeTypes: [],
        maxUploadSizeMb: 1,
        enableAntivirusScan: true,
        quarantineOnDetect: true,
        blockOnScanFailure: true,
        defaultRetentionDays: 365,
      },
    });
    await expect(
      enforceDocumentPolicies(ctx, {
        title: 'x',
        mimeType: 'application/pdf',
        sizeBytes: 2 * 1024 * 1024,
      })
    ).rejects.toThrow(TRPCError);
  });

  it('blocks when a required field is missing', async () => {
    const ctx = makeCtx({
      required: [{ fieldKey: 'description', isRequired: true }],
    });
    await expect(
      enforceDocumentPolicies(ctx, {
        title: 'x',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      })
    ).rejects.toThrow(TRPCError);
  });
});
