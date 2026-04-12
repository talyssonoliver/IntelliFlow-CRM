/**
 * Supabase Client Library Tests
 *
 * Tests for the Supabase client configuration and helper functions.
 * IFC-006: Supabase Integration
 * IFC-169: Fix Supabase auth
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

// Store original env before any imports
const originalEnv = { ...process.env };

describe('Supabase Configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset env for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('getSupabaseConfig - Production Environment (IFC-169)', () => {
    it('should throw when SUPABASE_URL is missing in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.VITEST;
      delete process.env.SUPABASE_URL;
      process.env.SUPABASE_ANON_KEY = 'real-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'real-service-key';

      await expect(import('../supabase.js')).rejects.toThrow(
        '[CRITICAL] Supabase configuration error in production'
      );
    });

    it('should throw when SUPABASE_ANON_KEY is missing in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.VITEST;
      process.env.SUPABASE_URL = 'https://prod.supabase.co';
      delete process.env.SUPABASE_ANON_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'real-service-key';

      await expect(import('../supabase.js')).rejects.toThrow('SUPABASE_ANON_KEY');
    });

    it('should throw when SUPABASE_SERVICE_ROLE_KEY is missing in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.VITEST;
      process.env.SUPABASE_URL = 'https://prod.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'real-anon-key';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      await expect(import('../supabase.js')).rejects.toThrow('SUPABASE_SERVICE_ROLE_KEY');
    });

    it('should throw listing all missing vars when none are set in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.VITEST;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      await expect(import('../supabase.js')).rejects.toThrow('SUPABASE_URL');
    });

    it('should NOT throw when all vars are set in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.VITEST;
      process.env.SUPABASE_URL = 'https://prod.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'real-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'real-service-key';

      const mod = await import('../supabase.js');
      expect(mod.supabase).toBeDefined();
      expect(mod.getConfig().usingMockKeys).toBe(false);
    });
  });

  describe('getSupabaseConfig - Development Environment (IFC-169)', () => {
    it('should warn but not throw when vars are missing in development', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.VITEST;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mod = await import('../supabase.js');

      expect(mod.supabase).toBeDefined();
      expect(mod.getConfig().usingMockKeys).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Supabase] Development mode'));
      warnSpy.mockRestore();
    });
  });

  describe('getSupabaseConfig - Test Environment', () => {
    it('should use mock keys silently in test environment', async () => {
      process.env.NODE_ENV = 'test';
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const { getConfig } = await import('../supabase.js');
      const config = getConfig();

      expect(config.url).toBe('http://127.0.0.1:54321');
      expect(config.usingMockKeys).toBe(true);
    });

    it('should use provided environment variables in test', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

      const { getConfig } = await import('../supabase.js');
      const config = getConfig();

      expect(config.url).toBe('https://test.supabase.co');
      expect(config.hasAnonKey).toBe(true);
      expect(config.hasServiceKey).toBe(true);
    });
  });

  describe('isConfigured', () => {
    it('should return false when using mock keys', async () => {
      process.env.NODE_ENV = 'test';
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const { isConfigured } = await import('../supabase.js');

      expect(isConfigured()).toBe(false);
    });

    it('should return true when keys are provided', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'real-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'real-service-key';

      const { isConfigured } = await import('../supabase.js');

      expect(isConfigured()).toBe(true);
    });
  });

  describe('isAuthFunctional', () => {
    it('should return false when keys are missing', async () => {
      process.env.NODE_ENV = 'test';
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const { isAuthFunctional } = await import('../supabase.js');

      expect(isAuthFunctional()).toBe(false);
    });

    it('should return true when both keys are present', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_ANON_KEY = 'anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

      const { isAuthFunctional } = await import('../supabase.js');

      expect(isAuthFunctional()).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return configuration summary', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'anon-key';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const { getConfig } = await import('../supabase.js');
      const config = getConfig();

      expect(config).toHaveProperty('url');
      expect(config).toHaveProperty('hasAnonKey');
      expect(config).toHaveProperty('hasServiceKey');
      expect(config).toHaveProperty('usingMockKeys');
      expect(config).toHaveProperty('environment');
      expect(config.hasAnonKey).toBe(true);
      expect(config.hasServiceKey).toBe(false);
    });
  });
});

describe('Supabase Client Exports', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('should export supabase client', async () => {
    const { supabase } = await import('../supabase.js');

    expect(supabase).toBeDefined();
    expect(supabase.auth).toBeDefined();
    expect(supabase.from).toBeDefined();
    expect(supabase.storage).toBeDefined();
  });

  it('should export supabaseAdmin client', async () => {
    const { supabaseAdmin } = await import('../supabase.js');

    expect(supabaseAdmin).toBeDefined();
    expect(supabaseAdmin.auth).toBeDefined();
    expect(supabaseAdmin.from).toBeDefined();
  });

  it('should export createAuthenticatedClient function', async () => {
    const { createAuthenticatedClient } = await import('../supabase.js');

    expect(createAuthenticatedClient).toBeDefined();
    expect(typeof createAuthenticatedClient).toBe('function');

    const client = createAuthenticatedClient('test-token');
    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
  });
});

describe('Supabase Auth Functions', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('should export signUp function', async () => {
    const { signUp } = await import('../supabase.js');
    expect(signUp).toBeDefined();
    expect(typeof signUp).toBe('function');
  });

  it('should export signIn function', async () => {
    const { signIn } = await import('../supabase.js');
    expect(signIn).toBeDefined();
    expect(typeof signIn).toBe('function');
  });

  it('should export signOut function', async () => {
    const { signOut } = await import('../supabase.js');
    expect(signOut).toBeDefined();
    expect(typeof signOut).toBe('function');
  });

  it('should export getSession function', async () => {
    const { getSession } = await import('../supabase.js');
    expect(getSession).toBeDefined();
    expect(typeof getSession).toBe('function');
  });

  it('should export getUser function', async () => {
    const { getUser } = await import('../supabase.js');
    expect(getUser).toBeDefined();
    expect(typeof getUser).toBe('function');
  });

  it('should export verifyToken function', async () => {
    const { verifyToken } = await import('../supabase.js');
    expect(verifyToken).toBeDefined();
    expect(typeof verifyToken).toBe('function');
  });

  it('should reject token verification when using mock keys (IFC-169)', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { verifyToken } = await import('../supabase.js');
    const result = await verifyToken('some-jwt-token');

    expect(result.user).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Mock keys cannot verify real tokens');
  });
});

describe('Supabase OAuth Functions', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('should export signInWithOAuth function', async () => {
    const { signInWithOAuth } = await import('../supabase.js');
    expect(signInWithOAuth).toBeDefined();
    expect(typeof signInWithOAuth).toBe('function');
  });

  it('should export exchangeCodeForSession function', async () => {
    const { exchangeCodeForSession } = await import('../supabase.js');
    expect(exchangeCodeForSession).toBeDefined();
    expect(typeof exchangeCodeForSession).toBe('function');
  });
});

describe('Supabase Realtime Functions', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('should export subscribeToTable function', async () => {
    const { subscribeToTable } = await import('../supabase.js');
    expect(subscribeToTable).toBeDefined();
    expect(typeof subscribeToTable).toBe('function');
  });

  it('should export subscribeToLeadScores function', async () => {
    const { subscribeToLeadScores } = await import('../supabase.js');
    expect(subscribeToLeadScores).toBeDefined();
    expect(typeof subscribeToLeadScores).toBe('function');
  });

  it('should export unsubscribe function', async () => {
    const { unsubscribe } = await import('../supabase.js');
    expect(unsubscribe).toBeDefined();
    expect(typeof unsubscribe).toBe('function');
  });
});

describe('Supabase Vector Search Functions', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('should export searchLeadsByEmbedding function', async () => {
    const { searchLeadsByEmbedding } = await import('../supabase.js');
    expect(searchLeadsByEmbedding).toBeDefined();
    expect(typeof searchLeadsByEmbedding).toBe('function');
  });

  it('should export searchContactsByEmbedding function', async () => {
    const { searchContactsByEmbedding } = await import('../supabase.js');
    expect(searchContactsByEmbedding).toBeDefined();
    expect(typeof searchContactsByEmbedding).toBe('function');
  });

  it('should export updateLeadEmbedding function', async () => {
    const { updateLeadEmbedding } = await import('../supabase.js');
    expect(updateLeadEmbedding).toBeDefined();
    expect(typeof updateLeadEmbedding).toBe('function');
  });

  it('should export updateContactEmbedding function', async () => {
    const { updateContactEmbedding } = await import('../supabase.js');
    expect(updateContactEmbedding).toBeDefined();
    expect(typeof updateContactEmbedding).toBe('function');
  });
});

describe('Supabase Storage Functions', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('should export uploadFile function', async () => {
    const { uploadFile } = await import('../supabase.js');
    expect(uploadFile).toBeDefined();
    expect(typeof uploadFile).toBe('function');
  });

  it('should export getPublicUrl function', async () => {
    const { getPublicUrl } = await import('../supabase.js');
    expect(getPublicUrl).toBeDefined();
    expect(typeof getPublicUrl).toBe('function');
  });

  it('should export deleteFile function', async () => {
    const { deleteFile } = await import('../supabase.js');
    expect(deleteFile).toBeDefined();
    expect(typeof deleteFile).toBe('function');
  });

  it('should return public URL', async () => {
    const { getPublicUrl } = await import('../supabase.js');

    const url = getPublicUrl('test-bucket', 'path/to/file.jpg');

    expect(url).toBeDefined();
    expect(typeof url).toBe('string');
    expect(url).toContain('test-bucket');
  });
});

describe('Supabase Type Exports', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('should export Database type structure', async () => {
    // Type-level test - if this compiles, the types are exported correctly
    const supabaseModule = await import('../supabase.js');

    // These are type exports, we're just verifying the module compiles
    expect(supabaseModule).toBeDefined();
  });
});
