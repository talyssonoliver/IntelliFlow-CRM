'use client';

/**
 * Login Page
 *
 * Full authentication with email/password, Google SSO, Microsoft SSO, and MFA.
 *
 * IMPLEMENTS: PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 *
 * Features:
 * - Email/password authentication via Supabase
 * - Google and Microsoft OAuth
 * - Multi-factor authentication (TOTP, SMS, Email, backup codes)
 * - Remember me (30-day session)
 * - Rate limiting protection
 * - Client-side security utilities
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@intelliflow/ui';
import { useAuth, useRedirectIfAuthenticated } from '@/lib/auth/AuthContext';
import { MfaChallenge, type MfaMethod } from '@/components/auth';
import {
  SocialLoginGrid,
  OAuthDivider,
  AuthBackground,
  AuthCard,
  PasswordInput,
  TrustIndicators,
} from '@/components/shared';
import {
  sanitizeEmail,
  sanitizePassword,
  checkRateLimitStatus,
  recordFailedAttempt,
  clearRateLimit,
  storeSessionFingerprint,
} from '@/lib/shared/login-security';

// ============================================
// Types
// ============================================

type ToastData = {
  open: boolean;
  variant: 'default' | 'destructive' | 'success';
  title: string;
  description: string;
};

type FormData = {
  email: string;
  password: string;
  rememberMe: boolean;
};

type ValidationErrors = {
  email?: string;
  password?: string;
};

type LoginStep = 'credentials' | 'mfa';

// ============================================
// Component
// ============================================

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();

  // Redirect if already authenticated
  useRedirectIfAuthenticated('/dashboard');

  // Form state
  const [step, setStep] = useState<LoginStep>('credentials');
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    rememberMe: false,
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastData>({
    open: false,
    variant: 'default',
    title: '',
    description: '',
  });

  // Rate limiting state
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    isLimited: boolean;
    timeRemaining: number;
  }>({ isLimited: false, timeRemaining: 0 });

  // ==========================================
  // Effects
  // ==========================================

  // Check rate limit on email change
  useEffect(() => {
    if (formData.email) {
      const info = checkRateLimitStatus(formData.email);
      setRateLimitInfo({
        isLimited: info.isLimited,
        timeRemaining: info.timeRemaining,
      });
    }
  }, [formData.email]);

  // Rate limit countdown
  useEffect(() => {
    if (rateLimitInfo.timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setRateLimitInfo((prev) => ({
        ...prev,
        timeRemaining: Math.max(0, prev.timeRemaining - 1),
        isLimited: prev.timeRemaining - 1 > 0,
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, [rateLimitInfo.timeRemaining]);

  // Handle auth errors from context
  useEffect(() => {
    if (auth.error) {
      setToast({
        open: true,
        variant: 'destructive',
        title: 'Authentication failed',
        description: auth.error,
      });
      auth.clearError();
    }
  }, [auth.error, auth.clearError]);

  // Handle MFA required state
  useEffect(() => {
    if (auth.mfa.required) {
      setStep('mfa');
    }
  }, [auth.mfa.required]);

  // ==========================================
  // Validation
  // ==========================================

  const validateEmail = (email: string): string | undefined => {
    if (!email) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Please enter a valid email address';
    return undefined;
  };

  const validatePassword = (password: string): string | undefined => {
    if (!password) return 'Password is required';
    if (password.length < 8) return 'Password must be at least 8 characters';
    return undefined;
  };

  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {
      email: validateEmail(formData.email),
      password: validatePassword(formData.password),
    };

    setErrors(newErrors);
    return !newErrors.email && !newErrors.password;
  };

  // ==========================================
  // Handlers
  // ==========================================

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (field === 'email' || field === 'password') {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check rate limiting
    if (rateLimitInfo.isLimited) {
      setToast({
        open: true,
        variant: 'destructive',
        title: 'Too many attempts',
        description: `Please wait ${rateLimitInfo.timeRemaining} seconds before trying again.`,
      });
      return;
    }

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      // Sanitize inputs
      const email = sanitizeEmail(formData.email);
      const password = sanitizePassword(formData.password);

      if (!email) {
        setErrors({ email: 'Invalid email format' });
        return;
      }

      // Attempt login
      const success = await auth.login(email, password, formData.rememberMe);

      if (success) {
        // Clear rate limiting on success
        clearRateLimit(email);
        // Store device fingerprint for session verification
        storeSessionFingerprint();

        setToast({
          open: true,
          variant: 'success',
          title: 'Welcome back!',
          description: 'Signing you in...',
        });

        // Redirect to dashboard
        setTimeout(() => {
          router.push('/dashboard');
        }, 1000);
      } else if (!auth.mfa.required) {
        // Login failed (and not MFA challenge)
        recordFailedAttempt(email);
        const info = checkRateLimitStatus(email);
        setRateLimitInfo({
          isLimited: info.isLimited,
          timeRemaining: info.timeRemaining,
        });

        if (info.isLimited) {
          setToast({
            open: true,
            variant: 'destructive',
            title: 'Account locked',
            description: 'Too many failed attempts. Please try again later.',
          });
        }
      }
      // If MFA is required, the effect will switch to MFA step
    } catch (error) {
      setToast({
        open: true,
        variant: 'destructive',
        title: 'Authentication failed',
        description: error instanceof Error ? error.message : 'Invalid email or password',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await auth.loginWithOAuth('google');
    } catch (error) {
      setToast({
        open: true,
        variant: 'destructive',
        title: 'Google sign-in failed',
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  };

  const handleMicrosoftLogin = async () => {
    try {
      await auth.loginWithOAuth('azure');
    } catch (error) {
      setToast({
        open: true,
        variant: 'destructive',
        title: 'Microsoft sign-in failed',
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  };

  const handleMfaVerify = async (code: string, method: MfaMethod): Promise<boolean> => {
    const success = await auth.verifyMfa(code, method);

    if (success) {
      clearRateLimit(formData.email);
      storeSessionFingerprint();

      setToast({
        open: true,
        variant: 'success',
        title: 'Verified!',
        description: 'Signing you in...',
      });

      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
    }

    return success;
  };

  const handleMfaCancel = () => {
    setStep('credentials');
    // Clear MFA state by logging out
    auth.logout();
  };

  // ==========================================
  // Render
  // ==========================================

  const isLoading = isSubmitting || auth.isLoading;

  // MFA Challenge Step
  if (step === 'mfa') {
    return (
      <ToastProvider>
        <AuthBackground>
          <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Branding header */}
            <div className="text-center mb-8 space-y-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-[#7cc4ff] font-medium backdrop-blur-sm text-sm mb-4">
                <span className="material-symbols-outlined text-base" aria-hidden="true">security</span>
                <span>Verification Required</span>
              </div>
              <h1 className="text-3xl font-bold text-white">Two-Factor Authentication</h1>
              <p className="text-slate-300 text-sm">
                Enter the verification code to continue
              </p>
            </div>

            <MfaChallenge
              availableMethods={auth.mfa.methods.length > 0 ? auth.mfa.methods : ['totp']}
              defaultMethod={auth.mfa.methods[0] || 'totp'}
              onVerify={handleMfaVerify}
              onCancel={handleMfaCancel}
              error={auth.error}
              isLoading={auth.isLoading}
            />
          </div>

          {/* Toast notifications */}
          <Toast
            open={toast.open}
            onOpenChange={(open) => setToast({ ...toast, open })}
            variant={toast.variant}
          >
            <div className="grid gap-1">
              <ToastTitle>{toast.title}</ToastTitle>
              <ToastDescription>{toast.description}</ToastDescription>
            </div>
            <ToastClose />
          </Toast>
          <ToastViewport />
        </AuthBackground>
      </ToastProvider>
    );
  }

  // Credentials Step
  return (
    <ToastProvider>
      <AuthBackground>
        <AuthCard
          badge="Secure Access"
          badgeIcon="shield_lock"
          title="Welcome back"
          description="Sign in to your IntelliFlow CRM account"
          securityBadge="256-bit SSL encryption | WCAG 2.1 AA compliant"
          footer={<TrustIndicators />}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Rate limit warning */}
            {rateLimitInfo.isLimited && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  lock_clock
                </span>
                Account temporarily locked. Try again in {rateLimitInfo.timeRemaining}s
              </div>
            )}

            {/* Email input */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-slate-200">
                Email address
              </label>
              <div className="relative">
                <span
                  className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl"
                  aria-hidden="true"
                >
                  mail
                </span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className={`w-full pl-11 pr-4 py-3 rounded-lg border bg-white/5 text-white placeholder:text-slate-400 backdrop-blur-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:border-transparent ${
                    errors.email ? 'border-red-500/50' : 'border-white/10 hover:border-white/20'
                  }`}
                  placeholder="you@company.com"
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  aria-invalid={!!errors.email}
                  disabled={isLoading || rateLimitInfo.isLimited}
                />
              </div>
              {errors.email && (
                <p
                  id="email-error"
                  className="text-sm text-red-400 flex items-center gap-1 animate-in fade-in slide-in-from-top-1 duration-200"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    error
                  </span>
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password input */}
            <PasswordInput
              id="password"
              value={formData.password}
              onChange={(value) => updateField('password', value)}
              error={errors.password}
              placeholder="Enter your password"
              disabled={isLoading || rateLimitInfo.isLimited}
              label="Password"
              labelExtra={
                <Link
                  href="/forgot-password"
                  className="text-sm text-[#7cc4ff] hover:text-[#5ab3ff] transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a] rounded px-1"
                >
                  Forgot password?
                </Link>
              }
            />

            {/* Remember me checkbox */}
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={formData.rememberMe}
                onChange={(e) => updateField('rememberMe', e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-[#137fec] focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a] transition-colors cursor-pointer"
                disabled={isLoading || rateLimitInfo.isLimited}
              />
              <label
                htmlFor="remember-me"
                className="ml-2 block text-sm text-slate-300 cursor-pointer"
              >
                Remember me for 30 days
              </label>
            </div>

            {/* Sign in button */}
            <button
              type="submit"
              disabled={isLoading || rateLimitInfo.isLimited}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7] transition-all focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#137fec]/20 hover:shadow-[#137fec]/30 hover:scale-[1.02] active:scale-[0.98]"
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <span
                    className="material-symbols-outlined animate-spin text-xl"
                    aria-hidden="true"
                  >progress_activity</span>
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">login</span>
                  <span>Sign in</span>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <OAuthDivider />

          {/* Social login buttons */}
          <SocialLoginGrid
            onGoogleLogin={handleGoogleLogin}
            onMicrosoftLogin={handleMicrosoftLogin}
            onError={(error) =>
              setToast({
                open: true,
                variant: 'destructive',
                title: 'Sign-in failed',
                description: error.message,
              })
            }
            disabled={isLoading || rateLimitInfo.isLimited}
          />

          {/* Sign up link */}
          <div className="text-center pt-4 border-t border-white/10">
            <p className="text-sm text-slate-300">
              Don&apos;t have an account?{' '}
              <Link
                href="/signup"
                className="text-[#7cc4ff] hover:text-[#5ab3ff] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a] rounded px-1"
              >
                Sign up for free
              </Link>
            </p>
          </div>
        </AuthCard>

        {/* Toast notifications */}
        <Toast
          open={toast.open}
          onOpenChange={(open) => setToast({ ...toast, open })}
          variant={toast.variant}
        >
          <div className="grid gap-1">
            <ToastTitle>{toast.title}</ToastTitle>
            <ToastDescription>{toast.description}</ToastDescription>
          </div>
          <ToastClose />
        </Toast>
        <ToastViewport />
      </AuthBackground>
    </ToastProvider>
  );
}
