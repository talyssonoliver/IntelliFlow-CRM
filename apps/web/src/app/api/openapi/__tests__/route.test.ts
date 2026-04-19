import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs — both 'fs' and 'node:fs' specifiers must be mocked because the
// route imports from 'node:fs'. Vitest treats them as distinct modules.
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
  },
  readFileSync: vi.fn(),
}));
vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(),
  },
  readFileSync: vi.fn(),
}));

// Mock path — same reasoning: also handle 'node:path'.
vi.mock('path', () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join('/')),
  },
  join: vi.fn((...args: string[]) => args.join('/')),
}));
vi.mock('node:path', () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join('/')),
  },
  join: vi.fn((...args: string[]) => args.join('/')),
}));

import { GET } from '../route';
import fs from 'node:fs';

const mockSpec = {
  openapi: '3.0.3',
  info: { title: 'IntelliFlow CRM API', version: '1.0.0' },
  paths: {},
};

describe('GET /api/openapi', () => {
  beforeEach(() => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSpec));
  });

  it('returns OpenAPI spec as JSON (body contains openapi: "3.0.3")', async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.openapi).toBe('3.0.3');
  });

  it('returns 200 status code on success', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('sets Cache-Control: public, max-age=3600 header', async () => {
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('sets Content-Type to application/json', async () => {
    const response = await GET();
    expect(response.headers.get('Content-Type')).toContain('application/json');
  });

  it('returns 503 when spec file is missing (fs.readFileSync throws)', async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    const response = await GET();
    expect(response.status).toBe(503);
  });

  it('returns error message { error: "OpenAPI spec not available" } on failure', async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const response = await GET();
    const body = await response.json();
    expect(body.error).toBe('OpenAPI spec not available');
  });

  it('reads spec from correct path relative to cwd', async () => {
    await GET();
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('api/openapi.json'),
      'utf-8'
    );
  });
});
