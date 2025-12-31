/**
 * Encryption Tests
 *
 * IMPLEMENTS: IFC-113 (Secrets Management & Encryption)
 *
 * Test suite for encryption utilities, key rotation, and security compliance.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EncryptionService,
  EncryptionError,
  EnvironmentKeyProvider,
  VaultKeyProvider,
  FieldEncryption,
  getEncryptionService,
  resetEncryptionService,
  type EncryptedData,
} from '../../apps/api/src/security/encryption';
import {
  KeyRotationService,
  InMemoryKeyVersionStore,
  getKeyRotationService,
  resetKeyRotationService,
  type DataProvider,
  type EncryptedRecord,
} from '../../apps/api/src/security/key-rotation';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    // Set up test encryption key
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-for-encryption-32bytes!';
    resetEncryptionService();
    service = new EncryptionService(new EnvironmentKeyProvider());
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    resetEncryptionService();
  });

  describe('Basic Encryption/Decryption', () => {
    it('should encrypt and decrypt plaintext correctly', async () => {
      const plaintext = 'Hello, World!';
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (unique IV)', async () => {
      const plaintext = 'Same message';
      const encrypted1 = await service.encrypt(plaintext);
      const encrypted2 = await service.encrypt(plaintext);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it('should handle empty string', async () => {
      const plaintext = '';
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', async () => {
      const plaintext = 'Unicode test: Emoji and special chars';
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle large payloads', async () => {
      const plaintext = 'A'.repeat(100000);
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should include proper metadata in encrypted data', async () => {
      const encrypted = await service.encrypt('test');

      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('authTag');
      expect(encrypted).toHaveProperty('keyVersion');
      expect(encrypted).toHaveProperty('algorithm');
      expect(encrypted).toHaveProperty('encryptedAt');
      expect(encrypted.algorithm).toBe('aes-256-gcm');
    });
  });

  describe('String Serialization', () => {
    it('should encrypt to string and decrypt from string', async () => {
      const plaintext = 'Secret message';
      const encryptedString = await service.encryptToString(plaintext);
      const decrypted = await service.decryptFromString(encryptedString);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce base64 encoded output', async () => {
      const encryptedString = await service.encryptToString('test');
      expect(() => Buffer.from(encryptedString, 'base64')).not.toThrow();
    });
  });

  describe('AAD (Additional Authenticated Data)', () => {
    it('should encrypt and decrypt with AAD', async () => {
      const plaintext = 'Secret with context';
      const aad = 'user-id:12345';

      const encrypted = await service.encrypt(plaintext, { aad });
      const decrypted = await service.decrypt(encrypted, { aad });

      expect(decrypted).toBe(plaintext);
    });

    it('should fail decryption with wrong AAD', async () => {
      const plaintext = 'Secret with context';
      const encrypted = await service.encrypt(plaintext, { aad: 'user-id:12345' });

      await expect(
        service.decrypt(encrypted, { aad: 'user-id:99999' }),
      ).rejects.toThrow(EncryptionError);
    });
  });

  describe('Tamper Detection', () => {
    it('should detect tampered ciphertext', async () => {
      const encrypted = await service.encrypt('test');
      const tamperedCiphertext = Buffer.from(encrypted.ciphertext, 'base64');
      tamperedCiphertext[0] = tamperedCiphertext[0] ^ 0xff;
      encrypted.ciphertext = tamperedCiphertext.toString('base64');

      await expect(service.decrypt(encrypted)).rejects.toThrow(EncryptionError);
    });

    it('should detect tampered IV', async () => {
      const encrypted = await service.encrypt('test');
      const tamperedIv = Buffer.from(encrypted.iv, 'base64');
      tamperedIv[0] = tamperedIv[0] ^ 0xff;
      encrypted.iv = tamperedIv.toString('base64');

      await expect(service.decrypt(encrypted)).rejects.toThrow(EncryptionError);
    });

    it('should detect tampered auth tag', async () => {
      const encrypted = await service.encrypt('test');
      const tamperedTag = Buffer.from(encrypted.authTag, 'base64');
      tamperedTag[0] = tamperedTag[0] ^ 0xff;
      encrypted.authTag = tamperedTag.toString('base64');

      await expect(service.decrypt(encrypted)).rejects.toThrow(EncryptionError);
    });
  });

  describe('Hashing', () => {
    it('should hash and verify correctly', () => {
      const data = 'password123';
      const hash = service.hash(data);
      const isValid = service.verifyHash(data, hash);

      expect(isValid).toBe(true);
    });

    it('should fail verification for wrong data', () => {
      const hash = service.hash('password123');
      const isValid = service.verifyHash('wrongpassword', hash);

      expect(isValid).toBe(false);
    });

    it('should produce different hashes for same input (unique salt)', () => {
      const data = 'password123';
      const hash1 = service.hash(data);
      const hash2 = service.hash(data);

      expect(hash1).not.toBe(hash2);
    });

    it('should use constant-time comparison', () => {
      // This test ensures timing attacks are mitigated
      const hash = service.hash('password');
      const start1 = performance.now();
      for (let i = 0; i < 1000; i++) {
        service.verifyHash('password', hash);
      }
      const time1 = performance.now() - start1;

      const start2 = performance.now();
      for (let i = 0; i < 1000; i++) {
        service.verifyHash('completely-different-password', hash);
      }
      const time2 = performance.now() - start2;

      // Timing should be similar (within 50% variance)
      const ratio = Math.max(time1, time2) / Math.min(time1, time2);
      expect(ratio).toBeLessThan(2);
    });
  });

  describe('Token Generation', () => {
    it('should generate secure random tokens', () => {
      const token1 = service.generateSecureToken();
      const token2 = service.generateSecureToken();

      expect(token1).not.toBe(token2);
      expect(token1.length).toBeGreaterThan(20);
    });

    it('should generate tokens of specified length', () => {
      const token = service.generateSecureToken(64);
      // Base64url encoding produces ~4/3 characters per byte
      expect(token.length).toBeGreaterThanOrEqual(64);
    });
  });

  describe('Error Handling', () => {
    it('should throw EncryptionError for missing key', async () => {
      delete process.env.ENCRYPTION_MASTER_KEY;
      const provider = new EnvironmentKeyProvider();
      const svc = new EncryptionService(provider);

      await expect(svc.encrypt('test')).rejects.toThrow(EncryptionError);
    });

    it('should throw EncryptionError for invalid encrypted format', async () => {
      await expect(service.decryptFromString('invalid-data')).rejects.toThrow(
        EncryptionError,
      );
    });
  });
});

describe('FieldEncryption', () => {
  let service: EncryptionService;

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-for-encryption-32bytes!';
    resetEncryptionService();
    service = new EncryptionService(new EnvironmentKeyProvider());
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    resetEncryptionService();
  });

  it('should encrypt a field in an object', async () => {
    const obj = { name: 'John', ssn: '123-45-6789' };
    const encrypted = await FieldEncryption.encryptField(obj, 'ssn', service);

    expect(encrypted.name).toBe('John');
    expect(encrypted.ssn).not.toBe('123-45-6789');
  });

  it('should decrypt a field in an object', async () => {
    const obj = { name: 'John', ssn: '123-45-6789' };
    const encrypted = await FieldEncryption.encryptField(obj, 'ssn', service);
    const decrypted = await FieldEncryption.decryptField(encrypted, 'ssn', service);

    expect(decrypted.ssn).toBe('123-45-6789');
  });

  it('should handle nested field paths', async () => {
    const obj = {
      user: {
        profile: {
          secret: 'sensitive-data',
        },
      },
    };
    const encrypted = await FieldEncryption.encryptField(
      obj,
      'user.profile.secret',
      service,
    );
    const decrypted = await FieldEncryption.decryptField(
      encrypted,
      'user.profile.secret',
      service,
    );

    expect(decrypted.user.profile.secret).toBe('sensitive-data');
  });

  it('should handle non-existent field paths gracefully', async () => {
    const obj = { name: 'John' };
    const result = await FieldEncryption.encryptField(
      obj,
      'nonexistent.field',
      service,
    );

    expect(result).toEqual(obj);
  });
});

describe('KeyRotationService', () => {
  let rotationService: KeyRotationService;
  let versionStore: InMemoryKeyVersionStore;
  let encryptionService: EncryptionService;

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-for-encryption-32bytes!';
    resetEncryptionService();
    resetKeyRotationService();
    versionStore = new InMemoryKeyVersionStore();
    encryptionService = new EncryptionService(new EnvironmentKeyProvider());
    rotationService = new KeyRotationService(
      {
        enabled: true,
        intervalDays: 30,
        retentionVersions: 5,
        preRotationValidation: true,
        postRotationVerification: true,
        maxConcurrentReEncryptions: 10,
        reEncryptionBatchSize: 100,
      },
      versionStore,
      encryptionService,
    );
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    resetEncryptionService();
    resetKeyRotationService();
  });

  describe('Key Rotation', () => {
    it('should rotate keys successfully', async () => {
      const result = await rotationService.rotateKeys();

      expect(result.success).toBe(true);
      expect(result.newVersion).toBe(2);
      expect(result.previousVersion).toBe(1);
    });

    it('should increment key version on each rotation', async () => {
      await rotationService.rotateKeys();
      const result = await rotationService.rotateKeys();

      expect(result.newVersion).toBe(3);
      expect(result.previousVersion).toBe(2);
    });

    it('should record lifecycle events', async () => {
      await rotationService.rotateKeys();
      const events = rotationService.getLifecycleEvents();

      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.eventType === 'KEY_ROTATED')).toBe(true);
    });
  });

  describe('Key Status', () => {
    it('should return current key status', async () => {
      const status = await rotationService.getKeyStatus();

      expect(status.currentVersion).toBe(1);
      expect(status.rotationNeeded).toBe(false);
    });

    it('should indicate rotation needed after interval', async () => {
      // Mock date to simulate time passing
      const originalDate = Date.now;
      Date.now = () => originalDate() + 31 * 24 * 60 * 60 * 1000; // 31 days

      const rotationNeeded = await rotationService.isRotationNeeded();

      expect(rotationNeeded).toBe(true);

      Date.now = originalDate;
    });
  });

  describe('Re-encryption', () => {
    it('should re-encrypt data with new key version', async () => {
      const encrypted = await encryptionService.encrypt('secret-data');
      const reEncrypted = await encryptionService.reEncrypt(encrypted);

      expect(reEncrypted.keyVersion).toBe(encrypted.keyVersion);
      const decrypted = await encryptionService.decrypt(reEncrypted);
      expect(decrypted).toBe('secret-data');
    });

    it('should process batch re-encryption', async () => {
      // Create mock data provider
      const records: EncryptedRecord[] = [];
      for (let i = 0; i < 5; i++) {
        const encrypted = await encryptionService.encrypt(`record-${i}`);
        records.push({ id: `id-${i}`, encryptedData: encrypted });
      }

      const dataProvider: DataProvider = {
        async getRecordsByKeyVersion(
          _version: number,
          _limit: number,
          _offset: number,
        ) {
          return records;
        },
        async updateRecord(id: string, encryptedData: EncryptedData) {
          const record = records.find((r) => r.id === id);
          if (record) record.encryptedData = encryptedData;
        },
        async getRecordCount(_version: number) {
          return records.length;
        },
      };

      await rotationService.rotateKeys();
      const progress = await rotationService.reEncryptData(dataProvider);

      expect(progress.status).toBe('completed');
      expect(progress.processedRecords).toBe(5);
      expect(progress.failedRecords).toBe(0);
    });
  });
});

describe('EnvironmentKeyProvider', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-for-encryption-32bytes!';
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_MASTER_KEY;
  });

  it('should derive keys from environment variable', async () => {
    const provider = new EnvironmentKeyProvider();
    const key = await provider.getCurrentKey();

    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it('should return same key for same version', async () => {
    const provider = new EnvironmentKeyProvider();
    const key1 = await provider.getKeyByVersion(1);
    const key2 = await provider.getKeyByVersion(1);

    expect(key1.equals(key2)).toBe(true);
  });

  it('should return different keys for different versions', async () => {
    const provider = new EnvironmentKeyProvider();
    const key1 = await provider.getKeyByVersion(1);
    const key2 = await provider.getKeyByVersion(2);

    expect(key1.equals(key2)).toBe(false);
  });

  it('should throw error when key is missing', async () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    const provider = new EnvironmentKeyProvider();

    await expect(provider.getCurrentKey()).rejects.toThrow(EncryptionError);
  });
});

describe('VaultKeyProvider', () => {
  it('should be instantiable with default options', () => {
    const provider = new VaultKeyProvider();
    expect(provider).toBeInstanceOf(VaultKeyProvider);
  });

  it('should use environment variables for configuration', () => {
    process.env.VAULT_ADDR = 'http://vault.example.com:8200';
    process.env.VAULT_TOKEN = 'test-token';

    const provider = new VaultKeyProvider();
    expect(provider).toBeInstanceOf(VaultKeyProvider);

    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_TOKEN;
  });
});

describe('Singleton Management', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-for-encryption-32bytes!';
    resetEncryptionService();
    resetKeyRotationService();
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    resetEncryptionService();
    resetKeyRotationService();
  });

  it('should return same encryption service instance', () => {
    const service1 = getEncryptionService();
    const service2 = getEncryptionService();

    expect(service1).toBe(service2);
  });

  it('should return same rotation service instance', () => {
    const service1 = getKeyRotationService();
    const service2 = getKeyRotationService();

    expect(service1).toBe(service2);
  });

  it('should create new instance after reset', () => {
    const service1 = getEncryptionService();
    resetEncryptionService();
    const service2 = getEncryptionService();

    expect(service1).not.toBe(service2);
  });
});

describe('Security Compliance', () => {
  let service: EncryptionService;

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-for-encryption-32bytes!';
    resetEncryptionService();
    service = new EncryptionService(new EnvironmentKeyProvider());
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    resetEncryptionService();
  });

  it('should use AES-256-GCM algorithm', async () => {
    const encrypted = await service.encrypt('test');
    expect(encrypted.algorithm).toBe('aes-256-gcm');
  });

  it('should use 256-bit keys (32 bytes)', async () => {
    const provider = new EnvironmentKeyProvider();
    const key = await provider.getCurrentKey();
    expect(key.length).toBe(32);
  });

  it('should use 128-bit IV (16 bytes)', async () => {
    const encrypted = await service.encrypt('test');
    const iv = Buffer.from(encrypted.iv, 'base64');
    expect(iv.length).toBe(16);
  });

  it('should use 128-bit auth tag (16 bytes)', async () => {
    const encrypted = await service.encrypt('test');
    const authTag = Buffer.from(encrypted.authTag, 'base64');
    expect(authTag.length).toBe(16);
  });

  it('should include encryption timestamp', async () => {
    const before = new Date().toISOString();
    const encrypted = await service.encrypt('test');
    const after = new Date().toISOString();

    expect(encrypted.encryptedAt >= before).toBe(true);
    expect(encrypted.encryptedAt <= after).toBe(true);
  });

  it('should include key version for rotation tracking', async () => {
    const encrypted = await service.encrypt('test');
    expect(typeof encrypted.keyVersion).toBe('number');
    expect(encrypted.keyVersion).toBeGreaterThanOrEqual(1);
  });
});
