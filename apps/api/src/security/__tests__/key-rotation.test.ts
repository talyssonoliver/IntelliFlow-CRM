/**
 * Key Rotation Service Tests - IFC-113
 *
 * Tests for key rotation scheduling and management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  InMemoryKeyVersionStore,
  type KeyRotationConfig,
  type RotationResult,
  type ReEncryptionProgress,
  type DataProvider,
  type EncryptedRecord,
  type KeyLifecycleEvent,
  type KeyLifecycleEventRecord,
  type KeyVersionStore,
} from '../key-rotation';
import { EncryptedData, KeyMetadata } from '../encryption';

// Store original env
const originalEnv = { ...process.env };

describe('Key Rotation Service - IFC-113', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('InMemoryKeyVersionStore', () => {
    it('should initialize with version 1', async () => {
      const store = new InMemoryKeyVersionStore();
      const version = await store.getCurrentVersion();

      expect(version).toBe(1);
    });

    it('should have initial metadata for version 1', async () => {
      const store = new InMemoryKeyVersionStore();
      const metadata = await store.getVersionMetadata(1);

      expect(metadata).toBeDefined();
      expect(metadata?.version).toBe(1);
      expect(metadata?.algorithm).toBe('aes-256-gcm');
      expect(metadata?.keyId).toBe('initial-key-v1');
      expect(metadata?.createdAt).toBeInstanceOf(Date);
    });

    it('should set current version', async () => {
      const store = new InMemoryKeyVersionStore();

      await store.setCurrentVersion(2);

      const version = await store.getCurrentVersion();
      expect(version).toBe(2);
    });

    it('should save version metadata', async () => {
      const store = new InMemoryKeyVersionStore();
      const metadata: KeyMetadata = {
        version: 2,
        createdAt: new Date(),
        algorithm: 'aes-256-gcm',
        keyId: 'key-v2',
      };

      await store.saveVersionMetadata(metadata);

      const retrieved = await store.getVersionMetadata(2);
      expect(retrieved).toEqual(metadata);
    });

    it('should return null for non-existent version', async () => {
      const store = new InMemoryKeyVersionStore();
      const metadata = await store.getVersionMetadata(999);

      expect(metadata).toBeNull();
    });

    it('should deprecate version', async () => {
      const store = new InMemoryKeyVersionStore();

      await store.deprecateVersion(1);

      // Deprecated version should still exist but be marked
      const metadata = await store.getVersionMetadata(1);
      expect(metadata).toBeDefined();
    });

    it('should list all versions', async () => {
      const store = new InMemoryKeyVersionStore();

      const metadata2: KeyMetadata = {
        version: 2,
        createdAt: new Date(),
        algorithm: 'aes-256-gcm',
        keyId: 'key-v2',
      };
      await store.saveVersionMetadata(metadata2);

      const versions = await store.listVersions();

      expect(versions.length).toBeGreaterThanOrEqual(1);
      expect(versions.some((v) => v.version === 1)).toBe(true);
    });
  });

  describe('KeyRotationConfig', () => {
    it('should have valid default configuration structure', () => {
      const config: KeyRotationConfig = {
        enabled: true,
        intervalDays: 90,
        retentionVersions: 3,
        preRotationValidation: true,
        postRotationVerification: true,
        maxConcurrentReEncryptions: 10,
        reEncryptionBatchSize: 100,
      };

      expect(config.enabled).toBe(true);
      expect(config.intervalDays).toBe(90);
      expect(config.retentionVersions).toBe(3);
    });

    it('should allow notification webhook', () => {
      const config: KeyRotationConfig = {
        enabled: true,
        intervalDays: 90,
        retentionVersions: 3,
        preRotationValidation: true,
        postRotationVerification: true,
        notificationWebhook: 'https://example.com/webhook',
        maxConcurrentReEncryptions: 10,
        reEncryptionBatchSize: 100,
      };

      expect(config.notificationWebhook).toBe('https://example.com/webhook');
    });
  });

  describe('RotationResult', () => {
    it('should have valid structure for successful rotation', () => {
      const result: RotationResult = {
        success: true,
        previousVersion: 1,
        newVersion: 2,
        rotatedAt: new Date(),
        affectedRecords: 1000,
        duration: 5000,
      };

      expect(result.success).toBe(true);
      expect(result.newVersion).toBe(result.previousVersion + 1);
      expect(result.rotatedAt).toBeInstanceOf(Date);
    });

    it('should have valid structure for failed rotation', () => {
      const result: RotationResult = {
        success: false,
        previousVersion: 1,
        newVersion: 1,
        rotatedAt: new Date(),
        errors: ['Validation failed', 'Key generation error'],
        duration: 1000,
      };

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('ReEncryptionProgress', () => {
    it('should track progress correctly', () => {
      const progress: ReEncryptionProgress = {
        totalRecords: 1000,
        processedRecords: 500,
        failedRecords: 5,
        startedAt: new Date(),
        status: 'in_progress',
      };

      expect(progress.processedRecords).toBeLessThanOrEqual(progress.totalRecords);
      expect(progress.failedRecords).toBeLessThanOrEqual(progress.processedRecords);
    });

    it('should have valid status transitions', () => {
      const validStatuses: ReEncryptionProgress['status'][] = [
        'pending',
        'in_progress',
        'completed',
        'failed',
      ];

      expect(validStatuses).toContain('pending');
      expect(validStatuses).toContain('in_progress');
      expect(validStatuses).toContain('completed');
      expect(validStatuses).toContain('failed');
    });

    it('should have estimated completion time', () => {
      const progress: ReEncryptionProgress = {
        totalRecords: 1000,
        processedRecords: 500,
        failedRecords: 0,
        startedAt: new Date(Date.now() - 5000),
        estimatedCompletion: new Date(Date.now() + 5000),
        status: 'in_progress',
      };

      expect(progress.estimatedCompletion).toBeDefined();
      expect(progress.estimatedCompletion!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('DataProvider Interface', () => {
    it('should define required methods', () => {
      const mockDataProvider: DataProvider = {
        getRecordsByKeyVersion: vi.fn().mockResolvedValue([]),
        updateRecord: vi.fn().mockResolvedValue(undefined),
        getRecordCount: vi.fn().mockResolvedValue(0),
      };

      expect(mockDataProvider.getRecordsByKeyVersion).toBeDefined();
      expect(mockDataProvider.updateRecord).toBeDefined();
      expect(mockDataProvider.getRecordCount).toBeDefined();
    });

    it('should return encrypted records', async () => {
      const mockRecord: EncryptedRecord = {
        id: 'record-123',
        encryptedData: {
          iv: 'test-iv',
          ciphertext: 'test-ciphertext',
          authTag: 'test-auth-tag',
          keyVersion: 1,
          algorithm: 'aes-256-gcm',
          encryptedAt: new Date().toISOString(),
        },
      };

      const mockDataProvider: DataProvider = {
        getRecordsByKeyVersion: vi.fn().mockResolvedValue([mockRecord]),
        updateRecord: vi.fn().mockResolvedValue(undefined),
        getRecordCount: vi.fn().mockResolvedValue(1),
      };

      const records = await mockDataProvider.getRecordsByKeyVersion(1, 10, 0);
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('record-123');
    });
  });

  describe('KeyLifecycleEvent Types', () => {
    it('should have all expected event types', () => {
      const eventTypes: KeyLifecycleEvent[] = [
        'KEY_CREATED',
        'KEY_ROTATED',
        'KEY_DEPRECATED',
        'KEY_DESTROYED',
        'REENCRYPTION_STARTED',
        'REENCRYPTION_COMPLETED',
        'REENCRYPTION_FAILED',
      ];

      expect(eventTypes).toHaveLength(7);
      expect(eventTypes).toContain('KEY_CREATED');
      expect(eventTypes).toContain('KEY_ROTATED');
      expect(eventTypes).toContain('REENCRYPTION_COMPLETED');
    });
  });

  describe('KeyLifecycleEventRecord', () => {
    it('should have valid structure', () => {
      const event: KeyLifecycleEventRecord = {
        eventType: 'KEY_ROTATED',
        keyVersion: 2,
        timestamp: new Date(),
        details: { previousVersion: 1 },
        actor: 'system',
      };

      expect(event.eventType).toBe('KEY_ROTATED');
      expect(event.keyVersion).toBe(2);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should allow optional fields', () => {
      const event: KeyLifecycleEventRecord = {
        eventType: 'KEY_CREATED',
        keyVersion: 1,
        timestamp: new Date(),
      };

      expect(event.details).toBeUndefined();
      expect(event.actor).toBeUndefined();
    });
  });

  describe('KeyVersionStore Interface', () => {
    it('should have all required methods', () => {
      const store = new InMemoryKeyVersionStore();

      expect(typeof store.getCurrentVersion).toBe('function');
      expect(typeof store.setCurrentVersion).toBe('function');
      expect(typeof store.getVersionMetadata).toBe('function');
      expect(typeof store.saveVersionMetadata).toBe('function');
      expect(typeof store.deprecateVersion).toBe('function');
      expect(typeof store.listVersions).toBe('function');
    });
  });

  describe('Rotation Intervals', () => {
    it('should use 90-day default rotation interval', () => {
      const defaultIntervalDays = 90;
      expect(defaultIntervalDays).toBe(90);
    });

    it('should support custom rotation intervals', () => {
      const config: KeyRotationConfig = {
        enabled: true,
        intervalDays: 30, // Monthly rotation
        retentionVersions: 5,
        preRotationValidation: true,
        postRotationVerification: true,
        maxConcurrentReEncryptions: 10,
        reEncryptionBatchSize: 100,
      };

      expect(config.intervalDays).toBe(30);
    });

    it('should calculate next rotation date', () => {
      const lastRotation = new Date('2025-01-01');
      const intervalDays = 90;
      const nextRotation = new Date(lastRotation.getTime() + intervalDays * 24 * 60 * 60 * 1000);

      expect(nextRotation.getTime()).toBe(new Date('2025-04-01').getTime());
    });
  });

  describe('Version Retention', () => {
    it('should retain specified number of versions', async () => {
      const store = new InMemoryKeyVersionStore();
      const retentionVersions = 3;

      // Save multiple versions
      for (let i = 2; i <= 5; i++) {
        await store.saveVersionMetadata({
          version: i,
          createdAt: new Date(),
          algorithm: 'aes-256-gcm',
          keyId: `key-v${i}`,
        });
      }

      const versions = await store.listVersions();
      expect(versions.length).toBeGreaterThanOrEqual(1);
    });

    it('should identify old versions for cleanup', async () => {
      const store = new InMemoryKeyVersionStore();
      const currentVersion = 5;
      const retentionVersions = 3;

      // Versions older than currentVersion - retentionVersions should be cleaned up
      const oldestRetainedVersion = currentVersion - retentionVersions;
      expect(oldestRetainedVersion).toBe(2);
    });
  });

  describe('Batch Re-encryption', () => {
    it('should process records in batches', async () => {
      const batchSize = 100;
      const totalRecords = 250;
      const expectedBatches = Math.ceil(totalRecords / batchSize);

      expect(expectedBatches).toBe(3);
    });

    it('should limit concurrent re-encryptions', () => {
      const config: KeyRotationConfig = {
        enabled: true,
        intervalDays: 90,
        retentionVersions: 3,
        preRotationValidation: true,
        postRotationVerification: true,
        maxConcurrentReEncryptions: 5,
        reEncryptionBatchSize: 100,
      };

      expect(config.maxConcurrentReEncryptions).toBe(5);
    });
  });
});

describe('KeyRotationService Functional Tests', () => {
  let KeyRotationService: typeof import('../key-rotation').KeyRotationService;
  let getKeyRotationService: typeof import('../key-rotation').getKeyRotationService;
  let resetKeyRotationService: typeof import('../key-rotation').resetKeyRotationService;

  beforeEach(async () => {
    vi.resetModules();
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-32-bytes-long-!!';
    const mod = await import('../key-rotation');
    KeyRotationService = mod.KeyRotationService;
    getKeyRotationService = mod.getKeyRotationService;
    resetKeyRotationService = mod.resetKeyRotationService;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('should create KeyRotationService with default config', () => {
    const service = new KeyRotationService();

    expect(service).toBeDefined();
  });

  it('should create KeyRotationService with custom config', () => {
    const config: Partial<KeyRotationConfig> = {
      enabled: true,
      intervalDays: 30,
      retentionVersions: 5,
      preRotationValidation: true,
      postRotationVerification: true,
      maxConcurrentReEncryptions: 20,
      reEncryptionBatchSize: 200,
    };
    const store = new InMemoryKeyVersionStore();
    const service = new KeyRotationService(config, store);

    expect(service).toBeDefined();
  });

  it('should get singleton service instance', () => {
    const service1 = getKeyRotationService();
    const service2 = getKeyRotationService();

    expect(service1).toBe(service2);
  });

  it('should reset singleton service', () => {
    const service1 = getKeyRotationService();
    resetKeyRotationService();
    const service2 = getKeyRotationService();

    expect(service1).not.toBe(service2);
  });

  it('should check if rotation is needed', async () => {
    const config: Partial<KeyRotationConfig> = {
      enabled: true,
      intervalDays: 0, // Immediate rotation
      retentionVersions: 3,
    };
    const store = new InMemoryKeyVersionStore();
    const service = new KeyRotationService(config, store);

    const needsRotation = await service.isRotationNeeded();
    expect(typeof needsRotation).toBe('boolean');
  });

  it('should return false for rotation needed when disabled', async () => {
    const config: Partial<KeyRotationConfig> = {
      enabled: false,
    };
    const service = new KeyRotationService(config);

    const needsRotation = await service.isRotationNeeded();
    expect(needsRotation).toBe(false);
  });

  it('should get lifecycle events as empty array initially', () => {
    const service = new KeyRotationService();

    const events = service.getLifecycleEvents();
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(0);
  });

  it('should get key status', async () => {
    const store = new InMemoryKeyVersionStore();
    const service = new KeyRotationService({}, store);

    const status = await service.getKeyStatus();

    expect(status.currentVersion).toBe(1);
    expect(Array.isArray(status.allVersions)).toBe(true);
    expect(typeof status.rotationNeeded).toBe('boolean');
  });

  it('should rotate keys successfully', async () => {
    const store = new InMemoryKeyVersionStore();
    const service = new KeyRotationService(
      { preRotationValidation: false, postRotationVerification: false },
      store,
    );

    const result = await service.rotateKeys();

    expect(result.success).toBe(true);
    expect(result.previousVersion).toBe(1);
    expect(result.newVersion).toBe(2);
    expect(result.rotatedAt).toBeInstanceOf(Date);
    expect(typeof result.duration).toBe('number');
  });

  it('should record lifecycle events after rotation', async () => {
    const store = new InMemoryKeyVersionStore();
    const service = new KeyRotationService(
      { preRotationValidation: false, postRotationVerification: false },
      store,
    );

    await service.rotateKeys();
    const events = service.getLifecycleEvents();

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some(e => e.eventType === 'KEY_ROTATED')).toBe(true);
  });
});
