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

  describe('getSupabaseConfig - Test Environment', () => {
    it('should use mock keys silently in test environment', async () => {
      process.env.NODE_ENV = 'test';
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const { getConfig } = await import('../supabase');
      const config = getConfig();

      expect(config.url).toBe('http://127.0.0.1:54321');
      expect(config.usingMockKeys).toBe(true);
    });

    it('should use provided environment variables in test', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

      const { getConfig } = await import('../supabase');
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

      const { isConfigured } = await import('../supabase');

      expect(isConfigured()).toBe(false);
    });

    it('should return true when keys are provided', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'real-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'real-service-key';

      const { isConfigured } = await import('../supabase');

      expect(isConfigured()).toBe(true);
    });
  });

  describe('isAuthFunctional', () => {
    it('should return false when keys are missing', async () => {
      process.env.NODE_ENV = 'test';
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const { isAuthFunctional } = await import('../supabase');

      expect(isAuthFunctional()).toBe(false);
    });

    it('should return true when both keys are present', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_ANON_KEY = 'anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

      const { isAuthFunctional } = await import('../supabase');

      expect(isAuthFunctional()).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return configuration summary', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'anon-key';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const { getConfig } = await import('../supabase');
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
    const { supabase } = await import('../supabase');

    expect(supabase).toBeDefined();
    expect(supabase.auth).toBeDefined();
    expect(supabase.from).toBeDefined();
    expect(supabase.storage).toBeDefined();
  });

  it('should export supabaseAdmin client', async () => {
    const { supabaseAdmin } = await import('../supabase');

    expect(supabaseAdmin).toBeDefined();
    expect(supabaseAdmin.auth).toBeDefined();
    expect(supabaseAdmin.from).toBeDefined();
  });

  it('should export createAuthenticatedClient function', async () => {
    const { createAuthenticatedClient } = await import('../supabase');

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
    const { signUp } = await import('../supabase');
    expect(signUp).toBeDefined();
    expect(typeof signUp).toBe('function');
  });

  it('should export signIn function', async () => {
    const { signIn } = await import('../supabase');
    expect(signIn).toBeDefined();
    expect(typeof signIn).toBe('function');
  });

  it('should export signOut function', async () => {
    const { signOut } = await import('../supabase');
    expect(signOut).toBeDefined();
    expect(typeof signOut).toBe('function');
  });

  it('should export getSession function', async () => {
    const { getSession } = await import('../supabase');
    expect(getSession).toBeDefined();
    expect(typeof getSession).toBe('function');
  });

  it('should export getUser function', async () => {
    const { getUser } = await import('../supabase');
    expect(getUser).toBeDefined();
    expect(typeof getUser).toBe('function');
  });

  it('should export verifyToken function', async () => {
    const { verifyToken } = await import('../supabase');
    expect(verifyToken).toBeDefined();
    expect(typeof verifyToken).toBe('function');
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
    const { signInWithOAuth } = await import('../supabase');
    expect(signInWithOAuth).toBeDefined();
    expect(typeof signInWithOAuth).toBe('function');
  });

  it('should export exchangeCodeForSession function', async () => {
    const { exchangeCodeForSession } = await import('../supabase');
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
    const { subscribeToTable } = await import('../supabase');
    expect(subscribeToTable).toBeDefined();
    expect(typeof subscribeToTable).toBe('function');
  });

  it('should export subscribeToLeadScores function', async () => {
    const { subscribeToLeadScores } = await import('../supabase');
    expect(subscribeToLeadScores).toBeDefined();
    expect(typeof subscribeToLeadScores).toBe('function');
  });

  it('should export unsubscribe function', async () => {
    const { unsubscribe } = await import('../supabase');
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
    const { searchLeadsByEmbedding } = await import('../supabase');
    expect(searchLeadsByEmbedding).toBeDefined();
    expect(typeof searchLeadsByEmbedding).toBe('function');
  });

  it('should export searchContactsByEmbedding function', async () => {
    const { searchContactsByEmbedding } = await import('../supabase');
    expect(searchContactsByEmbedding).toBeDefined();
    expect(typeof searchContactsByEmbedding).toBe('function');
  });

  it('should export updateLeadEmbedding function', async () => {
    const { updateLeadEmbedding } = await import('../supabase');
    expect(updateLeadEmbedding).toBeDefined();
    expect(typeof updateLeadEmbedding).toBe('function');
  });

  it('should export updateContactEmbedding function', async () => {
    const { updateContactEmbedding } = await import('../supabase');
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
    const { uploadFile } = await import('../supabase');
    expect(uploadFile).toBeDefined();
    expect(typeof uploadFile).toBe('function');
  });

  it('should export getPublicUrl function', async () => {
    const { getPublicUrl } = await import('../supabase');
    expect(getPublicUrl).toBeDefined();
    expect(typeof getPublicUrl).toBe('function');
  });

  it('should export deleteFile function', async () => {
    const { deleteFile } = await import('../supabase');
    expect(deleteFile).toBeDefined();
    expect(typeof deleteFile).toBe('function');
  });

  it('should return public URL', async () => {
    const { getPublicUrl } = await import('../supabase');

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
    const supabaseModule = await import('../supabase');

    // These are type exports, we're just verifying the module compiles
    expect(supabaseModule).toBeDefined();
  });
});
