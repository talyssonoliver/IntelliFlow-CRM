/**
 * Auth Router
 *
 * Provides tRPC endpoints for authentication operations.
 *
 * IMPLEMENTS: PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 *
 * Endpoints:
 * - login: Email/password authentication
 * - loginWithOAuth: Initiate OAuth flow
 * - oauthCallback: Handle OAuth callback
 * - verifyMfa: Verify MFA code
 * - logout: End session
 * - refreshSession: Refresh access token
 * - setupMfa: Initiate MFA setup
 * - confirmMfa: Confirm and enable MFA
 * - getBackupCodes: Generate backup codes
 * - getSessions: Get active sessions
 * - revokeSession: Revoke a session
 */

import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure, protectedProcedure, authProcedure } from '../../trpc';
import {
  loginSchema,
  mfaVerifySchema,
  mfaSetupSchema,
  mfaConfirmSchema,
  oauthInitSchema,
  oauthCallbackSchema,
  revokeSessionSchema,
  refreshTokenSchema,
  verifyEmailCallbackSchema,
  resendVerificationSchema,
  resendMfaCodeSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signupSchema,
  ssoResolveSchema,
  disableMfaSchema,
  regenerateBackupCodesSchema,
  type LoginResponse,
} from '@intelliflow/validators';
import {
  signIn,
  signOutUser,
  getSession,
  signInWithOAuth,
  exchangeCodeForSession,
  supabaseAdmin,
  resetPasswordForEmail,
  updateUserPassword,
  type OAuthProvider,
} from '../../lib/supabase';
import { ensureAppUserSession, type Context, type UserSession } from '../../context';
import { getLoginLimiter } from '../../security/login-limiter';
import { getAuditLogger } from '../../security/audit-logger';
import { getMfaService } from '../../services/mfa.service';
import { getSessionService } from '../../services/session.service';
import { requiredProdEnv } from '@intelliflow/validators/required-url';

// ============================================
// Helper Functions
// ============================================

/**
 * Extract a header value from the request context
 * Handles both Headers API (get method) and object-style headers
 */
function getHeaderFromContext(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) || undefined;
  }
  const value = (headers as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? value[0] : value;
}

// ============================================
// Per-Email Rate Limiter (IFC-120)
// ============================================

interface EmailRateLimitState {
  count: number;
  windowStart: number;
}

function createEmailRateLimiter(limit: number, windowMs: number) {
  const store = new Map<string, EmailRateLimitState>();

  return {
    check(email: string): { allowed: boolean; retryAfterSeconds: number } {
      const now = Date.now();
      const key = email.toLowerCase();
      let state = store.get(key);

      if (state && now - state.windowStart >= windowMs) {
        store.delete(key);
        state = undefined;
      }

      if (!state) {
        state = { count: 0, windowStart: now };
        store.set(key, state);
      }

      if (state.count >= limit) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((windowMs - (now - state.windowStart)) / 1000)
        );
        return { allowed: false, retryAfterSeconds };
      }

      state.count++;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

// 3 requests per email per 15 minutes (AC-008)
const passwordResetLimiter = createEmailRateLimiter(3, 900000);
const verificationResendLimiter = createEmailRateLimiter(3, 900000);

// 10 OAuth initiation requests per IP per 5 minutes (PG-124 SF-003)
const oauthInitLimiter = createEmailRateLimiter(10, 300000);

// 5 SSO resolve requests per email per 5 minutes (PG-124)
const ssoResolveLimiter = createEmailRateLimiter(5, 300000);

// 3 attempts per user per 15 minutes (PG-125 AC-009)
const mfaDisableLimiter = createEmailRateLimiter(3, 900000);

/**
 * SSO provider configuration.
 * In production this would be stored in the database; currently static.
 * IMPLEMENTS: PG-124 (server-side SSO resolution)
 */
const SSO_PROVIDER_CONFIG = {
  providers: [
    {
      domain: 'example-corp.com',
      provider_id: 'sso-example-corp',
      provider_name: 'Example Corp SSO',
      provider_type: 'saml' as const,
      enabled: true,
    },
  ],
  fallback: {
    message: 'Your organization has not configured SSO. Please use standard login.',
  },
};

/**
 * Validate redirect URL against an allowlist of safe internal paths.
 * Prevents open redirect attacks.
 */
const REDIRECT_ALLOWLIST = ['/', '/dashboard', '/settings', '/auth/callback'];

function isAllowedRedirect(url: string, appUrl: string): boolean {
  try {
    const parsed = new URL(url);
    const app = new URL(appUrl);
    // Must be same origin
    if (parsed.origin !== app.origin) return false;
    // Path must start with an allowed prefix
    return REDIRECT_ALLOWLIST.some(
      (allowed) => parsed.pathname === allowed || parsed.pathname.startsWith(`${allowed}/`)
    );
  } catch {
    // Relative path check
    if (!url.startsWith('/')) return false;
    return REDIRECT_ALLOWLIST.some((allowed) => url === allowed || url.startsWith(`${allowed}/`));
  }
}

/**
 * Mask email for logging: user@example.com → us***@example.com (NF-003)
 */
function maskEmail(email: string): string {
  return email.replace(/^(.{2})[^@]*@/, '$1***@');
}

/**
 * Handle MFA setup for a specific method, returning the appropriate response.
 * Extracted to reduce cognitive complexity of the setupMfa mutation.
 */
async function setupMfaByMethod(
  mfaService: ReturnType<typeof getMfaService>,
  input: { method: string; phone?: string },
  user: { email: string; userId: string }
): Promise<
  | { success: true; method: 'totp'; secret: string; qrCodeUrl: string }
  | { success: true; method: 'sms'; codeSentTo: string }
  | { success: true; method: 'email'; codeSentTo: string }
> {
  if (input.method === 'totp') {
    const { secret, otpauthUrl } = mfaService.generateTotpSecret(user.email);
    return { success: true, method: 'totp', secret, qrCodeUrl: otpauthUrl };
  }

  if (input.method === 'sms') {
    if (!input.phone) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Phone number required for SMS MFA' });
    }
    const result = await mfaService.sendSmsOtp(input.phone, user.userId);
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error || 'Failed to send SMS',
      });
    }
    return { success: true, method: 'sms', codeSentTo: input.phone };
  }

  if (input.method === 'email') {
    const result = await mfaService.sendEmailOtp(user.email, user.userId);
    if (!result.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error || 'Failed to send email',
      });
    }
    return { success: true, method: 'email', codeSentTo: user.email };
  }

  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid MFA method' });
}

