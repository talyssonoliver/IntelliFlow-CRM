import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
// Use relative paths since vitest aliases don't work consistently in tests/integration
import { PrismaClient } from '../../../packages/db/src';
// Prisma 7 requires a driver adapter — the legacy `datasources.db.url` constructor
// throws PrismaClientConstructorValidationError under Prisma 7 (see
// tests/integration/setup.ts). @prisma/adapter-pg is a first-class dependency.
import { PrismaPg } from '@prisma/adapter-pg';
import { IngestionOrchestrator } from '../../../packages/application/src';
import { PrismaCaseDocumentRepository } from '../../../packages/adapters/src';
import {
  InMemoryEventBus,
  InMemoryStorageAdapter,
  SupabaseStorageAdapter,
  MockAVScanner,
} from '../../../packages/adapters/src';
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
 *
 * Two layers (#665):
 * - 'File Ingestion Pipeline E2E' runs the orchestration, persistence and
 *   domain-contract assertions against a real PostgreSQL database with an
 *   in-memory StorageServicePort double (InMemoryStorageAdapter). It needs only
 *   DATABASE_TEST_URL / DATABASE_URL, so it executes in ordinary PR CI.
 * - 'File Ingestion Pipeline - Supabase storage round-trip' keeps the true
 *   storage round-trip (nightly). It needs NEXT_PUBLIC_SUPABASE_URL,
 *   SUPABASE_SERVICE_ROLE_KEY and the buckets 'case-documents-quarantine' and
 *   'case-documents' (`npx supabase db push`), and is the only part that may skip
 *   when Supabase is absent.
 */

/**
 * Is the database actually reachable? (Not just "is an env var set".) Storage is
 * an in-memory double in the main suite, so this is its only infrastructure.
 */
async function isDatabaseAvailable(
  prisma: PrismaClient
): Promise<{ available: boolean; reason?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { available: true };
  } catch (error) {
    return { available: false, reason: `Database not reachable: ${error}` };
  }
}

/**
 * Is Supabase storage reachable with the required buckets? Only the storage
 * round-trip spec needs this. Bucket names must match SupabaseStorageAdapter.
 */
async function isSupabaseStorageAvailable(): Promise<{ available: boolean; reason?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return {
      available: false,
      reason: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    };
  }

  try {
    const response = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      headers: { Authorization: `Bearer ${serviceKey}` },
    });

    if (!response.ok) {
      return {
        available: false,
        reason: `Supabase storage not accessible: ${response.status} ${response.statusText}`,
      };
    }

    const buckets = await response.json();
    const bucketNames = buckets.map((b: { name: string }) => b.name);
    const missing = ['case-documents-quarantine', 'case-documents'].filter(
      (name) => !bucketNames.includes(name)
    );
    if (missing.length > 0) {
      return {
        available: false,
        reason: `Missing storage buckets: ${missing.join(', ')}. Run: npx supabase db push`,
      };
    }

    return { available: true };
  } catch (error) {
    return { available: false, reason: `Infrastructure check failed: ${error}` };
  }
}

const databaseUrl = process.env.DATABASE_TEST_URL || process.env.DATABASE_URL;

// Basic env var check (fast, synchronous): without a database URL nothing can run.
const describeOrSkip = databaseUrl ? describe : describe.skip;

// Track database availability for the detailed check in beforeAll
let infrastructureStatus: { available: boolean; reason?: string } = { available: false };

/**
 * Tenant/user ids are deliberately **cuid-shaped**, matching what Prisma's
 * `@default(cuid())` issues for real tenants created through onboarding.
 * The previous `'tenant-1'` / `'user-123'` literals satisfied no id format at
 * all, so every ingest failed domain validation before it reached the database
 * — which is what masked ENG-OPS-003.Gap9. Keeping them cuid-shaped also makes
 * this suite a regression guard for the UUID-only schema bug it uncovered.
 */
const TENANT_1 = 'cgap9tenantaaaaaaaaaaaaa1';
const TENANT_2 = 'cgap9tenantaaaaaaaaaaaaa2';
const USER_1 = 'cgap9useraaaaaaaaaaaaaaa1';
/** Dedicated uploader so the "infected file was not saved" assertion stays
 *  meaningful now that the earlier ingest tests genuinely persist documents. */
const USER_AV = 'cgap9useravaaaaaaaaaaaaa1';
/** Dedicated uploader for the "storage keeps failing" persistence assertion. */
const USER_STORAGE_DOWN = 'cgap9userdownaaaaaaaaaa1';
const USER_TENANT_1 = 'cgap9usertenantaaaaaaaaa1';
const USER_TENANT_2 = 'cgap9usertenantaaaaaaaaa2';

