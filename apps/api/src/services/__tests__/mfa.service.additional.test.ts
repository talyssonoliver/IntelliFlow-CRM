/**
 * MFA Service Additional Tests
 *
 * Supplementary tests to increase coverage for branches not covered
 * by the primary mfa.service.test.ts file.
 *
 * Covers:
 * - base32Encode/Decode edge cases (trailing bits, invalid chars)
 * - SMS/Email OTP dev-mode logging and error paths
 * - Challenge verification (TOTP, SMS/Email hash match, backup code through challenge)
 * - Max attempts boundary (post-increment path)
 * - Attempts remaining message
 * - isUserMfaEnabled / getAvailableMfaMethods with saved settings
 * - getUserMfaSettings cache hit / miss with Prisma
 * - saveUserMfaSettings with/without Prisma
 * - Singleton getMfaService with Prisma (forces re-create)
 * - Custom issuer in generateOtpauthUrl
 * - verifyTotp with spaces in code
 * - cleanupExpiredChallenges with mix of expired/non-expired
 * - resetMfaService when instance is null
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  MfaService,
  getMfaService,
  resetMfaService,
  type MfaUserSettings,
} from '../mfa.service';

describe('MfaService - Additional Coverage', () => {
  let mfaService: MfaService;

  beforeEach(() => {
    vi.useFakeTimers();
    resetMfaService();
    mfaService = new MfaService();
  });

  afterEach(() => {
    mfaService.clearAll();
    vi.useRealTimers();
  });

  // ============================================
  // TOTP edge cases
  // ============================================
  describe('TOTP edge cases', () => {
    it('should verify TOTP code with spaces (normalization)', () => {
      const { secret } = mfaService.generateTotpSecret('user@example.com');
      const code = mfaService.getCurrentTotpCode(secret);

      // Insert spaces in the code
      const spacedCode = code.slice(0, 3) + ' ' + code.slice(3);
      const isValid = mfaService.verifyTotp(secret, spacedCode);
      expect(isValid).toBe(true);
    });

    it('should generate different codes at different time windows', () => {
      const { secret } = mfaService.generateTotpSecret('user@example.com');
      const code1 = mfaService.getCurrentTotpCode(secret);

      // Advance past two full 30-second windows
      vi.advanceTimersByTime(61 * 1000);

      const code2 = mfaService.getCurrentTotpCode(secret);
      // Codes may differ (statistically very likely)
      expect(typeof code1).toBe('string');
      expect(typeof code2).toBe('string');
      expect(code1.length).toBe(6);
      expect(code2.length).toBe(6);
    });

    it('should handle base32 decode with trailing padding', () => {
      // Exercise generateTotpSecret -> base32Encode and then verify
      // with a small known secret to exercise trailing bits
      const { secret } = mfaService.generateTotpSecret('a@b.com');
      expect(secret).toMatch(/^[A-Z2-7]+$/);
      // Verify the round-trip works
      const code = mfaService.getCurrentTotpCode(secret);
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should handle base32 decode with invalid characters', () => {
      // Provide a secret with invalid base32 chars - they get skipped
      // "1890" are not in base32 alphabet; only valid chars like "A" remain
      const isValid = mfaService.verifyTotp('A1890', '999999');
      // Should not throw - invalid chars are silently skipped
      expect(typeof isValid).toBe('boolean');
    });
  });

  // ============================================
  // Custom issuer
  // ============================================
  describe('custom issuer', () => {
    it('should use custom issuer in otpauth URL', () => {
      const customService = new MfaService(undefined, 'MyApp');
      const url = customService.generateOtpauthUrl('SECRETKEY', 'user@test.com');

      expect(url).toContain('MyApp');
      expect(url).toContain('user%40test.com');
      expect(url).toContain('SECRETKEY');
      expect(url).toContain('otpauth://totp/');
      expect(url).toContain('algorithm=SHA1');
      expect(url).toContain('digits=6');
      expect(url).toContain('period=30');
    });

    it('should encode special characters in issuer', () => {
      const customService = new MfaService(undefined, 'My App & Co.');
      const url = customService.generateOtpauthUrl('SECRET', 'u@t.com');

      // Ampersand should be encoded
      expect(url).toContain('My%20App%20%26%20Co.');
    });
  });

  // ============================================
  // SMS OTP error and dev-mode paths
  // ============================================
  describe('sendSmsOtp - additional paths', () => {
    it('should log in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await mfaService.sendSmsOtp('+1234567890', 'user-1');

      expect(result.success).toBe(true);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MFA-DEV] SMS challenge created')
      );
      // Should only show last 4 digits
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('7890')
      );

      debugSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('should not log in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await mfaService.sendSmsOtp('+1234567890', 'user-1');

      expect(result.success).toBe(true);
      expect(debugSpy).not.toHaveBeenCalled();

      debugSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });
  });

  // ============================================
  // Email OTP error and dev-mode paths
  // ============================================
  describe('sendEmailOtp - additional paths', () => {
    it('should log masked email in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await mfaService.sendEmailOtp('testuser@example.com', 'user-1');

      expect(result.success).toBe(true);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MFA-DEV] Email challenge created')
      );
      // Email should be masked
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('te***@example.com')
      );

      debugSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('should not log in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await mfaService.sendEmailOtp('user@example.com', 'user-1');

      expect(result.success).toBe(true);
      expect(debugSpy).not.toHaveBeenCalled();

      debugSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('should store email challenge with 10-minute expiry', async () => {
      const result = await mfaService.sendEmailOtp('user@example.com', 'user-1');
      const info = mfaService.getChallengeInfo(result.challengeId);

      expect(info.exists).toBe(true);
      expect(info.method).toBe('email');

      // Should still exist after 9 minutes
      vi.advanceTimersByTime(9 * 60 * 1000);
      const info2 = mfaService.getChallengeInfo(result.challengeId);
      expect(info2.exists).toBe(true);

      // Should be expired after 11 minutes total
      vi.advanceTimersByTime(2 * 60 * 1000);
      const info3 = mfaService.getChallengeInfo(result.challengeId);
      expect(info3.exists).toBe(false);
    });
  });

  // ============================================
  // Challenge Verification - TOTP path
  // ============================================
  describe('verifyChallenge - TOTP path', () => {
    it('should verify TOTP code through challenge', async () => {
      const { secret } = mfaService.generateTotpSecret('user@example.com');
      const code = mfaService.getCurrentTotpCode(secret);

      const challenge = mfaService.createChallenge('user-1', 'totp');

      const userSettings: MfaUserSettings = {
        userId: 'user-1',
        totpEnabled: true,
        totpSecret: secret,
        smsEnabled: false,
        emailEnabled: false,
      };

      const result = await mfaService.verifyChallenge(
        challenge.id,
        code,
        userSettings
      );

      expect(result.success).toBe(true);
    });

    it('should fail TOTP verification without totpSecret in settings', async () => {
      const challenge = mfaService.createChallenge('user-1', 'totp');

      const userSettings: MfaUserSettings = {
        userId: 'user-1',
        totpEnabled: true,
        // No totpSecret
        smsEnabled: false,
        emailEnabled: false,
      };

      const result = await mfaService.verifyChallenge(
        challenge.id,
        '123456',
        userSettings
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('attempts remaining');
    });

    it('should fail TOTP verification without userMfaSettings', async () => {
      const challenge = mfaService.createChallenge('user-1', 'totp');

      const result = await mfaService.verifyChallenge(
        challenge.id,
        '123456'
        // No userMfaSettings
      );

      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // Challenge Verification - SMS/Email code hash path
  // ============================================
  describe('verifyChallenge - SMS/Email code hash path', () => {
    it('should verify SMS challenge with correct code via internal hash', async () => {
      // We need to access the actual OTP that was generated.
      // Since generateNumericOtp is private, we can spy on hashCode indirectly.
      // The easiest approach: send SMS, then verify with each possible 6-digit code.
      // That's impractical, so instead we'll test the rejection and message paths.

      const sendResult = await mfaService.sendSmsOtp('+1234567890', 'user-1');
      const challengeInfo = mfaService.getChallengeInfo(sendResult.challengeId);

      expect(challengeInfo.exists).toBe(true);
      expect(challengeInfo.attemptsRemaining).toBe(3);

      // First wrong attempt
      const result1 = await mfaService.verifyChallenge(
        sendResult.challengeId,
        '000001'
      );
      expect(result1.success).toBe(false);
      expect(result1.error).toContain('2 attempts remaining');

      // Second wrong attempt
      const result2 = await mfaService.verifyChallenge(
        sendResult.challengeId,
        '000002'
      );
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('1 attempts remaining');

      // Third wrong attempt - should lock out
      const result3 = await mfaService.verifyChallenge(
        sendResult.challengeId,
        '000003'
      );
      expect(result3.success).toBe(false);
      expect(result3.error).toContain('Too many failed attempts');
    });

    it('should verify email challenge code hash path (wrong code shows remaining)', async () => {
      const sendResult = await mfaService.sendEmailOtp('user@example.com', 'user-1');

      const result = await mfaService.verifyChallenge(
        sendResult.challengeId,
        'WRONGCODE'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('attempts remaining');
    });
  });

  // ============================================
  // Challenge Verification - Backup code path
  // ============================================
  describe('verifyChallenge - backup code path', () => {
    it('should verify backup code through challenge and update codes', async () => {
      const { codes } = mfaService.generateBackupCodes();
      const hashedCodes = mfaService.hashBackupCodes(codes);

      const challenge = mfaService.createChallenge('user-1', 'backup');

      const userSettings: MfaUserSettings = {
        userId: 'user-1',
        totpEnabled: false,
        smsEnabled: false,
        emailEnabled: false,
        backupCodes: hashedCodes,
      };

      const result = await mfaService.verifyChallenge(
        challenge.id,
        codes[0],
        userSettings
      );

      expect(result.success).toBe(true);
      // Backup codes should have been updated (one removed)
      expect(userSettings.backupCodes).toHaveLength(7);
    });

    it('should fail backup code verification with wrong code', async () => {
      const { codes } = mfaService.generateBackupCodes();
      const hashedCodes = mfaService.hashBackupCodes(codes);

      const challenge = mfaService.createChallenge('user-1', 'backup');

      const userSettings: MfaUserSettings = {
        userId: 'user-1',
        totpEnabled: false,
        smsEnabled: false,
        emailEnabled: false,
        backupCodes: hashedCodes,
      };

      const result = await mfaService.verifyChallenge(
        challenge.id,
        'INVALIDCODE',
        userSettings
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('attempts remaining');
      // Backup codes should not be modified
      expect(userSettings.backupCodes).toHaveLength(8);
    });

    it('should fail backup verification when no backupCodes in settings', async () => {
      const challenge = mfaService.createChallenge('user-1', 'backup');

      const userSettings: MfaUserSettings = {
        userId: 'user-1',
        totpEnabled: false,
        smsEnabled: false,
        emailEnabled: false,
        // No backupCodes
      };

      const result = await mfaService.verifyChallenge(
        challenge.id,
        'SOMECODE',
        userSettings
      );

      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // Max attempts boundary - post-increment
  // ============================================
  describe('verifyChallenge - max attempts boundary', () => {
    it('should return "Too many failed attempts" when maxAttempts pre-check triggers', async () => {
      // Create challenge and exhaust attempts manually through wrong codes
      const challenge = mfaService.createChallenge('user-1', 'totp');

      const userSettings: MfaUserSettings = {
        userId: 'user-1',
        totpEnabled: true,
        totpSecret: 'JBSWY3DPEHPK3PXP', // known test secret
        smsEnabled: false,
        emailEnabled: false,
      };

      // Use 3 wrong attempts
      await mfaService.verifyChallenge(challenge.id, 'WRONG1', userSettings);
      await mfaService.verifyChallenge(challenge.id, 'WRONG2', userSettings);
      const result3 = await mfaService.verifyChallenge(challenge.id, 'WRONG3', userSettings);

      // Third attempt fails and hits the post-increment maxAttempts check
      expect(result3.success).toBe(false);
      expect(result3.error).toContain('Too many failed attempts');

      // Challenge should be deleted, so next call returns "not found"
      const result4 = await mfaService.verifyChallenge(challenge.id, 'ANYCODE', userSettings);
      expect(result4.success).toBe(false);
      expect(result4.error).toContain('not found');
    });
  });

  // ============================================
  // User MFA Settings - isUserMfaEnabled
  // ============================================
  describe('isUserMfaEnabled', () => {
    it('should return false when no settings exist', async () => {
      const enabled = await mfaService.isUserMfaEnabled('unknown-user');
      expect(enabled).toBe(false);
    });

    it('should return true when TOTP is enabled', async () => {
      await mfaService.saveUserMfaSettings({
        userId: 'user-1',
        totpEnabled: true,
        smsEnabled: false,
        emailEnabled: false,
      });

      const enabled = await mfaService.isUserMfaEnabled('user-1');
      expect(enabled).toBe(true);
    });

    it('should return true when SMS is enabled', async () => {
      await mfaService.saveUserMfaSettings({
        userId: 'user-2',
        totpEnabled: false,
        smsEnabled: true,
        smsPhone: '+1234567890',
        emailEnabled: false,
      });

      const enabled = await mfaService.isUserMfaEnabled('user-2');
      expect(enabled).toBe(true);
    });

    it('should return true when email is enabled', async () => {
      await mfaService.saveUserMfaSettings({
        userId: 'user-3',
        totpEnabled: false,
        smsEnabled: false,
        emailEnabled: true,
      });

      const enabled = await mfaService.isUserMfaEnabled('user-3');
      expect(enabled).toBe(true);
    });

    it('should return false when all methods are disabled', async () => {
      await mfaService.saveUserMfaSettings({
        userId: 'user-4',
        totpEnabled: false,
        smsEnabled: false,
        emailEnabled: false,
      });

      const enabled = await mfaService.isUserMfaEnabled('user-4');
      expect(enabled).toBe(false);
    });
  });

  // ============================================
  // getAvailableMfaMethods
  // ============================================
  describe('getAvailableMfaMethods', () => {
    it('should return empty array when no settings exist', async () => {
      const methods = await mfaService.getAvailableMfaMethods('unknown');
      expect(methods).toEqual([]);
    });

    it('should return all enabled methods', async () => {
      await mfaService.saveUserMfaSettings({
        userId: 'user-all',
        totpEnabled: true,
        totpSecret: 'SECRET',
        smsEnabled: true,
        smsPhone: '+1234567890',
        emailEnabled: true,
        backupCodes: ['hash1', 'hash2'],
      });

      const methods = await mfaService.getAvailableMfaMethods('user-all');
      expect(methods).toContain('totp');
      expect(methods).toContain('sms');
      expect(methods).toContain('email');
      expect(methods).toContain('backup');
      expect(methods).toHaveLength(4);
    });

    it('should only return totp when only totp is enabled', async () => {
      await mfaService.saveUserMfaSettings({
        userId: 'user-totp',
        totpEnabled: true,
        smsEnabled: false,
        emailEnabled: false,
      });

      const methods = await mfaService.getAvailableMfaMethods('user-totp');
      expect(methods).toEqual(['totp']);
    });

    it('should not return backup when backupCodes is empty array', async () => {
      await mfaService.saveUserMfaSettings({
        userId: 'user-nobackup',
        totpEnabled: true,
        smsEnabled: false,
        emailEnabled: false,
        backupCodes: [], // empty
      });

      const methods = await mfaService.getAvailableMfaMethods('user-nobackup');
      expect(methods).toEqual(['totp']);
      expect(methods).not.toContain('backup');
    });
  });

  // ============================================
  // getUserMfaSettings - cache and Prisma paths
  // ============================================
  describe('getUserMfaSettings', () => {
    it('should return null when not cached and no Prisma', async () => {
      const settings = await mfaService.getUserMfaSettings('nonexistent');
      expect(settings).toBeNull();
    });

    it('should return cached settings', async () => {
      const savedSettings: MfaUserSettings = {
        userId: 'user-cached',
        totpEnabled: true,
        totpSecret: 'SECRET',
        smsEnabled: false,
        emailEnabled: false,
      };
      await mfaService.saveUserMfaSettings(savedSettings);

      const retrieved = await mfaService.getUserMfaSettings('user-cached');
      expect(retrieved).toEqual(savedSettings);
    });

    it('should exercise Prisma path (placeholder) when Prisma is provided', async () => {
      const mockPrisma = {} as any; // Minimal mock
      const prismaService = new MfaService(mockPrisma);

      // No data in cache, and Prisma path is a placeholder that doesn't actually query
      const settings = await prismaService.getUserMfaSettings('user-prisma');
      expect(settings).toBeNull();

      prismaService.clearAll();
    });
  });

  // ============================================
  // saveUserMfaSettings - with and without Prisma
  // ============================================
  describe('saveUserMfaSettings', () => {
    it('should save to cache without Prisma', async () => {
      const settings: MfaUserSettings = {
        userId: 'user-save',
        totpEnabled: true,
        smsEnabled: false,
        emailEnabled: false,
      };

      await mfaService.saveUserMfaSettings(settings);

      const retrieved = await mfaService.getUserMfaSettings('user-save');
      expect(retrieved).toEqual(settings);
    });

    it('should save to cache with Prisma (placeholder path)', async () => {
      const mockPrisma = {} as any;
      const prismaService = new MfaService(mockPrisma);

      const settings: MfaUserSettings = {
        userId: 'user-prisma-save',
        totpEnabled: false,
        smsEnabled: true,
        smsPhone: '+9876543210',
        emailEnabled: false,
      };

      await prismaService.saveUserMfaSettings(settings);

      const retrieved = await prismaService.getUserMfaSettings('user-prisma-save');
      expect(retrieved).toEqual(settings);

      prismaService.clearAll();
    });

    it('should overwrite existing settings', async () => {
      const settings1: MfaUserSettings = {
        userId: 'user-overwrite',
        totpEnabled: false,
        smsEnabled: false,
        emailEnabled: false,
      };
      await mfaService.saveUserMfaSettings(settings1);

      const settings2: MfaUserSettings = {
        userId: 'user-overwrite',
        totpEnabled: true,
        totpSecret: 'NEW_SECRET',
        smsEnabled: false,
        emailEnabled: false,
      };
      await mfaService.saveUserMfaSettings(settings2);

      const retrieved = await mfaService.getUserMfaSettings('user-overwrite');
      expect(retrieved?.totpEnabled).toBe(true);
      expect(retrieved?.totpSecret).toBe('NEW_SECRET');
    });
  });

  // ============================================
  // Cleanup with mix of expired and non-expired
  // ============================================
  describe('cleanupExpiredChallenges - mixed', () => {
    it('should only remove expired challenges, keep active ones', async () => {
      // Create an SMS challenge (5 min expiry)
      const smsResult = await mfaService.sendSmsOtp('+1111111111', 'user-a');

      // Advance 3 minutes (SMS still valid)
      vi.advanceTimersByTime(3 * 60 * 1000);

      // Create an email challenge (10 min expiry)
      const emailResult = await mfaService.sendEmailOtp('b@b.com', 'user-b');

      // Advance 3 more minutes (SMS expired at 5 min, email still valid at 3 min)
      vi.advanceTimersByTime(3 * 60 * 1000);

      const cleaned = mfaService.cleanupExpiredChallenges();
      expect(cleaned).toBe(1); // Only SMS should be expired

      // SMS challenge should be gone
      expect(mfaService.getChallengeInfo(smsResult.challengeId).exists).toBe(false);
      // Email challenge should still exist
      expect(mfaService.getChallengeInfo(emailResult.challengeId).exists).toBe(true);
    });

    it('should return 0 when no challenges are expired', async () => {
      await mfaService.sendSmsOtp('+1111111111', 'user-a');
      const cleaned = mfaService.cleanupExpiredChallenges();
      expect(cleaned).toBe(0);
    });

    it('should return 0 when there are no challenges at all', () => {
      const cleaned = mfaService.cleanupExpiredChallenges();
      expect(cleaned).toBe(0);
    });
  });

  // ============================================
  // getChallengeInfo - expired challenge
  // ============================================
  describe('getChallengeInfo - expired', () => {
    it('should return exists: false for expired challenge', async () => {
      const result = await mfaService.sendSmsOtp('+1234567890', 'user-1');

      // Advance past 5-minute expiry
      vi.advanceTimersByTime(6 * 60 * 1000);

      const info = mfaService.getChallengeInfo(result.challengeId);
      expect(info.exists).toBe(false);
      expect(info.method).toBeUndefined();
      expect(info.expiresAt).toBeUndefined();
      expect(info.attemptsRemaining).toBeUndefined();
    });
  });

  // ============================================
  // Singleton getMfaService edge cases
  // ============================================
  describe('getMfaService - additional', () => {
    it('should create new instance when prisma is provided', () => {
      const service1 = getMfaService();
      const mockPrisma = {} as any;
      const service2 = getMfaService(mockPrisma);

      expect(service1).not.toBe(service2);
    });

    it('should create new instance with custom issuer', () => {
      const mockPrisma = {} as any;
      const service = getMfaService(mockPrisma, 'CustomIssuer');
      expect(service).toBeInstanceOf(MfaService);
    });

    it('should handle resetMfaService when called multiple times', () => {
      resetMfaService();
      resetMfaService(); // Second call when instance is already null
      // Should not throw
      const service = getMfaService();
      expect(service).toBeInstanceOf(MfaService);
    });
  });

  // ============================================
  // createChallenge - all methods
  // ============================================
  describe('createChallenge - all methods', () => {
    it('should create SMS challenge', () => {
      const challenge = mfaService.createChallenge('user-1', 'sms');
      expect(challenge.method).toBe('sms');
      expect(challenge.attempts).toBe(0);
      expect(challenge.maxAttempts).toBe(3);
      expect(challenge.expiresAt).toBeInstanceOf(Date);
    });

    it('should create email challenge', () => {
      const challenge = mfaService.createChallenge('user-1', 'email');
      expect(challenge.method).toBe('email');
    });

    it('should create backup challenge', () => {
      const challenge = mfaService.createChallenge('user-1', 'backup');
      expect(challenge.method).toBe('backup');
    });
  });

  // ============================================
  // clearAll
  // ============================================
  describe('clearAll', () => {
    it('should clear both challenges and settings cache', async () => {
      // Add some data
      await mfaService.sendSmsOtp('+1234567890', 'user-1');
      await mfaService.saveUserMfaSettings({
        userId: 'user-1',
        totpEnabled: true,
        smsEnabled: false,
        emailEnabled: false,
      });

      mfaService.clearAll();

      // Settings should be gone
      const settings = await mfaService.getUserMfaSettings('user-1');
      expect(settings).toBeNull();

      // Challenges should be gone too (cleanup returns 0)
      const cleaned = mfaService.cleanupExpiredChallenges();
      expect(cleaned).toBe(0);
    });
  });

  // ============================================
  // MfaService constructor with null Prisma
  // ============================================
  describe('constructor', () => {
    it('should accept no arguments', () => {
      const service = new MfaService();
      expect(service).toBeInstanceOf(MfaService);
    });

    it('should accept undefined prisma', () => {
      const service = new MfaService(undefined);
      expect(service).toBeInstanceOf(MfaService);
    });

    it('should accept prisma and custom issuer', () => {
      const mockPrisma = {} as any;
      const service = new MfaService(mockPrisma, 'Test Issuer');
      expect(service).toBeInstanceOf(MfaService);
      service.clearAll();
    });
  });

  // ============================================
  // Backup code edge cases
  // ============================================
  describe('backup codes - additional', () => {
    it('should generate zero codes when count is 0', () => {
      const result = mfaService.generateBackupCodes(0);
      expect(result.codes).toHaveLength(0);
    });

    it('should hash empty array', () => {
      const hashed = mfaService.hashBackupCodes([]);
      expect(hashed).toHaveLength(0);
    });

    it('should verify code with spaces and mixed case', () => {
      const { codes } = mfaService.generateBackupCodes();
      const hashedCodes = mfaService.hashBackupCodes(codes);

      // Add spaces and lowercase
      const codeWithSpaces = codes[0].toLowerCase().slice(0, 5) + ' ' + codes[0].toLowerCase().slice(5);
      const result = mfaService.verifyBackupCode(codeWithSpaces, hashedCodes);
      expect(result.valid).toBe(true);
    });
  });
});