/**
 * Extract userId from an MFA challenge, returning 'unknown' if unavailable.
 */
function resolveMfaChallengeUserId(
  mfaService: ReturnType<typeof getMfaService>,
  challengeId: string | undefined
): string {
  if (!challengeId) return 'unknown';
  const info = mfaService.getChallengeInfo(challengeId);
  return 'userId' in info && info.userId ? (info.userId as string) : 'unknown';
}

type SupabaseAuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

type AuthenticatedAppUser = {
  session: UserSession;
  avatar: string | null;
};

/**
 * No-op retained for test/back-compat: `auth.getStatus` used to keep a private,
 * token-keyed result cache to dodge a per-request DB read. That cache is gone —
 * `getStatus` now reuses the already-resolved `ctx.user` (resolved + cached once
 * per request in context.ts via USER_SESSION_CACHE), so there is no second cache
 * to clear. Kept exported so existing test isolation hooks stay valid.
 */
export function clearStatusCache(): void {
  /* intentionally empty — getStatus no longer maintains its own cache */
}

async function resolveAuthenticatedAppUser(
  prisma: Context['prisma'],
  supabaseUser: SupabaseAuthUser
): Promise<AuthenticatedAppUser> {
  const session = await ensureAppUserSession(prisma, supabaseUser);

  // Avatar now lives on the resolved session (DB `avatarUrl`, lazily backfilled
  // from provider metadata inside ensureAppUserSession). This removes the extra
  // `prisma.user.findUnique` avatar read that used to run on every login / OAuth /
  // MFA / getStatus call. Fall back to the raw OAuth metadata for the very first
  // request, before the fire-and-forget backfill write has landed.
  let metadataAvatar: string | null = null;
  if (typeof supabaseUser.user_metadata?.avatar_url === 'string') {
    metadataAvatar = supabaseUser.user_metadata.avatar_url;
  } else if (typeof supabaseUser.user_metadata?.picture === 'string') {
    metadataAvatar = supabaseUser.user_metadata.picture;
  }

  return {
    session,
    avatar: session.avatarUrl ?? metadataAvatar,
  };
}

function buildAuthUserPayload(user: AuthenticatedAppUser) {
  return {
    id: user.session.userId,
    email: user.session.email,
    name: user.session.name ?? null,
    role: user.session.role,
    avatar: user.avatar,
  };
}

// ============================================
// Auth Router
// ============================================

