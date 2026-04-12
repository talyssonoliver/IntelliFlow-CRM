'use client';

/**
 * Sign Up Page
 *
 * User registration with email/password, Google SSO, and Microsoft SSO.
 *
 * IMPLEMENTS: PG-016 (Sign Up page)
 *
 * Features:
 * - Email/password registration via Supabase
 * - Google and Microsoft OAuth registration
 * - Password strength indicator
 * - Terms of service acceptance
 * - Email verification flow
 * - Rate limiting protection
 */

import { Suspense, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@intelliflow/ui';
import { useAuth, useRedirectIfAuthenticated } from '@/lib/auth/AuthContext';
import { SocialLoginGrid, OAuthDivider, AuthBackground, AuthCard } from '@/components/shared';
import { RegistrationForm, type RegistrationFormData } from '@/components/shared/registration-form';
import { trpc } from '@/lib/trpc';

// ============================================
// Types
// ============================================

type ToastData = {
  open: boolean;
  variant: 'default' | 'destructive' | 'success';
  title: string;
  description: string;
};

interface UTMData {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string;
  landing_page: string;
  captured_at: string;
}

// ============================================
// Error Fallback Component
// ============================================

function SignUpErrorFallback({ error, resetErrorBoundary }: Readonly<FallbackProps>) {
  const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';

  return (
    <AuthBackground>
      <div className="relative z-10 w-full max-w-md mx-auto">
        <AuthCard
          badge="INTELLIFLOW"
          badgeIcon="error"
          title="Something went wrong"
          description="An unexpected error occurred during registration."
        >
          <div className="text-center space-y-4">
            <p className="text-red-400 text-sm">{errorMessage}</p>
            <button
              onClick={resetErrorBoundary}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg font-medium transition-colors"
            >
              Try again
            </button>
          </div>
        </AuthCard>
      </div>
    </AuthBackground>
  );
}

// ============================================
// UTM Capture Hook
// ============================================

function useUTMCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // Capture UTM params from URL on mount
    const utmData: UTMData = {
      utm_source: searchParams.get('utm_source'),
      utm_medium: searchParams.get('utm_medium'),
      utm_campaign: searchParams.get('utm_campaign'),
      utm_content: searchParams.get('utm_content'),
      utm_term: searchParams.get('utm_term'),
      referrer: typeof document === 'undefined' ? '' : document.referrer,
      landing_page: typeof globalThis.window === 'undefined' ? '' : globalThis.location.pathname,
      captured_at: new Date().toISOString(),
    };

    // Only store if we have at least one UTM parameter
    const hasUTM = utmData.utm_source || utmData.utm_medium || utmData.utm_campaign;
    if (hasUTM) {
      try {
        localStorage.setItem('intelliflow_utm', JSON.stringify(utmData));
      } catch (e) {
        console.warn('[SignUp] Failed to store UTM data:', e);
      }
    }
  }, [searchParams]);

  // Return function to retrieve UTM data
  return useCallback((): UTMData | null => {
    try {
      const stored = localStorage.getItem('intelliflow_utm');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, []);
}

// ============================================
// Component
// ============================================

function SignUpPageContent() {
  const router = useRouter();
  const auth = useAuth();
  const getUTMData = useUTMCapture();

  // Redirect if already authenticated
  useRedirectIfAuthenticated('/');

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastData>({
    open: false,
    variant: 'default',
    title: '',
    description: '',
  });

  // Toast helper
  const showToast = useCallback(
    (variant: ToastData['variant'], title: string, description: string) => {
      setToast({ open: true, variant, title, description });
    },
    []
  );

  // tRPC signup mutation
  const signupMutation = trpc.auth.signup.useMutation();

  // Handle registration form submission
  const handleSubmit = useCallback(
    async (data: RegistrationFormData) => {
      setIsSubmitting(true);

      try {
        // Get UTM data for marketing attribution
        const utmData = getUTMData();
        if (utmData) {
          console.info('[SignUp] Registration with UTM:', utmData);
        }

        // Call tRPC signup — Supabase handles email verification
        await signupMutation.mutateAsync({
          email: data.email,
          password: data.password,
          confirmPassword: data.password,
          name: data.fullName,
          acceptTerms: true as const,
        });

        // Show success and redirect
        showToast('success', 'Account created!', 'Please check your email to verify your account.');

        // Redirect to success page after a short delay
        setTimeout(() => {
          router.push('/signup/success?email=' + encodeURIComponent(data.email));
        }, 1500);
      } catch (error: unknown) {
        const trpcError = error as { data?: { code?: string }; message?: string };
        if (trpcError.data?.code === 'CONFLICT') {
          showToast(
            'destructive',
            'Email already registered',
            'An account with this email already exists. Please sign in instead.'
          );
        } else {
          showToast(
            'destructive',
            'Registration failed',
            'An unexpected error occurred. Please try again.'
          );
        }
        setIsSubmitting(false);
      }
    },
    [router, showToast, getUTMData, signupMutation]
  );

  // Handle OAuth registration
  // Maps 'microsoft' to 'azure' for the auth context
  const handleOAuthSignUp = useCallback(
    async (provider: 'google' | 'microsoft') => {
      try {
        // Map provider names to auth context expected values
        const authProvider = provider === 'microsoft' ? 'azure' : 'google';
        await auth.loginWithOAuth(authProvider);
        // OAuth redirects automatically on success
      } catch (error) {
        console.error(`[SignUp] ${provider} OAuth error:`, error);
        showToast(
          'destructive',
          'Registration failed',
          `An error occurred with ${provider} sign up. Please try again.`
        );
      }
    },
    [auth, showToast]
  );

  return (
    <ToastProvider>
      <AuthBackground>
        <div className="relative z-10 w-full max-w-md mx-auto">
          <AuthCard
            badge="INTELLIFLOW"
            badgeIcon="rocket_launch"
            badgeClassName="hidden md:inline-flex"
            title="Create your account"
            description="Start your free trial today. No credit card required."
          >
            {/* Social Login Options */}
            <SocialLoginGrid
              onGoogleLogin={() => handleOAuthSignUp('google')}
              onMicrosoftLogin={() => handleOAuthSignUp('microsoft')}
              disabled={isSubmitting}
            />

            {/* Divider */}
            <OAuthDivider />

            {/* Registration Form */}
            <RegistrationForm onSubmit={handleSubmit} isLoading={isSubmitting} />

            {/* Sign in link */}
            <div className="text-center pt-4 border-t border-white/10">
              <p className="text-sm text-slate-300">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="text-[#7cc4ff] hover:text-[#5ab3ff] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a] rounded px-1"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </AuthCard>

          {/* Additional Info */}
          <p className="mt-6 text-center text-xs text-slate-500">
            By creating an account, you agree to our{' '}
            <Link
              href="/terms"
              className="text-slate-400 hover:text-white underline transition-colors"
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href="/privacy"
              className="text-slate-400 hover:text-white underline transition-colors"
            >
              Privacy Policy
            </Link>
          </p>
        </div>

        {/* Toast Notifications */}
        <Toast
          open={toast.open}
          onOpenChange={(open) => setToast((prev) => ({ ...prev, open }))}
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

// ============================================
// Exported Page with ErrorBoundary
// ============================================

export default function SignUpPage() {
  return (
    <ErrorBoundary FallbackComponent={SignUpErrorFallback}>
      <Suspense fallback={<div className="min-h-screen" />}>
        <SignUpPageContent />
      </Suspense>
    </ErrorBoundary>
  );
}
