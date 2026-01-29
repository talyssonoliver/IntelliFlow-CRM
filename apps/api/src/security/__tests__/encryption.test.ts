/**
 * Encryption Service Tests - IFC-113
 *
 * Tests for AES-256-GCM encryption at rest and transit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EncryptionService,
  EncryptionError,
  EnvironmentKeyProvider,
  VaultKeyProvider,
  type EncryptedData,
  type KeyProvider,
  type KeyMetadata,
} from '../encryption';

// Store original env
const originalEnv = { ...process.env };

describe('Encryption Service - IFC-113', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('EnvironmentKeyProvider', () => {
    it('should get current key version', () => {
      const provider = new EnvironmentKeyProvider();
      expect(provider.getCurrentKeyVersion()).toBe(1);
    });

    it('should derive key from environment variable', async () => {
      const provider = new EnvironmentKeyProvider();
      const key = await provider.getCurrentKey();

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32); // 256 bits
    });

    it('should throw error when master key is missing', async () => {
      delete process.env.ENCRYPTION_MASTER_KEY;

      const provider = new EnvironmentKeyProvider();
      await expect(provider.getCurrentKey()).rejects.toThrow(EncryptionError);
    });

    it('should cache derived keys', async () => {
      const provider = new EnvironmentKeyProvider();

      const key1 = await provider.getKeyByVersion(1);
      const key2 = await provider.getKeyByVersion(1);

      expect(key1).toBe(key2); // Same reference (cached)
    });

    it('should derive different keys for different versions', async () => {
      const provider = new EnvironmentKeyProvider();

      const key1 = await provider.getKeyByVersion(1);
      const key2 = await provider.getKeyByVersion(2);

      expect(key1).not.toEqual(key2);
    });

    it('should return key metadata', async () => {
      const provider = new EnvironmentKeyProvider();
      const metadata = await provider.getKeyMetadata(1);

      expect(metadata).toBeDefined();
      expect(metadata?.version).toBe(1);
      expect(metadata?.algorithm).toBe('aes-256-gcm');
      expect(metadata?.keyId).toContain('env-key-v1');
    });

    it('should use custom environment variable name', async () => {
      process.env.CUSTOM_KEY = 'custom-master-key-32-bytes-long!';

      const provider = new EnvironmentKeyProvider('CUSTOM_KEY');
      const key = await provider.getCurrentKey();

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });
  });

  describe('VaultKeyProvider', () => {
    it('should create with default options', () => {
      const provider = new VaultKeyProvider();
      expect(provider).toBeDefined();
      expect(provider.getCurrentKeyVersion()).toBe(1);
    });

    it('should create with custom options', () => {
      const provider = new VaultKeyProvider({
        address: 'http://custom-vault:8200',
        token: 'custom-token',
        keyName: 'custom-key',
      });

      expect(provider).toBeDefined();
    });

    it('should get current key version', () => {
      const provider = new VaultKeyProvider();
      expect(provider.getCurrentKeyVersion()).toBe(1);
    });

    it('should generate DEK for key version', async () => {
      const provider = new VaultKeyProvider();
      const key = await provider.getKeyByVersion(1);

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should cache generated DEKs', async () => {
      const provider = new VaultKeyProvider();

      const key1 = await provider.getKeyByVersion(1);
      const key2 = await provider.getKeyByVersion(1);

      expect(key1).toBe(key2); // Same reference (cached)
    });
  });

  describe('EncryptionError', () => {
    it('should create with code and message', () => {
      const error = new EncryptionError('TEST_CODE', 'Test message');

      expect(error.code).toBe('TEST_CODE');
      expect(error.message).toBe('Test message');
      expect(error.name).toBe('EncryptionError');
    });

    it('should create with cause', () => {
      const cause = new Error('Original error');
      const error = new EncryptionError('TEST_CODE', 'Test message', cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('EncryptionService', () => {
    it('should encrypt plaintext', async () => {
      const service = new EncryptionService();
      const plaintext = 'Hello, World!';

      const encrypted = await service.encrypt(plaintext);

      expect(encrypted.iv).toBeDefined();
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
      expect(encrypted.keyVersion).toBe(1);
      expect(encrypted.algorithm).toBe('aes-256-gcm');
      expect(encrypted.encryptedAt).toBeDefined();
    });

    it('should decrypt ciphertext', async () => {
      const service = new EncryptionService();
      const plaintext = 'Hello, World!';

      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string encryption', async () => {
      const service = new EncryptionService();
      const plaintext = '';

      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe('');
    });

    it('should handle unicode characters', async () => {
      const service = new EncryptionService();
      const plaintext = '你好世界! Привет мир! 🎉';

      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long text', async () => {
      const service = new EncryptionService();
      const plaintext = 'a'.repeat(10000);

      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (IV randomness)', async () => {
      const service = new EncryptionService();
      const plaintext = 'Hello, World!';

      const encrypted1 = await service.encrypt(plaintext);
      const encrypted2 = await service.encrypt(plaintext);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it('should encrypt with AAD (Additional Authenticated Data)', async () => {
      const service = new EncryptionService();
      const plaintext = 'Sensitive data';
      const aad = 'context-id-123';

      const encrypted = await service.encrypt(plaintext, { aad });
      const decrypted = await service.decrypt(encrypted, { aad });

      expect(decrypted).toBe(plaintext);
    });

    it('should fail decryption with wrong AAD', async () => {
      const service = new EncryptionService();
      const plaintext = 'Sensitive data';

      const encrypted = await service.encrypt(plaintext, { aad: 'correct-aad' });

      await expect(
        service.decrypt(encrypted, { aad: 'wrong-aad' })
      ).rejects.toThrow(EncryptionError);
    });

    it('should fail decryption with tampered ciphertext', async () => {
      const service = new EncryptionService();
      const plaintext = 'Hello, World!';

      const encrypted = await service.encrypt(plaintext);

      // Tamper with ciphertext
      const tamperedCiphertext = Buffer.from(encrypted.ciphertext, 'base64');
      tamperedCiphertext[0] ^= 0xff;
      encrypted.ciphertext = tamperedCiphertext.toString('base64');

      await expect(service.decrypt(encrypted)).rejects.toThrow(EncryptionError);
    });

    it('should fail decryption with tampered auth tag', async () => {
      const service = new EncryptionService();
      const plaintext = 'Hello, World!';

      const encrypted = await service.encrypt(plaintext);

      // Tamper with auth tag
      const tamperedAuthTag = Buffer.from(encrypted.authTag, 'base64');
      tamperedAuthTag[0] ^= 0xff;
      encrypted.authTag = tamperedAuthTag.toString('base64');

      await expect(service.decrypt(encrypted)).rejects.toThrow(EncryptionError);
    });

    it('should use custom key provider', async () => {
      const mockKeyProvider: KeyProvider = {
        getCurrentKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 'a')),
        getKeyByVersion: vi.fn().mockResolvedValue(Buffer.alloc(32, 'a')),
        getCurrentKeyVersion: vi.fn().mockReturnValue(5),
        getKeyMetadata: vi.fn().mockResolvedValue({ version: 5, createdAt: new Date(), algorithm: 'aes-256-gcm', keyId: 'custom-key' }),
      };

      const service = new EncryptionService(mockKeyProvider);
      const encrypted = await service.encrypt('test');

      expect(encrypted.keyVersion).toBe(5);
      expect(mockKeyProvider.getCurrentKey).toHaveBeenCalled();
    });
  });

  describe('EncryptedData Structure', () => {
    it('should have valid base64 encoded IV', async () => {
      const service = new EncryptionService();
      const encrypted = await service.encrypt('test');

      const iv = Buffer.from(encrypted.iv, 'base64');
      expect(iv.length).toBe(16); // 128 bits
    });

    it('should have valid base64 encoded auth tag', async () => {
      const service = new EncryptionService();
      const encrypted = await service.encrypt('test');

      const authTag = Buffer.from(encrypted.authTag, 'base64');
      expect(authTag.length).toBe(16); // 128 bits
    });

    it('should have valid ISO timestamp', async () => {
      const service = new EncryptionService();
      const encrypted = await service.encrypt('test');

      const timestamp = new Date(encrypted.encryptedAt);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });
});

describe('Key Derivation', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should produce deterministic keys from same master key', async () => {
    const provider1 = new EnvironmentKeyProvider();
    const provider2 = new EnvironmentKeyProvider();

    const key1 = await provider1.getKeyByVersion(1);
    const key2 = await provider2.getKeyByVersion(1);

    expect(key1.equals(key2)).toBe(true);
  });

  it('should produce different keys for different master keys', async () => {
    process.env.ENCRYPTION_MASTER_KEY = 'master-key-1-32-bytes-long-!!!!';
    const provider1 = new EnvironmentKeyProvider();
    const key1 = await provider1.getKeyByVersion(1);

    process.env.ENCRYPTION_MASTER_KEY = 'master-key-2-32-bytes-long-!!!!';
    const provider2 = new EnvironmentKeyProvider();
    const key2 = await provider2.getKeyByVersion(1);

    expect(key1.equals(key2)).toBe(false);
  });
});

describe('getEncryptionService singleton', () => {
  let getEncryptionService: () => EncryptionService;

  beforeEach(async () => {
    vi.resetModules();
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
    const mod = await import('../encryption');
    getEncryptionService = mod.getEncryptionService;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('should return singleton instance', () => {
    const service1 = getEncryptionService();
    const service2 = getEncryptionService();

    expect(service1).toBe(service2);
  });

  it('should encrypt and decrypt through singleton', async () => {
    const service = getEncryptionService();
    const plaintext = 'Hello from singleton!';

    const encrypted = await service.encrypt(plaintext);
    const decrypted = await service.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });
});

describe('Cross-version decryption', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should decrypt data encrypted with specific key version', async () => {
    const service = new EncryptionService();
    const plaintext = 'Version-specific data';

    // Encrypt with explicit version
    const encrypted = await service.encrypt(plaintext, { keyVersion: 1 });
    expect(encrypted.keyVersion).toBe(1);

    // Should decrypt using the correct version key
    const decrypted = await service.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });
});