export const authRouter = createTRPCRouter({
  /**
   * Login with email and password
   *
   * Validates credentials via Supabase Auth.
   * If MFA is enabled, returns challenge info instead of session.
   */
  login: authProcedure.input(loginSchema).mutation(async ({ ctx, input }) => {
    const loginLimiter = getLoginLimiter();
    const auditLogger = getAuditLogger(ctx.prisma);
    const mfaService = getMfaService(ctx.prisma);
    const sessionService = getSessionService(ctx.prisma);

    // Extract IP and user agent from context
    const headers = ctx.req?.headers;
    const ipAddress =
      getHeaderFromContext(headers, 'x-forwarded-for') ||
      getHeaderFromContext(headers, 'x-real-ip');
    const userAgent = getHeaderFromContext(headers, 'user-agent');

    try {
      // Check rate limit
      loginLimiter.checkAllowed(input.email, ipAddress);

      // Authenticate with Supabase
      const { user, session, error } = await signIn(input.email, input.password);

      if (error || !user || !session) {
        // Record failed attempt
        const attemptResult = loginLimiter.recordFailed(input.email, ipAddress);

        // Log failed login
        await auditLogger.logLoginFailure('system', {
          email: input.email,
          ipAddress,
          userAgent,
          failureReason: error?.message || 'Invalid credentials',
        });

        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: attemptResult.isLocked
            ? `Account locked. Try again in ${Math.ceil((attemptResult.lockoutDuration || 0) / 60000)} minutes.`
            : 'Invalid email or password',
        });
      }

      // Check if MFA is enabled for this user
      const mfaEnabled = await mfaService.isUserMfaEnabled(user.id);

      if (mfaEnabled) {
        // Create MFA challenge
        const availableMethods = await mfaService.getAvailableMfaMethods(user.id);
        const primaryMethod = availableMethods[0] || 'totp';
        const challenge = mfaService.createChallenge(user.id, primaryMethod);

        // Return partial response requiring MFA
        const response: LoginResponse = {
          success: false,
          requiresMfa: true,
          mfaChallengeId: challenge.id,
          mfaMethods: availableMethods,
        };

        return response;
      }

      // Fix #13: MFA_REQUIRED env flag
      // If MFA is globally required but the user has not enrolled, signal
      // the frontend to redirect to MFA setup. We intentionally do NOT block
      // login here — that is a product decision left to the frontend.
      const appUser = await resolveAuthenticatedAppUser(ctx.prisma, user);
      const mfaRequiredGlobally = process.env.MFA_REQUIRED === 'true';
      if (mfaRequiredGlobally) {
        // Record success and create session so the user is authenticated
        loginLimiter.recordSuccess(input.email, ipAddress);
        const deviceInfoEnroll = sessionService.parseDeviceInfo(userAgent);
        await sessionService.createSession({
          userId: appUser.session.userId,
          tenantId: appUser.session.tenantId,
          deviceInfo: deviceInfoEnroll,
          ipAddress,
          userAgent,
          refreshToken: session.refresh_token,
          rememberMe: input.rememberMe,
        });
        await auditLogger.logLoginSuccess(appUser.session.userId, {
          userId: appUser.session.userId,
          email: appUser.session.email,
          ipAddress,
          userAgent,
          mfaUsed: false,
        });

        const enrollResponse: LoginResponse = {
          success: true,
          user: buildAuthUserPayload(appUser),
          session: {
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            expiresAt: new Date(session.expires_at! * 1000),
          },
          requiresMfa: false,
          mfaEnrollmentRequired: true,
        };

        return enrollResponse;
      }

      // Record successful login
      loginLimiter.recordSuccess(input.email, ipAddress);

      // Create application session
      const deviceInfo = sessionService.parseDeviceInfo(userAgent);
      await sessionService.createSession({
        userId: appUser.session.userId,
        tenantId: appUser.session.tenantId,
        deviceInfo,
        ipAddress,
        userAgent,
        refreshToken: session.refresh_token,
        rememberMe: input.rememberMe,
      });

      // Log successful login
      await auditLogger.logLoginSuccess(appUser.session.userId, {
        userId: appUser.session.userId,
        email: appUser.session.email,
        ipAddress,
        userAgent,
        mfaUsed: false,
      });

      // Return success response
      const response: LoginResponse = {
        success: true,
        user: buildAuthUserPayload(appUser),
        session: {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: new Date(session.expires_at! * 1000),
        },
        requiresMfa: false,
      };

      return response;
    } catch (error) {
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Authentication failed. Please try again.',
        cause: error,
      });
    }
  }),

  /**
   * Initiate OAuth sign-in flow
   *
   * Returns the OAuth provider URL to redirect the user to.
   * SF-003: Server-side redirectTo validation prevents open redirect attacks.
   */
  loginWithOAuth: publicProcedure.input(oauthInitSchema).mutation(async ({ ctx, input }) => {
    // Rate limit OAuth initiation by IP (PG-124 SF-003)
    const oauthHeaders = ctx.req?.headers;
    const ipAddress =
      getHeaderFromContext(oauthHeaders, 'x-forwarded-for') ||
      getHeaderFromContext(oauthHeaders, 'x-real-ip') ||
      'unknown';
    const rateCheck = oauthInitLimiter.check(ipAddress);
    if (!rateCheck.allowed) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `Too many login attempts. Please try again in ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minutes.`,
      });
    }

    const provider = input.provider as OAuthProvider;

    // SF-003: Validate redirectTo against allowlist (prevent open redirect)
    const appUrl = requiredProdEnv('APP_URL', process.env.APP_URL, 'http://localhost:3000');
    let safeRedirectTo = input.redirectTo;
    if (safeRedirectTo) {
      if (!isAllowedRedirect(safeRedirectTo, appUrl)) {
        console.warn('[OAuth] Server: Blocked non-allowlisted redirectTo:', safeRedirectTo);
        safeRedirectTo = `${appUrl}/auth/callback`;
      }
    }

    console.log(
      '[OAuth] Server: Initiating OAuth for provider:',
      provider,
      'redirectTo:',
      safeRedirectTo
    );

    const { url, error } = await signInWithOAuth(provider, {
      redirectTo: safeRedirectTo,
    });

    console.log(
      '[OAuth] Server: Supabase response - url:',
      url ? 'received' : 'null',
      'error:',
      error?.message || 'none'
    );

    if (error || !url) {
      console.error('[OAuth] Server: Failed to get OAuth URL:', error?.message);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          error?.message ||
          'Failed to initiate OAuth flow. Is the provider configured in Supabase?',
      });
    }

    return { url, provider };
  }),

  /**
   * Resolve SSO provider for a given email domain.
   *
   * Rate-limited server-side endpoint that resolves an email address
   * to its enterprise SSO provider configuration.
   *
   * IMPLEMENTS: PG-124 (SSO server-side resolution)
   */
  resolveSso: publicProcedure.input(ssoResolveSchema).query(async ({ input }) => {
    // Rate limit SSO resolution by email (PG-124)
    const rateCheck = ssoResolveLimiter.check(input.email);
    if (!rateCheck.allowed) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `Too many requests. Please try again in ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minutes.`,
      });
    }

    const domain = input.email.split('@')[1]?.toLowerCase();
    if (!domain) {
      return { found: false as const };
    }

    console.log('[SSO] Server-side resolution for domain:', maskEmail(input.email));

    // Look up SSO provider configuration for the domain.
    // In production this would query the Supabase SSO provider table;
    // currently resolves from the static SSO_PROVIDER_CONFIG.
    const provider = SSO_PROVIDER_CONFIG.providers.find(
      (p) => p.domain.toLowerCase() === domain && p.enabled
    );

    if (provider) {
      return {
        found: true as const,
        config: {
          provider_id: provider.provider_id,
          provider_name: provider.provider_name,
          provider_type: provider.provider_type,
        },
      };
    }

    return { found: false as const, suggestion: SSO_PROVIDER_CONFIG.fallback.message };
  }),

  /**
   * Handle OAuth callback
   *
   * Exchanges the authorization code for a session.
   */
  oauthCallback: publicProcedure.input(oauthCallbackSchema).mutation(async ({ ctx, input }) => {
    const auditLogger = getAuditLogger(ctx.prisma);
    const sessionService = getSessionService(ctx.prisma);

    // Check for OAuth errors
    if (input.error) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: input.errorDescription || input.error,
      });
    }

    // Exchange code for session
    const { session, user, error } = await exchangeCodeForSession(input.code);

    if (error || !session || !user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: error?.message || 'Failed to complete OAuth authentication',
      });
    }

    const oauthHeaders = ctx.req?.headers;
    const ipAddress =
      getHeaderFromContext(oauthHeaders, 'x-forwarded-for') ||
      getHeaderFromContext(oauthHeaders, 'x-real-ip');
    const userAgent = getHeaderFromContext(oauthHeaders, 'user-agent');
    const appUser = await resolveAuthenticatedAppUser(ctx.prisma, user);

    // Create application session
    const deviceInfo = sessionService.parseDeviceInfo(userAgent);
    await sessionService.createSession({
      userId: appUser.session.userId,
      tenantId: appUser.session.tenantId,
      deviceInfo,
      ipAddress,
      userAgent,
      refreshToken: session.refresh_token,
      rememberMe: true, // OAuth sessions default to remember
    });

    // Log successful login
    await auditLogger.logLoginSuccess(appUser.session.userId, {
      userId: appUser.session.userId,
      email: appUser.session.email,
      ipAddress,
      userAgent,
      mfaUsed: false,
    });

    return {
      success: true,
      user: buildAuthUserPayload(appUser),
      session: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: new Date(session.expires_at! * 1000),
      },
    };
  }),

  /**
   * Verify MFA code
   *
   * Completes the login process after MFA verification.
   */
  verifyMfa: publicProcedure.input(mfaVerifySchema).mutation(async ({ ctx, input }) => {
    const mfaService = getMfaService(ctx.prisma);
    const sessionService = getSessionService(ctx.prisma);
    const auditLogger = getAuditLogger(ctx.prisma);

    const mfaHeaders = ctx.req?.headers;
    const ipAddress =
      getHeaderFromContext(mfaHeaders, 'x-forwarded-for') ||
      getHeaderFromContext(mfaHeaders, 'x-real-ip');
    const userAgent = getHeaderFromContext(mfaHeaders, 'user-agent');

    // Get challenge info
    const challengeInfo = mfaService.getChallengeInfo(input.challengeId);
    if (!challengeInfo.exists) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Invalid or expired MFA challenge',
      });
    }

    // Get user MFA settings (would need the user ID from challenge)
    // For now, we'll verify using the challenge directly
    const result = await mfaService.verifyChallenge(input.challengeId, input.code);

    if (!result.success) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: result.error || 'Invalid MFA code',
      });
    }

    // MFA verified - get user session from Supabase
    const { session, error: sessionError } = await getSession();

    if (sessionError || !session) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Session expired. Please log in again.',
      });
    }
    const appUser = await resolveAuthenticatedAppUser(ctx.prisma, session.user);

    // Create application session
    const deviceInfo = sessionService.parseDeviceInfo(userAgent);
    await sessionService.createSession({
      userId: appUser.session.userId,
      tenantId: appUser.session.tenantId,
      deviceInfo,
      ipAddress,
      userAgent,
      refreshToken: session.refresh_token,
      rememberMe: true,
    });

    // Log successful MFA login
    await auditLogger.logLoginSuccess(appUser.session.userId, {
      userId: appUser.session.userId,
      email: appUser.session.email,
      ipAddress,
      userAgent,
      mfaUsed: true,
    });

    return {
      success: true,
      user: buildAuthUserPayload(appUser),
      session: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: new Date(session.expires_at! * 1000),
      },
    };
  }),

  /**
   * Resend MFA verification code
   *
   * Resends the MFA code via SMS or email for the current challenge.
   */
  resendMfaCode: publicProcedure.input(resendMfaCodeSchema).mutation(async ({ ctx, input }) => {
    const mfaService = getMfaService(ctx.prisma);

    try {
      const userId = resolveMfaChallengeUserId(mfaService, input.challengeId);

      if (input.method === 'sms' && input.phone) {
        const result = await mfaService.sendSmsOtp(input.phone, userId);
        return {
          success: result.success,
          message: result.success
            ? 'SMS code sent successfully'
            : result.error || 'Failed to send SMS',
        };
      }

      if (input.method === 'email' && input.email) {
        const result = await mfaService.sendEmailOtp(input.email, userId);
        return {
          success: result.success,
          message: result.success
            ? 'Email code sent successfully'
            : result.error || 'Failed to send email',
        };
      }

      return { success: false, message: 'Invalid MFA method or missing contact information' };
    } catch (error) {
      console.error('[Auth] Resend MFA code error:', error);
      return { success: false, message: 'Failed to resend MFA code. Please try again.' };
    }
  }),

  /**
   * Logout - end session
   *
   * IFC-007: Fixed to properly invalidate user's Supabase session via admin API
   */
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const sessionService = getSessionService(ctx.prisma);
    const auditLogger = getAuditLogger(ctx.prisma);

    // Sign out user from Supabase using admin API (invalidates all sessions)
    // IFC-007: Use signOutUser with user ID instead of signOut (which doesn't work server-side)
    const { error } = await signOutUser(ctx.user.userId);

    if (error) {
      console.error('[Auth] Supabase signout error:', error);
      // Don't throw - continue with application session cleanup
    }

    // Revoke all application sessions for user
    const revokedCount = await sessionService.revokeAllUserSessions(ctx.user.userId);

    // Log logout
    await auditLogger.log({
      tenantId: ctx.user.tenantId,
      eventType: 'UserLogout',
      action: 'LOGOUT',
      actionResult: 'SUCCESS',
      resourceType: 'user',
      resourceId: ctx.user.userId,
      actorId: ctx.user.userId,
      actorEmail: ctx.user.email,
    });

    return { success: true, sessionsRevoked: revokedCount };
  }),

  /**
   * Refresh session token
   */
  refreshSession: publicProcedure.input(refreshTokenSchema).mutation(async ({ input }) => {
    // Supabase handles token refresh automatically
    // This endpoint is for manual refresh if needed
    const { session, error } = await getSession();

    if (error || !session) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Session expired. Please log in again.',
      });
    }

    return {
      success: true,
      session: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: new Date(session.expires_at! * 1000),
      },
    };
  }),

  /**
   * Setup MFA for the current user
   */
  setupMfa: protectedProcedure.input(mfaSetupSchema).mutation(async ({ ctx, input }) => {
    const mfaService = getMfaService(ctx.prisma);
    return setupMfaByMethod(mfaService, input, ctx.user);
  }),

  /**
   * Confirm and enable MFA
   */
  confirmMfa: protectedProcedure.input(mfaConfirmSchema).mutation(async ({ ctx, input }) => {
    const mfaService = getMfaService(ctx.prisma);
    const auditLogger = getAuditLogger(ctx.prisma);

    // Get user's pending MFA settings and verify code
    const userSettings = await mfaService.getUserMfaSettings(ctx.user.userId);

    // For TOTP, verify the code against the secret
    if (input.method === 'totp' && userSettings?.totpSecret) {
      const isValid = mfaService.verifyTotpTimingSafe(userSettings.totpSecret, input.code);

      if (!isValid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid verification code',
        });
      }

      // Enable TOTP
      await mfaService.saveUserMfaSettings({
        ...userSettings,
        userId: ctx.user.userId,
        totpEnabled: true,
      });

      // Log MFA enabled
      await auditLogger.log({
        tenantId: ctx.user.tenantId,
        eventType: 'MfaEnabled',
        action: 'UPDATE',
        actionResult: 'SUCCESS',
        resourceType: 'user',
        resourceId: ctx.user.userId,
        actorId: ctx.user.userId,
        actorEmail: ctx.user.email,
        metadata: { method: 'totp' },
      });

      return { success: true, method: 'totp' };
    }

    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'MFA setup not found or invalid',
    });
  }),

  /**
   * Generate backup codes
   */
  getBackupCodes: protectedProcedure.mutation(async ({ ctx }) => {
    const mfaService = getMfaService(ctx.prisma);
    const auditLogger = getAuditLogger(ctx.prisma);

    // Generate new backup codes
    const { codes, generatedAt } = mfaService.generateBackupCodes(8);

    // Hash and store codes
    const hashedCodes = mfaService.hashBackupCodes(codes);

    const userSettings = (await mfaService.getUserMfaSettings(ctx.user.userId)) || {
      userId: ctx.user.userId,
      totpEnabled: false,
      smsEnabled: false,
      emailEnabled: false,
    };

    await mfaService.saveUserMfaSettings({
      ...userSettings,
      backupCodes: hashedCodes,
    });

    // Log backup codes generated
    await auditLogger.log({
      tenantId: ctx.user.tenantId,
      eventType: 'BackupCodesGenerated',
      action: 'CREATE',
      actionResult: 'SUCCESS',
      resourceType: 'user',
      resourceId: ctx.user.userId,
      actorId: ctx.user.userId,
      actorEmail: ctx.user.email,
    });

    return {
      codes, // Return plaintext codes (user must save them)
      generatedAt,
      warning: 'Save these codes securely. They cannot be recovered if lost.',
    };
  }),

  /**
   * Get MFA status for current user
   * PG-125: AC-001
   */
  getMfaStatus: protectedProcedure.query(async ({ ctx }) => {
    const mfaService = getMfaService(ctx.prisma);
    const settings = await mfaService.getUserMfaSettings(ctx.user.userId);

    return {
      enabled: !!(settings?.totpEnabled || settings?.smsEnabled || settings?.emailEnabled),
      methods: {
        totp: settings?.totpEnabled ?? false,
        sms: settings?.smsEnabled ?? false,
        email: settings?.emailEnabled ?? false,
      },
      backupCodesRemaining: settings?.backupCodes?.length ?? 0,
      lastVerifiedAt: settings?.lastUsedAt ?? null,
      enabledAt: null, // Stored in DB but not in MfaUserSettings interface yet
    };
  }),

  /**
   * Disable MFA for current user
   * Requires re-authentication via TOTP code or password
   * PG-125: AC-002, AC-003, AC-009
   */
  disableMfa: protectedProcedure.input(disableMfaSchema).mutation(async ({ ctx, input }) => {
    const mfaService = getMfaService(ctx.prisma);
    const auditLogger = getAuditLogger(ctx.prisma);

    // Rate limit check (AC-009)
    const rateCheck = mfaDisableLimiter.check(ctx.user.userId);
    if (!rateCheck.allowed) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `Too many attempts. Please try again in ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minutes.`,
      });
    }

    // Get current MFA settings
    const settings = await mfaService.getUserMfaSettings(ctx.user.userId);
    if (!settings || !(settings.totpEnabled || settings.smsEnabled || settings.emailEnabled)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'MFA is not currently enabled',
      });
    }

    // Re-authenticate (AC-002)
    if (input.totpCode && settings.totpSecret) {
      const isValid = mfaService.verifyTotpTimingSafe(settings.totpSecret, input.totpCode);
      if (!isValid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid TOTP code',
        });
      }
    } else if (input.password) {
      // Verify password via Supabase (NF-003: doesn't create new session)
      const { error } = await signIn(ctx.user.email, input.password);
      if (error) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid password',
        });
      }
    } else {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Either TOTP code or password required',
      });
    }

    // Disable all MFA methods (AC-003)
    await mfaService.saveUserMfaSettings(
      {
        userId: ctx.user.userId,
        totpEnabled: false,
        totpSecret: undefined,
        smsEnabled: false,
        smsPhone: undefined,
        emailEnabled: false,
        backupCodes: [],
      },
      ctx.user.tenantId
    );

    // Audit log (AC-003)
    await auditLogger.log({
      tenantId: ctx.user.tenantId,
      eventType: 'MfaDisabled',
      action: 'UPDATE',
      actionResult: 'SUCCESS',
      resourceType: 'user',
      resourceId: ctx.user.userId,
      actorId: ctx.user.userId,
      actorEmail: ctx.user.email,
    });

    return { success: true };
  }),

  /**
   * Regenerate backup codes
   * Requires TOTP code for proof of possession
   * PG-125: AC-004
   */
  regenerateBackupCodes: protectedProcedure
    .input(regenerateBackupCodesSchema)
    .mutation(async ({ ctx, input }) => {
      const mfaService = getMfaService(ctx.prisma);
      const auditLogger = getAuditLogger(ctx.prisma);

      // Get current MFA settings
      const settings = await mfaService.getUserMfaSettings(ctx.user.userId);
      if (!settings || !settings.totpEnabled || !settings.totpSecret) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'MFA must be enabled to regenerate backup codes',
        });
      }

      // Verify TOTP code
      const isValid = mfaService.verifyTotpTimingSafe(settings.totpSecret, input.totpCode);
      if (!isValid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid TOTP code',
        });
      }

      // Generate new backup codes
      const { codes, generatedAt } = mfaService.generateBackupCodes(8);
      const hashedCodes = mfaService.hashBackupCodes(codes);

      // Save with new codes (invalidates old ones)
      await mfaService.saveUserMfaSettings(
        {
          ...settings,
          backupCodes: hashedCodes,
        },
        ctx.user.tenantId
      );

      // Audit log
      await auditLogger.log({
        tenantId: ctx.user.tenantId,
        eventType: 'BackupCodesRegenerated',
        action: 'UPDATE',
        actionResult: 'SUCCESS',
        resourceType: 'user',
        resourceId: ctx.user.userId,
        actorId: ctx.user.userId,
        actorEmail: ctx.user.email,
      });

      return {
        codes,
        generatedAt,
        warning: 'Save these codes securely. Your previous backup codes have been invalidated.',
      };
    }),

  /**
   * Get active sessions for current user
   */
  getSessions: protectedProcedure.query(async ({ ctx }) => {
    const sessionService = getSessionService(ctx.prisma);

    // Get current session ID from context (would need to be passed in)
    const sessions = await sessionService.getUserSessions(ctx.user.userId);

    return {
      sessions,
      maxSessions: 3,
    };
  }),

  /**
   * Revoke a specific session
   */
  revokeSession: protectedProcedure.input(revokeSessionSchema).mutation(async ({ ctx, input }) => {
    const sessionService = getSessionService(ctx.prisma);
    const auditLogger = getAuditLogger(ctx.prisma);

    const revoked = await sessionService.revokeSession(input.sessionId);

    if (!revoked) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Session not found',
      });
    }

    // Log session revocation
    await auditLogger.log({
      tenantId: ctx.user.tenantId,
      eventType: 'SessionRevoked',
      action: 'DELETE',
      actionResult: 'SUCCESS',
      resourceType: 'session',
      resourceId: input.sessionId,
      actorId: ctx.user.userId,
      actorEmail: ctx.user.email,
    });

    return { success: true };
  }),

  /**
   * Check current auth status.
   *
   * IFC-007: derives auth status from the request's Bearer token.
   *
   * Performance (N+1 elimination): this reuses `ctx.user`, which context.ts
   * resolves exactly once per request — Bearer verify (local JOSE, no network)
   * plus a single `prisma.user` resolution that is itself memoised for 60 s
   * (USER_SESSION_CACHE). getStatus therefore issues NO database query and NO
   * second token verification of its own. Previously a single warm getStatus
   * call cost: the context resolution + a redundant verifyToken +
   * ensureAppUserSession + a separate avatar `findUnique` — three user reads per
   * request. The avatar now travels on the session (`ctx.user.avatarUrl`,
   * lazily backfilled from provider metadata in ensureAppUserSession).
   */
  getStatus: publicProcedure.query(({ ctx }) => {
    if (!ctx.user) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      user: {
        id: ctx.user.userId,
        email: ctx.user.email,
        name: ctx.user.name ?? null,
        role: ctx.user.role,
        avatar: ctx.user.avatarUrl ?? null,
      },
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
  }),

  /**
   * Request password reset email
   *
   * IMPLEMENTS: IFC-120 (AC-001, AC-007, AC-008)
   *
   * Sends a password reset email via Supabase. Always returns success
   * to prevent email enumeration (AC-007). Rate limited per email (AC-008).
   */
  requestPasswordReset: authProcedure.input(forgotPasswordSchema).mutation(async ({ input }) => {
    // Check per-email rate limit (AC-008)
    const rateCheck = passwordResetLimiter.check(input.email);
    if (!rateCheck.allowed) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `Too many requests. Please try again in ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minutes.`,
      });
    }

    const redirectTo = `${requiredProdEnv('APP_URL', process.env.APP_URL, 'http://localhost:3000')}/reset-password/callback`;

    try {
      await resetPasswordForEmail(input.email, redirectTo);
    } catch {
      // Silently swallow errors to prevent email enumeration (AC-007)
    }

    // Always return success (AC-007)
    return { success: true };
  }),

  /**
   * Reset password with Supabase access token
   *
   * IMPLEMENTS: IFC-120 (AC-002)
   *
   * Uses the access token from the Supabase callback URL to update the password.
   */
  resetPassword: authProcedure.input(resetPasswordSchema).mutation(async ({ input }) => {
    const { error } = await updateUserPassword(input.token, input.password);

    if (error) {
      const isExpired = error.message?.includes('expired') || error.message?.includes('invalid');
      throw new TRPCError({
        code: isExpired ? 'UNAUTHORIZED' : 'INTERNAL_SERVER_ERROR',
        message: isExpired
          ? 'Reset link has expired. Please request a new one.'
          : 'Failed to reset password. Please try again.',
      });
    }

    return { success: true };
  }),

  /**
   * Sign up a new user
   *
   * IMPLEMENTS: IFC-120 (AC-003)
   *
   * Creates a user via Supabase Auth. Supabase auto-sends confirmation email.
   */
  signup: authProcedure.input(signupSchema).mutation(async ({ input }) => {
    const { data, error } = await supabaseAdmin.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { name: input.name },
      },
    });

    if (error) {
      // Supabase returns specific errors for duplicate email
      if (
        error.message?.includes('already registered') ||
        error.message?.includes('already been registered')
      ) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An account with this email already exists.',
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create account. Please try again.',
      });
    }

    // If Supabase returns a user with identities=[] it means user already exists
    if (data.user?.identities?.length === 0) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'An account with this email already exists.',
      });
    }

    return { success: true, needsEmailVerification: true };
  }),

  /**
   * Verify email address via Supabase OTP
   *
   * IMPLEMENTS: IFC-120 (AC-004)
   *
   * Validates the email verification token_hash from Supabase callback URL.
   */
  verifyEmail: publicProcedure.input(verifyEmailCallbackSchema).mutation(async ({ input }) => {
    const { data, error } = await supabaseAdmin.auth.verifyOtp({
      token_hash: input.token_hash,
      type: input.type,
    });

    if (error) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Verification link is invalid or has expired.',
      });
    }

    return {
      success: true,
      email: data.user?.email || '',
    };
  }),

  /**
   * Resend verification email
   *
   * IMPLEMENTS: IFC-120 (AC-005, AC-007, AC-008)
   *
   * Rate-limited endpoint to resend verification emails via Supabase.
   * Always returns success to prevent email enumeration (AC-007).
   */
  resendVerification: publicProcedure
    .input(resendVerificationSchema)
    .mutation(async ({ input }) => {
      // Check per-email rate limit (AC-008)
      const rateCheck = verificationResendLimiter.check(input.email);
      if (!rateCheck.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Too many requests. Please try again in ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minutes.`,
        });
      }

      try {
        await supabaseAdmin.auth.resend({
          type: 'signup',
          email: input.email,
        });
      } catch {
        // Silently swallow errors to prevent email enumeration (AC-007)
      }

      // Always return success (AC-007)
      return { success: true };
    }),
});
