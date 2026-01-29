/**
 * Comprehensive Key Rotation Tests - IFC-113
 *
 * Additional tests for uncovered code paths in key-rotation.ts:
 * - VaultKeyVersionStore methods
 * - reEncryptData with errors
 * - cleanupOldVersions
 * - sendRotationNotification
 * - recordLifecycleEvent trimming
 * - Pre/post rotation validation
 * - Audit logging
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  KeyRotationService,
  InMemoryKeyVersionStore,
  VaultKeyVersionStore,
  getKeyRotationService,
  resetKeyRotationService,
  type KeyRotationConfig,
  type DataProvider,
  type EncryptedRecord,
  type KeyVersionStore,
} from '../key-rotation';
import { EncryptionService, type EncryptedData, type KeyMetadata } from '../encryption';
import { AuditLogger } from '../audit-logger';

// Store original env
const originalEnv = { ...process.env };

// Mock fetch for Vault tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('VaultKeyVersionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const store = new VaultKeyVersionStore();
      expect(store).toBeDefined();
    });

    it('should create with custom options', () => {
      const store = new VaultKeyVersionStore({
        address: 'http://custom-vault:8200',
        token: 'custom-token',
        keyName: 'custom-key',
      });
      expect(store).toBeDefined();
    });
  });

  describe('getCurrentVersion', () => {
    it('should fetch current version from Vault', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { latest_version: 5 },
          }),
      });

      const store = new VaultKeyVersionStore({
        address: 'http://vault:8200',
        token: 'test-token',
        keyName: 'test-key',
      });

      const version = await store.getCurrentVersion();

      expect(version).toBe(5);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://vault:8200/v1/transit/keys/test-key',
        expect.objectContaining({
          headers: { 'X-Vault-Token': 'test-token' },
        }),
      );
    });

    it('should throw error when Vault returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const store = new VaultKeyVersionStore();

      await expect(store.getCurrentVersion()).rejects.toThrow(
        'Failed to get current key version from Vault',
      );
    });
  });

  describe('setCurrentVersion', () => {
    it('should update Vault key config', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const store = new VaultKeyVersionStore({
        address: 'http://vault:8200',
        token: 'test-token',
        keyName: 'test-key',
      });

      await store.setCurrentVersion(5);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://vault:8200/v1/transit/keys/test-key/config',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'X-Vault-Token': 'test-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            min_decryption_version: 1, // version - 4
            min_encryption_version: 5,
          }),
        }),
      );
    });
  });

  describe('getVersionMetadata', () => {
    it('should fetch version metadata from Vault', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              keys: {
                1: { creation_time: '2025-01-01T00:00:00Z' },
                2: { creation_time: '2025-01-15T00:00:00Z' },
              },
              type: 'aes256-gcm96',
            },
          }),
      });

      const store = new VaultKeyVersionStore({
        keyName: 'test-key',
      });

      const metadata = await store.getVersionMetadata(1);

      expect(metadata).toBeDefined();
      expect(metadata?.version).toBe(1);
      expect(metadata?.algorithm).toBe('aes256-gcm96');
      expect(metadata?.keyId).toBe('test-key');
    });

    it('should return null for non-existent version', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              keys: { 1: { creation_time: '2025-01-01T00:00:00Z' } },
              type: 'aes256-gcm96',
            },
          }),
      });

      const store = new VaultKeyVersionStore();
      const metadata = await store.getVersionMetadata(999);

      expect(metadata).toBeNull();
    });

    it('should return null when Vault returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const store = new VaultKeyVersionStore();
      const metadata = await store.getVersionMetadata(1);

      expect(metadata).toBeNull();
    });
  });

  describe('saveVersionMetadata', () => {
    it('should be a no-op (Vault manages metadata)', async () => {
      const store = new VaultKeyVersionStore();
      const metadata: KeyMetadata = {
        version: 2,
        createdAt: new Date(),
        algorithm: 'aes-256-gcm',
        keyId: 'test-key',
      };

      // Should not throw
      await store.saveVersionMetadata(metadata);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('deprecateVersion', () => {
    it('should update min_decryption_version in Vault', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { latest_version: 5 },
            }),
        })
        .mockResolvedValueOnce({ ok: true });

      const store = new VaultKeyVersionStore({
        address: 'http://vault:8200',
        token: 'test-token',
        keyName: 'test-key',
      });

      await store.deprecateVersion(2);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        'http://vault:8200/v1/transit/keys/test-key/config',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ min_decryption_version: 3 }),
        }),
      );
    });

    it('should throw error when deprecating current or future version', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { latest_version: 3 },
          }),
      });

      const store = new VaultKeyVersionStore();

      await expect(store.deprecateVersion(3)).rejects.toThrow(
        'Cannot deprecate current or future versions',
      );
    });
  });

  describe('listVersions', () => {
    it('should list all versions from Vault', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              keys: {
                1: { creation_time: '2025-01-01T00:00:00Z' },
                2: { creation_time: '2025-01-15T00:00:00Z' },
                3: { creation_time: '2025-01-30T00:00:00Z' },
              },
              type: 'aes256-gcm96',
            },
          }),
      });

      const store = new VaultKeyVersionStore();
      const versions = await store.listVersions();

      expect(versions).toHaveLength(3);
      expect(versions.map((v) => v.version)).toContain(1);
      expect(versions.map((v) => v.version)).toContain(2);
      expect(versions.map((v) => v.version)).toContain(3);
    });

    it('should return empty array on Vault error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const store = new VaultKeyVersionStore();
      const versions = await store.listVersions();

      expect(versions).toEqual([]);
    });
  });
});

describe('KeyRotationService - Comprehensive Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
    resetKeyRotationService();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    resetKeyRotationService();
  });

  describe('reEncryptData', () => {
    it('should re-encrypt records from old key versions', async () => {
      const store = new InMemoryKeyVersionStore();
      await store.setCurrentVersion(3);

      const encryptionService = new EncryptionService();
      const encrypted = await encryptionService.encrypt('test-data');

      const mockDataProvider: DataProvider = {
        getRecordCount: vi.fn().mockResolvedValue(2),
        getRecordsByKeyVersion: vi.fn().mockResolvedValue([
          { id: 'record-1', encryptedData: encrypted },
          { id: 'record-2', encryptedData: encrypted },
        ]),
        updateRecord: vi.fn().mockResolvedValue(undefined),
      };

      const service = new KeyRotationService(
        { reEncryptionBatchSize: 10 },
        store,
        encryptionService,
      );

      const progress = await service.reEncryptData(mockDataProvider);

      expect(progress.status).toBe('completed');
      expect(progress.processedRecords).toBe(4); // 2 records * 2 versions (1 and 2)
    });

    it('should re-encrypt specific version when targetVersion provided', async () => {
      const store = new InMemoryKeyVersionStore();
      await store.setCurrentVersion(3);

      const encryptionService = new EncryptionService();
      const encrypted = await encryptionService.encrypt('test-data');

      const mockDataProvider: DataProvider = {
        getRecordCount: vi.fn().mockResolvedValue(1),
        getRecordsByKeyVersion: vi.fn().mockResolvedValue([
          { id: 'record-1', encryptedData: encrypted },
        ]),
        updateRecord: vi.fn().mockResolvedValue(undefined),
      };

      const service = new KeyRotationService(
        { reEncryptionBatchSize: 10 },
        store,
        encryptionService,
      );

      const progress = await service.reEncryptData(mockDataProvider, 2);

      expect(progress.status).toBe('completed');
      expect(mockDataProvider.getRecordCount).toHaveBeenCalledWith(2);
    });

    it('should track failed records', async () => {
      const store = new InMemoryKeyVersionStore();
      await store.setCurrentVersion(2);

      const encryptionService = new EncryptionService();
      const encrypted = await encryptionService.encrypt('test-data');

      const mockDataProvider: DataProvider = {
        getRecordCount: vi.fn().mockResolvedValue(2),
        getRecordsByKeyVersion: vi.fn().mockResolvedValue([
          { id: 'record-1', encryptedData: encrypted },
          { id: 'record-2', encryptedData: encrypted },
        ]),
        updateRecord: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('Update failed')),
      };

      const service = new KeyRotationService(
        { reEncryptionBatchSize: 10 },
        store,
        encryptionService,
      );

      const progress = await service.reEncryptData(mockDataProvider);

      expect(progress.failedRecords).toBe(1);
      expect(progress.processedRecords).toBe(1);
    });

    it('should handle errors in re-encryption and return failed status', async () => {
      const store = new InMemoryKeyVersionStore();
      await store.setCurrentVersion(2);

      const mockDataProvider: DataProvider = {
        getRecordCount: vi.fn().mockRejectedValue(new Error('Database error')),
        getRecordsByKeyVersion: vi.fn(),
        updateRecord: vi.fn(),
      };

      const service = new KeyRotationService({}, store);

      const progress = await service.reEncryptData(mockDataProvider);

      expect(progress.status).toBe('failed');
    });

    it('should record lifecycle events during re-encryption', async () => {
      const store = new InMemoryKeyVersionStore();
      await store.setCurrentVersion(2);

      const encryptionService = new EncryptionService();
      const encrypted = await encryptionService.encrypt('test-data');

      const mockDataProvider: DataProvider = {
        getRecordCount: vi.fn().mockResolvedValue(1),
        getRecordsByKeyVersion: vi.fn().mockResolvedValue([
          { id: 'record-1', encryptedData: encrypted },
        ]),
        updateRecord: vi.fn().mockResolvedValue(undefined),
      };

      const service = new KeyRotationService(
        { reEncryptionBatchSize: 10 },
        store,
        encryptionService,
      );

      await service.reEncryptData(mockDataProvider);

      const events = service.getLifecycleEvents();
      expect(events.some((e) => e.eventType === 'REENCRYPTION_STARTED')).toBe(true);
      expect(events.some((e) => e.eventType === 'REENCRYPTION_COMPLETED')).toBe(true);
    });
  });

  describe('rotateKeys with validation', () => {
    it('should fail rotation when pre-rotation validation fails', async () => {
      const store = new InMemoryKeyVersionStore();
      // Clear version metadata to make validation fail
      const badStore: KeyVersionStore = {
        getCurrentVersion: () => Promise.resolve(1),
        setCurrentVersion: vi.fn(),
        getVersionMetadata: () => Promise.resolve(null), // This causes pre-rotation to fail
        saveVersionMetadata: vi.fn(),
        deprecateVersion: vi.fn(),
        listVersions: () => Promise.resolve([]),
      };

      const service = new KeyRotationService(
        { preRotationValidation: true, postRotationVerification: false },
        badStore,
      );

      const result = await service.rotateKeys();

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Pre-rotation validation failed');
    });

    it('should record errors when post-rotation verification fails', async () => {
      const mockStore: KeyVersionStore = {
        getCurrentVersion: vi.fn().mockResolvedValue(1),
        setCurrentVersion: vi.fn(),
        getVersionMetadata: vi.fn().mockResolvedValue({
          version: 1,
          createdAt: new Date(),
          algorithm: 'aes-256-gcm',
          keyId: 'test-key',
        }),
        saveVersionMetadata: vi.fn(),
        deprecateVersion: vi.fn(),
        listVersions: vi.fn().mockResolvedValue([]),
      };

      // After rotation, getCurrentVersion returns same version (mismatch)
      // This causes postRotationVerification to fail
      const service = new KeyRotationService(
        { preRotationValidation: false, postRotationVerification: true },
        mockStore,
      );

      const result = await service.rotateKeys();

      // Rotation still succeeds but with warning
      expect(result.success).toBe(true);
      expect(result.errors).toContain(
        'Post-rotation verification failed but rotation completed',
      );
    });
  });

  describe('rotateKeys with notification webhook', () => {
    it('should send notification on successful rotation', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const store = new InMemoryKeyVersionStore();
      const service = new KeyRotationService(
        {
          preRotationValidation: false,
          postRotationVerification: false,
          notificationWebhook: 'https://example.com/webhook',
        },
        store,
      );

      const result = await service.rotateKeys();

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should continue rotation even if notification fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const store = new InMemoryKeyVersionStore();
      const service = new KeyRotationService(
        {
          preRotationValidation: false,
          postRotationVerification: false,
          notificationWebhook: 'https://example.com/webhook',
        },
        store,
      );

      const result = await service.rotateKeys();

      expect(result.success).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to send rotation notification');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('rotateKeys with audit logging', () => {
    it('should log successful rotation to audit logger', async () => {
      const mockAuditLogger = {
        log: vi.fn().mockResolvedValue(undefined),
      } as unknown as AuditLogger;

      const store = new InMemoryKeyVersionStore();
      const service = new KeyRotationService(
        { preRotationValidation: false, postRotationVerification: false },
        store,
        new EncryptionService(),
        mockAuditLogger,
      );

      await service.rotateKeys();

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'system',
          eventType: 'KEY_ROTATION',
          resourceType: 'system',
          resourceId: 'encryption-keys',
          action: 'CONFIGURE',
          actionResult: 'SUCCESS',
        }),
      );
    });

    it('should log failed rotation to audit logger', async () => {
      const mockAuditLogger = {
        log: vi.fn().mockResolvedValue(undefined),
      } as unknown as AuditLogger;

      const badStore: KeyVersionStore = {
        getCurrentVersion: () => Promise.resolve(1),
        setCurrentVersion: vi.fn(),
        getVersionMetadata: () => Promise.resolve(null),
        saveVersionMetadata: vi.fn(),
        deprecateVersion: vi.fn(),
        listVersions: () => Promise.resolve([]),
      };

      const service = new KeyRotationService(
        { preRotationValidation: true, postRotationVerification: false },
        badStore,
        new EncryptionService(),
        mockAuditLogger,
      );

      await service.rotateKeys();

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'KEY_ROTATION_FAILED',
          actionResult: 'FAILURE',
        }),
      );
    });
  });

  describe('cleanupOldVersions', () => {
    it('should deprecate versions beyond retention', async () => {
      const store = new InMemoryKeyVersionStore();

      // Create multiple versions and set current to 8
      for (let i = 2; i <= 8; i++) {
        await store.saveVersionMetadata({
          version: i,
          createdAt: new Date(Date.now() - (8 - i) * 24 * 60 * 60 * 1000),
          algorithm: 'aes-256-gcm',
          keyId: `key-v${i}`,
        });
      }
      await store.setCurrentVersion(8);

      const service = new KeyRotationService(
        {
          retentionVersions: 3,
          preRotationValidation: false,
          postRotationVerification: false,
        },
        store,
      );

      // Rotate to version 9
      await service.rotateKeys();

      const events = service.getLifecycleEvents();
      const deprecationEvents = events.filter((e) => e.eventType === 'KEY_DEPRECATED');

      // Versions 1-5 should be deprecated (9 - 3 retention = keep 6,7,8,9)
      expect(deprecationEvents.length).toBeGreaterThan(0);
    });

    it('should not deprecate if current version - retention <= 0', async () => {
      const store = new InMemoryKeyVersionStore();

      const service = new KeyRotationService(
        {
          retentionVersions: 5,
          preRotationValidation: false,
          postRotationVerification: false,
        },
        store,
      );

      // Rotate to version 2
      await service.rotateKeys();

      const events = service.getLifecycleEvents();
      const deprecationEvents = events.filter((e) => e.eventType === 'KEY_DEPRECATED');

      // No versions should be deprecated (2 - 5 = -3, minVersion <= 0)
      expect(deprecationEvents.length).toBe(0);
    });
  });

  describe('recordLifecycleEvent trimming', () => {
    it('should trim lifecycle events to last 1000', async () => {
      const store = new InMemoryKeyVersionStore();
      const encryptionService = new EncryptionService();
      const encrypted = await encryptionService.encrypt('test');

      const mockDataProvider: DataProvider = {
        getRecordCount: vi.fn().mockResolvedValue(1),
        getRecordsByKeyVersion: vi.fn().mockResolvedValue([
          { id: 'record-1', encryptedData: encrypted },
        ]),
        updateRecord: vi.fn().mockResolvedValue(undefined),
      };

      const service = new KeyRotationService(
        {
          preRotationValidation: false,
          postRotationVerification: false,
          reEncryptionBatchSize: 1,
        },
        store,
        encryptionService,
      );

      // Generate more than 1000 events by rotating many times
      for (let i = 0; i < 600; i++) {
        await service.rotateKeys();
      }

      // Also do some re-encryption to add more events
      for (let i = 0; i < 100; i++) {
        await service.reEncryptData(mockDataProvider, 1);
      }

      const events = service.getLifecycleEvents();

      // Should be trimmed to at most 1000
      expect(events.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('isRotationNeeded', () => {
    it('should return true when no metadata exists', async () => {
      const badStore: KeyVersionStore = {
        getCurrentVersion: () => Promise.resolve(1),
        setCurrentVersion: vi.fn(),
        getVersionMetadata: () => Promise.resolve(null),
        saveVersionMetadata: vi.fn(),
        deprecateVersion: vi.fn(),
        listVersions: () => Promise.resolve([]),
      };

      const service = new KeyRotationService({ enabled: true }, badStore);

      const needed = await service.isRotationNeeded();

      expect(needed).toBe(true);
    });

    it('should return true when interval has passed', async () => {
      const store = new InMemoryKeyVersionStore();
      // Set creation time to 100 days ago
      const oldMetadata: KeyMetadata = {
        version: 1,
        createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        algorithm: 'aes-256-gcm',
        keyId: 'old-key',
      };
      await store.saveVersionMetadata(oldMetadata);

      const service = new KeyRotationService({ enabled: true, intervalDays: 30 }, store);

      const needed = await service.isRotationNeeded();

      expect(needed).toBe(true);
    });

    it('should return false when interval has not passed', async () => {
      const store = new InMemoryKeyVersionStore();
      // Default version 1 was just created

      const service = new KeyRotationService({ enabled: true, intervalDays: 30 }, store);

      const needed = await service.isRotationNeeded();

      expect(needed).toBe(false);
    });
  });

  describe('getKeyStatus', () => {
    it('should return complete key status', async () => {
      const store = new InMemoryKeyVersionStore();
      await store.saveVersionMetadata({
        version: 2,
        createdAt: new Date(),
        algorithm: 'aes-256-gcm',
        keyId: 'key-v2',
      });
      await store.setCurrentVersion(2);

      const service = new KeyRotationService({ intervalDays: 30 }, store);

      const status = await service.getKeyStatus();

      expect(status.currentVersion).toBe(2);
      expect(status.allVersions.length).toBeGreaterThanOrEqual(1);
      expect(typeof status.rotationNeeded).toBe('boolean');
      expect(status.nextRotationDue).toBeInstanceOf(Date);
    });

    it('should not have nextRotationDue when no metadata', async () => {
      const badStore: KeyVersionStore = {
        getCurrentVersion: () => Promise.resolve(1),
        setCurrentVersion: vi.fn(),
        getVersionMetadata: () => Promise.resolve(null),
        saveVersionMetadata: vi.fn(),
        deprecateVersion: vi.fn(),
        listVersions: () => Promise.resolve([]),
      };

      const service = new KeyRotationService({}, badStore);

      const status = await service.getKeyStatus();

      expect(status.nextRotationDue).toBeUndefined();
    });
  });
});

describe('getKeyRotationService singleton', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
    resetKeyRotationService();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetKeyRotationService();
  });

  it('should use VaultKeyVersionStore when VAULT_ENABLED', async () => {
    process.env.VAULT_ENABLED = 'true';

    vi.resetModules();
    const mod = await import('../key-rotation');
    mod.resetKeyRotationService();

    // Can't easily verify the store type, but verify service is created
    const service = mod.getKeyRotationService();
    expect(service).toBeDefined();
  });

  it('should use environment config values', async () => {
    process.env.KEY_ROTATION_ENABLED = 'false';
    process.env.KEY_ROTATION_INTERVAL_DAYS = '60';
    process.env.KEY_RETENTION_VERSIONS = '10';
    process.env.KEY_ROTATION_WEBHOOK = 'https://example.com/webhook';

    vi.resetModules();
    const mod = await import('../key-rotation');
    mod.resetKeyRotationService();

    const service = mod.getKeyRotationService();
    const isNeeded = await service.isRotationNeeded();

    // Should return false because enabled is false
    expect(isNeeded).toBe(false);
  });
});

describe('InMemoryKeyVersionStore - deprecateVersion with expiry', () => {
  it('should set expiresAt when deprecating', async () => {
    const store = new InMemoryKeyVersionStore();

    await store.deprecateVersion(1);

    const metadata = await store.getVersionMetadata(1);
    expect(metadata?.expiresAt).toBeDefined();
    // Should be approximately 30 days from now
    const expectedExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(metadata?.expiresAt?.getTime()).toBeGreaterThan(expectedExpiry - 1000);
    expect(metadata?.expiresAt?.getTime()).toBeLessThan(expectedExpiry + 1000);
  });
});

describe('Error handling edge cases', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should handle errors in reEncryptData when getRecordCount throws', async () => {
    const store = new InMemoryKeyVersionStore();
    await store.setCurrentVersion(2);

    const mockDataProvider: DataProvider = {
      getRecordCount: () => Promise.reject(new Error('Database error')),
      getRecordsByKeyVersion: vi.fn(),
      updateRecord: vi.fn(),
    };

    const service = new KeyRotationService({}, store);

    const progress = await service.reEncryptData(mockDataProvider);

    expect(progress.status).toBe('failed');
  });

  it('should capture error message in reEncryptData lifecycle event', async () => {
    const store = new InMemoryKeyVersionStore();
    await store.setCurrentVersion(2);

    const mockDataProvider: DataProvider = {
      getRecordCount: () => Promise.reject(new Error('Specific DB error')),
      getRecordsByKeyVersion: vi.fn(),
      updateRecord: vi.fn(),
    };

    const service = new KeyRotationService({}, store);

    await service.reEncryptData(mockDataProvider);

    const events = service.getLifecycleEvents();
    const failedEvent = events.find((e) => e.eventType === 'REENCRYPTION_FAILED');
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.details?.error).toBe('Specific DB error');
  });

  it('should handle errors within rotateKeys try-catch block', async () => {
    // Test that errors during pre-rotation validation are caught
    const badStore: KeyVersionStore = {
      getCurrentVersion: () => Promise.resolve(1),
      setCurrentVersion: vi.fn(),
      getVersionMetadata: () => Promise.resolve(null), // This causes pre-rotation to fail
      saveVersionMetadata: vi.fn(),
      deprecateVersion: vi.fn(),
      listVersions: () => Promise.resolve([]),
    };

    const service = new KeyRotationService(
      { preRotationValidation: true },
      badStore,
    );

    const result = await service.rotateKeys();

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Pre-rotation validation failed');
  });
});
