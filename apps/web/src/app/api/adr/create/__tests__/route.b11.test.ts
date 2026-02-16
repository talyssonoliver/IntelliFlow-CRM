/**
 * ADR Create Route B11 Tests - covers all branches (0% coverage)
 *
 * Targets:
 * - POST: valid title -> creates ADR successfully
 * - POST: with technicalStory parameter
 * - POST: missing title (400)
 * - POST: title is not a string (400)
 * - POST: createADR returns failure (400)
 * - POST: error handling (500)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateADR = vi.hoisted(() => vi.fn());

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
  createADR: (...args: unknown[]) => mockCreateADR(...args),
}));

import { POST } from '../route';

function makeReq(body: unknown) {
  return {
    json: () => Promise.resolve(body),
  } as any;
}

describe('/api/adr/create route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateADR.mockReturnValue({
      success: true,
      path: 'docs/adr/ADR-042-my-decision.md',
    });
  });

  describe('POST - valid creation', () => {
    it('should create ADR with title only', async () => {
      const res = await POST(makeReq({ title: 'Use PostgreSQL for storage' }));
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.path).toBe('docs/adr/ADR-042-my-decision.md');
      expect(mockCreateADR).toHaveBeenCalledWith('Use PostgreSQL for storage', undefined);
    });

    it('should create ADR with title and technicalStory', async () => {
      const res = await POST(
        makeReq({
          title: 'Adopt Event Sourcing',
          technicalStory: 'We need audit trail for compliance',
        })
      );
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.path).toBe('docs/adr/ADR-042-my-decision.md');
      expect(mockCreateADR).toHaveBeenCalledWith(
        'Adopt Event Sourcing',
        'We need audit trail for compliance'
      );
    });
  });

  describe('POST - missing title', () => {
    it('should return 400 when title is missing', async () => {
      const res = await POST(makeReq({}));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Title is required');
    });

    it('should return 400 when title is not a string', async () => {
      const res = await POST(makeReq({ title: 999 }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Title is required');
    });

    it('should return 400 when title is empty string', async () => {
      const res = await POST(makeReq({ title: '' }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('POST - service returns failure', () => {
    it('should return 400 when createADR fails', async () => {
      mockCreateADR.mockReturnValue({
        success: false,
        error: 'Duplicate ADR title',
      });

      const res = await POST(makeReq({ title: 'Existing Decision' }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Duplicate ADR title');
    });
  });

  describe('POST - error handling', () => {
    it('should return 500 when createADR throws', async () => {
      mockCreateADR.mockImplementation(() => {
        throw new Error('Cannot write to disk');
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await POST(makeReq({ title: 'New Decision' }));
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Cannot write to disk');
      errorSpy.mockRestore();
    });

    it('should return 500 when request.json() throws', async () => {
      const badReq = {
        json: () => Promise.reject(new Error('Malformed body')),
      } as any;

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await POST(badReq);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Malformed body');
      errorSpy.mockRestore();
    });
  });
});
