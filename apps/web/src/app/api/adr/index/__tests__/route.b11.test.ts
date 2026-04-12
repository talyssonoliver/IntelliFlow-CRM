/**
 * ADR Index Route B11 Tests - covers all branches (0% coverage)
 *
 * Targets:
 * - GET: generateADRIndex success
 * - GET: generateADRIndex throws (500)
 * - POST: writeADRIndex success with path
 * - POST: writeADRIndex returns failure (400)
 * - POST: writeADRIndex throws (500)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateADRIndex = vi.hoisted(() => vi.fn());
const mockWriteADRIndex = vi.hoisted(() => vi.fn());

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
  generateADRIndex: (...args: unknown[]) => mockGenerateADRIndex(...args),
  writeADRIndex: (...args: unknown[]) => mockWriteADRIndex(...args),
}));

import { GET, POST } from '../route';

describe('/api/adr/index route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateADRIndex.mockReturnValue('# ADR Index\n\n- ADR-001: Test\n');
    mockWriteADRIndex.mockReturnValue({ success: true, path: 'docs/adr/INDEX.md' });
  });

  describe('GET - generate index', () => {
    it('should return generated ADR index content', async () => {
      const res = await GET();
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.content).toBe('# ADR Index\n\n- ADR-001: Test\n');
      expect(mockGenerateADRIndex).toHaveBeenCalled();
    });

    it('should return 500 when generateADRIndex throws', async () => {
      mockGenerateADRIndex.mockImplementation(() => {
        throw new Error('File system read error');
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await GET();
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('File system read error');
      errorSpy.mockRestore();
    });
  });

  describe('POST - write index', () => {
    it('should write ADR index and return path', async () => {
      const res = await POST();
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.data.path).toBe('docs/adr/INDEX.md');
      expect(mockWriteADRIndex).toHaveBeenCalled();
    });

    it('should return 400 when writeADRIndex returns failure', async () => {
      mockWriteADRIndex.mockReturnValue({
        success: false,
        error: 'No ADRs found to index',
      });

      const res = await POST();
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('No ADRs found to index');
    });

    it('should return 500 when writeADRIndex throws', async () => {
      mockWriteADRIndex.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await POST();
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Permission denied');
      errorSpy.mockRestore();
    });
  });
});
