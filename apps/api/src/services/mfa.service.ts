/**
 * MFA (Multi-Factor Authentication) Service
 *
 * Provides MFA functionality including:
 * - TOTP (Time-based One-Time Password) generation and verification
 * - SMS OTP sending (placeholder for integration)
 * - Email OTP sending (placeholder for integration)
 * - Backup code generation and verification
 *
 * IMPLEMENTS: PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 *
 * Dependencies:
 * - otplib: For TOTP generation/verification (add to package.json)
 * - qrcode: For QR code generation (optional, can use URL)
 */

import { randomBytes, randomInt, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaClient } from '@intelliflow/db';

// ============================================
// TOTP Implementation (no external deps for now)
// ============================================

/**
 * Simple TOTP implementation following RFC 6238
 * Note: In production, use 'otplib' for better security and features
 */

// Base32 alphabet for secret encoding
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode bytes to Base32
 */
function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decode Base32 to bytes
 */
function base32Decode(encoded: string): Buffer {
  const cleanedInput = encoded.replace(/={1,8}$/, '').toUpperCase();
  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleanedInput) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * Generate HMAC-SHA1
 */
function hmacSha1(key: Buffer, message: Buffer): Buffer {
  const hmac = createHmac('sha1', key);
  hmac.update(message);
  return hmac.digest();
}

/**
 * Generate TOTP code
 *
 * @param secret - Base32 encoded secret
 * @param time - Unix timestamp (defaults to now)
 * @param digits - Number of digits (default 6)
 * @param period - Time period in seconds (default 30)
 */
