/**
 * Key Rotation Service
 *
 * IMPLEMENTS: IFC-113 (Secrets Management & Encryption)
 *
 * This module provides:
 * - Automated key rotation scheduling
 * - Key version management
 * - Re-encryption of existing data
 * - Audit trail for key lifecycle events
 *
 * Usage:
 * ```typescript
 * import { KeyRotationService, getKeyRotationService } from './key-rotation';
 *
 * const rotationService = getKeyRotationService();
 * await rotationService.rotateKeys();
 * await rotationService.reEncryptData(dataProvider);
 * ```
 */

import { randomBytes } from 'crypto';
import { AuditLogger } from './audit-logger';
import {
  EncryptionService,
  EncryptedData,
  KeyMetadata,
  EncryptionError,
} from './encryption';

/**
 * Key rotation configuration
 */
export interface KeyRotationConfig {
  /** Enable automatic rotation */
  enabled: boolean;
  /** Rotation interval in days */
  intervalDays: number;
  /** Number of old key versions to retain */
  retentionVersions: number;
  /** Enable pre-rotation validation */
  preRotationValidation: boolean;
  /** Enable post-rotation verification */
  postRotationVerification: boolean;
  /** Webhook URL for rotation notifications */
  notificationWebhook?: string;
  /** Maximum concurrent re-encryption operations */
  maxConcurrentReEncryptions: number;
  /** Batch size for re-encryption */
  reEncryptionBatchSize: number;
}

/**
 * Rotation result
 */
export interface RotationResult {
  success: boolean;
  previousVersion: number;
  newVersion: number;
  rotatedAt: Date;
  affectedRecords?: number;
  errors?: string[];
  duration: number;
}

/**
 * Re-encryption progress
 */
export interface ReEncryptionProgress {
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  startedAt: Date;
  estimatedCompletion?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Data provider interface for re-encryption
 */
export interface DataProvider {
  /** Get records that need re-encryption (by key version) */
  getRecordsByKeyVersion(version: number, limit: number, offset: number): Promise<EncryptedRecord[]>;
  /** Update a record with new encrypted data */
  updateRecord(id: string, encryptedData: EncryptedData): Promise<void>;
  /** Get total count of records for a key version */
  getRecordCount(version: number): Promise<number>;
}

/**
 * Encrypted record structure
 */
export interface EncryptedRecord {
  id: string;
  encryptedData: EncryptedData;
}

/**
 * Key lifecycle event types
 */
export type KeyLifecycleEvent =
  | 'KEY_CREATED'
  | 'KEY_ROTATED'
  | 'KEY_DEPRECATED'
  | 'KEY_DESTROYED'
  | 'REENCRYPTION_STARTED'
  | 'REENCRYPTION_COMPLETED'
  | 'REENCRYPTION_FAILED';

/**
 * Key lifecycle event
 */
export interface KeyLifecycleEventRecord {
  eventType: KeyLifecycleEvent;
  keyVersion: number;
  timestamp: Date;
  details?: Record<string, unknown>;
  actor?: string;
}

/**
 * Key version store interface
 */
export interface KeyVersionStore {
  getCurrentVersion(): Promise<number>;
  setCurrentVersion(version: number): Promise<void>;
  getVersionMetadata(version: number): Promise<KeyMetadata | null>;
  saveVersionMetadata(metadata: KeyMetadata): Promise<void>;
  deprecateVersion(version: number): Promise<void>;
  listVersions(): Promise<KeyMetadata[]>;
}

/**
 * In-memory key version store (for development/testing)
 */
export class InMemoryKeyVersionStore implements KeyVersionStore {
  private currentVersion = 1;
  private versions: Map<number, KeyMetadata> = new Map();
  private deprecated: Set<number> = new Set();

  async getCurrentVersion(): Promise<number> {
    return this.currentVersion;
  }

  async setCurrentVersion(version: number): Promise<void> {
    this.currentVersion = version;
  }

  async getVersionMetadata(version: number): Promise<KeyMetadata | null> {
    return this.versions.get(version) || null;
  }

  async saveVersionMetadata(metadata: KeyMetadata): Promise<void> {
    this.versions.set(metadata.version, metadata);
  }

  async deprecateVersion(version: number): Promise<void> {
    this.deprecated.add(version);
    const metadata = this.versions.get(version);
    if (metadata) {
      metadata.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    }
  }

  async listVersions(): Promise<KeyMetadata[]> {
    return Array.from(this.versions.values());
  }
}

/**
 * Vault-backed key version store
 */
export class VaultKeyVersionStore implements KeyVersionStore {
  private vaultAddress: string;
  private vaultToken: string;
  private keyName: string;

