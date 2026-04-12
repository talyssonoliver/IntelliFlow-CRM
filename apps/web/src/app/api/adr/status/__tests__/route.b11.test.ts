/**
 * ADR Status Route B11 Tests - covers all branches (0% coverage)
 *
 * Targets:
 * - POST: valid id and status -> success
 * - POST: missing id (400)
 * - POST: missing status (400)
 * - POST: updateADRStatus returns failure (400)
 * - POST: error handling (500)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdateADRStatus = vi.hoisted(() => vi.fn());
const mockValidStatuses = vi.hoisted(() => ['Proposed', 'Accepted', 'Deprecated', 'Superseded']);

vi.mock('next/server', async (importOriginal) => {
  const orig = (await importOriginal()) as any;
  return {
    ...orig,
    NextResponse: {
      json: (body: unknown, init?: { status?: number }) => ({
        json: () => Promise.resolve(body),
        status: init?.status || 200,
      }),
    },
  };
});

vi.mock('@/lib/adr/adr-service', () => ({
  updateADRStatus: (...args: unknown[]) => mockUpdateADRStatus(...args),
  VALID_STATUSES: mockValidStatuses,
}));

import { POST } from '../route';

function makeReq(body: unknown) {
  return {
    json: () => Promise.resolve(body),
  } as any;
}

describe('/api/adr/status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateADRStatus.mockReturnValue({ success: true });
  });

  describe('POST - valid request', () => {
    it('should update ADR status successfully', async () => {
      const res = await POST(makeReq({ id: 'ADR-001', status: 'Accepted' }));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(mockUpdateADRStatus).toHaveBeenCalledWith('ADR-001', 'Accepted');
    });
  });

  describe('POST - missing id', () => {
    it('should return 400 when id is missing', async () => {
      const res = await POST(makeReq({ status: 'Accepted' }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('ADR ID is required');
    });

    it('should return 400 when id is not a string', async () => {
      const res = await POST(makeReq({ id: 123, status: 'Accepted' }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('ADR ID is required');
    });

    it('should return 400 when id is empty string', async () => {
      const res = await POST(makeReq({ id: '', status: 'Accepted' }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('POST - missing status', () => {
    it('should return 400 when status is missing', async () => {
      const res = await POST(makeReq({ id: 'ADR-001' }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Status is required');
      expect(data.error).toContain('Valid statuses');
    });

    it('should return 400 when status is not a string', async () => {
      const res = await POST(makeReq({ id: 'ADR-001', status: 42 }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Status is required');
    });
  });

  describe('POST - service returns failure', () => {
    it('should return 400 when updateADRStatus fails', async () => {
      mockUpdateADRStatus.mockReturnValue({
        success: false,
        error: 'ADR-001 not found',
      });

      const res = await POST(makeReq({ id: 'ADR-001', status: 'Accepted' }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('ADR-001 not found');
    });
  });

  describe('POST - error handling', () => {
    it('should return 500 when an exception is thrown', async () => {
      mockUpdateADRStatus.mockImplementation(() => {
        throw new Error('Disk write failed');
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await POST(makeReq({ id: 'ADR-001', status: 'Accepted' }));
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Disk write failed');
      errorSpy.mockRestore();
    });

    it('should return 500 when request.json() throws', async () => {
      const badReq = {
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as any;

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await POST(badReq);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid JSON');
      errorSpy.mockRestore();
    });
  });
});