function generateTotpCode(
  secret: string,
  time: number = Math.floor(Date.now() / 1000),
  digits: number = 6,
  period: number = 30
): string {
  const key = base32Decode(secret);
  const counter = Math.floor(time / period);

  // Convert counter to 8-byte big-endian buffer
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  // Generate HMAC
  const hmac = hmacSha1(key, counterBuffer);

  // Dynamic truncation
  const offset = hmac.at(-1)! & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  // Generate OTP
  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

/**
 * Verify TOTP code with time window tolerance
 *
 * @param secret - Base32 encoded secret
 * @param code - User-provided code
 * @param window - Number of periods to check before/after (default 1)
 */
function verifyTotpCode(secret: string, code: string, window: number = 1): boolean {
  const now = Math.floor(Date.now() / 1000);
  const period = 30;

  // Check current and adjacent time windows
  for (let i = -window; i <= window; i++) {
    const checkTime = now + i * period;
    const expectedCode = generateTotpCode(secret, checkTime);
    if (expectedCode === code.replaceAll(/\s/g, '')) {
      return true;
    }
  }

  return false;
}

// ============================================
// Types
// ============================================

export type MfaMethod = 'totp' | 'sms' | 'email' | 'backup';

/**
 * MFA challenge stored in database or cache
 */
export interface MfaChallenge {
  id: string;
  userId: string;
  method: MfaMethod;
  /** For SMS/Email: the code sent */
  code?: string;
  /** For SMS/Email: hashed code for comparison */
  codeHash?: string;
  /** Challenge expiration */
  expiresAt: Date;
  /** Number of verification attempts */
  attempts: number;
  /** Maximum allowed attempts */
  maxAttempts: number;
  /** Challenge created at */
  createdAt: Date;
}

/**
 * MFA setup result
 */
export interface MfaSetupResult {
  success: boolean;
  method: 'totp' | 'sms' | 'email';
  /** For TOTP: Base32 encoded secret */
  secret?: string;
  /** For TOTP: URL for QR code generation */
  otpauthUrl?: string;
  /** For SMS/Email: confirmation that code was sent */
  codeSentTo?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Backup codes result
 */
export interface BackupCodesResult {
  codes: string[];
  generatedAt: Date;
}

/**
 * MFA user settings stored in database
 */
export interface MfaUserSettings {
  userId: string;
  totpEnabled: boolean;
  totpSecret?: string;
  smsEnabled: boolean;
  smsPhone?: string;
  emailEnabled: boolean;
  backupCodes?: string[]; // Hashed
  lastUsedAt?: Date;
}

// ============================================
// In-memory stores (use Redis in production)
// ============================================

/** Active MFA challenges */
const challengeStore = new Map<string, MfaChallenge>();

/** User MFA settings (cache) */
const mfaSettingsCache = new Map<string, MfaUserSettings>();

// ============================================
// MFA Service Class
// ============================================

/**
 * MFA Service
 *
 * Handles all MFA-related operations including setup,
 * verification, and backup code management.
 */
export class MfaService {
  private readonly issuer: string;
  private readonly prisma: PrismaClient | null;

  constructor(prisma?: PrismaClient, issuer: string = 'IntelliFlow CRM') {
    this.prisma = prisma ?? null;
    this.issuer = issuer;
  }

  // ==========================================
  // TOTP Methods
  // ==========================================

  /**
   * Generate a new TOTP secret for setup
   *
   * @returns Object with secret and QR code URL
   */
  generateTotpSecret(userEmail: string): {
    secret: string;
    otpauthUrl: string;
  } {
    // Generate 20 bytes of random data for the secret
    const secretBytes = randomBytes(20);
    const secret = base32Encode(secretBytes);

    // Generate otpauth URL for QR code
    const otpauthUrl = this.generateOtpauthUrl(secret, userEmail);

    return { secret, otpauthUrl };
  }

  /**
   * Generate otpauth URL for QR code
   */
  generateOtpauthUrl(secret: string, account: string): string {
    const encodedIssuer = encodeURIComponent(this.issuer);
    const encodedAccount = encodeURIComponent(account);
    return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
  }

  /**
   * Verify a TOTP code
   *
   * @param secret - User's TOTP secret
   * @param code - User-provided code
   * @returns True if code is valid
   */
  verifyTotp(secret: string, code: string): boolean {
    const normalizedCode = code.replaceAll(/\s/g, '');
    return verifyTotpCode(secret, normalizedCode);
  }

  /**
   * Timing-safe TOTP verification
   * Uses timingSafeEqual to prevent timing side-channel attacks
   * PG-125: AC-008
   */
  verifyTotpTimingSafe(secret: string, code: string): boolean {
    const normalizedCode = code.replaceAll(/\s/g, '');
    const now = Math.floor(Date.now() / 1000);
    const period = 30;

    for (let i = -1; i <= 1; i++) {
      const checkTime = now + i * period;
      const expectedCode = generateTotpCode(secret, checkTime);
      // Use timing-safe comparison
      const expectedBuf = Buffer.from(expectedCode, 'utf8');
      const codeBuf = Buffer.from(normalizedCode, 'utf8');
      if (expectedBuf.length === codeBuf.length && timingSafeEqual(expectedBuf, codeBuf)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get current TOTP code (for testing)
   */
  getCurrentTotpCode(secret: string): string {
    return generateTotpCode(secret);
  }

  // ==========================================
  // SMS OTP Methods
  // ==========================================

  /**
   * Generate and send SMS OTP
   *
   * Note: This is a placeholder. In production, integrate with
   * Twilio, AWS SNS, or another SMS provider.
   */
  async sendSmsOtp(
    phone: string,
    userId: string
  ): Promise<{ success: boolean; challengeId: string; error?: string }> {
    // Generate 6-digit OTP
    const otp = this.generateNumericOtp(6);
    const challengeId = this.generateChallengeId();

    // Store challenge
    const challenge: MfaChallenge = {
      id: challengeId,
      userId,
      method: 'sms',
      codeHash: this.hashCode(otp),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
    };
    challengeStore.set(challengeId, challenge);

    // Send SMS (placeholder)
    try {
      // TODO: In production, integrate with SMS provider (Twilio, AWS SNS, etc.)
      // await twilioClient.messages.create({ to: phone, body: `Your code: ${otp}` });
      // SECURITY: Never log OTP codes - this placeholder exists only for development
      if (process.env.NODE_ENV === 'development') {
        // Development only - codes visible in dev for testing
        console.debug(`[MFA-DEV] SMS challenge created for ${phone.slice(-4)}`);
      }

      return { success: true, challengeId };
    } catch (error) {
      return {
        success: false,
        challengeId,
        error: error instanceof Error ? error.message : 'Failed to send SMS',
      };
    }
  }

  // ==========================================
  // Email OTP Methods
  // ==========================================

  /**
   * Generate and send Email OTP
   *
   * Note: This is a placeholder. In production, integrate with
   * your email service (SendGrid, AWS SES, etc.)
   */
  async sendEmailOtp(
    email: string,
    userId: string
  ): Promise<{ success: boolean; challengeId: string; error?: string }> {
    // Generate 6-digit OTP
    const otp = this.generateNumericOtp(6);
    const challengeId = this.generateChallengeId();

    // Store challenge
    const challenge: MfaChallenge = {
      id: challengeId,
      userId,
      method: 'email',
      codeHash: this.hashCode(otp),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
    };
    challengeStore.set(challengeId, challenge);

    // Send Email (placeholder)
    try {
      // TODO: In production, integrate with email provider (SendGrid, AWS SES, etc.)
      // await emailService.send({ to: email, subject: 'Verification Code', body: `Your code: ${otp}` });
      // SECURITY: Never log OTP codes - this placeholder exists only for development
      if (process.env.NODE_ENV === 'development') {
        // Development only - mask email for privacy
        const maskedEmail = email.replace(/^(.{2})[^@]*(@.*)$/, '$1***$2');
        console.debug(`[MFA-DEV] Email challenge created for ${maskedEmail}`);
      }

      return { success: true, challengeId };
    } catch (error) {
      return {
        success: false,
        challengeId,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  // ==========================================
  // Challenge Verification
  // ==========================================

  /**
   * Create an MFA challenge for a user
   */
  createChallenge(userId: string, method: MfaMethod): MfaChallenge {
    const challengeId = this.generateChallengeId();

    const challenge: MfaChallenge = {
      id: challengeId,
      userId,
      method,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
    };

    challengeStore.set(challengeId, challenge);
    return challenge;
  }

  /**
   * Validate an MFA code against the challenge method, returning whether it is valid.
   * Side effect: may mutate userMfaSettings.backupCodes when a backup code is consumed.
   */
  private validateChallengeCode(
    challenge: MfaChallenge,
    normalizedCode: string,
    userMfaSettings?: MfaUserSettings
  ): boolean {
    switch (challenge.method) {
      case 'totp':
        return userMfaSettings?.totpSecret
          ? this.verifyTotp(userMfaSettings.totpSecret, normalizedCode)
          : false;

      case 'sms':
      case 'email':
        return challenge.codeHash ? this.verifyCodeHash(normalizedCode, challenge.codeHash) : false;

      case 'backup': {
        if (!userMfaSettings?.backupCodes) return false;
        const result = this.verifyBackupCode(normalizedCode, userMfaSettings.backupCodes);
        if (result.valid && result.updatedCodes) {
          userMfaSettings.backupCodes = result.updatedCodes;
        }
        return result.valid;
      }
      default:
        return false;
    }
  }

  /**
   * Verify MFA challenge
   *
   * @param challengeId - The challenge ID
   * @param code - User-provided code
   * @param userMfaSettings - User's MFA settings
   * @returns Object indicating success/failure
   */
  async verifyChallenge(
    challengeId: string,
    code: string,
    userMfaSettings?: MfaUserSettings
  ): Promise<{ success: boolean; error?: string }> {
    const challenge = challengeStore.get(challengeId);

    if (!challenge) {
      return { success: false, error: 'Challenge not found or expired' };
    }

    // Check expiration
    if (new Date() > challenge.expiresAt) {
      challengeStore.delete(challengeId);
      return { success: false, error: 'Challenge expired' };
    }

    // Check attempts
    if (challenge.attempts >= challenge.maxAttempts) {
      challengeStore.delete(challengeId);
      return { success: false, error: 'Too many failed attempts' };
    }

    // Increment attempts
    challenge.attempts++;

    const normalizedCode = code.replaceAll(/\s/g, '').toUpperCase();
    // Backup codes are consumed ATOMICALLY + durably in the database when a DB and
    // userId are available — preventing reuse after cache eviction and the concurrent
    // double-spend race (RACE-RBAC-M1). Other methods (totp/sms/email) and DB-less
    // callers fall back to the in-memory validator (unchanged behaviour).
    const isValid =
      challenge.method === 'backup' && this.prisma && userMfaSettings?.userId
        ? await this.consumeBackupCode(userMfaSettings.userId, normalizedCode)
        : this.validateChallengeCode(challenge, normalizedCode, userMfaSettings);

    if (isValid) {
      challengeStore.delete(challengeId);
      return { success: true };
    }

    // Check if max attempts reached
    if (challenge.attempts >= challenge.maxAttempts) {
      challengeStore.delete(challengeId);
      return { success: false, error: 'Too many failed attempts' };
    }

    return {
      success: false,
      error: `Invalid code. ${challenge.maxAttempts - challenge.attempts} attempts remaining.`,
    };
  }

  /**
   * Get challenge info (without sensitive data)
   */
  getChallengeInfo(challengeId: string): {
    exists: boolean;
    method?: MfaMethod;
    expiresAt?: Date;
    attemptsRemaining?: number;
  } {
    const challenge = challengeStore.get(challengeId);

    if (!challenge || new Date() > challenge.expiresAt) {
      return { exists: false };
    }

    return {
      exists: true,
      method: challenge.method,
      expiresAt: challenge.expiresAt,
      attemptsRemaining: challenge.maxAttempts - challenge.attempts,
    };
  }

  // ==========================================
  // Backup Codes
  // ==========================================

  /**
   * Generate backup codes
   *
   * @param count - Number of codes to generate (default 8)
   * @returns Array of backup codes
   */
  generateBackupCodes(count: number = 8): BackupCodesResult {
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      // Generate 10-character alphanumeric code
      const code = randomBytes(5).toString('hex').toUpperCase();
      codes.push(code);
    }

    return {
      codes,
      generatedAt: new Date(),
    };
  }

  /**
   * Hash backup codes for storage
   */
  hashBackupCodes(codes: string[]): string[] {
    return codes.map((code) => this.hashCode(code.toUpperCase()));
  }

  /**
   * Verify a backup code
   *
   * @param code - User-provided code
   * @param hashedCodes - Array of hashed backup codes
   * @returns Object with validation result and updated codes (with used code removed)
   */
  verifyBackupCode(
    code: string,
    hashedCodes: string[]
  ): { valid: boolean; updatedCodes?: string[] } {
    const normalizedCode = code.replaceAll(/\s/g, '').toUpperCase();
    const codeHash = this.hashCode(normalizedCode);

    const index = hashedCodes.indexOf(codeHash);

    if (index === -1) {
      return { valid: false };
    }

    // Remove used code
    const updatedCodes = [...hashedCodes];
    updatedCodes.splice(index, 1);

    return { valid: true, updatedCodes };
  }

  /**
   * Atomically consume a backup code in the database (RACE-RBAC-M1).
   *
   * Removes the code's hash from `user_mfa_settings.backupCodes` ONLY if present,
   * in a single guarded UPDATE. Under READ COMMITTED two concurrent attempts with
   * the same code can never both succeed: the second UPDATE waits on the row lock
   * held by the first, then re-evaluates its `= ANY(...)` guard against the
   * already-updated row (code gone) and affects 0 rows. Durable — survives cache
   * eviction / process restart, unlike the previous in-memory splice.
   *
   * Parameterised raw SQL is used deliberately: atomic array-element removal
   * guarded by a presence check is not expressible through Prisma's typed array
   * API. The `${...}` interpolations are bound parameters, not string concat.
   *
   * @returns true iff THIS call consumed the code.
   */
  async consumeBackupCode(userId: string, code: string): Promise<boolean> {
    if (!this.prisma) return false;
    const codeHash = this.hashCode(code.replaceAll(/\s/g, '').toUpperCase());
    try {
      const affected = await this.prisma.$executeRaw`
        UPDATE "user_mfa_settings"
        SET "backupCodes" = array_remove("backupCodes", ${codeHash})
        WHERE "userId" = ${userId} AND ${codeHash} = ANY("backupCodes")
      `;
      if (affected > 0) {
        // Drop any cached settings that still list the now-consumed code.
        mfaSettingsCache.delete(userId);
        return true;
      }
      return false;
    } catch {
      // Table missing / DB unavailable: behave as "not consumed" (never crash auth).
      return false;
    }
  }

  // ==========================================
  // User MFA Settings
  // ==========================================

  /**
   * Check if user has MFA enabled
   */
  async isUserMfaEnabled(userId: string): Promise<boolean> {
    const settings = await this.getUserMfaSettings(userId);
    return settings?.totpEnabled || settings?.smsEnabled || settings?.emailEnabled || false;
  }

  /**
   * Get available MFA methods for user
   */
  async getAvailableMfaMethods(userId: string): Promise<MfaMethod[]> {
    const settings = await this.getUserMfaSettings(userId);
    const methods: MfaMethod[] = [];

    if (settings?.totpEnabled) methods.push('totp');
    if (settings?.smsEnabled) methods.push('sms');
    if (settings?.emailEnabled) methods.push('email');
    if (settings?.backupCodes && settings.backupCodes.length > 0) methods.push('backup');

    return methods;
  }

  /**
   * Get user MFA settings
   */
  async getUserMfaSettings(userId: string): Promise<MfaUserSettings | null> {
    // Check cache first
    const cached = mfaSettingsCache.get(userId);
    if (cached) return cached;

    // Query database
    if (this.prisma) {
      try {
        const dbSettings = await (this.prisma as any).userMfaSettings.findUnique({
          where: { userId },
        });
        if (dbSettings) {
          const settings: MfaUserSettings = {
            userId: dbSettings.userId,
            totpEnabled: dbSettings.totpEnabled,
            totpSecret: dbSettings.totpSecret ?? undefined,
            smsEnabled: dbSettings.smsEnabled,
            smsPhone: dbSettings.smsPhone ?? undefined,
            emailEnabled: dbSettings.emailEnabled,
            backupCodes: dbSettings.backupCodes ?? undefined,
            lastUsedAt: dbSettings.lastVerifiedAt ?? undefined,
          };
          mfaSettingsCache.set(userId, settings);
          return settings;
        }
      } catch {
        // Fall through to null if table doesn't exist yet
      }
    }

    return null;
  }

  /**
   * Save user MFA settings
   */
  async saveUserMfaSettings(settings: MfaUserSettings, tenantId?: string): Promise<void> {
    // Update cache
    mfaSettingsCache.set(settings.userId, settings);

    // Invalidate and re-cache to ensure freshness
    // Save to database
    if (this.prisma) {
      try {
        await (this.prisma as any).userMfaSettings.upsert({
          where: { userId: settings.userId },
          create: {
            userId: settings.userId,
            tenantId: tenantId || settings.userId,
            totpEnabled: settings.totpEnabled,
            totpSecret: settings.totpSecret ?? null,
            smsEnabled: settings.smsEnabled,
            smsPhone: settings.smsPhone ?? null,
            emailEnabled: settings.emailEnabled,
            backupCodes: settings.backupCodes ?? [],
            enabledAt:
              settings.totpEnabled || settings.smsEnabled || settings.emailEnabled
                ? new Date()
                : null,
            lastVerifiedAt: settings.lastUsedAt ?? null,
          },
          update: {
            totpEnabled: settings.totpEnabled,
            totpSecret: settings.totpSecret ?? null,
            smsEnabled: settings.smsEnabled,
            smsPhone: settings.smsPhone ?? null,
            emailEnabled: settings.emailEnabled,
            backupCodes: settings.backupCodes ?? [],
            enabledAt:
              settings.totpEnabled || settings.smsEnabled || settings.emailEnabled
                ? new Date()
                : null,
            lastVerifiedAt: settings.lastUsedAt ?? null,
          },
        });
      } catch {
        // Log but don't throw - cache still updated
        console.error('[MFA] Failed to persist settings to database');
      }
    }
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  /**
   * Generate a random challenge ID
   */
  private generateChallengeId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Generate numeric OTP
   */
  private generateNumericOtp(digits: number): string {
    const max = Math.pow(10, digits);
    const randomNumber = randomInt(max);
    return randomNumber.toString().padStart(digits, '0');
  }

  /**
   * Hash a code for storage/comparison
   */
  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /**
   * Verify a code against a hash
   */
  private verifyCodeHash(code: string, hash: string): boolean {
    const codeHash = this.hashCode(code);
    return codeHash === hash;
  }

  // ==========================================
  // Cleanup
  // ==========================================

  /**
   * Clear expired challenges
   */
  cleanupExpiredChallenges(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [id, challenge] of challengeStore.entries()) {
      if (now > challenge.expiresAt) {
        challengeStore.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clear all data (for testing)
   */
  clearAll(): void {
    challengeStore.clear();
    mfaSettingsCache.clear();
  }
}

// ============================================
// Singleton and Exports
// ============================================

let mfaServiceInstance: MfaService | null = null;

/**
 * Get MFA service instance
 */
export function getMfaService(prisma?: PrismaClient, issuer?: string): MfaService {
  if (!mfaServiceInstance || prisma) {
    mfaServiceInstance = new MfaService(prisma, issuer);
  }
  return mfaServiceInstance;
}

/**
 * Reset MFA service (for testing)
 */
export function resetMfaService(): void {
  if (mfaServiceInstance) {
    mfaServiceInstance.clearAll();
  }
  mfaServiceInstance = null;
}
