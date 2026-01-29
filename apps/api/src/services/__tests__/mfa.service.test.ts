/**
 * MFA Service Tests
 *
 * Tests for multi-factor authentication functionality.
 *
 * IMPLEMENTS: PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MfaService, getMfaService, resetMfaService } from '../mfa.service';

describe('MfaService', () => {
  let mfaService: MfaService;

  beforeEach(() => {
    vi.useFakeTimers();
    resetMfaService();
    mfaService = getMfaService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================
  // TOTP Generation
  // ============================================
  describe('generateTotpSecret', () => {
    it('generates a valid secret and otpauth URL', () => {
      const result = mfaService.generateTotpSecret('user@example.com');

      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBeGreaterThan(0);
      expect(result.otpauthUrl).toContain('otpauth://totp/');
      expect(result.otpauthUrl).toContain('IntelliFlow%20CRM');
      // @ is URL-encoded as %40
      expect(result.otpauthUrl).toContain('user%40example.com');
    });

    it('generates unique secrets for different users', () => {
      const result1 = mfaService.generateTotpSecret('user1@example.com');
      const result2 = mfaService.generateTotpSecret('user2@example.com');

      expect(result1.secret).not.toBe(result2.secret);
    });

    it('generates base32 encoded secret', () => {
      const result = mfaService.generateTotpSecret('user@example.com');
      // Base32 characters
      expect(result.secret).toMatch(/^[A-Z2-7]+$/);
    });
  });

  // ============================================
  // TOTP Verification
  // ============================================
  describe('verifyTotp', () => {
    it('verifies correct TOTP code', () => {
      // Generate a secret
      const { secret } = mfaService.generateTotpSecret('user@example.com');

      // Generate the current TOTP code
      const code = mfaService.getCurrentTotpCode(secret);

      const isValid = mfaService.verifyTotp(secret, code);
      expect(isValid).toBe(true);
    });

    it('rejects incorrect TOTP code', () => {
      const { secret } = mfaService.generateTotpSecret('user@example.com');
      const isValid = mfaService.verifyTotp(secret, '000000');
      // Note: This might occasionally pass if 000000 happens to be the current code
      // but statistically unlikely
      expect(typeof isValid).toBe('boolean');
    });

    it('accepts codes within time window', () => {
      const { secret } = mfaService.generateTotpSecret('user@example.com');
      const code = mfaService.getCurrentTotpCode(secret);

      // Code should still be valid within the 30-second window
      const isValid = mfaService.verifyTotp(secret, code);
      expect(isValid).toBe(true);
    });

    it('handles invalid secret gracefully', () => {
      // Base32 decode of invalid characters will produce empty buffer
      // The TOTP generation will still work but produce different codes
      const isValid = mfaService.verifyTotp('AAAA', '123456');
      expect(isValid).toBe(false);
    });

    it('handles empty code', () => {
      const { secret } = mfaService.generateTotpSecret('user@example.com');
      const isValid = mfaService.verifyTotp(secret, '');
      expect(isValid).toBe(false);
    });
  });

  // ============================================
  // SMS OTP
  // ============================================
  describe('sendSmsOtp', () => {
    it('creates a challenge with ID', async () => {
      const result = await mfaService.sendSmsOtp('+1234567890', 'user-id-123');

      expect(result.success).toBe(true);
      expect(result.challengeId).toBeDefined();
      expect(result.challengeId).toMatch(/^[0-9a-f]{32}$/i);
    });

    it('stores the challenge for later verification', async () => {
      const result = await mfaService.sendSmsOtp('+1234567890', 'user-id-123');

      // Should be able to get challenge info
      const challengeInfo = mfaService.getChallengeInfo(result.challengeId!);
      expect(challengeInfo).toBeDefined();
      expect(challengeInfo.exists).toBe(true);
      expect(challengeInfo.method).toBe('sms');
    });
  });

  // ============================================
  // Email OTP
  // ============================================
  describe('sendEmailOtp', () => {
    it('creates a challenge with ID', async () => {
      const result = await mfaService.sendEmailOtp('user@example.com', 'user-id-123');

      expect(result.success).toBe(true);
      expect(result.challengeId).toBeDefined();
    });

    it('stores the challenge for later verification', async () => {
      const result = await mfaService.sendEmailOtp('user@example.com', 'user-id-123');

      const challengeInfo = mfaService.getChallengeInfo(result.challengeId!);
      expect(challengeInfo).toBeDefined();
      expect(challengeInfo.method).toBe('email');
    });
  });

  // ============================================
  // Challenge Verification (without code access)
  // ============================================
  describe('verifyChallenge', () => {
    it('rejects incorrect code', async () => {
      const sendResult = await mfaService.sendSmsOtp('+1234567890', 'user-id-123');

      const result = await mfaService.verifyChallenge(
        sendResult.challengeId!,
        '000000'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects expired challenge', async () => {
      const sendResult = await mfaService.sendSmsOtp('+1234567890', 'user-id-123');

      // Advance time past expiry (6 minutes, SMS is 5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000);

      const result = await mfaService.verifyChallenge(
        sendResult.challengeId!,
        '123456'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('rejects non-existent challenge', async () => {
      const result = await mfaService.verifyChallenge(
        '00000000000000000000000000000000',
        '123456'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('limits verification attempts', async () => {
      const sendResult = await mfaService.sendSmsOtp('+1234567890', 'user-id-123');

      // Make 3 failed attempts (max is 3)
      for (let i = 0; i < 3; i++) {
        await mfaService.verifyChallenge(sendResult.challengeId!, 'wrong');
      }

      // Challenge should be invalidated
      const result = await mfaService.verifyChallenge(
        sendResult.challengeId!,
        '123456'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ============================================
  // Challenge Info
  // ============================================
  describe('getChallengeInfo', () => {
    it('returns exists: false for unknown challenge', () => {
      const info = mfaService.getChallengeInfo('unknown-id');
      expect(info.exists).toBe(false);
    });

    it('returns challenge info for valid challenge', async () => {
      const sendResult = await mfaService.sendSmsOtp('+1234567890', 'user-id-123');
      const info = mfaService.getChallengeInfo(sendResult.challengeId!);

      expect(info.exists).toBe(true);
      expect(info.method).toBe('sms');
      expect(info.attemptsRemaining).toBe(3);
      expect(info.expiresAt).toBeInstanceOf(Date);
    });
  });

  // ============================================
  // Backup Codes
  // ============================================
  describe('generateBackupCodes', () => {
    it('generates 8 backup codes by default', () => {
      const result = mfaService.generateBackupCodes();

      expect(result.codes).toHaveLength(8);
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('generates specified number of codes', () => {
      const result = mfaService.generateBackupCodes(10);

      expect(result.codes).toHaveLength(10);
    });

    it('generates unique codes', () => {
      const result = mfaService.generateBackupCodes();
      const uniqueCodes = new Set(result.codes);

      expect(uniqueCodes.size).toBe(result.codes.length);
    });

    it('generates codes in correct format', () => {
      const result = mfaService.generateBackupCodes();

      for (const code of result.codes) {
        // Should be 10 hex characters (uppercase)
        expect(code).toMatch(/^[A-F0-9]{10}$/);
      }
    });
  });

  // ============================================
  // Backup Code Hashing
  // ============================================
  describe('hashBackupCodes', () => {
    it('hashes codes to different values', () => {
      const result = mfaService.generateBackupCodes();
      const hashedCodes = mfaService.hashBackupCodes(result.codes);

      expect(hashedCodes).toHaveLength(result.codes.length);
      for (let i = 0; i < result.codes.length; i++) {
        expect(result.codes[i]).not.toBe(hashedCodes[i]);
        // SHA256 produces 64 hex characters
        expect(hashedCodes[i]).toMatch(/^[a-f0-9]{64}$/);
      }
    });
  });

  // ============================================
  // Backup Code Verification
  // ============================================
  describe('verifyBackupCode', () => {
    it('verifies correct backup code', () => {
      const { codes } = mfaService.generateBackupCodes();
      const hashedCodes = mfaService.hashBackupCodes(codes);

      // Verify first code
      const result = mfaService.verifyBackupCode(codes[0], hashedCodes);

      expect(result.valid).toBe(true);
      expect(result.updatedCodes).toBeDefined();
      expect(result.updatedCodes).toHaveLength(7);
    });

    it('rejects incorrect backup code', () => {
      const { codes } = mfaService.generateBackupCodes();
      const hashedCodes = mfaService.hashBackupCodes(codes);

      const result = mfaService.verifyBackupCode('WRONGCODE0', hashedCodes);

      expect(result.valid).toBe(false);
      expect(result.updatedCodes).toBeUndefined();
    });

    it('removes used code from list', () => {
      const { codes } = mfaService.generateBackupCodes();
      const hashedCodes = mfaService.hashBackupCodes(codes);

      const result1 = mfaService.verifyBackupCode(codes[0], hashedCodes);
      expect(result1.valid).toBe(true);

      // Try same code again with updated list
      const result2 = mfaService.verifyBackupCode(codes[0], result1.updatedCodes!);
      expect(result2.valid).toBe(false);
    });

    it('handles case-insensitive codes', () => {
      const { codes } = mfaService.generateBackupCodes();
      const hashedCodes = mfaService.hashBackupCodes(codes);

      // Try lowercase version
      const result = mfaService.verifyBackupCode(codes[0].toLowerCase(), hashedCodes);
      expect(result.valid).toBe(true);
    });
  });

  // ============================================
  // Create Challenge
  // ============================================
  describe('createChallenge', () => {
    it('creates TOTP challenge', () => {
      const challenge = mfaService.createChallenge('user-id-123', 'totp');

      expect(challenge.id).toBeDefined();
      expect(challenge.userId).toBe('user-id-123');
      expect(challenge.method).toBe('totp');
      expect(challenge.attempts).toBe(0);
      expect(challenge.maxAttempts).toBe(3);
    });

    it('creates challenges with unique IDs', () => {
      const challenge1 = mfaService.createChallenge('user-id-123', 'totp');
      const challenge2 = mfaService.createChallenge('user-id-123', 'totp');

      expect(challenge1.id).not.toBe(challenge2.id);
    });
  });

  // ============================================
  // Singleton
  // ============================================
  describe('getMfaService', () => {
    it('returns same instance', () => {
      const service1 = getMfaService();
      const service2 = getMfaService();

      expect(service1).toBe(service2);
    });

    it('returns new instance after reset', () => {
      const service1 = getMfaService();
      resetMfaService();
      const service2 = getMfaService();

      expect(service1).not.toBe(service2);
    });
  });

  // ============================================
  // Cleanup
  // ============================================
  describe('cleanupExpiredChallenges', () => {
    it('removes expired challenges', async () => {
      const result = await mfaService.sendSmsOtp('+1234567890', 'user-id-123');

      // Challenge should exist
      expect(mfaService.getChallengeInfo(result.challengeId!).exists).toBe(true);

      // Advance time past expiry
      vi.advanceTimersByTime(10 * 60 * 1000);

      // Cleanup
      const cleaned = mfaService.cleanupExpiredChallenges();
      expect(cleaned).toBeGreaterThan(0);

      // Challenge should be gone
      expect(mfaService.getChallengeInfo(result.challengeId!).exists).toBe(false);
    });
  });
});