describeOrSkip('File Ingestion Pipeline E2E', () => {
  let prisma: PrismaClient;
  let orchestrator: IngestionOrchestrator;
  let repository: PrismaCaseDocumentRepository;
  let eventBus: InMemoryEventBus;
  let storage: InMemoryStorageAdapter;
  let avScanner: MockAVScanner;

  beforeAll(async () => {
    // Initialize test database (Prisma 7: construct with the pg driver adapter,
    // NOT the removed `datasources.db.url` constructor option).
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    prisma = new PrismaClient({ adapter });

    infrastructureStatus = await isDatabaseAvailable(prisma);

    if (!infrastructureStatus.available) {
      console.log(`\n⏭️  File Ingestion E2E: Skipping tests - ${infrastructureStatus.reason}\n`);
      // Note: Tests will still run but skip gracefully - see individual test checks
      return;
    }

    console.log('\n✅ File Ingestion E2E: Database available, running tests\n');

    // Initialize components
    repository = new PrismaCaseDocumentRepository(prisma);
    eventBus = new InMemoryEventBus();
    storage = new InMemoryStorageAdapter();
    avScanner = new MockAVScanner();

    orchestrator = new IngestionOrchestrator(repository, eventBus, storage, avScanner);

    // `case_documents.tenant_id` is a FK to `tenants` — the suite must own real
    // tenant rows or every save fails with a constraint violation.
    for (const [id, name] of [
      [TENANT_1, 'Gap9 Ingestion Tenant 1'],
      [TENANT_2, 'Gap9 Ingestion Tenant 2'],
    ] as const) {
      await prisma.tenant.upsert({
        where: { id },
        create: { id, name, slug: id },
        update: {},
      });
    }
  });

  beforeEach(() => {
    if (!infrastructureStatus.available) return;
    eventBus.clearPublishedEvents();
    storage.reset();
    avScanner.setInfected(false);
    avScanner.setShouldFail(false);
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      if (!infrastructureStatus.available) return;
      // Deleting the tenants cascades to their case documents and ACL rows.
      await prisma.tenant
        .deleteMany({
          where: { id: { in: [TENANT_1, TENANT_2] } },
        })
        .catch(() => {});
    } finally {
      await prisma.$disconnect();
    }
  });

  describe('Successful Ingestion Flow', () => {
    it('should successfully ingest a PDF document', async (context) => {
      if (!infrastructureStatus.available) {
        context.skip();
        return;
      }

      const fileContent = Buffer.from('%PDF-1.4\nTest PDF content');
      const metadata = {
        tenantId: TENANT_1,
        filename: 'contract.pdf',
        mimeType: 'application/pdf',
        uploadedBy: USER_1,
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

      // Verify the bytes were promoted to primary storage under the document's key
      expect(await storage.download(document!.storageKey)).toEqual(fileContent);

      // Verify event was emitted
      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('document.ingestion.created');
      // `DomainEvent` exposes its payload via `toPayload()` — there is no `.data`.
      expect(events[0].toPayload().documentId).toBe(result.documentId);
    });

    it('should handle DOCX files', async (context) => {
      if (!infrastructureStatus.available) {
        context.skip();
        return;
      }

      const fileContent = Buffer.from('PK\\x03\\x04'); // DOCX magic number
      const metadata = {
        tenantId: TENANT_1,
        filename: 'report.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uploadedBy: USER_1,
      };

      const result = await orchestrator.ingestFile(fileContent, metadata);

      expect(result.success).toBe(true);

      const document = await repository.findById(result.documentId!);
      expect(document).toBeDefined();
      expect(document!.metadata.title).toBe('report.docx');
    });

    it('should classify privileged documents correctly', async (context) => {
      if (!infrastructureStatus.available) {
        context.skip();
        return;
      }

      const fileContent = Buffer.from('Confidential legal document');
      const metadata = {
        tenantId: TENANT_1,
        filename: 'attorney-client-privileged.pdf',
        mimeType: 'application/pdf',
        uploadedBy: USER_1,
      };

      const result = await orchestrator.ingestFile(fileContent, metadata);

      expect(result.success).toBe(true);

      const document = await repository.findById(result.documentId!);
      expect(document!.metadata.classification).toBe('PRIVILEGED');
    });
  });

  describe('Antivirus Scanning', () => {
    it('should reject infected files', async (context) => {
      if (!infrastructureStatus.available) {
        context.skip();
        return;
      }

      avScanner.setInfected(true);

      // Must be an ALLOWED MIME type: `validateFile()` runs before the AV scan,
      // so an `application/x-msdownload` fixture is rejected on MIME grounds and
      // never exercises the scanner. Disallowed MIME types have their own test.
      const fileContent = Buffer.from('Infected content');
      const metadata = {
        tenantId: TENANT_1,
        filename: 'malware.pdf',
        mimeType: 'application/pdf',
        uploadedBy: USER_AV,
      };

      const result = await orchestrator.ingestFile(fileContent, metadata);

      expect(result.success).toBe(false);
      expect(result.error).toContain('virus detected');

      // Verify document was NOT saved
      const documents = await repository.findAccessibleByUser(USER_AV, TENANT_1);
      expect(documents).toHaveLength(0);

      // Verify failure event was emitted
      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('document.ingestion_failed');

      // The infected object must be purged from quarantine and never promoted.
      expect(storage.quarantineKeys()).toHaveLength(0);
      expect(storage.primaryKeys()).toHaveLength(0);
    });

    it('should detect EICAR test virus', async (context) => {
      if (!infrastructureStatus.available) {
        context.skip();
        return;
      }

      const eicarString = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

      const result = await orchestrator.ingestFile(Buffer.from(eicarString), {
        tenantId: TENANT_1,
        filename: 'eicar.txt',
        mimeType: 'text/plain',
        uploadedBy: USER_1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('virus detected');
    });
  });

  describe('Validation', () => {
    it('should reject files exceeding size limit', async (context) => {
      if (!infrastructureStatus.available) {
        context.skip();
        return;
      }

      // Use a fake buffer to avoid allocating 55MB — only .length is checked by validateFile()
      const largeFile = { length: 55 * 1024 * 1024 } as any; // fake buffer — only .length is checked by validateFile()

      const result = await orchestrator.ingestFile(largeFile, {
        tenantId: TENANT_1,
        filename: 'large.pdf',
        mimeType: 'application/pdf',
        uploadedBy: USER_1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum size');
    });

    it('should reject disallowed MIME types', async (context) => {
      if (!infrastructureStatus.available) {
        context.skip();
        return;
      }

      const fileContent = Buffer.from('Executable content');

      const result = await orchestrator.ingestFile(fileContent, {
        tenantId: TENANT_1,
        filename: 'malware.exe',
        mimeType: 'application/x-msdownload',
        uploadedBy: USER_1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });
  });

  describe('Idempotency', () => {
    it('should handle duplicate uploads', async (context) => {
      if (!infrastructureStatus.available) {
        context.skip();
        return;
      }

      const fileContent = Buffer.from('Same content');
      const metadata = {
        tenantId: TENANT_1,
        filename: 'duplicate.pdf',
        mimeType: 'application/pdf',
        uploadedBy: USER_1,
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
    it('should retry on transient storage failures', async (context) => {
      if (!infrastructureStatus.available) {
        context.skip();
        return;
      }

      // Two transient quarantine-upload failures, then success: within maxRetries (3).
      storage.failNext('uploadToQuarantine', 2);

      const result = await orchestrator.ingestFile(
        Buffer.from('retry me'),
        {
          tenantId: TENANT_1,
          filename: 'retry.pdf',
          mimeType: 'application/pdf',
          uploadedBy: USER_1,
        },
        { retryDelayMs: 0 }
      );

      expect(result.success).toBe(true);
      expect(storage.callCount('uploadToQuarantine')).toBe(3);
      // The promoted object lives in primary storage and quarantine is drained.
      expect(storage.primaryKeys()).toHaveLength(1);
      expect(storage.quarantineKeys()).toHaveLength(0);
      expect(eventBus.getPublishedEvents().map((e) => e.eventType)).toEqual([
        'document.ingestion.created',
      ]);
    });

    it('should fail and persist nothing when storage keeps failing', async (context) => {
      if (!infrastructureStatus.available) {
        context.skip();
        return;
      }

      storage.failNext('uploadToQuarantine', 3);

      const result = await orchestrator.ingestFile(
        Buffer.from('storage is down'),
        {
          tenantId: TENANT_1,
          filename: 'down.pdf',
          mimeType: 'application/pdf',
          uploadedBy: USER_STORAGE_DOWN,
        },
        { maxRetries: 3, retryDelayMs: 0 }
      );

      expect(result.success).toBe(false);
      expect(storage.callCount('uploadToQuarantine')).toBe(3);
      expect(await repository.findAccessibleByUser(USER_STORAGE_DOWN, TENANT_1)).toHaveLength(0);
      expect(eventBus.getPublishedEvents().map((e) => e.eventType)).toEqual([
        'document.ingestion_failed',
      ]);
    });

    it('should emit failure event after max retries', async (context) => {
      if (!infrastructureStatus.available) {
        context.skip();
        return;
      }

      avScanner.setShouldFail(true);

      const result = await orchestrator.ingestFile(Buffer.from('test'), {
        tenantId: TENANT_1,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        uploadedBy: USER_1,
      });

      expect(result.success).toBe(false);

      const events = eventBus.getPublishedEvents();
      expect(events.some((e) => e.eventType === 'document.ingestion_failed')).toBe(true);
    });
  });

  describe('Access Control', () => {
    it('should grant creator ADMIN access by default', async (context) => {
      if (!infrastructureStatus.available) {
        context.skip();
        return;
      }

      const result = await orchestrator.ingestFile(Buffer.from('test content'), {
        tenantId: TENANT_1,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        uploadedBy: USER_1,
      });

      expect(result.success).toBe(true);

      const document = await repository.findById(result.documentId!);
      expect(document).toBeDefined();

      // Check ACL
      const userAccess = document!.acl.find((ace) => ace.principalId === USER_1);
      expect(userAccess).toBeDefined();
      expect(userAccess!.accessLevel).toBe('ADMIN');
    });

    it('should isolate documents by tenant', async (context) => {
      if (!infrastructureStatus.available) {
        context.skip();
        return;
      }

      // Upload document for tenant-1
      await orchestrator.ingestFile(Buffer.from('tenant1 doc'), {
        tenantId: TENANT_1,
        filename: 'tenant1.pdf',
        mimeType: 'application/pdf',
        uploadedBy: USER_TENANT_1,
      });

      // Try to access from tenant-2
      const tenant2Docs = await repository.findAccessibleByUser(USER_TENANT_2, TENANT_2);
      expect(tenant2Docs).toHaveLength(0);

      // Verify tenant-1 can access
      const tenant1Docs = await repository.findAccessibleByUser(USER_TENANT_1, TENANT_1);
      expect(tenant1Docs.length).toBeGreaterThan(0);
    });
  });
});

/**
 * The true storage round-trip: the part the in-memory double cannot prove. Needs a
 * reachable Supabase storage API with the quarantine and primary buckets, so it
 * truly executes only in preship-full-nightly. Declared in
 * tools/scripts/infra-skip-gate.registry.json (maxSkipped: 1).
 */
const TENANT_STORAGE = 'cgap9tenantaaaaaaaaaaaaa3';
const USER_STORAGE = 'cgap9userstorageaaaaaaa1';

const describeStorageOrSkip =
  databaseUrl && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? describe
    : describe.skip;

describeStorageOrSkip('File Ingestion Pipeline - Supabase storage round-trip', () => {
  let prisma: PrismaClient;
  let storageStatus: { available: boolean; reason?: string } = { available: false };

  beforeAll(async () => {
    storageStatus = await isSupabaseStorageAvailable();
    if (!storageStatus.available) {
      console.log(`\n⏭️  File Ingestion storage round-trip: Skipping - ${storageStatus.reason}\n`);
      return;
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.tenant.upsert({
      where: { id: TENANT_STORAGE },
      create: { id: TENANT_STORAGE, name: 'Gap9 Storage Tenant', slug: TENANT_STORAGE },
      update: {},
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.tenant.deleteMany({ where: { id: TENANT_STORAGE } }).catch(() => {});
    } finally {
      await prisma.$disconnect();
    }
  });

  it('stores the uploaded bytes in the primary bucket and reads them back', async (context) => {
    if (!storageStatus.available) {
      context.skip();
      return;
    }

    const storage = new SupabaseStorageAdapter(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const repository = new PrismaCaseDocumentRepository(prisma);
    const orchestrator = new IngestionOrchestrator(
      repository,
      new InMemoryEventBus(),
      storage,
      new MockAVScanner()
    );

    const fileContent = Buffer.from(`%PDF-1.4\nround-trip ${Date.now()}`);
    const result = await orchestrator.ingestFile(fileContent, {
      tenantId: TENANT_STORAGE,
      filename: 'round-trip.pdf',
      mimeType: 'application/pdf',
      uploadedBy: USER_STORAGE,
    });

    expect(result.success).toBe(true);
    const document = await repository.findById(result.documentId!);
    expect(document).toBeDefined();
    expect(await storage.download(document!.storageKey)).toEqual(fileContent);
  });
});