  constructor(options?: {
    address?: string;
    token?: string;
    keyName?: string;
  }) {
    this.vaultAddress = options?.address || process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
    this.vaultToken = options?.token || process.env.VAULT_TOKEN || '';
    this.keyName = options?.keyName || 'intelliflow-data-key';
  }

  async getCurrentVersion(): Promise<number> {
    const response = await fetch(
      `${this.vaultAddress}/v1/transit/keys/${this.keyName}`,
      {
        headers: { 'X-Vault-Token': this.vaultToken },
      },
    );

    if (!response.ok) throw new Error('Failed to get current key version from Vault');
    const data = (await response.json()) as { data: { latest_version: number } };
    return data.data.latest_version;
  }

  async setCurrentVersion(version: number): Promise<void> {
    // Vault manages this automatically during rotation
    await fetch(
      `${this.vaultAddress}/v1/transit/keys/${this.keyName}/config`,
      {
        method: 'POST',
        headers: {
          'X-Vault-Token': this.vaultToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          min_decryption_version: version - 4, // Keep last 4 versions
          min_encryption_version: version,
        }),
      },
    );
  }

  async getVersionMetadata(version: number): Promise<KeyMetadata | null> {
    const response = await fetch(
      `${this.vaultAddress}/v1/transit/keys/${this.keyName}`,
      {
        headers: { 'X-Vault-Token': this.vaultToken },
      },
    );

    if (!response.ok) return null;
    const data = (await response.json()) as { data: { keys: Record<number, { creation_time: string }>; type: string } };
    const keys = data.data.keys;

    if (!keys[version]) return null;

    return {
      version,
      createdAt: new Date(keys[version].creation_time),
      algorithm: data.data.type,
      keyId: this.keyName,
    };
  }

  async saveVersionMetadata(_metadata: KeyMetadata): Promise<void> {
    // Vault manages metadata automatically
  }

  async deprecateVersion(version: number): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    if (version >= currentVersion) {
      throw new Error('Cannot deprecate current or future versions');
    }

    // Update min_decryption_version to prevent decryption with deprecated key
    await fetch(
      `${this.vaultAddress}/v1/transit/keys/${this.keyName}/config`,
      {
        method: 'POST',
        headers: {
          'X-Vault-Token': this.vaultToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          min_decryption_version: version + 1,
        }),
      },
    );
  }

  async listVersions(): Promise<KeyMetadata[]> {
    const response = await fetch(
      `${this.vaultAddress}/v1/transit/keys/${this.keyName}`,
      {
        headers: { 'X-Vault-Token': this.vaultToken },
      },
    );

    if (!response.ok) return [];
    const data = (await response.json()) as { data: { keys: Record<string, { creation_time: string }>; type: string } };
    const keys = data.data.keys;

    return Object.entries(keys).map(([version, info]) => ({
      version: parseInt(version),
      createdAt: new Date(info.creation_time),
      algorithm: data.data.type,
      keyId: this.keyName,
    }));
  }
}

/**
 * Key Rotation Service
 */
export class KeyRotationService {
  private config: KeyRotationConfig;
  private versionStore: KeyVersionStore;
  private encryptionService: EncryptionService;
  private auditLogger: AuditLogger | null = null;
  private lifecycleEvents: KeyLifecycleEventRecord[] = [];

  constructor(
    config?: Partial<KeyRotationConfig>,
    versionStore?: KeyVersionStore,
    encryptionService?: EncryptionService,
    auditLogger?: AuditLogger,
  ) {
    this.config = {
      enabled: true,
      intervalDays: 30,
      retentionVersions: 5,
      preRotationValidation: true,
      postRotationVerification: true,
      maxConcurrentReEncryptions: 10,
      reEncryptionBatchSize: 100,
      ...config,
    };

    this.versionStore = versionStore || new InMemoryKeyVersionStore();
    this.encryptionService = encryptionService || new EncryptionService();
    this.auditLogger = auditLogger || null;
  }

