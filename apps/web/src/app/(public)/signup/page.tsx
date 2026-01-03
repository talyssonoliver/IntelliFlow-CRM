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

import { useState, useCallback } from 'react';
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
import {
  SocialLoginGrid,
  OAuthDivider,
  AuthBackground,
  AuthCard,
  TrustIndicators,
} from '@/components/shared';
import { RegistrationForm, type RegistrationFormData } from '@/components/shared/registration-form';
import {
  sendWelcomeEmail,
  generateVerificationToken,
} from '@/lib/shared/welcome-email';

// ============================================
// Types
// ============================================

type ToastData = {
  open: boolean;
  variant: 'default' | 'destructive' | 'success';
  title: string;
  description: string;
};

// ============================================
// Component
// ============================================

export default function SignUpPage() {
  const router = useRouter();
  const auth = useAuth();

  // Redirect if already authenticated
  useRedirectIfAuthenticated('/dashboard');

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastData>({
    open: false,
    variant: 'default',
    title: '',
    description: '',
  });

  // Toast helper
  const showToast = useCallback((
    variant: ToastData['variant'],
    title: string,
    description: string
  ) => {
    setToast({ open: true, variant, title, description });
  }, []);

  // Handle registration form submission
  // Note: In production, this would call an API endpoint to create the user
  // For now, we simulate the signup flow and send a welcome email
  const handleSubmit = useCallback(async (data: RegistrationFormData) => {
    setIsSubmitting(true);

    try {
      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // TODO: Replace with actual signup API call when backend is ready
      // const response = await fetch('/api/auth/signup', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ email: data.email, password: data.password, fullName: data.fullName }),
      // });

      // Generate verification token and send welcome email
      const verificationToken = generateVerificationToken();
      const emailResult = await sendWelcomeEmail({
        fullName: data.fullName,
        email: data.email,
        verificationToken,
      });

      if (!emailResult.ok) {
        console.warn('[SignUp] Failed to send welcome email:', emailResult.error);
        // Don't block registration if email fails
      }

      // Show success and redirect
      showToast(
        'success',
        'Account created!',
        'Please check your email to verify your account.'
      );

      // Redirect to success page after a short delay
      setTimeout(() => {
        router.push('/signup/success?email=' + encodeURIComponent(data.email));
      }, 1500);

    } catch (error) {
      console.error('[SignUp] Unexpected error:', error);
      showToast(
        'destructive',
        'Registration failed',
        'An unexpected error occurred. Please try again.'
      );
      setIsSubmitting(false);
    }
  }, [router, showToast]);

  // Handle OAuth registration
  // Maps 'microsoft' to 'azure' for the auth context
  const handleOAuthSignUp = useCallback(async (provider: 'google' | 'microsoft') => {
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
  }, [auth, showToast]);

  return (
    <ToastProvider>
      <AuthBackground>
        <div className="relative z-10 w-full max-w-md mx-auto">
          <AuthCard
            badge="INTELLIFLOW"
            badgeIcon="rocket_launch"
            title="Create your account"
            description="Start your free trial today. No credit card required."
            footer={
              <p className="text-center text-sm text-slate-400">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="text-[#137fec] hover:text-[#137fec]/80 font-medium transition-colors"
                >
                  Sign in
                </Link>
              </p>
            }
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
            <RegistrationForm
              onSubmit={handleSubmit}
              isLoading={isSubmitting}
            />

            {/* Trust Indicators */}
            <div className="mt-6 pt-6 border-t border-slate-700/50">
              <TrustIndicators
                items={[
                  { icon: 'lock', label: '256-bit SSL' },
                  { icon: 'verified_user', label: 'GDPR Ready' },
                  { icon: 'schedule', label: '14-day trial' },
                ]}
              />
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
