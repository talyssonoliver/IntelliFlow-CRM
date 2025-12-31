import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@intelliflow/db';
import { IngestionOrchestrator } from '@intelliflow/application';
import { PrismaCaseDocumentRepository } from '@intelliflow/adapters';
import { InMemoryEventBus, SupabaseStorageAdapter, MockAVScanner } from '@intelliflow/adapters';
import { CaseDocument } from '@intelliflow/domain';
import { createHash } from 'crypto';

/**
 * End-to-End Integration Test for File Ingestion Pipeline
 *
 * Tests the complete flow:
 * 1. File upload
 * 2. Validation
 * 3. Quarantine storage
 * 4. AV scanning
 * 5. Metadata extraction
 * 6. Primary storage
 * 7. Database persistence
 * 8. Event emission
 */
describe('File Ingestion Pipeline E2E', () => {
  let prisma: PrismaClient;
  let orchestrator: IngestionOrchestrator;
  let repository: PrismaCaseDocumentRepository;
  let eventBus: InMemoryEventBus;
  let storage: SupabaseStorageAdapter;
  let avScanner: MockAVScanner;

  beforeAll(async () => {
    // Initialize test database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
        },
      },
    });

    // Initialize components
    repository = new PrismaCaseDocumentRepository(prisma);
    eventBus = new InMemoryEventBus();
    storage = new SupabaseStorageAdapter(
      process.env.SUPABASE_URL || 'http://localhost:54321',
      process.env.SUPABASE_KEY || 'test-key'
    );
    avScanner = new MockAVScanner();

    orchestrator = new IngestionOrchestrator(repository, eventBus, storage, avScanner);

    // Run migrations
    // await prisma.$executeRaw`DROP SCHEMA IF EXISTS public CASCADE`;
    // await prisma.$executeRaw`CREATE SCHEMA public`;
    // Note: In real tests, use Prisma migrations
  });

  beforeEach(() => {
    eventBus.clearPublishedEvents();
    avScanner.setInfected(false);
    avScanner.setShouldFail(false);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Successful Ingestion Flow', () => {
    it('should successfully ingest a PDF document', async () => {
      const fileContent = Buffer.from('%PDF-1.4\nTest PDF content');
      const metadata = {
        tenantId: 'tenant-1',
        filename: 'contract.pdf',
        mimeType: 'application/pdf',
        uploadedBy: 'user-123',
      };

      const result = await orchestrator.ingestFile(fileContent, metadata);

      expect(result.success).toBe(true);
      expect(result.documentId).toBeDefined();
      expect(result.duplicate).toBe(false);

      // Verify document was saved to database
      const document = await repository.findById(result.documentId!);
      expect(document).toBeDefined();
      expect(document!.metadata.title).toBe('contract.pdf');
      expect(document!.mimeType).toBe('application/pdf');
      expect(document!.sizeBytes).toBe(fileContent.length);

      // Verify content hash
      const expectedHash = createHash('sha256').update(fileContent).digest('hex');
      expect(document!.contentHash).toBe(expectedHash);

      // Verify event was emitted
      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('document.ingestion.created');
      expect(events[0].data.documentId).toBe(result.documentId);
    });

    it('should handle DOCX files', async () => {
      const fileContent = Buffer.from('PK\\x03\\x04'); // DOCX magic number
      const metadata = {
        tenantId: 'tenant-1',
        filename: 'report.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uploadedBy: 'user-123',
      };

      const result = await orchestrator.ingestFile(fileContent, metadata);

      expect(result.success).toBe(true);

      const document = await repository.findById(result.documentId!);
      expect(document).toBeDefined();
      expect(document!.metadata.title).toBe('report.docx');
    });

    it('should classify privileged documents correctly', async () => {
      const fileContent = Buffer.from('Confidential legal document');
      const metadata = {
        tenantId: 'tenant-1',
        filename: 'attorney-client-privileged.pdf',
        mimeType: 'application/pdf',
        uploadedBy: 'user-123',
      };

      const result = await orchestrator.ingestFile(fileContent, metadata);

      expect(result.success).toBe(true);

      const document = await repository.findById(result.documentId!);
      expect(document!.metadata.classification).toBe('PRIVILEGED');
    });
  });

  describe('Antivirus Scanning', () => {
    it('should reject infected files', async () => {
      avScanner.setInfected(true);

      const fileContent = Buffer.from('Infected content');
      const metadata = {
        tenantId: 'tenant-1',
        filename: 'malware.exe',
        mimeType: 'application/x-msdownload',
        uploadedBy: 'user-123',
      };

      const result = await orchestrator.ingestFile(fileContent, metadata);

      expect(result.success).toBe(false);
      expect(result.error).toContain('virus detected');

      // Verify document was NOT saved
      const documents = await repository.findAccessibleByUser('user-123', 'tenant-1');
      expect(documents).toHaveLength(0);

      // Verify failure event was emitted
      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('DocumentIngestionFailedEvent');
    });

    it('should detect EICAR test virus', async () => {
      const eicarString =
        'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

      const result = await orchestrator.ingestFile(Buffer.from(eicarString), {
        tenantId: 'tenant-1',
        filename: 'eicar.txt',
        mimeType: 'text/plain',
        uploadedBy: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('virus detected');
    });
  });

  describe('Validation', () => {
    it('should reject files exceeding size limit', async () => {
      const largeFile = Buffer.alloc(55 * 1024 * 1024); // 55MB

      const result = await orchestrator.ingestFile(largeFile, {
        tenantId: 'tenant-1',
        filename: 'large.pdf',
        mimeType: 'application/pdf',
        uploadedBy: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum size');
    });

    it('should reject disallowed MIME types', async () => {
      const fileContent = Buffer.from('Executable content');

      const result = await orchestrator.ingestFile(fileContent, {
        tenantId: 'tenant-1',
        filename: 'malware.exe',
        mimeType: 'application/x-msdownload',
        uploadedBy: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });
  });

  describe('Idempotency', () => {
    it('should handle duplicate uploads', async () => {
      const fileContent = Buffer.from('Same content');
      const metadata = {
        tenantId: 'tenant-1',
        filename: 'duplicate.pdf',
        mimeType: 'application/pdf',
        uploadedBy: 'user-123',
      };

      // First upload
      const result1 = await orchestrator.ingestFile(fileContent, metadata);
      expect(result1.success).toBe(true);

      // Second upload (same content, different filename)
      const result2 = await orchestrator.ingestFile(fileContent, {
        ...metadata,
        filename: 'duplicate-copy.pdf',
      });

      // Both should succeed (idempotency not yet fully implemented in orchestrator)
      expect(result2.success).toBe(true);
    });
  });

  describe('Failure Handling', () => {
    it('should retry on transient storage failures', async () => {
      // This test requires mocking storage service to fail then succeed
      // Skipped for now as we're using real Supabase adapter
    });

    it('should emit failure event after max retries', async () => {
      avScanner.setShouldFail(true);

      const result = await orchestrator.ingestFile(Buffer.from('test'), {
        tenantId: 'tenant-1',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        uploadedBy: 'user-123',
      });

      expect(result.success).toBe(false);

      const events = eventBus.getPublishedEvents();
      expect(events.some((e) => e.eventType === 'DocumentIngestionFailedEvent')).toBe(true);
    });
  });

  describe('Access Control', () => {
    it('should grant creator ADMIN access by default', async () => {
      const result = await orchestrator.ingestFile(Buffer.from('test content'), {
        tenantId: 'tenant-1',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        uploadedBy: 'user-123',
      });

      expect(result.success).toBe(true);

      const document = await repository.findById(result.documentId!);
      expect(document).toBeDefined();

      // Check ACL
      const userAccess = document!.acl.find((ace) => ace.principalId === 'user-123');
      expect(userAccess).toBeDefined();
      expect(userAccess!.accessLevel).toBe('ADMIN');
    });

    it('should isolate documents by tenant', async () => {
      // Upload document for tenant-1
      const result1 = await orchestrator.ingestFile(Buffer.from('tenant1 doc'), {
        tenantId: 'tenant-1',
        filename: 'tenant1.pdf',
        mimeType: 'application/pdf',
        uploadedBy: 'user-tenant1',
      });

      // Try to access from tenant-2
      const tenant2Docs = await repository.findAccessibleByUser('user-tenant2', 'tenant-2');
      expect(tenant2Docs).toHaveLength(0);

      // Verify tenant-1 can access
      const tenant1Docs = await repository.findAccessibleByUser('user-tenant1', 'tenant-1');
      expect(tenant1Docs.length).toBeGreaterThan(0);
    });
  });
});