  /**
   * Rotate encryption keys
   */
  async rotateKeys(): Promise<RotationResult> {
    const startTime = Date.now();
    const previousVersion = await this.versionStore.getCurrentVersion();
    const newVersion = previousVersion + 1;
    const errors: string[] = [];

    try {
      // Pre-rotation validation
      if (this.config.preRotationValidation) {
        const valid = await this.preRotationValidation(previousVersion);
        if (!valid) {
          throw new EncryptionError(
            'PRE_ROTATION_FAILED',
            'Pre-rotation validation failed',
          );
        }
      }

      // Create new key version
      const newMetadata: KeyMetadata = {
        version: newVersion,
        createdAt: new Date(),
        algorithm: 'aes-256-gcm',
        keyId: `key-v${newVersion}-${randomBytes(4).toString('hex')}`,
      };

      await this.versionStore.saveVersionMetadata(newMetadata);
      await this.versionStore.setCurrentVersion(newVersion);

      // Log lifecycle event
      this.recordLifecycleEvent({
        eventType: 'KEY_ROTATED',
        keyVersion: newVersion,
        timestamp: new Date(),
        details: { previousVersion },
      });

      // Post-rotation verification
      if (this.config.postRotationVerification) {
        const verified = await this.postRotationVerification(newVersion);
        if (!verified) {
          errors.push('Post-rotation verification failed but rotation completed');
        }
      }

      // Deprecate old versions beyond retention
      await this.cleanupOldVersions(newVersion);

      // Send notification
      if (this.config.notificationWebhook) {
        await this.sendRotationNotification(newVersion, previousVersion);
      }

      // Audit log
      if (this.auditLogger) {
        await this.auditLogger.log({
          tenantId: 'system',
          eventType: 'KEY_ROTATION',
          resourceType: 'system',
          resourceId: 'encryption-keys',
          action: 'CONFIGURE',
          actionResult: 'SUCCESS',
          metadata: {
            previousVersion,
            newVersion,
          },
        });
      }

      return {
        success: true,
        previousVersion,
        newVersion,
        rotatedAt: new Date(),
        duration: Date.now() - startTime,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      if (this.auditLogger) {
        await this.auditLogger.log({
          tenantId: 'system',
          eventType: 'KEY_ROTATION_FAILED',
          resourceType: 'system',
          resourceId: 'encryption-keys',
          action: 'CONFIGURE',
          actionResult: 'FAILURE',
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }

      return {
        success: false,
        previousVersion,
        newVersion,
        rotatedAt: new Date(),
        duration: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Re-encrypt all data with current key version
   */
  async reEncryptData(
    dataProvider: DataProvider,
    targetVersion?: number,
  ): Promise<ReEncryptionProgress> {
    const currentVersion = await this.versionStore.getCurrentVersion();
    const versionsToMigrate = targetVersion
      ? [targetVersion]
      : Array.from({ length: currentVersion - 1 }, (_, i) => i + 1);

    let totalRecords = 0;
    let processedRecords = 0;
    let failedRecords = 0;
    const startedAt = new Date();

    this.recordLifecycleEvent({
      eventType: 'REENCRYPTION_STARTED',
      keyVersion: currentVersion,
      timestamp: startedAt,
      details: { versionsToMigrate },
    });

    try {
      for (const version of versionsToMigrate) {
        const count = await dataProvider.getRecordCount(version);
        totalRecords += count;

        let offset = 0;
        while (offset < count) {
          const records = await dataProvider.getRecordsByKeyVersion(
            version,
            this.config.reEncryptionBatchSize,
            offset,
          );

          const results = await Promise.allSettled(
            records.map(async (record) => {
              const reEncrypted = await this.encryptionService.reEncrypt(record.encryptedData);
              await dataProvider.updateRecord(record.id, reEncrypted);
            }),
          );

          processedRecords += results.filter((r) => r.status === 'fulfilled').length;
          failedRecords += results.filter((r) => r.status === 'rejected').length;
          offset += this.config.reEncryptionBatchSize;
        }
      }

      this.recordLifecycleEvent({
        eventType: 'REENCRYPTION_COMPLETED',
        keyVersion: currentVersion,
        timestamp: new Date(),
        details: { totalRecords, processedRecords, failedRecords },
      });

      return {
        totalRecords,
        processedRecords,
        failedRecords,
        startedAt,
        status: failedRecords > 0 ? 'completed' : 'completed',
      };
    } catch (error) {
      this.recordLifecycleEvent({
        eventType: 'REENCRYPTION_FAILED',
        keyVersion: currentVersion,
        timestamp: new Date(),
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      });

      return {
        totalRecords,
        processedRecords,
        failedRecords,
        startedAt,
        status: 'failed',
      };
    }
  }

  /**
   * Check if rotation is needed based on schedule
   */
  async isRotationNeeded(): Promise<boolean> {
    if (!this.config.enabled) return false;

    const currentVersion = await this.versionStore.getCurrentVersion();
    const metadata = await this.versionStore.getVersionMetadata(currentVersion);

    if (!metadata) return true;

    const daysSinceCreation = (Date.now() - metadata.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceCreation >= this.config.intervalDays;
  }

  /**
   * Get key lifecycle events
   */
  getLifecycleEvents(): KeyLifecycleEventRecord[] {
    return [...this.lifecycleEvents];
  }

  /**
   * Get current key status
   */
  async getKeyStatus(): Promise<{
    currentVersion: number;
    allVersions: KeyMetadata[];
    rotationNeeded: boolean;
    nextRotationDue?: Date;
  }> {
    const currentVersion = await this.versionStore.getCurrentVersion();
    const allVersions = await this.versionStore.listVersions();
    const rotationNeeded = await this.isRotationNeeded();

    const currentMetadata = await this.versionStore.getVersionMetadata(currentVersion);
    const nextRotationDue = currentMetadata
      ? new Date(currentMetadata.createdAt.getTime() + this.config.intervalDays * 24 * 60 * 60 * 1000)
      : undefined;

    return {
      currentVersion,
      allVersions,
      rotationNeeded,
      nextRotationDue,
    };
  }

  /**
   * Pre-rotation validation
   */
  private async preRotationValidation(currentVersion: number): Promise<boolean> {
    // Verify current key is accessible
    const metadata = await this.versionStore.getVersionMetadata(currentVersion);
    if (!metadata) return false;

    // Test encryption/decryption with current key
    try {
      const testData = 'rotation-test-' + randomBytes(8).toString('hex');
      const encrypted = await this.encryptionService.encrypt(testData);
      const decrypted = await this.encryptionService.decrypt(encrypted);
      return testData === decrypted;
    } catch {
      return false;
    }
  }

  /**
   * Post-rotation verification
   */
  private async postRotationVerification(newVersion: number): Promise<boolean> {
    // Verify new key version is active
    const currentVersion = await this.versionStore.getCurrentVersion();
    if (currentVersion !== newVersion) return false;

    // Test encryption with new key
    try {
      const testData = 'verification-test-' + randomBytes(8).toString('hex');
      const encrypted = await this.encryptionService.encrypt(testData);
      const decrypted = await this.encryptionService.decrypt(encrypted);
      return testData === decrypted && encrypted.keyVersion === newVersion;
    } catch {
      return false;
    }
  }

  /**
   * Cleanup old key versions beyond retention
   */
  private async cleanupOldVersions(currentVersion: number): Promise<void> {
    const minVersion = currentVersion - this.config.retentionVersions;
    if (minVersion <= 0) return;

    const allVersions = await this.versionStore.listVersions();
    const versionsToDeprecate = allVersions.filter((v) => v.version < minVersion);

    for (const version of versionsToDeprecate) {
      await this.versionStore.deprecateVersion(version.version);
      this.recordLifecycleEvent({
        eventType: 'KEY_DEPRECATED',
        keyVersion: version.version,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Send rotation notification
   */
  private async sendRotationNotification(
    newVersion: number,
    previousVersion: number,
  ): Promise<void> {
    if (!this.config.notificationWebhook) return;

    try {
      await fetch(this.config.notificationWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'KEY_ROTATED',
          newVersion,
          previousVersion,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // Log but don't fail rotation
      console.error('Failed to send rotation notification');
    }
  }

  /**
   * Record lifecycle event
   */
  private recordLifecycleEvent(event: KeyLifecycleEventRecord): void {
    this.lifecycleEvents.push(event);
    // Keep only last 1000 events
    if (this.lifecycleEvents.length > 1000) {
      this.lifecycleEvents = this.lifecycleEvents.slice(-1000);
    }
  }
}

// Singleton instance
let keyRotationServiceInstance: KeyRotationService | null = null;

/**
 * Get the singleton key rotation service instance
 */
export function getKeyRotationService(): KeyRotationService {
  if (!keyRotationServiceInstance) {
    const useVault = process.env.VAULT_ENABLED === 'true';
    const versionStore = useVault
      ? new VaultKeyVersionStore()
      : new InMemoryKeyVersionStore();

    keyRotationServiceInstance = new KeyRotationService(
      {
        enabled: process.env.KEY_ROTATION_ENABLED !== 'false',
        intervalDays: parseInt(process.env.KEY_ROTATION_INTERVAL_DAYS || '30'),
        retentionVersions: parseInt(process.env.KEY_RETENTION_VERSIONS || '5'),
        notificationWebhook: process.env.KEY_ROTATION_WEBHOOK,
      },
      versionStore,
    );
  }
  return keyRotationServiceInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetKeyRotationService(): void {
  keyRotationServiceInstance = null;
}

export default KeyRotationService;
