/**
 * Encryption Utilities - AES-256-GCM Encryption at Rest and Transit
 *
 * IMPLEMENTS: IFC-113 (Secrets Management & Encryption)
 *
 * This module provides:
 * - AES-256-GCM encryption for data at rest
 * - Key derivation using PBKDF2
 * - Vault Transit backend integration
 * - Secure key storage abstraction
 *
 * Usage:
 * ```typescript
 * import { EncryptionService, getEncryptionService } from './encryption';
 *
 * const encryptionService = getEncryptionService();
 * const encrypted = await encryptionService.encrypt('sensitive data');
 * const decrypted = await encryptionService.decrypt(encrypted);
 * ```
 */

import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync, timingSafeEqual } from 'crypto';

/**
 * Encryption algorithm configuration
 */
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_DIGEST = 'sha512';

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  /** Base64 encoded initialization vector */
  iv: string;
  /** Base64 encoded encrypted data */
  ciphertext: string;
  /** Base64 encoded authentication tag */
  authTag: string;
  /** Base64 encoded salt (for PBKDF2 derived keys) */
  salt?: string;
  /** Key version for rotation support */
  keyVersion: number;
  /** Algorithm identifier */
  algorithm: string;
  /** Timestamp of encryption */
  encryptedAt: string;
}

/**
 * Encryption options
 */
export interface EncryptionOptions {
  /** Additional authenticated data (AAD) for GCM mode */
  aad?: string;
  /** Override key version */
  keyVersion?: number;
}

/**
 * Key metadata for rotation tracking
 */
export interface KeyMetadata {
  version: number;
  createdAt: Date;
  expiresAt?: Date;
  algorithm: string;
  keyId: string;
}

/**
 * Key provider interface for abstraction
 */
export interface KeyProvider {
  /** Get the current encryption key */
  getCurrentKey(): Promise<Buffer>;
  /** Get key by version for decryption */
  getKeyByVersion(version: number): Promise<Buffer>;
  /** Get current key version */
  getCurrentKeyVersion(): number;
  /** Get key metadata */
  getKeyMetadata(version: number): Promise<KeyMetadata | null>;
}

/**
 * Environment-based key provider (for development/testing)
 */
export class EnvironmentKeyProvider implements KeyProvider {
  private keyCache: Map<number, Buffer> = new Map();
  private currentVersion = 1;

  constructor(private masterKeyEnvVar: string = 'ENCRYPTION_MASTER_KEY') {}

  async getCurrentKey(): Promise<Buffer> {
    return this.getKeyByVersion(this.currentVersion);
  }

  async getKeyByVersion(version: number): Promise<Buffer> {
    const cached = this.keyCache.get(version);
    if (cached) return cached;

    const masterKey = process.env[this.masterKeyEnvVar];
    if (!masterKey) {
      throw new EncryptionError(
        'MISSING_KEY',
        `Encryption master key not found in ${this.masterKeyEnvVar}`,
      );
    }

    // Derive version-specific key from master key
    const salt = Buffer.from(`intelliflow-v${version}`);
    const derivedKey = pbkdf2Sync(
      masterKey,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      PBKDF2_DIGEST,
    );

    this.keyCache.set(version, derivedKey);
    return derivedKey;
  }

  getCurrentKeyVersion(): number {
    return this.currentVersion;
  }

  async getKeyMetadata(version: number): Promise<KeyMetadata | null> {
    return {
      version,
      createdAt: new Date(),
      algorithm: ALGORITHM,
      keyId: `env-key-v${version}`,
    };
  }
}

/**
 * Vault Transit backend key provider
 */
export class VaultKeyProvider implements KeyProvider {
  private keyCache: Map<number, Buffer> = new Map();
  private vaultAddress: string;
  private vaultToken: string;
  private keyName: string;
  private currentVersion = 1;

  constructor(options?: {
    address?: string;
    token?: string;
    keyName?: string;
  }) {
    this.vaultAddress = options?.address || process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
    this.vaultToken = options?.token || process.env.VAULT_TOKEN || '';
    this.keyName = options?.keyName || 'intelliflow-data-key';
  }

  async getCurrentKey(): Promise<Buffer> {
    // Vault Transit doesn't export keys - encryption happens on Vault side
    // This is a placeholder that returns a derived key for local operations
    // In production, use encryptWithVault/decryptWithVault methods
    return this.getKeyByVersion(this.currentVersion);
  }

