/**
 * Auth Test Mocks and Utilities
 *
 * Reusable mocks for authentication-related testing.
 * Supports PG-015 (Sign In) and PG-016 (Sign Up) pages.
 */

import { vi } from 'vitest';

// ============================================
// Supabase Auth Mocks
// ============================================

export const mockSupabaseAuth = {
  signUp: vi.fn().mockResolvedValue({
    data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    error: null,
  }),
  signInWithPassword: vi.fn().mockResolvedValue({
    data: {
      user: { id: 'test-user-id', email: 'test@example.com' },
      session: { access_token: 'test-token' },
    },
    error: null,
  }),
  signInWithOAuth: vi.fn().mockResolvedValue({
    data: { provider: 'google', url: 'https://oauth.provider.com' },
    error: null,
  }),
  signOut: vi.fn().mockResolvedValue({ error: null }),
  onAuthStateChange: vi.fn().mockReturnValue({
    data: {
      subscription: {
        unsubscribe: vi.fn(),
      },
    },
  }),
  getSession: vi.fn().mockResolvedValue({
    data: { session: null },
    error: null,
  }),
  getUser: vi.fn().mockResolvedValue({
    data: { user: null },
    error: null,
  }),
  resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
  updateUser: vi.fn().mockResolvedValue({
    data: { user: { id: 'test-user-id' } },
    error: null,
  }),
};

// ============================================
// reCAPTCHA Mocks
// ============================================

export const mockReCaptcha = {
  execute: vi.fn().mockResolvedValue('test-recaptcha-token'),
  ready: vi.fn((callback: () => void) => callback()),
  render: vi.fn().mockReturnValue(1), // Widget ID
  reset: vi.fn(),
  getResponse: vi.fn().mockReturnValue('test-response'),
};

/**
 * Create a reCAPTCHA mock with a specific score
 * Useful for testing v3 score thresholds
 */
export const createMockWithScore = (score: number) => ({
  ...mockReCaptcha,
  execute: vi.fn().mockResolvedValue(`test-token-score-${score}`),
});

/**
 * Mock for low reCAPTCHA scores (triggers v2 fallback)
 */
export const mockLowScoreReCaptcha = createMockWithScore(0.2);

/**
 * Mock for passing reCAPTCHA scores
 */
export const mockHighScoreReCaptcha = createMockWithScore(0.9);

// ============================================
// Router Mocks
// ============================================

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
};

// ============================================
// Test Data
// ============================================

export const validSignupData = {
  fullName: 'Test User',
  email: 'test@example.com',
  password: 'SecurePass123!',
  confirmPassword: 'SecurePass123!',
  acceptTerms: true,
};

export const validLoginData = {
  email: 'test@example.com',
  password: 'SecurePass123!',
  rememberMe: false,
};

export const invalidEmails = [
  '',
  'invalid',
  'invalid@',
  '@example.com',
  'invalid@example',
  'invalid @example.com',
  'invalid@example .com',
];

export const weakPasswords = [
  '',
  'short',
  '12345678', // No letters
  'abcdefgh', // No numbers or special chars
  'Abcdefgh', // No numbers
  'ABCDEFGH1', // No lowercase
];

export const strongPasswords = [
  'SecurePass123!',
  'MyP@ssw0rd!',
  'Complex1ty#Pass',
  'Str0ng&Secure',
];

// ============================================
// UTM Parameters
// ============================================

export const utmParams = {
  utm_source: 'google',
  utm_medium: 'cpc',
  utm_campaign: 'signup-test',
  utm_content: 'ad-variant-1',
  utm_term: 'crm software',
};

export const createUTMSearchParams = (params: Partial<typeof utmParams> = utmParams) => {
  return new URLSearchParams(params as Record<string, string>);
};

// ============================================
// Error Response Mocks
// ============================================

export const mockAuthErrors = {
  invalidCredentials: {
    error: {
      message: 'Invalid login credentials',
      status: 400,
    },
    data: null,
  },
  emailNotConfirmed: {
    error: {
      message: 'Email not confirmed',
      status: 400,
    },
    data: null,
  },
  userNotFound: {
    error: {
      message: 'User not found',
      status: 404,
    },
    data: null,
  },
  rateLimited: {
    error: {
      message: 'Rate limit exceeded',
      status: 429,
    },
    data: null,
  },
  networkError: {
    error: {
      message: 'Network error',
      status: 500,
    },
    data: null,
  },
};

// ============================================
// Session Mocks
// ============================================

export const mockSession = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_at: Date.now() + 3600000,
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    app_metadata: {},
    user_metadata: {
      full_name: 'Test User',
    },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  },
};

// ============================================
// Helper Functions
// ============================================

/**
 * Reset all auth mocks to their default state
 */
export const resetAuthMocks = () => {
  mockSupabaseAuth.signUp.mockClear();
  mockSupabaseAuth.signInWithPassword.mockClear();
  mockSupabaseAuth.signInWithOAuth.mockClear();
  mockSupabaseAuth.signOut.mockClear();
  mockSupabaseAuth.onAuthStateChange.mockClear();
  mockSupabaseAuth.getSession.mockClear();
  mockSupabaseAuth.getUser.mockClear();
  mockReCaptcha.execute.mockClear();
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
};

/**
 * Configure mock to simulate authenticated state
 */
export const mockAuthenticatedState = () => {
  mockSupabaseAuth.getSession.mockResolvedValue({
    data: { session: mockSession },
    error: null,
  });
  mockSupabaseAuth.getUser.mockResolvedValue({
    data: { user: mockSession.user },
    error: null,
  });
};

/**
 * Configure mock to simulate unauthenticated state
 */
export const mockUnauthenticatedState = () => {
  mockSupabaseAuth.getSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });
  mockSupabaseAuth.getUser.mockResolvedValue({
    data: { user: null },
    error: null,
  });
};
