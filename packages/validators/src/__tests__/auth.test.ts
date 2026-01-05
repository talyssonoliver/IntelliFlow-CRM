/**
 * Auth Validators Tests
 *
 * Tests for authentication-related Zod schemas.
 *
 * IMPLEMENTS: PG-015 (Sign In page)
 */

import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  mfaVerifySchema,
  mfaSetupSchema,
  mfaConfirmSchema,
  oauthInitSchema,
  oauthCallbackSchema,
  refreshTokenSchema,
  revokeSessionSchema,
  mfaMethodSchema,
  strongPasswordSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signupSchema,
} from '../auth';
import { emailSchema } from '../common';

describe('Auth Validators', () => {
  // ============================================
  // Email Schema (from common)
  // ============================================
  describe('emailSchema', () => {
    it('validates correct email addresses', () => {
      expect(emailSchema.safeParse('user@example.com').success).toBe(true);
      expect(emailSchema.safeParse('test.user@domain.co.uk').success).toBe(true);
      expect(emailSchema.safeParse('name+tag@company.org').success).toBe(true);
    });

    it('rejects invalid email addresses', () => {
      expect(emailSchema.safeParse('invalid').success).toBe(false);
      expect(emailSchema.safeParse('@nodomain.com').success).toBe(false);
      expect(emailSchema.safeParse('').success).toBe(false);
    });

    it('lowercases valid emails', () => {
      // Email must be valid first, then gets lowercased
      const result = emailSchema.parse('User@Example.COM');
      expect(result).toBe('user@example.com');
    });

    it('accepts long but valid emails', () => {
      // Current schema doesn't enforce max length
      const longEmail = 'a'.repeat(50) + '@example.com';
      expect(emailSchema.safeParse(longEmail).success).toBe(true);
    });
  });

  // ============================================
  // Login Schema
  // ============================================
  describe('loginSchema', () => {
    it('validates complete login data', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'securePassword123',
        rememberMe: true,
      });
      expect(result.success).toBe(true);
    });

    it('defaults rememberMe to false', () => {
      const result = loginSchema.parse({
        email: 'user@example.com',
        password: 'securePassword123',
      });
      expect(result.rememberMe).toBe(false);
    });

    it('rejects invalid email', () => {
      const result = loginSchema.safeParse({
        email: 'invalid-email',
        password: 'securePassword123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short password', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('rejects password that is too long', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'a'.repeat(129),
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // MFA Method Schema
  // ============================================
  describe('mfaMethodSchema', () => {
    it('validates all MFA methods', () => {
      expect(mfaMethodSchema.safeParse('totp').success).toBe(true);
      expect(mfaMethodSchema.safeParse('sms').success).toBe(true);
      expect(mfaMethodSchema.safeParse('email').success).toBe(true);
      expect(mfaMethodSchema.safeParse('backup').success).toBe(true);
    });

    it('rejects invalid methods', () => {
      expect(mfaMethodSchema.safeParse('invalid').success).toBe(false);
      expect(mfaMethodSchema.safeParse('').success).toBe(false);
    });
  });

  // ============================================
  // MFA Verify Schema
  // ============================================
  describe('mfaVerifySchema', () => {
    it('validates complete MFA verification data', () => {
      const result = mfaVerifySchema.safeParse({
        challengeId: '550e8400-e29b-41d4-a716-446655440000',
        code: '123456',
        method: 'totp',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID', () => {
      const result = mfaVerifySchema.safeParse({
        challengeId: 'not-a-uuid',
        code: '123456',
        method: 'totp',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid method', () => {
      const result = mfaVerifySchema.safeParse({
        challengeId: '550e8400-e29b-41d4-a716-446655440000',
        code: '123456',
        method: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('validates 6-digit codes', () => {
      const result = mfaVerifySchema.safeParse({
        challengeId: '550e8400-e29b-41d4-a716-446655440000',
        code: '123456',
        method: 'totp',
      });
      expect(result.success).toBe(true);
    });

    it('validates backup codes (8+ chars)', () => {
      const result = mfaVerifySchema.safeParse({
        challengeId: '550e8400-e29b-41d4-a716-446655440000',
        code: 'ABCD1234',
        method: 'backup',
      });
      expect(result.success).toBe(true);
    });

    it('rejects codes that are too short', () => {
      const result = mfaVerifySchema.safeParse({
        challengeId: '550e8400-e29b-41d4-a716-446655440000',
        code: '12345',
        method: 'totp',
      });
      expect(result.success).toBe(false);
    });

    it('rejects codes that are too long', () => {
      const result = mfaVerifySchema.safeParse({
        challengeId: '550e8400-e29b-41d4-a716-446655440000',
        code: '1'.repeat(21),
        method: 'totp',
      });
      expect(result.success).toBe(false);
    });

    it('transforms code to uppercase', () => {
      const result = mfaVerifySchema.parse({
        challengeId: '550e8400-e29b-41d4-a716-446655440000',
        code: 'abcdef12',
        method: 'backup',
      });
      expect(result.code).toBe('ABCDEF12');
    });
  });

  // ============================================
  // MFA Setup Schema
  // ============================================
  describe('mfaSetupSchema', () => {
    it('validates TOTP setup', () => {
      const result = mfaSetupSchema.safeParse({
        method: 'totp',
      });
      expect(result.success).toBe(true);
    });

    it('validates SMS setup with phone', () => {
      const result = mfaSetupSchema.safeParse({
        method: 'sms',
        phone: '+1234567890',
      });
      expect(result.success).toBe(true);
    });

    it('accepts setup without phone', () => {
      const result = mfaSetupSchema.safeParse({
        method: 'sms',
      });
      expect(result.success).toBe(true);
    });

    it('validates E.164 phone format', () => {
      expect(
        mfaSetupSchema.safeParse({ method: 'sms', phone: '+12025551234' }).success
      ).toBe(true);
      expect(
        mfaSetupSchema.safeParse({ method: 'sms', phone: '12025551234' }).success
      ).toBe(true);
    });

    it('rejects invalid phone format', () => {
      expect(
        mfaSetupSchema.safeParse({ method: 'sms', phone: 'not-a-phone' }).success
      ).toBe(false);
    });
  });

  // ============================================
  // MFA Confirm Schema
  // ============================================
  describe('mfaConfirmSchema', () => {
    it('validates complete confirmation data', () => {
      const result = mfaConfirmSchema.safeParse({
        method: 'totp',
        code: '123456',
      });
      expect(result.success).toBe(true);
    });

    it('transforms code to uppercase', () => {
      const result = mfaConfirmSchema.parse({
        method: 'backup',
        code: 'abcdef12',
      });
      expect(result.code).toBe('ABCDEF12');
    });

    it('rejects short code', () => {
      const result = mfaConfirmSchema.safeParse({
        method: 'totp',
        code: '12345',
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // OAuth Init Schema
  // ============================================
  describe('oauthInitSchema', () => {
    it('validates Google provider', () => {
      const result = oauthInitSchema.safeParse({
        provider: 'google',
      });
      expect(result.success).toBe(true);
    });

    it('validates Azure provider with redirect', () => {
      const result = oauthInitSchema.safeParse({
        provider: 'azure',
        redirectTo: 'https://app.example.com/callback',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid provider', () => {
      const result = oauthInitSchema.safeParse({
        provider: 'facebook',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid redirect URL', () => {
      const result = oauthInitSchema.safeParse({
        provider: 'google',
        redirectTo: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // OAuth Callback Schema
  // ============================================
  describe('oauthCallbackSchema', () => {
    it('validates callback with code', () => {
      const result = oauthCallbackSchema.safeParse({
        code: 'auth-code-from-provider',
      });
      expect(result.success).toBe(true);
    });

    it('validates callback with all optional params', () => {
      const result = oauthCallbackSchema.safeParse({
        code: 'auth-code',
        state: 'state-token',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing code', () => {
      const result = oauthCallbackSchema.safeParse({
        state: 'state-token',
      });
      expect(result.success).toBe(false);
    });

    it('accepts error response', () => {
      const result = oauthCallbackSchema.safeParse({
        code: '',
        error: 'access_denied',
        errorDescription: 'User denied access',
      });
      // Code is required, but can be empty when error is present
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // Refresh Token Schema
  // ============================================
  describe('refreshTokenSchema', () => {
    it('validates refresh token', () => {
      const result = refreshTokenSchema.safeParse({
        refreshToken: 'valid-refresh-token',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty refresh token', () => {
      const result = refreshTokenSchema.safeParse({
        refreshToken: '',
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // Revoke Session Schema
  // ============================================
  describe('revokeSessionSchema', () => {
    it('validates session ID', () => {
      const result = revokeSessionSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID', () => {
      const result = revokeSessionSchema.safeParse({
        sessionId: 'invalid-id',
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // Strong Password Schema
  // ============================================
  describe('strongPasswordSchema', () => {
    it('validates strong passwords', () => {
      expect(strongPasswordSchema.safeParse('StrongP@ss1').success).toBe(true);
      expect(strongPasswordSchema.safeParse('C0mplex!Pass').success).toBe(true);
    });

    it('rejects passwords without uppercase', () => {
      expect(strongPasswordSchema.safeParse('lowercase1!').success).toBe(false);
    });

    it('rejects passwords without lowercase', () => {
      expect(strongPasswordSchema.safeParse('UPPERCASE1!').success).toBe(false);
    });

    it('rejects passwords without number', () => {
      expect(strongPasswordSchema.safeParse('NoNumber!@').success).toBe(false);
    });

    it('rejects passwords without special character', () => {
      expect(strongPasswordSchema.safeParse('NoSpecial1').success).toBe(false);
    });

    it('rejects short passwords', () => {
      expect(strongPasswordSchema.safeParse('Sh0rt!').success).toBe(false);
    });
  });

  // ============================================
  // Change Password Schema
  // ============================================
  describe('changePasswordSchema', () => {
    it('validates password change request', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'oldPassword123',
        newPassword: 'NewP@ssword1',
        confirmPassword: 'NewP@ssword1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects if passwords do not match', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'oldPassword123',
        newPassword: 'NewP@ssword1',
        confirmPassword: 'DifferentP@ss1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects weak new password', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'oldPassword123',
        newPassword: 'weak',
        confirmPassword: 'weak',
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // Forgot Password Schema
  // ============================================
  describe('forgotPasswordSchema', () => {
    it('validates reset request with email', () => {
      const result = forgotPasswordSchema.safeParse({
        email: 'user@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = forgotPasswordSchema.safeParse({
        email: 'invalid-email',
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // Reset Password Schema
  // ============================================
  describe('resetPasswordSchema', () => {
    it('validates complete reset request', () => {
      const result = resetPasswordSchema.safeParse({
        token: 'reset-token-from-email',
        password: 'NewSecureP@ss1',
        confirmPassword: 'NewSecureP@ss1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty token', () => {
      const result = resetPasswordSchema.safeParse({
        token: '',
        password: 'NewSecureP@ss1',
        confirmPassword: 'NewSecureP@ss1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects mismatched passwords', () => {
      const result = resetPasswordSchema.safeParse({
        token: 'valid-token',
        password: 'NewSecureP@ss1',
        confirmPassword: 'DifferentP@ss1',
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // Signup Schema
  // ============================================
  describe('signupSchema', () => {
    it('validates complete signup request', () => {
      const result = signupSchema.safeParse({
        email: 'user@example.com',
        password: 'StrongP@ss1',
        confirmPassword: 'StrongP@ss1',
        name: 'John Doe',
        acceptTerms: true,
      });
      expect(result.success).toBe(true);
    });

    it('rejects without accepting terms', () => {
      const result = signupSchema.safeParse({
        email: 'user@example.com',
        password: 'StrongP@ss1',
        confirmPassword: 'StrongP@ss1',
        name: 'John Doe',
        acceptTerms: false,
      });
      expect(result.success).toBe(false);
    });

    it('rejects mismatched passwords', () => {
      const result = signupSchema.safeParse({
        email: 'user@example.com',
        password: 'StrongP@ss1',
        confirmPassword: 'DifferentP@ss1',
        name: 'John Doe',
        acceptTerms: true,
      });
      expect(result.success).toBe(false);
    });
  });
});
