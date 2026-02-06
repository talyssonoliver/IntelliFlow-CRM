/**
 * DSARWorkflow Tests
 *
 * Comprehensive tests for the DSAR (Data Subject Access Request) workflow.
 * Covers:
 * - initiateDSAR: request creation and verification email
 * - verifyIdentity: token validation, expiry, status checks
 * - processDSAR: routing to correct handler based on request type
 * - handleAccessRequest: data export across all tables
 * - handleErasureRequest: anonymization with legal hold check + search purge
 * - handleRectificationRequest: user notification
 * - handleRestrictionRequest: legal hold placement
 * - handleObjectionRequest: consent withdrawal
 * - getStatus: request status retrieval
 * - getOverdueRequests: SLA monitoring
 * - createDSARWorkflow factory
 * - Error handling throughout the workflow
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DSARWorkflow, createDSARWorkflow, dsarRequestSchema } from '../dsar-workflow';
import type { DSARRequest } from '../dsar-workflow';

// Mock only randomBytes from crypto - use importOriginal to preserve rest
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    randomBytes: () => Buffer.alloc(32, 'a'),
  };
});

// Create mock dependencies
function createMockDb() {
  return {
    data_subject_requests: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    leads: {
      findMany: vi.fn(),
    },
    contacts: {
      findMany: vi.fn(),
    },
    accounts: {
      findMany: vi.fn(),
    },
    opportunities: {
      findMany: vi.fn(),
    },
    tasks: {
      findMany: vi.fn(),
    },
    audit_logs: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    consents: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    legal_holds: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    $executeRaw: vi.fn(),
  };
}

function createMockEmailService() {
  return {
    send: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockStorageService() {
  return {
    upload: vi.fn().mockResolvedValue('https://storage.example.com/export.json'),
  };
}

const VALID_UUID = '00000000-0000-4000-8000-000000000001';
const SUBJECT_UUID = '00000000-0000-4000-8000-000000000002';

describe('DSARWorkflow', () => {
  let workflow: DSARWorkflow;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockEmailService: ReturnType<typeof createMockEmailService>;
  let mockStorageService: ReturnType<typeof createMockStorageService>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockDb = createMockDb();
    mockEmailService = createMockEmailService();
    mockStorageService = createMockStorageService();
    workflow = new DSARWorkflow(mockDb, mockEmailService, mockStorageService);
    process.env.APP_URL = 'https://app.example.com';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.APP_URL;
  });

  // ============================================
  // dsarRequestSchema validation
  // ============================================
  describe('dsarRequestSchema', () => {
    it('should validate a valid access request', () => {
      const result = dsarRequestSchema.safeParse({
        requestType: 'access',
        subjectId: SUBJECT_UUID,
        subjectEmail: 'user@example.com',
        preferredFormat: 'json',
      });

      expect(result.success).toBe(true);
    });

    it('should validate all request types', () => {
      const types = ['access', 'erasure', 'rectification', 'portability', 'restriction', 'objection'];
      for (const type of types) {
        const result = dsarRequestSchema.safeParse({
          requestType: type,
          subjectId: SUBJECT_UUID,
          subjectEmail: 'user@example.com',
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid request type', () => {
      const result = dsarRequestSchema.safeParse({
        requestType: 'invalid',
        subjectId: SUBJECT_UUID,
        subjectEmail: 'user@example.com',
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid email', () => {
      const result = dsarRequestSchema.safeParse({
        requestType: 'access',
        subjectId: SUBJECT_UUID,
        subjectEmail: 'not-an-email',
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid UUID for subjectId', () => {
      const result = dsarRequestSchema.safeParse({
        requestType: 'access',
        subjectId: 'not-a-uuid',
        subjectEmail: 'user@example.com',
      });

      expect(result.success).toBe(false);
    });

    it('should default preferredFormat to json', () => {
      const result = dsarRequestSchema.parse({
        requestType: 'access',
        subjectId: SUBJECT_UUID,
        subjectEmail: 'user@example.com',
      });

      expect(result.preferredFormat).toBe('json');
    });

    it('should accept optional requestDetails', () => {
      const result = dsarRequestSchema.parse({
        requestType: 'erasure',
        subjectId: SUBJECT_UUID,
        subjectEmail: 'user@example.com',
        requestDetails: 'Please delete all my data',
      });

      expect(result.requestDetails).toBe('Please delete all my data');
    });
  });

  // ============================================
  // initiateDSAR
  // ============================================
  describe('initiateDSAR()', () => {
    const validRequest: DSARRequest = {
      requestType: 'access',
      subjectId: SUBJECT_UUID,
      subjectEmail: 'user@example.com',
      preferredFormat: 'json',
    };

    it('should create a DSAR record in the database', async () => {
      mockDb.data_subject_requests.create.mockResolvedValue({
        id: 'dsar-001',
      });
      mockDb.audit_logs.create.mockResolvedValue({});

      const result = await workflow.initiateDSAR(validRequest);

      expect(mockDb.data_subject_requests.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          request_type: 'access',
          subject_id: SUBJECT_UUID,
          subject_email: 'user@example.com',
          status: 'pending',
        }),
      });

      expect(result.requestId).toBe('dsar-001');
      expect(result.status).toBe('pending');
    });

    it('should calculate SLA deadline 30 days from now', async () => {
      mockDb.data_subject_requests.create.mockResolvedValue({ id: 'dsar-001' });
      mockDb.audit_logs.create.mockResolvedValue({});

      const result = await workflow.initiateDSAR(validRequest);

      const now = new Date();
      const expectedDeadline = new Date();
      expectedDeadline.setDate(expectedDeadline.getDate() + 30);

      // Check within a few seconds tolerance
      expect(result.slaDeadline.getTime()).toBeCloseTo(expectedDeadline.getTime(), -4);
    });

    it('should send verification email', async () => {
      mockDb.data_subject_requests.create.mockResolvedValue({ id: 'dsar-001' });
      mockDb.audit_logs.create.mockResolvedValue({});

      await workflow.initiateDSAR(validRequest);

      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Verify Your Data Subject Access Request',
        })
      );
    });

    it('should log the initiation event', async () => {
      mockDb.data_subject_requests.create.mockResolvedValue({ id: 'dsar-001' });
      mockDb.audit_logs.create.mockResolvedValue({});

      await workflow.initiateDSAR(validRequest);

      expect(mockDb.audit_logs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entity_type: 'data_subject_request',
          entity_id: 'dsar-001',
          action: 'INITIATED',
        }),
      });
    });

    it('should return workflow state with notes', async () => {
      mockDb.data_subject_requests.create.mockResolvedValue({ id: 'dsar-001' });
      mockDb.audit_logs.create.mockResolvedValue({});

      const result = await workflow.initiateDSAR(validRequest);

      expect(result.notes).toContain('DSAR request initiated');
      expect(result.notes).toContain('Verification email sent');
      expect(result.verificationSentAt).toBeInstanceOf(Date);
    });

    it('should include verification token in state', async () => {
      mockDb.data_subject_requests.create.mockResolvedValue({ id: 'dsar-001' });
      mockDb.audit_logs.create.mockResolvedValue({});

      const result = await workflow.initiateDSAR(validRequest);

      expect(result.verificationToken).toBeDefined();
      expect(typeof result.verificationToken).toBe('string');
    });

    it('should reject invalid request data', async () => {
      const invalidRequest = {
        requestType: 'invalid_type',
        subjectId: 'not-a-uuid',
        subjectEmail: 'not-an-email',
      } as any;

      await expect(workflow.initiateDSAR(invalidRequest)).rejects.toThrow();
    });

    it('should store requestDetails as notes when provided', async () => {
      mockDb.data_subject_requests.create.mockResolvedValue({ id: 'dsar-001' });
      mockDb.audit_logs.create.mockResolvedValue({});

      await workflow.initiateDSAR({
        ...validRequest,
        requestDetails: 'I want all my data exported',
      });

      expect(mockDb.data_subject_requests.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          notes: 'I want all my data exported',
        }),
      });
    });

    it('should use empty string for notes when no requestDetails', async () => {
      mockDb.data_subject_requests.create.mockResolvedValue({ id: 'dsar-001' });
      mockDb.audit_logs.create.mockResolvedValue({});

      await workflow.initiateDSAR(validRequest);

      expect(mockDb.data_subject_requests.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          notes: '',
        }),
      });
    });
  });

  // ============================================
  // verifyIdentity
  // ============================================
  describe('verifyIdentity()', () => {
    it('should verify identity with valid token', async () => {
      const recentDate = new Date();
      // First call: verifyIdentity, Second call: processDSAR
      mockDb.data_subject_requests.findUnique
        .mockResolvedValueOnce({
          id: 'dsar-001',
          status: 'pending',
          verification_token: 'valid-token',
          requested_at: recentDate.toISOString(),
          request_type: 'access',
          subject_id: SUBJECT_UUID,
          subject_email: 'user@example.com',
        })
        .mockResolvedValueOnce({
          id: 'dsar-001',
          status: 'verified',
          request_type: 'access',
          subject_id: SUBJECT_UUID,
          subject_email: 'user@example.com',
        });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
      // processDSAR mocks
      mockDb.leads.findMany.mockResolvedValue([]);
      mockDb.contacts.findMany.mockResolvedValue([]);
      mockDb.accounts.findMany.mockResolvedValue([]);
      mockDb.opportunities.findMany.mockResolvedValue([]);
      mockDb.tasks.findMany.mockResolvedValue([]);
      mockDb.audit_logs.findMany.mockResolvedValue([]);
      mockDb.consents.findMany.mockResolvedValue([]);

      const result = await workflow.verifyIdentity('dsar-001', 'valid-token');

      expect(result).toBe(true);
    });

    it('should throw when DSAR request not found', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue(null);

      await expect(
        workflow.verifyIdentity('non-existent', 'token')
      ).rejects.toThrow('DSAR request not found');
    });

    it('should throw when request already processed', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-001',
        status: 'completed', // not pending
      });

      await expect(
        workflow.verifyIdentity('dsar-001', 'token')
      ).rejects.toThrow('DSAR request already processed');
    });

    it('should return false for invalid token', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-001',
        status: 'pending',
        verification_token: 'correct-token',
        requested_at: new Date().toISOString(),
      });
      mockDb.audit_logs.create.mockResolvedValue({});

      const result = await workflow.verifyIdentity('dsar-001', 'wrong-token');

      expect(result).toBe(false);
    });

    it('should log verification failure for invalid token', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-001',
        status: 'pending',
        verification_token: 'correct-token',
        requested_at: new Date().toISOString(),
      });
      mockDb.audit_logs.create.mockResolvedValue({});

      await workflow.verifyIdentity('dsar-001', 'wrong-token');

      expect(mockDb.audit_logs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'VERIFICATION_FAILED',
          metadata: expect.objectContaining({
            reason: 'Invalid token',
          }),
        }),
      });
    });

    it('should return false for expired token (>48 hours)', async () => {
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() - 49); // 49 hours ago

      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-001',
        status: 'pending',
        verification_token: 'valid-token',
        requested_at: expiredDate.toISOString(),
      });
      mockDb.audit_logs.create.mockResolvedValue({});

      const result = await workflow.verifyIdentity('dsar-001', 'valid-token');

      expect(result).toBe(false);
    });

    it('should log token expiry', async () => {
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() - 49);

      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-001',
        status: 'pending',
        verification_token: 'valid-token',
        requested_at: expiredDate.toISOString(),
      });
      mockDb.audit_logs.create.mockResolvedValue({});

      await workflow.verifyIdentity('dsar-001', 'valid-token');

      expect(mockDb.audit_logs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'VERIFICATION_FAILED',
          metadata: expect.objectContaining({
            reason: 'Token expired',
          }),
        }),
      });
    });

    it('should update request status to verified', async () => {
      const recentDate = new Date();
      // First call: verifyIdentity, Second call: processDSAR
      mockDb.data_subject_requests.findUnique
        .mockResolvedValueOnce({
          id: 'dsar-001',
          status: 'pending',
          verification_token: 'valid-token',
          requested_at: recentDate.toISOString(),
          request_type: 'access',
          subject_id: SUBJECT_UUID,
          subject_email: 'user@example.com',
        })
        .mockResolvedValueOnce({
          id: 'dsar-001',
          status: 'verified',
          request_type: 'access',
          subject_id: SUBJECT_UUID,
          subject_email: 'user@example.com',
        });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
      // processDSAR mocks
      mockDb.leads.findMany.mockResolvedValue([]);
      mockDb.contacts.findMany.mockResolvedValue([]);
      mockDb.accounts.findMany.mockResolvedValue([]);
      mockDb.opportunities.findMany.mockResolvedValue([]);
      mockDb.tasks.findMany.mockResolvedValue([]);
      mockDb.audit_logs.findMany.mockResolvedValue([]);
      mockDb.consents.findMany.mockResolvedValue([]);

      await workflow.verifyIdentity('dsar-001', 'valid-token');

      expect(mockDb.data_subject_requests.update).toHaveBeenCalledWith({
        where: { id: 'dsar-001' },
        data: {
          status: 'verified',
          verified_at: expect.any(Date),
        },
      });
    });

    it('should auto-process after verification', async () => {
      const recentDate = new Date();
      // First findUnique in verifyIdentity
      mockDb.data_subject_requests.findUnique
        .mockResolvedValueOnce({
          id: 'dsar-001',
          status: 'pending',
          verification_token: 'valid-token',
          requested_at: recentDate.toISOString(),
          request_type: 'access',
          subject_id: SUBJECT_UUID,
          subject_email: 'user@example.com',
        })
        // Second findUnique in processDSAR
        .mockResolvedValueOnce({
          id: 'dsar-001',
          status: 'verified',
          request_type: 'access',
          subject_id: SUBJECT_UUID,
          subject_email: 'user@example.com',
        });

      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
      mockDb.leads.findMany.mockResolvedValue([]);
      mockDb.contacts.findMany.mockResolvedValue([]);
      mockDb.accounts.findMany.mockResolvedValue([]);
      mockDb.opportunities.findMany.mockResolvedValue([]);
      mockDb.tasks.findMany.mockResolvedValue([]);
      mockDb.audit_logs.findMany.mockResolvedValue([]);
      mockDb.consents.findMany.mockResolvedValue([]);

      await workflow.verifyIdentity('dsar-001', 'valid-token');

      // processDSAR should have been called (status updated to processing then completed)
      const updateCalls = mockDb.data_subject_requests.update.mock.calls;
      const statusUpdates = updateCalls.map((c: any) => c[0].data.status).filter(Boolean);
      expect(statusUpdates).toContain('verified');
      expect(statusUpdates).toContain('processing');
    });
  });

  // ============================================
  // processDSAR
  // ============================================
  describe('processDSAR()', () => {
    it('should throw when request not found', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue(null);

      await expect(workflow.processDSAR('non-existent')).rejects.toThrow(
        'DSAR request not ready for processing'
      );
    });

    it('should throw when request not in verified status', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-001',
        status: 'pending', // not verified
      });

      await expect(workflow.processDSAR('dsar-001')).rejects.toThrow(
        'DSAR request not ready for processing'
      );
    });

    it('should update status to processing', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-001',
        status: 'verified',
        request_type: 'access',
        subject_id: SUBJECT_UUID,
        subject_email: 'user@example.com',
      });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
      mockDb.leads.findMany.mockResolvedValue([]);
      mockDb.contacts.findMany.mockResolvedValue([]);
      mockDb.accounts.findMany.mockResolvedValue([]);
      mockDb.opportunities.findMany.mockResolvedValue([]);
      mockDb.tasks.findMany.mockResolvedValue([]);
      mockDb.audit_logs.findMany.mockResolvedValue([]);
      mockDb.consents.findMany.mockResolvedValue([]);

      await workflow.processDSAR('dsar-001');

      // First update should be status: processing
      expect(mockDb.data_subject_requests.update).toHaveBeenCalledWith({
        where: { id: 'dsar-001' },
        data: { status: 'processing' },
      });
    });

    it('should mark as completed on success', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-001',
        status: 'verified',
        request_type: 'access',
        subject_id: SUBJECT_UUID,
        subject_email: 'user@example.com',
      });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
      mockDb.leads.findMany.mockResolvedValue([]);
      mockDb.contacts.findMany.mockResolvedValue([]);
      mockDb.accounts.findMany.mockResolvedValue([]);
      mockDb.opportunities.findMany.mockResolvedValue([]);
      mockDb.tasks.findMany.mockResolvedValue([]);
      mockDb.audit_logs.findMany.mockResolvedValue([]);
      mockDb.consents.findMany.mockResolvedValue([]);

      await workflow.processDSAR('dsar-001');

      // Should update to completed
      expect(mockDb.data_subject_requests.update).toHaveBeenCalledWith({
        where: { id: 'dsar-001' },
        data: {
          status: 'completed',
          completed_at: expect.any(Date),
        },
      });
    });

    it('should send completion email on success', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-001',
        status: 'verified',
        request_type: 'access',
        subject_id: SUBJECT_UUID,
        subject_email: 'user@example.com',
      });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
      mockDb.leads.findMany.mockResolvedValue([]);
      mockDb.contacts.findMany.mockResolvedValue([]);
      mockDb.accounts.findMany.mockResolvedValue([]);
      mockDb.opportunities.findMany.mockResolvedValue([]);
      mockDb.tasks.findMany.mockResolvedValue([]);
      mockDb.audit_logs.findMany.mockResolvedValue([]);
      mockDb.consents.findMany.mockResolvedValue([]);

      await workflow.processDSAR('dsar-001');

      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('access'),
        })
      );
    });

    it('should set status to rejected on error and rethrow', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-001',
        status: 'verified',
        request_type: 'access',
        subject_id: SUBJECT_UUID,
        subject_email: 'user@example.com',
      });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
      // Make leads query fail to trigger error handling
      mockDb.leads.findMany.mockRejectedValue(new Error('DB query failed'));

      await expect(workflow.processDSAR('dsar-001')).rejects.toThrow('DB query failed');

      // Should update status to rejected
      expect(mockDb.data_subject_requests.update).toHaveBeenCalledWith({
        where: { id: 'dsar-001' },
        data: { status: 'rejected' },
      });
    });

    it('should log processing failure', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-001',
        status: 'verified',
        request_type: 'access',
        subject_id: SUBJECT_UUID,
        subject_email: 'user@example.com',
      });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
      mockDb.leads.findMany.mockRejectedValue(new Error('Query timeout'));

      try {
        await workflow.processDSAR('dsar-001');
      } catch {
        // expected
      }

      expect(mockDb.audit_logs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'PROCESSING_FAILED',
          metadata: expect.objectContaining({
            error: 'Query timeout',
          }),
        }),
      });
    });

    it('should route to correct handler for each request type', async () => {
      const types = ['access', 'erasure', 'rectification', 'portability', 'restriction', 'objection'];

      for (const type of types) {
        vi.clearAllMocks();

        mockDb.data_subject_requests.findUnique.mockResolvedValue({
          id: `dsar-${type}`,
          status: 'verified',
          request_type: type,
          subject_id: SUBJECT_UUID,
          subject_email: 'user@example.com',
          tenant_id: 'tenant-1',
        });
        mockDb.data_subject_requests.update.mockResolvedValue({});
        mockDb.audit_logs.create.mockResolvedValue({});

        // Mock all data tables
        mockDb.leads.findMany.mockResolvedValue([]);
        mockDb.contacts.findMany.mockResolvedValue([]);
        mockDb.accounts.findMany.mockResolvedValue([]);
        mockDb.opportunities.findMany.mockResolvedValue([]);
        mockDb.tasks.findMany.mockResolvedValue([]);
        mockDb.audit_logs.findMany.mockResolvedValue([]);
        mockDb.consents.findMany.mockResolvedValue([]);
        mockDb.consents.updateMany.mockResolvedValue({});
        mockDb.legal_holds.findMany.mockResolvedValue([]);
        mockDb.legal_holds.create.mockResolvedValue({});
        mockDb.$executeRaw.mockResolvedValue(0);

        await workflow.processDSAR(`dsar-${type}`);

        // All types should complete successfully
        expect(mockDb.data_subject_requests.update).toHaveBeenCalledWith({
          where: { id: `dsar-${type}` },
          data: expect.objectContaining({ status: 'completed' }),
        });
      }
    });
  });

  // ============================================
  // handleAccessRequest
  // ============================================
  describe('handleAccessRequest (via processDSAR)', () => {
    const setupAccessRequest = () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-access',
        status: 'verified',
        request_type: 'access',
        subject_id: SUBJECT_UUID,
        subject_email: 'user@example.com',
      });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
    };

    it('should export data from all tables', async () => {
      setupAccessRequest();

      mockDb.leads.findMany.mockResolvedValue([{ id: 'lead-1', email: 'user@example.com' }]);
      mockDb.contacts.findMany.mockResolvedValue([{ id: 'contact-1' }]);
      mockDb.accounts.findMany.mockResolvedValue([]);
      mockDb.opportunities.findMany.mockResolvedValue([{ id: 'opp-1' }]);
      mockDb.tasks.findMany.mockResolvedValue([]);
      mockDb.audit_logs.findMany.mockResolvedValue([{ id: 'log-1' }]);
      mockDb.consents.findMany.mockResolvedValue([]);

      await workflow.processDSAR('dsar-access');

      expect(mockDb.leads.findMany).toHaveBeenCalledWith({
        where: { ownerId: SUBJECT_UUID },
      });
      expect(mockDb.contacts.findMany).toHaveBeenCalledWith({
        where: { ownerId: SUBJECT_UUID },
      });
      expect(mockDb.accounts.findMany).toHaveBeenCalledWith({
        where: { ownerId: SUBJECT_UUID },
      });
    });

    it('should upload export data to storage', async () => {
      setupAccessRequest();

      mockDb.leads.findMany.mockResolvedValue([{ id: 'lead-1' }]);
      mockDb.contacts.findMany.mockResolvedValue([]);
      mockDb.accounts.findMany.mockResolvedValue([]);
      mockDb.opportunities.findMany.mockResolvedValue([]);
      mockDb.tasks.findMany.mockResolvedValue([]);
      mockDb.audit_logs.findMany.mockResolvedValue([]);
      mockDb.consents.findMany.mockResolvedValue([]);

      await workflow.processDSAR('dsar-access');

      expect(mockStorageService.upload).toHaveBeenCalledWith(
        expect.stringContaining('dsar-export-dsar-access'),
        expect.any(String)
      );
    });

    it('should update DSAR record with export URL', async () => {
      setupAccessRequest();

      mockDb.leads.findMany.mockResolvedValue([]);
      mockDb.contacts.findMany.mockResolvedValue([]);
      mockDb.accounts.findMany.mockResolvedValue([]);
      mockDb.opportunities.findMany.mockResolvedValue([]);
      mockDb.tasks.findMany.mockResolvedValue([]);
      mockDb.audit_logs.findMany.mockResolvedValue([]);
      mockDb.consents.findMany.mockResolvedValue([]);

      await workflow.processDSAR('dsar-access');

      expect(mockDb.data_subject_requests.update).toHaveBeenCalledWith({
        where: { id: 'dsar-access' },
        data: { data_export_url: 'https://storage.example.com/export.json' },
      });
    });

    it('should log data export event with record count', async () => {
      setupAccessRequest();

      mockDb.leads.findMany.mockResolvedValue([{ id: '1' }, { id: '2' }]);
      mockDb.contacts.findMany.mockResolvedValue([{ id: '3' }]);
      mockDb.accounts.findMany.mockResolvedValue([]);
      mockDb.opportunities.findMany.mockResolvedValue([]);
      mockDb.tasks.findMany.mockResolvedValue([]);
      mockDb.audit_logs.findMany.mockResolvedValue([]);
      mockDb.consents.findMany.mockResolvedValue([]);

      await workflow.processDSAR('dsar-access');

      expect(mockDb.audit_logs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DATA_EXPORTED',
          metadata: expect.objectContaining({
            recordCount: 3,
            tables: expect.arrayContaining(['leads', 'contacts']),
          }),
        }),
      });
    });

    it('should only include non-empty tables in metadata', async () => {
      setupAccessRequest();

      mockDb.leads.findMany.mockResolvedValue([{ id: '1' }]);
      mockDb.contacts.findMany.mockResolvedValue([]);
      mockDb.accounts.findMany.mockResolvedValue([]);
      mockDb.opportunities.findMany.mockResolvedValue([]);
      mockDb.tasks.findMany.mockResolvedValue([]);
      mockDb.audit_logs.findMany.mockResolvedValue([]);
      mockDb.consents.findMany.mockResolvedValue([]);

      await workflow.processDSAR('dsar-access');

      expect(mockDb.audit_logs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DATA_EXPORTED',
          metadata: expect.objectContaining({
            tables: ['leads'],
          }),
        }),
      });
    });
  });

  // ============================================
  // handleErasureRequest
  // ============================================
  describe('handleErasureRequest (via processDSAR)', () => {
    const setupErasureRequest = () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-erase',
        status: 'verified',
        request_type: 'erasure',
        subject_id: SUBJECT_UUID,
        subject_email: 'user@example.com',
        tenant_id: 'tenant-1',
      });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
    };

    it('should check for legal holds before erasure', async () => {
      setupErasureRequest();
      mockDb.legal_holds.findMany.mockResolvedValue([]);
      mockDb.$executeRaw.mockResolvedValue(0);

      await workflow.processDSAR('dsar-erase');

      expect(mockDb.legal_holds.findMany).toHaveBeenCalledWith({
        where: {
          record_id: SUBJECT_UUID,
          released_at: null,
        },
      });
    });

    it('should throw when subject is under legal hold', async () => {
      setupErasureRequest();
      mockDb.legal_holds.findMany.mockResolvedValue([
        { case_reference: 'CASE-001' },
      ]);

      await expect(workflow.processDSAR('dsar-erase')).rejects.toThrow(
        'Cannot erase data: subject is under legal hold in CASE-001'
      );
    });

    it('should purge search indexes before anonymization', async () => {
      setupErasureRequest();
      mockDb.legal_holds.findMany.mockResolvedValue([]);
      mockDb.$executeRaw.mockResolvedValue(5);

      await workflow.processDSAR('dsar-erase');

      // Should call $executeRaw for purge (2 calls for docs and notes) + 3 for anonymize
      expect(mockDb.$executeRaw).toHaveBeenCalled();
    });

    it('should anonymize data in leads, contacts, and accounts tables', async () => {
      setupErasureRequest();
      mockDb.legal_holds.findMany.mockResolvedValue([]);
      mockDb.$executeRaw.mockResolvedValue(0);

      await workflow.processDSAR('dsar-erase');

      // Should call $executeRaw for each table + purge calls
      const rawCalls = mockDb.$executeRaw.mock.calls;
      expect(rawCalls.length).toBeGreaterThanOrEqual(3); // 2 purge + 3 anonymize
    });

    it('should log erasure event with table list and purge results', async () => {
      setupErasureRequest();
      mockDb.legal_holds.findMany.mockResolvedValue([]);
      mockDb.$executeRaw
        .mockResolvedValueOnce(3) // documents purged
        .mockResolvedValueOnce(2) // notes purged
        .mockResolvedValue(0); // anonymize calls

      await workflow.processDSAR('dsar-erase');

      expect(mockDb.audit_logs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DATA_ERASED',
          metadata: expect.objectContaining({
            subjectId: SUBJECT_UUID,
            tablesAnonymized: ['leads', 'contacts', 'accounts'],
            searchIndexesPurged: expect.objectContaining({
              documents: 3,
              notes: 2,
            }),
          }),
        }),
      });
    });
  });

  // ============================================
  // handleRectificationRequest
  // ============================================
  describe('handleRectificationRequest (via processDSAR)', () => {
    it('should send rectification email with profile link', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-rect',
        status: 'verified',
        request_type: 'rectification',
        subject_id: SUBJECT_UUID,
        subject_email: 'user@example.com',
      });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});

      await workflow.processDSAR('dsar-rect');

      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Data Rectification - Update Your Information',
          body: expect.stringContaining('/profile'),
        })
      );
    });

    it('should log rectification request', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-rect',
        status: 'verified',
        request_type: 'rectification',
        subject_id: SUBJECT_UUID,
        subject_email: 'user@example.com',
      });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});

      await workflow.processDSAR('dsar-rect');

      expect(mockDb.audit_logs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'RECTIFICATION_REQUESTED',
        }),
      });
    });
  });

  // ============================================
  // handleRestrictionRequest
  // ============================================
  describe('handleRestrictionRequest (via processDSAR)', () => {
    it('should place legal hold on subject', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-restrict',
        status: 'verified',
        request_type: 'restriction',
        subject_id: SUBJECT_UUID,
        subject_email: 'user@example.com',
      });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
      mockDb.legal_holds.create.mockResolvedValue({});

      await workflow.processDSAR('dsar-restrict');

      expect(mockDb.legal_holds.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          case_reference: 'DSAR-RESTRICTION-dsar-restrict',
          table_name: 'users',
          record_id: SUBJECT_UUID,
          hold_reason: expect.stringContaining('GDPR Article 18'),
          placed_by: SUBJECT_UUID,
        }),
      });
    });

    it('should log processing restriction', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-restrict',
        status: 'verified',
        request_type: 'restriction',
        subject_id: SUBJECT_UUID,
        subject_email: 'user@example.com',
      });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
      mockDb.legal_holds.create.mockResolvedValue({});

      await workflow.processDSAR('dsar-restrict');

      expect(mockDb.audit_logs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'PROCESSING_RESTRICTED',
          metadata: expect.objectContaining({
            holdPlaced: true,
          }),
        }),
      });
    });
  });

  // ============================================
  // handleObjectionRequest
  // ============================================
  describe('handleObjectionRequest (via processDSAR)', () => {
    it('should withdraw consents for marketing, analytics, profiling', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-object',
        status: 'verified',
        request_type: 'objection',
        subject_id: SUBJECT_UUID,
        subject_email: 'user@example.com',
      });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
      mockDb.consents.updateMany.mockResolvedValue({ count: 3 });

      await workflow.processDSAR('dsar-object');

      expect(mockDb.consents.updateMany).toHaveBeenCalledWith({
        where: {
          subject_id: SUBJECT_UUID,
          purpose: { in: ['marketing', 'analytics', 'profiling'] },
        },
        data: {
          given: false,
          withdrawn_at: expect.any(Date),
        },
      });
    });

    it('should log objection with withdrawn consents', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-object',
        status: 'verified',
        request_type: 'objection',
        subject_id: SUBJECT_UUID,
        subject_email: 'user@example.com',
      });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
      mockDb.consents.updateMany.mockResolvedValue({ count: 3 });

      await workflow.processDSAR('dsar-object');

      expect(mockDb.audit_logs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'OBJECTION_PROCESSED',
          metadata: expect.objectContaining({
            consentsWithdrawn: ['marketing', 'analytics', 'profiling'],
          }),
        }),
      });
    });
  });

  // ============================================
  // handlePortabilityRequest
  // ============================================
  describe('handlePortabilityRequest (via processDSAR)', () => {
    it('should perform same export as access request', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-port',
        status: 'verified',
        request_type: 'portability',
        subject_id: SUBJECT_UUID,
        subject_email: 'user@example.com',
      });
      mockDb.data_subject_requests.update.mockResolvedValue({});
      mockDb.audit_logs.create.mockResolvedValue({});
      mockDb.leads.findMany.mockResolvedValue([]);
      mockDb.contacts.findMany.mockResolvedValue([]);
      mockDb.accounts.findMany.mockResolvedValue([]);
      mockDb.opportunities.findMany.mockResolvedValue([]);
      mockDb.tasks.findMany.mockResolvedValue([]);
      mockDb.audit_logs.findMany.mockResolvedValue([]);
      mockDb.consents.findMany.mockResolvedValue([]);

      await workflow.processDSAR('dsar-port');

      // Should call the same data export tables as access
      expect(mockDb.leads.findMany).toHaveBeenCalled();
      expect(mockDb.contacts.findMany).toHaveBeenCalled();
      expect(mockStorageService.upload).toHaveBeenCalled();
    });
  });

  // ============================================
  // getStatus
  // ============================================
  describe('getStatus()', () => {
    it('should return workflow state for existing request', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-001',
        status: 'completed',
        verified_at: new Date('2026-01-16T10:00:00Z'),
        completed_at: new Date('2026-01-17T10:00:00Z'),
        data_export_url: 'https://storage.example.com/export.json',
        sla_deadline: new Date('2026-02-15T10:00:00Z'),
        notes: 'Request processed successfully',
      });

      const result = await workflow.getStatus('dsar-001');

      expect(result.requestId).toBe('dsar-001');
      expect(result.status).toBe('completed');
      expect(result.verifiedAt).toEqual(new Date('2026-01-16T10:00:00Z'));
      expect(result.completedAt).toEqual(new Date('2026-01-17T10:00:00Z'));
      expect(result.dataExportUrl).toBe('https://storage.example.com/export.json');
      expect(result.slaDeadline).toEqual(new Date('2026-02-15T10:00:00Z'));
      expect(result.notes).toEqual(['Request processed successfully']);
    });

    it('should throw when request not found', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue(null);

      await expect(workflow.getStatus('non-existent')).rejects.toThrow(
        'DSAR request not found'
      );
    });

    it('should handle null notes', async () => {
      mockDb.data_subject_requests.findUnique.mockResolvedValue({
        id: 'dsar-001',
        status: 'pending',
        verified_at: null,
        completed_at: null,
        data_export_url: null,
        sla_deadline: new Date(),
        notes: null,
      });

      const result = await workflow.getStatus('dsar-001');

      expect(result.notes).toEqual([]);
    });
  });

  // ============================================
  // getOverdueRequests
  // ============================================
  describe('getOverdueRequests()', () => {
    it('should return requests past SLA deadline', async () => {
      const overdueRequests = [
        { id: 'dsar-overdue-1', status: 'processing', sla_deadline: new Date('2025-12-01') },
        { id: 'dsar-overdue-2', status: 'verified', sla_deadline: new Date('2025-11-15') },
      ];
      mockDb.data_subject_requests.findMany.mockResolvedValue(overdueRequests);

      const result = await workflow.getOverdueRequests();

      expect(result).toHaveLength(2);
      expect(mockDb.data_subject_requests.findMany).toHaveBeenCalledWith({
        where: {
          sla_deadline: { lt: expect.any(Date) },
          status: { notIn: ['completed', 'rejected'] },
        },
        orderBy: { sla_deadline: 'asc' },
      });
    });

    it('should return empty array when no overdue requests', async () => {
      mockDb.data_subject_requests.findMany.mockResolvedValue([]);

      const result = await workflow.getOverdueRequests();

      expect(result).toEqual([]);
    });
  });

  // ============================================
  // createDSARWorkflow factory
  // ============================================
  describe('createDSARWorkflow()', () => {
    it('should create a DSARWorkflow instance', () => {
      const workflow = createDSARWorkflow(mockDb, mockEmailService, mockStorageService);

      expect(workflow).toBeInstanceOf(DSARWorkflow);
    });
  });
});