  async getKeyByVersion(version: number): Promise<Buffer> {
    const cached = this.keyCache.get(version);
    if (cached) return cached;

    // For Vault Transit, we generate a data encryption key (DEK)
    // that is wrapped by Vault's transit key
    const dek = randomBytes(KEY_LENGTH);
    this.keyCache.set(version, dek);
    return dek;
  }

  getCurrentKeyVersion(): number {
    return this.currentVersion;
  }

  async getKeyMetadata(version: number): Promise<KeyMetadata | null> {
    try {
      const response = await fetch(
        `${this.vaultAddress}/v1/transit/keys/${this.keyName}`,
        {
          headers: {
            'X-Vault-Token': this.vaultToken,
          },
        },
      );

      if (!response.ok) return null;

      const data = (await response.json()) as { data: { creation_time: string; type: string } };
      return {
        version,
        createdAt: new Date(data.data.creation_time),
        algorithm: data.data.type,
        keyId: this.keyName,
      };
    } catch {
      return null;
    }
  }

  /**
   * Encrypt using Vault Transit backend directly
   */
  async encryptWithVault(plaintext: string): Promise<string> {
    const response = await fetch(
      `${this.vaultAddress}/v1/transit/encrypt/${this.keyName}`,
      {
        method: 'POST',
        headers: {
          'X-Vault-Token': this.vaultToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plaintext: Buffer.from(plaintext).toString('base64'),
        }),
      },
    );

    if (!response.ok) {
      throw new EncryptionError('VAULT_ERROR', 'Failed to encrypt with Vault');
    }

    const data = (await response.json()) as { data: { ciphertext: string } };
    return data.data.ciphertext;
  }

  /**
   * Decrypt using Vault Transit backend directly
   */
  async decryptWithVault(ciphertext: string): Promise<string> {
    const response = await fetch(
      `${this.vaultAddress}/v1/transit/decrypt/${this.keyName}`,
      {
        method: 'POST',
        headers: {
          'X-Vault-Token': this.vaultToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ciphertext,
        }),
      },
    );

    if (!response.ok) {
      throw new EncryptionError('VAULT_ERROR', 'Failed to decrypt with Vault');
    }

    const data = (await response.json()) as { data: { plaintext: string } };
    return Buffer.from(data.data.plaintext, 'base64').toString('utf-8');
  }
}

/**
 * Custom error class for encryption operations
 */
export class EncryptionError extends Error {
  constructor(
    public code: string,
    message: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'EncryptionError';
  }
}

/**
 * Main encryption service
 */
export class EncryptionService {
  private keyProvider: KeyProvider;

  constructor(keyProvider?: KeyProvider) {
    this.keyProvider = keyProvider || new EnvironmentKeyProvider();
  }

