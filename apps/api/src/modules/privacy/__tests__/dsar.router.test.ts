/**
 * DSAR Router Tests — Fix #17
 *
 * Tests for privacy.submitDSAR and privacy.getDSARStatus endpoints.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { TRPCError } from '@trpc/server';

// ------------------------------------------------
// Mock the workflow module BEFORE importing the router
// ------------------------------------------------

const mockInitiateDSAR = vi.fn();
const mockVerifyIdentity = vi.fn();
const mockGetStatus = vi.fn();

const mockWorkflowInstance = {
  initiateDSAR: mockInitiateDSAR,
  verifyIdentity: mockVerifyIdentity,
  getStatus: mockGetStatus,
};

vi.mock('../../../workflow/dsar-workflow', () => ({
  createDSARWorkflow: vi.fn(() => mockWorkflowInstance),
}));

// ------------------------------------------------
// Test data
// ------------------------------------------------

const REQUEST_ID = 'req-abc-123';
const TOKEN = 'tok-def-456';
const SLA = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

const DEFAULT_STATE = {
  requestId: REQUEST_ID,
  status: 'pending' as const,
  slaDeadline: SLA,
  verifiedAt: undefined,
  completedAt: undefined,
  dataExportUrl: undefined,
  notes: ['DSAR request initiated'],
};

// ------------------------------------------------
// Helpers
// ------------------------------------------------

let dsarRouter: any;

function makeCtx() {
  return {
    prisma: {} as any,
    user: null,
    req: undefined,
  };
}

function makeCaller() {
  return dsarRouter.createCaller(makeCtx());
}

// ------------------------------------------------
// Tests
// ------------------------------------------------

describe('DSAR Router (Fix #17)', () => {
  beforeAll(async () => {
    const mod = await import('../dsar.router.js');
    dsarRouter = mod.dsarRouter;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------------
  // submitDSAR
  // ------------------------------------------------

  describe('submitDSAR', () => {
    it('returns success with requestId when workflow initiates correctly', async () => {
      mockInitiateDSAR.mockResolvedValue({ ...DEFAULT_STATE });

      const caller = makeCaller();
      const result = await caller.submitDSAR({
        type: 'ACCESS',
        email: 'user@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.requestId).toBe(REQUEST_ID);
      expect(result.slaDeadline).toBeDefined();
      expect(typeof result.message).toBe('string');
    });

    it('calls initiateDSAR with correct request type (lowercased)', async () => {
      mockInitiateDSAR.mockResolvedValue({ ...DEFAULT_STATE });

      const caller = makeCaller();
      await caller.submitDSAR({ type: 'ERASURE', email: 'test@example.com' });

      expect(mockInitiateDSAR).toHaveBeenCalledWith(
        expect.objectContaining({ requestType: 'erasure', subjectEmail: 'test@example.com' })
      );
    });

    it('passes optional description to the workflow', async () => {
      mockInitiateDSAR.mockResolvedValue({ ...DEFAULT_STATE });

      const caller = makeCaller();
      await caller.submitDSAR({
        type: 'PORTABILITY',
        email: 'test@example.com',
        description: 'I want my data exported.',
      });

      expect(mockInitiateDSAR).toHaveBeenCalledWith(
        expect.objectContaining({ requestDetails: 'I want my data exported.' })
      );
    });

    it('throws INTERNAL_SERVER_ERROR when workflow throws', async () => {
      mockInitiateDSAR.mockRejectedValue(new Error('DB unavailable'));

      const caller = makeCaller();
      await expect(
        caller.submitDSAR({ type: 'ACCESS', email: 'user@example.com' })
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
    });

    it('rejects invalid email with BAD_REQUEST (Zod validation)', async () => {
      const caller = makeCaller();
      await expect(
        caller.submitDSAR({ type: 'ACCESS', email: 'not-an-email' })
      ).rejects.toThrow();
    });

    it('rejects unknown DSAR type with validation error', async () => {
      const caller = makeCaller();
      await expect(
        caller.submitDSAR({ type: 'UNKNOWN_TYPE' as any, email: 'user@example.com' })
      ).rejects.toThrow();
    });

    it('accepts all valid DSAR types', async () => {
      mockInitiateDSAR.mockResolvedValue({ ...DEFAULT_STATE });
      const caller = makeCaller();

      const types = ['ACCESS', 'ERASURE', 'PORTABILITY', 'RESTRICTION', 'OBJECTION'] as const;
      for (const type of types) {
        await expect(
          caller.submitDSAR({ type, email: 'test@example.com' })
        ).resolves.toMatchObject({ success: true });
      }
    });
  });

  // ------------------------------------------------
  // getDSARStatus
  // ------------------------------------------------

  describe('getDSARStatus', () => {
    it('returns status when requestId and token are valid', async () => {
      mockVerifyIdentity.mockResolvedValue(true);
      mockGetStatus.mockResolvedValue({ ...DEFAULT_STATE });

      const caller = makeCaller();
      const result = await caller.getDSARStatus({ requestId: REQUEST_ID, verificationToken: TOKEN });

      expect(result.requestId).toBe(REQUEST_ID);
      expect(result.status).toBe('pending');
    });

    it('throws UNAUTHORIZED when token is invalid', async () => {
      mockVerifyIdentity.mockResolvedValue(false);

      const caller = makeCaller();
      await expect(
        caller.getDSARStatus({ requestId: REQUEST_ID, verificationToken: 'wrong-token' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('throws NOT_FOUND when workflow throws (e.g. unknown requestId)', async () => {
      mockVerifyIdentity.mockRejectedValue(new Error('DSAR request not found'));

      const caller = makeCaller();
      await expect(
        caller.getDSARStatus({ requestId: 'no-such-id', verificationToken: TOKEN })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('includes dataExportUrl when present', async () => {
      mockVerifyIdentity.mockResolvedValue(true);
      mockGetStatus.mockResolvedValue({
        ...DEFAULT_STATE,
        status: 'completed',
        dataExportUrl: 'https://storage.example.com/export.json',
        completedAt: new Date(),
      });

      const caller = makeCaller();
      const result = await caller.getDSARStatus({ requestId: REQUEST_ID, verificationToken: TOKEN });

      expect(result.status).toBe('completed');
      expect(result.dataExportUrl).toBe('https://storage.example.com/export.json');
    });

    it('requires requestId', async () => {
      const caller = makeCaller();
      await expect(
        caller.getDSARStatus({ requestId: '', verificationToken: TOKEN })
      ).rejects.toThrow();
    });

    it('requires verificationToken', async () => {
      const caller = makeCaller();
      await expect(
        caller.getDSARStatus({ requestId: REQUEST_ID, verificationToken: '' })
      ).rejects.toThrow();
    });
  });
});
