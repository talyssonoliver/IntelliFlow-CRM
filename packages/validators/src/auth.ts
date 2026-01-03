/**
 * Auth Validation Schemas
 *
 * Zod schemas for authentication-related validation.
 * All enums derive from @intelliflow/domain constants (single source of truth).
 * Implements: PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 */

import { z } from 'zod';
import { emailSchema, idSchema } from './common';
import { MFA_METHODS, OAUTH_PROVIDERS } from '@intelliflow/domain';

// ============================================
// AUTH ENUMS - derived from domain constants
// ============================================

export const mfaMethodSchema = z.enum(MFA_METHODS);
export type MfaMethod = z.infer<typeof mfaMethodSchema>;

export const oauthProviderSchema = z.enum(OAUTH_PROVIDERS);
export type OAuthProvider = z.infer<typeof oauthProviderSchema>;

// ============================================
// LOGIN SCHEMAS
// ============================================

/**
 * Login credentials schema
 * Used for email/password authentication
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
  rememberMe: z.boolean().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Login response schema
 * Returned after successful credential verification
 */
export const loginResponseSchema = z.object({
  success: z.boolean(),
  user: z
    .object({
      id: idSchema,
      email: emailSchema,
      name: z.string().nullable(),
      role: z.string(),
    })
    .optional(),
  session: z
    .object({
      accessToken: z.string(),
      refreshToken: z.string().optional(),
      expiresAt: z.coerce.date(),
    })
    .optional(),
  requiresMfa: z.boolean().default(false),
  mfaChallengeId: z.string().uuid().optional(),
  mfaMethods: z.array(mfaMethodSchema).optional(),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

// ============================================
// MFA SCHEMAS
// ============================================

/**
 * MFA verification schema
 * Used when verifying TOTP, SMS, Email OTP, or backup codes
 */
export const mfaVerifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z
    .string()
    .min(6, 'Code must be at least 6 characters')
    .max(20, 'Code is too long')
    .transform((val) => val.replace(/\s/g, '').toUpperCase()),
  method: mfaMethodSchema,
});

export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

/**
 * MFA setup initiation schema
 * Used when user requests to enable MFA
 */
export const mfaSetupSchema = z.object({
  method: mfaMethodSchema,
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)')
    .optional(), // Required for SMS method
});

export type MfaSetupInput = z.infer<typeof mfaSetupSchema>;

/**
 * MFA setup response schema
 * Returned after MFA setup initiation
 */
export const mfaSetupResponseSchema = z.object({
  success: z.boolean(),
  method: mfaMethodSchema,
  // For TOTP - return secret and QR code
  secret: z.string().optional(),
  qrCodeUrl: z.string().url().optional(),
  // For SMS/Email - confirmation that code was sent
  codeSentTo: z.string().optional(),
});

export type MfaSetupResponse = z.infer<typeof mfaSetupResponseSchema>;

/**
 * MFA confirmation schema
 * Used to confirm and enable MFA after setup
 */
export const mfaConfirmSchema = z.object({
  method: mfaMethodSchema,
  code: z
    .string()
    .min(6)
    .max(20)
    .transform((val) => val.replace(/\s/g, '').toUpperCase()),
});

export type MfaConfirmInput = z.infer<typeof mfaConfirmSchema>;

/**
 * Backup codes response schema
 * Returned when generating backup codes
 */
export const backupCodesResponseSchema = z.object({
  codes: z.array(z.string().length(10)),
  generatedAt: z.coerce.date(),
  warning: z.string(),
});

export type BackupCodesResponse = z.infer<typeof backupCodesResponseSchema>;

// ============================================
// OAUTH SCHEMAS
// ============================================

/**
 * OAuth initiation schema
 * Used when starting OAuth flow
 */
export const oauthInitSchema = z.object({
  provider: oauthProviderSchema,
  redirectTo: z.string().url().optional(),
});

export type OAuthInitInput = z.infer<typeof oauthInitSchema>;

/**
 * OAuth callback schema
 * Used when handling OAuth callback
 */
export const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().optional(),
  error: z.string().optional(),
  errorDescription: z.string().optional(),
  provider: oauthProviderSchema.optional(),
});

export type OAuthCallbackInput = z.infer<typeof oauthCallbackSchema>;

// ============================================
// SESSION SCHEMAS
// ============================================

/**
 * Session info schema
 * Represents an active user session
 */
export const sessionInfoSchema = z.object({
  id: idSchema,
  userId: idSchema,
  deviceInfo: z.object({
    browser: z.string().optional(),
    os: z.string().optional(),
    device: z.string().optional(),
  }),
  ipAddress: z.string().optional(),
  createdAt: z.coerce.date(),
  lastActiveAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  isCurrent: z.boolean(),
});

export type SessionInfo = z.infer<typeof sessionInfoSchema>;

/**
 * Active sessions response schema
 */
export const activeSessionsResponseSchema = z.object({
  sessions: z.array(sessionInfoSchema),
  maxSessions: z.number().int().positive(),
});

export type ActiveSessionsResponse = z.infer<typeof activeSessionsResponseSchema>;

/**
 * Revoke session schema
 */
export const revokeSessionSchema = z.object({
  sessionId: idSchema,
});

export type RevokeSessionInput = z.infer<typeof revokeSessionSchema>;

/**
 * Refresh token schema
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

// ============================================
// PASSWORD SCHEMAS
// ============================================

/**
 * Password strength rules:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

/**
 * Forgot password schema
 */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * Reset password schema
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: strongPasswordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Change password schema (for authenticated users)
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: strongPasswordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ============================================
// SIGNUP SCHEMAS
// ============================================

/**
 * Signup schema
 */
export const signupSchema = z.object({
  email: emailSchema,
  password: strongPasswordSchema,
  confirmPassword: z.string(),
  name: z.string().min(1).max(100).trim(),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms and conditions' }),
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type SignupInput = z.infer<typeof signupSchema>;

// ============================================
// EMAIL VERIFICATION SCHEMAS
// ============================================

/**
 * Email verification schema
 * Used when verifying email from verification link
 *
 * IMPLEMENTS: PG-023 (Email Verification page)
 */
export const verifyEmailSchema = z.object({
  token: z
    .string()
    .min(64, 'Invalid verification token')
    .max(64, 'Invalid verification token')
    .regex(/^[a-f0-9]+$/, 'Invalid verification token format'),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/**
 * Email verification response schema
 */
export const verifyEmailResponseSchema = z.object({
  success: z.boolean(),
  email: emailSchema.optional(),
  message: z.string(),
});

export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;

/**
 * Resend verification email schema
 */
export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