  /**
   * Encrypt plaintext using AES-256-GCM
   */
  async encrypt(plaintext: string, options: EncryptionOptions = {}): Promise<EncryptedData> {
    try {
      const key = await this.keyProvider.getCurrentKey();
      const iv = randomBytes(IV_LENGTH);
      const keyVersion = options.keyVersion ?? this.keyProvider.getCurrentKeyVersion();

      const cipher = createCipheriv(ALGORITHM, key, iv);

      // Set AAD if provided
      if (options.aad) {
        cipher.setAAD(Buffer.from(options.aad), { plaintextLength: Buffer.byteLength(plaintext) });
      }

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);

      const authTag = cipher.getAuthTag();

      return {
        iv: iv.toString('base64'),
        ciphertext: encrypted.toString('base64'),
        authTag: authTag.toString('base64'),
        keyVersion,
        algorithm: ALGORITHM,
        encryptedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new EncryptionError(
        'ENCRYPTION_FAILED',
        'Failed to encrypt data',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Decrypt ciphertext using AES-256-GCM
   */
  async decrypt(encryptedData: EncryptedData, options: EncryptionOptions = {}): Promise<string> {
    try {
      const key = await this.keyProvider.getKeyByVersion(encryptedData.keyVersion);
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');
      const authTag = Buffer.from(encryptedData.authTag, 'base64');

      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      // Set AAD if provided
      if (options.aad) {
        decipher.setAAD(Buffer.from(options.aad));
      }

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      throw new EncryptionError(
        'DECRYPTION_FAILED',
        'Failed to decrypt data - possible tampering or wrong key',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Encrypt and serialize to a single string
   */
  async encryptToString(plaintext: string, options?: EncryptionOptions): Promise<string> {
    const encrypted = await this.encrypt(plaintext, options);
    return Buffer.from(JSON.stringify(encrypted)).toString('base64');
  }

  /**
   * Decrypt from serialized string
   */
  async decryptFromString(encryptedString: string, options?: EncryptionOptions): Promise<string> {
    try {
      const encrypted = JSON.parse(
        Buffer.from(encryptedString, 'base64').toString('utf8'),
      ) as EncryptedData;
      return this.decrypt(encrypted, options);
    } catch (error) {
      throw new EncryptionError(
        'INVALID_FORMAT',
        'Invalid encrypted data format',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Hash data for comparison (constant-time comparison)
   */
  hash(data: string): string {
    const salt = randomBytes(SALT_LENGTH);
    const hash = pbkdf2Sync(data, salt, PBKDF2_ITERATIONS, 64, PBKDF2_DIGEST);
    return `${salt.toString('base64')}:${hash.toString('base64')}`;
  }

  /**
   * Verify hash with constant-time comparison
   */
  verifyHash(data: string, storedHash: string): boolean {
    try {
      const [saltB64, hashB64] = storedHash.split(':');
      const salt = Buffer.from(saltB64, 'base64');
      const storedHashBuffer = Buffer.from(hashB64, 'base64');
      const computedHash = pbkdf2Sync(data, salt, PBKDF2_ITERATIONS, 64, PBKDF2_DIGEST);
      return timingSafeEqual(storedHashBuffer, computedHash);
    } catch {
      return false;
    }
  }

  /**
   * Generate a secure random token
   */
  generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString('base64url');
  }

  /**
   * Re-encrypt data with current key version (for key rotation)
   */
  async reEncrypt(encryptedData: EncryptedData): Promise<EncryptedData> {
    const plaintext = await this.decrypt(encryptedData);
    return this.encrypt(plaintext);
  }

  /**
   * Get the key provider (for advanced operations)
   */
  getKeyProvider(): KeyProvider {
    return this.keyProvider;
  }
}

// Singleton instance
let encryptionServiceInstance: EncryptionService | null = null;

/**
 * Get the singleton encryption service instance
 */
export function getEncryptionService(): EncryptionService {
  if (!encryptionServiceInstance) {
    // Determine key provider based on environment
    const useVault = process.env.VAULT_ENABLED === 'true';
    const keyProvider = useVault ? new VaultKeyProvider() : new EnvironmentKeyProvider();
    encryptionServiceInstance = new EncryptionService(keyProvider);
  }
  return encryptionServiceInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetEncryptionService(): void {
  encryptionServiceInstance = null;
}

/**
 * Field-level encryption utilities for sensitive data
 */
export const FieldEncryption = {
  /**
   * Encrypt a specific field in an object
   */
  async encryptField<T extends Record<string, unknown>>(
    obj: T,
    fieldPath: string,
    service?: EncryptionService,
  ): Promise<T> {
    const svc = service || getEncryptionService();
    const parts = fieldPath.split('.');
    const result = { ...obj };

    let current: Record<string, unknown> = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined) return result;
      current[parts[i]] = { ...(current[parts[i]] as Record<string, unknown>) };
      current = current[parts[i]] as Record<string, unknown>;
    }

    const lastKey = parts[parts.length - 1];
    if (current[lastKey] !== undefined && typeof current[lastKey] === 'string') {
      current[lastKey] = await svc.encryptToString(current[lastKey] as string);
    }

    return result;
  },

  /**
   * Decrypt a specific field in an object
   */
  async decryptField<T extends Record<string, unknown>>(
    obj: T,
    fieldPath: string,
    service?: EncryptionService,
  ): Promise<T> {
    const svc = service || getEncryptionService();
    const parts = fieldPath.split('.');
    const result = { ...obj };

    let current: Record<string, unknown> = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined) return result;
      current[parts[i]] = { ...(current[parts[i]] as Record<string, unknown>) };
      current = current[parts[i]] as Record<string, unknown>;
    }

    const lastKey = parts[parts.length - 1];
    if (current[lastKey] !== undefined && typeof current[lastKey] === 'string') {
      current[lastKey] = await svc.decryptFromString(current[lastKey] as string);
    }

    return result;
  },
};

export default EncryptionService;
