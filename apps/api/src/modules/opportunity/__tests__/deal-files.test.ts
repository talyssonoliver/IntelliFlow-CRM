/**
 * Deal File Helpers Tests (#421, IFC-280 deferred)
 *
 * Tests attachDealFile / listDealFiles / removeDealFile directly against a
 * minimal fake Context — these are plain async functions, not tRPC
 * procedures, so there's no need to go through a router caller.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  attachDealFile,
  listDealFiles,
  removeDealFile,
  resolveDealFileType,
  formatFileSize,
  MAX_DEAL_FILE_SIZE_BYTES,
} from '../deal-files';
import type { Context } from '../../../context';

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
const OPPORTUNITY_ID = 'opportunity-1';

function buildCtx(overrides: Partial<Record<string, unknown>> = {}): Context {
  const prismaWithTenant = {
    opportunity: {
      findFirst: vi.fn().mockResolvedValue({ id: OPPORTUNITY_ID }),
    },
    dealFile: {
      create: vi.fn().mockImplementation(async ({ data }: any) => ({
        id: 'file-1',
        uploadedAt: new Date(),
        ...data,
      })),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({ id: 'file-1' }),
    },
  };

  const storageService = {
    uploadToQuarantine: vi.fn().mockResolvedValue('quarantine/key'),
    moveToPrimary: vi.fn().mockResolvedValue('primary/key'),
    deleteFromQuarantine: vi.fn().mockResolvedValue(undefined),
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example.invalid/file'),
    download: vi.fn(),
  };

  const avScanner = {
    scan: vi
      .fn()
      .mockResolvedValue({ clean: true, threatName: null, scanDuration: 1, engine: 'test' }),
    isHealthy: vi.fn().mockResolvedValue(true),
  };

  return {
    tenant: { tenantId: TENANT_ID, userId: USER_ID, tenantType: 'user', role: 'USER' },
    prismaWithTenant,
    adapters: { storageService, avScanner },
    ...overrides,
  } as unknown as Context;
}

// A valid base64 payload (content doesn't need to be a real PDF for these tests).
const SAMPLE_CONTENT = Buffer.from('hello world').toString('base64');

describe('deal-files (#421)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveDealFileType', () => {
    it('maps known MIME types to the DealFile.FileType enum', () => {
      expect(resolveDealFileType('application/pdf')).toBe('PDF');
      expect(resolveDealFileType('image/png')).toBe('IMAGE');
      expect(resolveDealFileType('application/vnd.ms-excel')).toBe('XLS');
    });

    it('rejects unknown MIME types', () => {
      expect(resolveDealFileType('application/x-executable')).toBeNull();
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes, KB and MB', () => {
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(2048)).toBe('2.0 KB');
      expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    });
  });

  describe('attachDealFile', () => {
    it('throws NOT_FOUND when the deal does not exist', async () => {
      const ctx = buildCtx();
      (ctx.prismaWithTenant as any).opportunity.findFirst.mockResolvedValue(null);

      await expect(
        attachDealFile(ctx, {
          opportunityId: OPPORTUNITY_ID,
          name: 'doc.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 11,
          content: SAMPLE_CONTENT,
        })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    // Tenant-isolation defense-in-depth (#421 security fix): the deal-existence
    // check must scope by tenantId, not just id. Under the documented pooled-
    // connection SET race (tenant-context.ts), RLS alone can't be trusted — this
    // explicit filter is what stops a cross-tenant opportunityId from resolving.
    it('scopes the deal-existence check by tenantId, not just opportunityId', async () => {
      const ctx = buildCtx();

      await attachDealFile(ctx, {
        opportunityId: OPPORTUNITY_ID,
        name: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 11,
        content: SAMPLE_CONTENT,
      });

      expect((ctx.prismaWithTenant as any).opportunity.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: OPPORTUNITY_ID, tenantId: TENANT_ID }),
        })
      );
    });

    it('rejects a disallowed MIME type before touching storage', async () => {
      const ctx = buildCtx();

      await expect(
        attachDealFile(ctx, {
          opportunityId: OPPORTUNITY_ID,
          name: 'virus.exe',
          mimeType: 'application/x-executable',
          sizeBytes: 11,
          content: SAMPLE_CONTENT,
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      expect((ctx.adapters as any).storageService.uploadToQuarantine).not.toHaveBeenCalled();
    });

    it('rejects a file over the size limit using the DECODED buffer length', async () => {
      const ctx = buildCtx();
      // A caller-supplied sizeBytes that lies (claims small) must not bypass
      // the real decoded-buffer check.
      const bigContent = Buffer.alloc(MAX_DEAL_FILE_SIZE_BYTES + 1, 'a').toString('base64');

      await expect(
        attachDealFile(ctx, {
          opportunityId: OPPORTUNITY_ID,
          name: 'big.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          content: bigContent,
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('uploads through quarantine, scans, promotes to primary, and persists the DealFile', async () => {
      const ctx = buildCtx();

      const result = await attachDealFile(ctx, {
        opportunityId: OPPORTUNITY_ID,
        name: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 11,
        content: SAMPLE_CONTENT,
      });

      expect((ctx.adapters as any).storageService.uploadToQuarantine).toHaveBeenCalledWith(
        expect.any(Buffer),
        'doc.pdf',
        TENANT_ID
      );
      expect((ctx.adapters as any).avScanner.scan).toHaveBeenCalled();
      expect((ctx.adapters as any).storageService.moveToPrimary).toHaveBeenCalledWith(
        'quarantine/key',
        expect.stringContaining(TENANT_ID)
      );
      expect((ctx.prismaWithTenant as any).dealFile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'doc.pdf',
            fileType: 'PDF',
            url: 'primary/key',
            opportunityId: OPPORTUNITY_ID,
            tenantId: TENANT_ID,
            uploadedById: USER_ID,
          }),
        })
      );
      expect(result.url).toBe('primary/key');
    });

    it('deletes the quarantined file and throws when the AV scan rejects it', async () => {
      const ctx = buildCtx();
      (ctx.adapters as any).avScanner.scan.mockResolvedValue({
        clean: false,
        threatName: 'Eicar-Test-Signature',
        scanDuration: 1,
        engine: 'test',
      });

      await expect(
        attachDealFile(ctx, {
          opportunityId: OPPORTUNITY_ID,
          name: 'doc.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 11,
          content: SAMPLE_CONTENT,
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      expect((ctx.adapters as any).storageService.deleteFromQuarantine).toHaveBeenCalledWith(
        'quarantine/key'
      );
      expect((ctx.prismaWithTenant as any).dealFile.create).not.toHaveBeenCalled();
    });
  });

  describe('listDealFiles', () => {
    it('throws NOT_FOUND when the deal does not exist', async () => {
      const ctx = buildCtx();
      (ctx.prismaWithTenant as any).opportunity.findFirst.mockResolvedValue(null);

      await expect(listDealFiles(ctx, OPPORTUNITY_ID)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('returns each file with a freshly-signed download URL', async () => {
      const ctx = buildCtx();
      (ctx.prismaWithTenant as any).dealFile.findMany.mockResolvedValue([
        { id: 'file-1', name: 'doc.pdf', url: 'primary/key-1' },
      ]);

      const files = await listDealFiles(ctx, OPPORTUNITY_ID);

      expect(files).toHaveLength(1);
      expect(files[0].downloadUrl).toBe('https://signed.example.invalid/file');
      expect((ctx.adapters as any).storageService.getSignedUrl).toHaveBeenCalledWith(
        'primary/key-1',
        3600
      );
    });

    // Tenant-isolation defense-in-depth (#421 security fix): without this,
    // a caller in tenant A who knows/guesses a tenant-B opportunityId (and
    // slips through the pooled-connection SET race) gets tenant B's file
    // list back, including a live signed download URL per file.
    it('scopes the file list by tenantId, not just opportunityId', async () => {
      const ctx = buildCtx();
      (ctx.prismaWithTenant as any).dealFile.findMany.mockResolvedValue([]);

      await listDealFiles(ctx, OPPORTUNITY_ID);

      expect((ctx.prismaWithTenant as any).dealFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ opportunityId: OPPORTUNITY_ID, tenantId: TENANT_ID }),
        })
      );
    });

    it('returns a null downloadUrl (not a thrown error) when signing fails', async () => {
      const ctx = buildCtx();
      (ctx.prismaWithTenant as any).dealFile.findMany.mockResolvedValue([
        { id: 'file-1', name: 'doc.pdf', url: 'primary/key-1' },
      ]);
      (ctx.adapters as any).storageService.getSignedUrl.mockRejectedValue(new Error('boom'));

      const files = await listDealFiles(ctx, OPPORTUNITY_ID);

      expect(files[0].downloadUrl).toBeNull();
    });
  });

  describe('removeDealFile', () => {
    it('throws NOT_FOUND when the file does not exist for this tenant', async () => {
      const ctx = buildCtx();
      (ctx.prismaWithTenant as any).dealFile.findFirst.mockResolvedValue(null);

      await expect(removeDealFile(ctx, 'file-1')).rejects.toBeInstanceOf(TRPCError);
      await expect(removeDealFile(ctx, 'file-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('deletes the file and returns its opportunityId for audit logging', async () => {
      const ctx = buildCtx();
      (ctx.prismaWithTenant as any).dealFile.findFirst.mockResolvedValue({
        id: 'file-1',
        opportunityId: OPPORTUNITY_ID,
      });

      const result = await removeDealFile(ctx, 'file-1');

      expect(result).toEqual({ opportunityId: OPPORTUNITY_ID });
      expect((ctx.prismaWithTenant as any).dealFile.delete).toHaveBeenCalledWith({
        where: { id: 'file-1' },
      });
    });
  });
});
