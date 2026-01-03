'use client';

/**
 * Sign Up Success Page
 *
 * Displays confirmation after successful registration with onboarding steps.
 *
 * IMPLEMENTS: PG-017 (Sign Up Success page)
 *
 * Features:
 * - Success confirmation message
 * - Animated celebration effect
 * - Onboarding flow with next steps
 * - Conversion tracking (GTM, Facebook Pixel, LinkedIn)
 * - Email verification reminder
 * - Accessibility support
 */

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';
import { AuthBackground } from '@/components/shared';
import { OnboardingFlow, DEFAULT_ONBOARDING_STEPS } from '@/components/shared/onboarding-flow';
import { trackSignupComplete, trackPageView } from '@/lib/shared/tracking-pixel';

// ============================================
// Confetti Animation Component
// ============================================

interface ConfettiPiece {
  id: number;
  x: number;
  delay: number;
  duration: number;
  color: string;
}

function ConfettiAnimation() {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    const colors = ['#137fec', '#7cc4ff', '#10b981', '#f59e0b', '#ec4899'];
    const newPieces: ConfettiPiece[] = [];

    for (let i = 0; i < 50; i++) {
      newPieces.push({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 2 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    setPieces(newPieces);

    // Clean up after animation
    const timer = setTimeout(() => setPieces([]), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (pieces.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute w-3 h-3 rounded-sm animate-confetti"
          style={{
            left: `${piece.x}%`,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti {
          0% {
            transform: translateY(-10vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti linear forwards;
        }
      `}</style>
    </div>
  );
}

// ============================================
// Success Content Component
// ============================================

function SuccessContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const [showConfetti, setShowConfetti] = useState(true);

  // Track page view and signup completion on mount
  useEffect(() => {
    trackPageView({
      path: '/signup/success',
      title: 'Sign Up Success',
    });

    trackSignupComplete({
      method: 'email',
      email: email || undefined,
    });

    // Hide confetti after animation
    const timer = setTimeout(() => setShowConfetti(false), 4000);
    return () => clearTimeout(timer);
  }, [email]);

  // Handle onboarding step completion
  const handleStepComplete = useCallback((stepId: string, stepIndex: number) => {
    console.log(`[Onboarding] Step completed: ${stepId} (${stepIndex})`);
  }, []);

  // Handle all onboarding complete
  const handleAllComplete = useCallback(() => {
    console.log('[Onboarding] All required steps completed');
  }, []);

  // Mask email for display
  const maskedEmail = email
    ? email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
    : 'your email';

  return (
    <>
      {/* Confetti Animation */}
      {showConfetti && <ConfettiAnimation />}

      <AuthBackground>
        <div className="relative z-10 w-full max-w-lg mx-auto px-4">
          {/* Success Card */}
          <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden">
            {/* Success Header */}
            <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-b border-green-500/20 p-8 text-center">
              {/* Success Icon */}
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500 mb-4">
                <span className="material-symbols-outlined text-4xl text-green-400" aria-hidden="true">
                  check_circle
                </span>
              </div>

              <h1 className="text-2xl font-bold text-white mb-2">
                Welcome to IntelliFlow!
              </h1>
              <p className="text-slate-300">
                Your account has been created successfully.
              </p>
            </div>

            {/* Email Verification Notice */}
            <div className="bg-blue-500/10 border-b border-blue-500/20 p-4">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-blue-400 flex-shrink-0" aria-hidden="true">
                  mark_email_read
                </span>
                <div>
                  <p className="text-sm text-slate-200 font-medium">
                    Verification email sent
                  </p>
                  <p className="text-sm text-slate-400 mt-0.5">
                    We sent a verification link to <span className="text-white">{maskedEmail}</span>.
                    Please check your inbox.
                  </p>
                </div>
              </div>
            </div>

            {/* Onboarding Flow */}
            <div className="p-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                Get started in 4 easy steps
              </h2>
              <OnboardingFlow
                steps={DEFAULT_ONBOARDING_STEPS}
                currentStep={0}
                onStepComplete={handleStepComplete}
                onAllComplete={handleAllComplete}
                variant="vertical"
                showProgress={true}
              />
            </div>
          </div>

          {/* Help Section */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-400">
              Didn&apos;t receive the email?{' '}
              <button
                type="button"
                onClick={() => {
                  // TODO: Implement resend email
                  console.log('[SignUpSuccess] Resend email clicked');
                }}
                className="text-[#137fec] hover:text-[#137fec]/80 font-medium transition-colors"
              >
                Resend verification
              </button>
            </p>
            <p className="text-sm text-slate-500 mt-2">
              Need help?{' '}
              <Link
                href="/support"
                className="text-slate-400 hover:text-white underline transition-colors"
              >
                Contact support
              </Link>
            </p>
          </div>

          {/* Quick Actions */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/dashboard"
              className={cn(
                'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg',
                'bg-[#137fec] text-white font-medium',
                'hover:bg-[#137fec]/90 transition-all',
                'focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2 focus:ring-offset-slate-900'
              )}
            >
              Go to Dashboard
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
            <Link
              href="/settings/profile"
              className={cn(
                'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg',
                'bg-slate-700 text-white font-medium',
                'hover:bg-slate-600 transition-all',
                'focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900'
              )}
            >
              Complete Profile
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                person
              </span>
            </Link>
          </div>
        </div>
      </AuthBackground>
    </>
  );
}

// ============================================
// Main Page Component
// ============================================

export default function SignUpSuccessPage() {
  return (
    <Suspense
      fallback={
        <AuthBackground>
          <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#137fec]" />
          </div>
        </AuthBackground>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
