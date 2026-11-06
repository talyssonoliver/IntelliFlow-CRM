/**
 * Tests for session.ts: the server-side Supabase client used to check tokens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateClient = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient: (...a: any[]) => mockCreateClient(...a) }));

import * as session from '../session';

describe('session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockReturnValue({ auth: {} });
  });

  describe('createServerClient', () => {
    it('creates a client that never keeps or refreshes a session', () => {
      session.createServerClient();

      expect(mockCreateClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ auth: { autoRefreshToken: false, persistSession: false } })
      );
    });
  });

  it('offers nothing that reads a role or a session cookie', () => {
    expect(Object.keys(session)).toEqual(['createServerClient']);
  });
});
