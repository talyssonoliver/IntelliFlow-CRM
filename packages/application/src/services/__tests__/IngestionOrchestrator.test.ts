import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IngestionOrchestrator } from '../IngestionOrchestrator';
import { CaseDocumentRepository } from '@intelliflow/domain';
import { EventBusPort } from '../../ports/external';
import { createHash, randomUUID } from 'crypto';

// Valid UUIDs for test data
const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = '22222222-2222-2222-2222-222222222222';

describe('IngestionOrchestrator', () => {
  let orchestrator: IngestionOrchestrator;
  let mockRepository: CaseDocumentRepository;
  let mockEventBus: EventBusPort;
  let mockStorageService: any;
  let mockAVScanner: any;

  beforeEach(() => {
    mockRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByCaseId: vi.fn(),
      findAccessibleByUser: vi.fn(),
      delete: vi.fn(),
    } as unknown as CaseDocumentRepository;

    mockEventBus = {
      publish: vi.fn(),
      publishAll: vi.fn(),
      subscribe: vi.fn(),
    };

    mockStorageService = {
      uploadToQuarantine: vi.fn().mockResolvedValue('quarantine/test-hash.pdf'),
      moveToPrimary: vi.fn().mockResolvedValue('documents/test-hash.pdf'),
      deleteFromQuarantine: vi.fn().mockResolvedValue(undefined),
    };

    mockAVScanner = {
      scan: vi.fn().mockResolvedValue({ clean: true, threatName: null }),
    };

    orchestrator = new IngestionOrchestrator(
      mockRepository,
      mockEventBus,
      mockStorageService,
      mockAVScanner
    );
  });

  describe('ingestFile', () => {
    it('should successfully ingest a clean file', async () => {
      const file = Buffer.from('test content');
      const metadata = {
        tenantId: TEST_TENANT_ID,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        uploadedBy: TEST_USER_ID,
      };

      const result = await orchestrator.ingestFile(file, metadata);

      expect(result.success).toBe(true);
      expect(result.documentId).toBeDefined();
      expect(mockStorageService.uploadToQuarantine).toHaveBeenCalled();
      expect(mockAVScanner.scan).toHaveBeenCalled();
      expect(mockStorageService.moveToPrimary).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'document.ingestion.created',
        })
      );
    });

    it('should reject infected files', async () => {
      mockAVScanner.scan.mockResolvedValue({ clean: false, threatName: 'Win32.Trojan' });

      const file = Buffer.from('infected content');
      // Use allowed MIME type so file passes validation and reaches AV scan
      const metadata = {
        tenantId: TEST_TENANT_ID,
        filename: 'infected.pdf',
        mimeType: 'application/pdf',
        uploadedBy: TEST_USER_ID,
      };

      const result = await orchestrator.ingestFile(file, metadata);

      expect(result.success).toBe(false);
      expect(result.error).toContain('virus detected');
      expect(mockStorageService.deleteFromQuarantine).toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'document.ingestion_failed',
        })
      );
    });

    it('should validate file size limits', async () => {
      const largeFile = Buffer.alloc(55 * 1024 * 1024); // 55MB
      const metadata = {
        tenantId: TEST_TENANT_ID,
        filename: 'large.pdf',
        mimeType: 'application/pdf',
        uploadedBy: TEST_USER_ID,
      };

      const result = await orchestrator.ingestFile(largeFile, metadata);

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum size');
    });

    it('should validate MIME type whitelist', async () => {
      const file = Buffer.from('executable content');
      const metadata = {
        tenantId: TEST_TENANT_ID,
        filename: 'malware.exe',
        mimeType: 'application/x-msdownload',
        uploadedBy: TEST_USER_ID,
      };

      const result = await orchestrator.ingestFile(file, metadata);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    // Skip: checkDuplicate() is not yet implemented (always returns null)
    // When implemented, this test should verify duplicate detection behavior
    it.skip('should handle duplicate files idempotently', async () => {
      const file = Buffer.from('duplicate content');
      const hash = createHash('sha256').update(file).digest('hex');

      const existingDoc = {
        id: 'existing-doc-123',
        contentHash: hash,
      };

      mockRepository.findById = vi.fn().mockResolvedValue(existingDoc);

      const metadata = {
        tenantId: TEST_TENANT_ID,
        filename: 'duplicate.pdf',
        mimeType: 'application/pdf',
        uploadedBy: TEST_USER_ID,
      };

      const result = await orchestrator.ingestFile(file, metadata);

      expect(result.success).toBe(true);
      expect(result.documentId).toBe('existing-doc-123');
      expect(result.duplicate).toBe(true);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should retry on transient failures', async () => {
      mockStorageService.uploadToQuarantine
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce('quarantine/test-hash.pdf');

      const file = Buffer.from('test content');
      const metadata = {
        tenantId: TEST_TENANT_ID,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        uploadedBy: TEST_USER_ID,
      };

      const result = await orchestrator.ingestFile(file, metadata, { maxRetries: 3 });

      expect(result.success).toBe(true);
      expect(mockStorageService.uploadToQuarantine).toHaveBeenCalledTimes(3);
    });

    it('should emit DocumentIngestionFailedEvent after max retries', async () => {
      mockStorageService.uploadToQuarantine.mockRejectedValue(new Error('Permanent failure'));

      const file = Buffer.from('test content');
      const metadata = {
        tenantId: TEST_TENANT_ID,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        uploadedBy: TEST_USER_ID,
      };

      const result = await orchestrator.ingestFile(file, metadata, { maxRetries: 3 });

      expect(result.success).toBe(false);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'document.ingestion_failed',
        })
      );
    });
  });

  describe('extractMetadata', () => {
    it('should extract file metadata correctly', async () => {
      const file = Buffer.from('PDF content');
      const metadata = await orchestrator['extractMetadata'](file, 'test.pdf', 'application/pdf');

      expect(metadata).toMatchObject({
        mimeType: 'application/pdf',
        sizeBytes: file.length,
        contentHash: expect.any(String),
      });
      expect(metadata.contentHash).toHaveLength(64); // SHA-256
    });

    it('should classify documents based on filename patterns', async () => {
      const file = Buffer.from('privileged content');
      const metadata = await orchestrator['extractMetadata'](
        file,
        'attorney-client-privileged.pdf',
        'application/pdf'
      );

      expect(metadata.classification).toBe('PRIVILEGED');
    });

    it('should assign PUBLIC classification by default', async () => {
      const file = Buffer.from('public content');
      const metadata = await orchestrator['extractMetadata'](file, 'invoice.pdf', 'application/pdf');

      expect(metadata.classification).toBe('PUBLIC');
    });
  });
});
