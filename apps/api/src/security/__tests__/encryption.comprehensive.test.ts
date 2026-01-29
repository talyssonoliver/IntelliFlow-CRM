/**
 * Comprehensive Encryption Tests - IFC-113
 *
 * Additional tests for uncovered code paths in encryption.ts:
 * - FieldEncryption utilities
 * - VaultKeyProvider methods
 * - Singleton management
 * - Edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EncryptionService,
  EncryptionError,
  EnvironmentKeyProvider,
  VaultKeyProvider,
  FieldEncryption,
  getEncryptionService,
  resetEncryptionService,
  type EncryptedData,
  type KeyProvider,
} from '../encryption';

// Store original env
const originalEnv = { ...process.env };

// Mock fetch for Vault tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('FieldEncryption Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
    resetEncryptionService();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    resetEncryptionService();
  });

  describe('encryptField', () => {
    it('should encrypt a simple field', async () => {
      const obj = { name: 'John', ssn: '123-45-6789' };
      const service = new EncryptionService();

      const result = await FieldEncryption.encryptField(obj, 'ssn', service);

      expect(result.name).toBe('John');
      expect(result.ssn).not.toBe('123-45-6789');
      expect(typeof result.ssn).toBe('string');
    });

    it('should encrypt a nested field', async () => {
      const obj = {
        user: {
          profile: {
            secret: 'sensitive-data',
          },
        },
        public: 'visible',
      };
      const service = new EncryptionService();

      const result = await FieldEncryption.encryptField(obj, 'user.profile.secret', service);

      expect(result.public).toBe('visible');
      expect(result.user.profile.secret).not.toBe('sensitive-data');
    });

    it('should return original object if field path does not exist', async () => {
      const obj = { name: 'John' };
      const service = new EncryptionService();

      const result = await FieldEncryption.encryptField(obj, 'nonexistent.path', service);

      expect(result).toEqual({ name: 'John' });
    });

    it('should return original object if nested path is undefined', async () => {
      const obj = { name: 'John', address: undefined };
      const service = new EncryptionService();

      const result = await FieldEncryption.encryptField(obj, 'address.city', service);

      expect(result).toEqual({ name: 'John', address: undefined });
    });

    it('should skip non-string fields', async () => {
      const obj = { name: 'John', age: 30 };
      const service = new EncryptionService();

      const result = await FieldEncryption.encryptField(obj, 'age', service);

      expect(result.age).toBe(30); // Should remain unchanged
    });

    it('should use default encryption service if none provided', async () => {
      const obj = { secret: 'test-secret' };

      const result = await FieldEncryption.encryptField(obj, 'secret');

      expect(result.secret).not.toBe('test-secret');
    });

    it('should preserve other fields when encrypting', async () => {
      const obj = {
        id: 1,
        name: 'Test',
        nested: { value: 'preserved' },
        sensitiveData: 'encrypt-me',
      };
      const service = new EncryptionService();

      const result = await FieldEncryption.encryptField(obj, 'sensitiveData', service);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Test');
      expect(result.nested.value).toBe('preserved');
      expect(result.sensitiveData).not.toBe('encrypt-me');
    });

    it('should handle deeply nested objects', async () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              secret: 'deep-secret',
            },
          },
        },
      };
      const service = new EncryptionService();

      const result = await FieldEncryption.encryptField(
        obj,
        'level1.level2.level3.secret',
        service,
      );

      expect(result.level1.level2.level3.secret).not.toBe('deep-secret');
    });
  });

  describe('decryptField', () => {
    it('should decrypt a simple field', async () => {
      const service = new EncryptionService();
      const originalObj = { name: 'John', ssn: '123-45-6789' };

      // First encrypt
      const encrypted = await FieldEncryption.encryptField(originalObj, 'ssn', service);

      // Then decrypt
      const decrypted = await FieldEncryption.decryptField(encrypted, 'ssn', service);

      expect(decrypted.name).toBe('John');
      expect(decrypted.ssn).toBe('123-45-6789');
    });

    it('should decrypt a nested field', async () => {
      const service = new EncryptionService();
      const originalObj = {
        user: {
          profile: {
            secret: 'sensitive-data',
          },
        },
        public: 'visible',
      };

      // First encrypt
      const encrypted = await FieldEncryption.encryptField(
        originalObj,
        'user.profile.secret',
        service,
      );

      // Then decrypt
      const decrypted = await FieldEncryption.decryptField(
        encrypted,
        'user.profile.secret',
        service,
      );

      expect(decrypted.public).toBe('visible');
      expect(decrypted.user.profile.secret).toBe('sensitive-data');
    });

    it('should return original object if field path does not exist', async () => {
      const obj = { name: 'John' };
      const service = new EncryptionService();

      const result = await FieldEncryption.decryptField(obj, 'nonexistent.path', service);

      expect(result).toEqual({ name: 'John' });
    });

    it('should return original object if nested path is undefined', async () => {
      const obj = { name: 'John', address: undefined };
      const service = new EncryptionService();

      const result = await FieldEncryption.decryptField(obj, 'address.city', service);

      expect(result).toEqual({ name: 'John', address: undefined });
    });

    it('should skip non-string fields', async () => {
      const obj = { name: 'John', age: 30 };
      const service = new EncryptionService();

      const result = await FieldEncryption.decryptField(obj, 'age', service);

      expect(result.age).toBe(30); // Should remain unchanged
    });

    it('should use default encryption service if none provided', async () => {
      const service = new EncryptionService();
      const originalObj = { secret: 'test-secret' };
      const encrypted = await FieldEncryption.encryptField(originalObj, 'secret', service);

      const decrypted = await FieldEncryption.decryptField(encrypted, 'secret');

      expect(decrypted.secret).toBe('test-secret');
    });

    it('should handle deeply nested objects', async () => {
      const service = new EncryptionService();
      const originalObj = {
        level1: {
          level2: {
            level3: {
              secret: 'deep-secret',
            },
          },
        },
      };

      const encrypted = await FieldEncryption.encryptField(
        originalObj,
        'level1.level2.level3.secret',
        service,
      );
      const decrypted = await FieldEncryption.decryptField(
        encrypted,
        'level1.level2.level3.secret',
        service,
      );

      expect(decrypted.level1.level2.level3.secret).toBe('deep-secret');
    });
  });

  describe('Round-trip encryption/decryption', () => {
    it('should preserve data through encrypt/decrypt cycle', async () => {
      const service = new EncryptionService();
      const originalObj = {
        id: 'user-123',
        profile: {
          name: 'Test User',
          ssn: '111-22-3333',
          dob: '1990-01-01',
        },
        metadata: {
          created: new Date().toISOString(),
        },
      };

      const encrypted = await FieldEncryption.encryptField(
        originalObj,
        'profile.ssn',
        service,
      );
      const decrypted = await FieldEncryption.decryptField(encrypted, 'profile.ssn', service);

      expect(decrypted).toEqual(originalObj);
    });

    it('should handle multiple field encryption', async () => {
      const service = new EncryptionService();
      let obj = {
        user: {
          ssn: '111-22-3333',
          creditCard: '4111-1111-1111-1111',
        },
        public: 'visible',
      };

      // Encrypt multiple fields
      obj = await FieldEncryption.encryptField(obj, 'user.ssn', service);
      obj = await FieldEncryption.encryptField(obj, 'user.creditCard', service);

      expect(obj.user.ssn).not.toBe('111-22-3333');
      expect(obj.user.creditCard).not.toBe('4111-1111-1111-1111');

      // Decrypt multiple fields
      obj = await FieldEncryption.decryptField(obj, 'user.ssn', service);
      obj = await FieldEncryption.decryptField(obj, 'user.creditCard', service);

      expect(obj.user.ssn).toBe('111-22-3333');
      expect(obj.user.creditCard).toBe('4111-1111-1111-1111');
    });
  });
});

describe('VaultKeyProvider Extended Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getKeyMetadata', () => {
    it('should fetch metadata from Vault', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              creation_time: '2025-01-01T00:00:00Z',
              type: 'aes256-gcm96',
            },
          }),
      });

      const provider = new VaultKeyProvider({
        address: 'http://vault:8200',
        token: 'test-token',
        keyName: 'test-key',
      });

      const metadata = await provider.getKeyMetadata(1);

      expect(metadata).toBeDefined();
      expect(metadata?.version).toBe(1);
      expect(metadata?.algorithm).toBe('aes256-gcm96');
      expect(metadata?.keyId).toBe('test-key');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://vault:8200/v1/transit/keys/test-key',
        expect.objectContaining({
          headers: { 'X-Vault-Token': 'test-token' },
        }),
      );
    });

    it('should return null when Vault returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const provider = new VaultKeyProvider();
      const metadata = await provider.getKeyMetadata(1);

      expect(metadata).toBeNull();
    });

    it('should return null when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const provider = new VaultKeyProvider();
      const metadata = await provider.getKeyMetadata(1);

      expect(metadata).toBeNull();
    });
  });

  describe('encryptWithVault', () => {
    it('should encrypt using Vault Transit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              ciphertext: 'vault:v1:encrypted-data',
            },
          }),
      });

      const provider = new VaultKeyProvider({
        address: 'http://vault:8200',
        token: 'test-token',
        keyName: 'test-key',
      });

      const result = await provider.encryptWithVault('plain-text');

      expect(result).toBe('vault:v1:encrypted-data');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://vault:8200/v1/transit/encrypt/test-key',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'X-Vault-Token': 'test-token',
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    it('should throw EncryptionError on Vault encrypt failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const provider = new VaultKeyProvider();

      await expect(provider.encryptWithVault('plain-text')).rejects.toThrow(EncryptionError);
    });
  });

  describe('decryptWithVault', () => {
    it('should decrypt using Vault Transit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              plaintext: Buffer.from('decrypted-text').toString('base64'),
            },
          }),
      });

      const provider = new VaultKeyProvider({
        address: 'http://vault:8200',
        token: 'test-token',
        keyName: 'test-key',
      });

      const result = await provider.decryptWithVault('vault:v1:encrypted');

      expect(result).toBe('decrypted-text');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://vault:8200/v1/transit/decrypt/test-key',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('should throw EncryptionError on Vault decrypt failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const provider = new VaultKeyProvider();

      await expect(provider.decryptWithVault('vault:v1:encrypted')).rejects.toThrow(
        EncryptionError,
      );
    });
  });

  describe('getCurrentKey', () => {
    it('should return key from getKeyByVersion', async () => {
      const provider = new VaultKeyProvider();
      const key = await provider.getCurrentKey();

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });
  });
});

describe('resetEncryptionService', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
    resetEncryptionService();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEncryptionService();
  });

  it('should reset the singleton instance', () => {
    const service1 = getEncryptionService();
    resetEncryptionService();
    const service2 = getEncryptionService();

    expect(service1).not.toBe(service2);
  });

  it('should allow creating new service after reset', async () => {
    const service1 = getEncryptionService();
    const encrypted1 = await service1.encrypt('test');

    resetEncryptionService();

    const service2 = getEncryptionService();
    const encrypted2 = await service2.encrypt('test');

    // Both should work and produce different IVs
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
  });
});

describe('getEncryptionService with VAULT_ENABLED', () => {
  beforeEach(() => {
    vi.resetModules();
    resetEncryptionService();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    resetEncryptionService();
  });

  it('should use VaultKeyProvider when VAULT_ENABLED is true', async () => {
    process.env.VAULT_ENABLED = 'true';
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';

    // Re-import to get fresh singleton
    vi.resetModules();
    const mod = await import('../encryption');
    mod.resetEncryptionService();

    const service = mod.getEncryptionService();
    const keyProvider = service.getKeyProvider();

    expect(keyProvider).toBeInstanceOf(mod.VaultKeyProvider);
  });

  it('should use EnvironmentKeyProvider when VAULT_ENABLED is not set', async () => {
    delete process.env.VAULT_ENABLED;
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';

    vi.resetModules();
    const mod = await import('../encryption');
    mod.resetEncryptionService();

    const service = mod.getEncryptionService();
    const keyProvider = service.getKeyProvider();

    expect(keyProvider).toBeInstanceOf(mod.EnvironmentKeyProvider);
  });
});

describe('EncryptionService.encryptToString and decryptFromString', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should encrypt to base64 string', async () => {
    const service = new EncryptionService();
    const result = await service.encryptToString('test-data');

    expect(typeof result).toBe('string');
    // Should be valid base64
    expect(() => Buffer.from(result, 'base64')).not.toThrow();
  });

  it('should decrypt from base64 string', async () => {
    const service = new EncryptionService();
    const encrypted = await service.encryptToString('test-data');
    const decrypted = await service.decryptFromString(encrypted);

    expect(decrypted).toBe('test-data');
  });

  it('should throw EncryptionError for invalid format', async () => {
    const service = new EncryptionService();

    await expect(service.decryptFromString('not-valid-base64-json')).rejects.toThrow(
      EncryptionError,
    );
  });

  it('should throw EncryptionError for invalid JSON', async () => {
    const service = new EncryptionService();
    const invalidBase64 = Buffer.from('not json').toString('base64');

    await expect(service.decryptFromString(invalidBase64)).rejects.toThrow(EncryptionError);
  });

  it('should pass options to encrypt', async () => {
    const service = new EncryptionService();
    const encrypted = await service.encryptToString('test-data', { aad: 'context' });
    const decrypted = await service.decryptFromString(encrypted, { aad: 'context' });

    expect(decrypted).toBe('test-data');
  });
});

describe('EncryptionService.hash and verifyHash', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should generate hash with salt', () => {
    const service = new EncryptionService();
    const hash = service.hash('password123');

    expect(hash).toContain(':');
    const [salt, hashValue] = hash.split(':');
    expect(salt.length).toBeGreaterThan(0);
    expect(hashValue.length).toBeGreaterThan(0);
  });

  it('should verify correct password', () => {
    const service = new EncryptionService();
    const hash = service.hash('password123');

    const result = service.verifyHash('password123', hash);

    expect(result).toBe(true);
  });

  it('should reject incorrect password', () => {
    const service = new EncryptionService();
    const hash = service.hash('password123');

    const result = service.verifyHash('wrongpassword', hash);

    expect(result).toBe(false);
  });

  it('should return false for malformed hash', () => {
    const service = new EncryptionService();

    const result = service.verifyHash('password', 'invalid-hash-format');

    expect(result).toBe(false);
  });

  it('should return false for empty hash', () => {
    const service = new EncryptionService();

    const result = service.verifyHash('password', '');

    expect(result).toBe(false);
  });

  it('should generate different hashes for same password (random salt)', () => {
    const service = new EncryptionService();
    const hash1 = service.hash('password123');
    const hash2 = service.hash('password123');

    expect(hash1).not.toBe(hash2);
  });
});

describe('EncryptionService.generateSecureToken', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should generate token with default length', () => {
    const service = new EncryptionService();
    const token = service.generateSecureToken();

    // 32 bytes in base64url is ~43 characters
    expect(token.length).toBeGreaterThan(40);
  });

  it('should generate token with custom length', () => {
    const service = new EncryptionService();
    const token16 = service.generateSecureToken(16);
    const token64 = service.generateSecureToken(64);

    // Different lengths should produce different sized tokens
    expect(token64.length).toBeGreaterThan(token16.length);
  });

  it('should generate unique tokens', () => {
    const service = new EncryptionService();
    const tokens = new Set<string>();

    for (let i = 0; i < 100; i++) {
      tokens.add(service.generateSecureToken());
    }

    expect(tokens.size).toBe(100);
  });
});

describe('EncryptionService.reEncrypt', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should re-encrypt data', async () => {
    const service = new EncryptionService();
    const original = await service.encrypt('sensitive-data');

    const reEncrypted = await service.reEncrypt(original);

    // Should have different IV
    expect(reEncrypted.iv).not.toBe(original.iv);

    // Should decrypt to same value
    const decrypted = await service.decrypt(reEncrypted);
    expect(decrypted).toBe('sensitive-data');
  });

  it('should update encryption timestamp', async () => {
    const service = new EncryptionService();
    const original = await service.encrypt('sensitive-data');

    // Wait a bit to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    const reEncrypted = await service.reEncrypt(original);

    expect(new Date(reEncrypted.encryptedAt).getTime()).toBeGreaterThan(
      new Date(original.encryptedAt).getTime(),
    );
  });
});

describe('EncryptionService.getKeyProvider', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return the key provider', () => {
    const customProvider: KeyProvider = {
      getCurrentKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 'a')),
      getKeyByVersion: vi.fn().mockResolvedValue(Buffer.alloc(32, 'a')),
      getCurrentKeyVersion: vi.fn().mockReturnValue(1),
      getKeyMetadata: vi.fn().mockResolvedValue(null),
    };

    const service = new EncryptionService(customProvider);
    const provider = service.getKeyProvider();

    expect(provider).toBe(customProvider);
  });
});

describe('Error Handling Edge Cases', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should handle encryption errors gracefully', async () => {
    const badProvider: KeyProvider = {
      getCurrentKey: vi.fn().mockRejectedValue(new Error('Key retrieval failed')),
      getKeyByVersion: vi.fn().mockRejectedValue(new Error('Key retrieval failed')),
      getCurrentKeyVersion: vi.fn().mockReturnValue(1),
      getKeyMetadata: vi.fn().mockResolvedValue(null),
    };

    const service = new EncryptionService(badProvider);

    await expect(service.encrypt('test')).rejects.toThrow(EncryptionError);
  });

  it('should handle decryption errors gracefully', async () => {
    const badProvider: KeyProvider = {
      getCurrentKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 'a')),
      getKeyByVersion: vi.fn().mockRejectedValue(new Error('Key retrieval failed')),
      getCurrentKeyVersion: vi.fn().mockReturnValue(1),
      getKeyMetadata: vi.fn().mockResolvedValue(null),
    };

    const service = new EncryptionService(badProvider);
    const encrypted: EncryptedData = {
      iv: Buffer.alloc(16).toString('base64'),
      ciphertext: 'encrypted',
      authTag: Buffer.alloc(16).toString('base64'),
      keyVersion: 1,
      algorithm: 'aes-256-gcm',
      encryptedAt: new Date().toISOString(),
    };

    await expect(service.decrypt(encrypted)).rejects.toThrow(EncryptionError);
  });
});
