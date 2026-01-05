'use client';

/**
 * Onboarding Flow Component
 *
 * Displays next steps after signup with visual progress indication.
 *
 * IMPLEMENTS: PG-017 (Sign Up Success page)
 *
 * Features:
 * - Step-by-step onboarding guide
 * - Progress tracking
 * - Animated step transitions
 * - Action buttons for each step
 * - Accessibility support
 */

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';
import { trackOnboardingStep, trackOnboardingComplete } from '@/lib/shared/tracking-pixel';

// ============================================
// Types
// ============================================

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  completed?: boolean;
  optional?: boolean;
}

export interface OnboardingFlowProps {
  steps?: OnboardingStep[];
  currentStep?: number;
  onStepComplete?: (stepId: string, stepIndex: number) => void;
  onAllComplete?: () => void;
  variant?: 'vertical' | 'horizontal';
  showProgress?: boolean;
  className?: string;
}

// ============================================
// Default Steps
// ============================================

export const DEFAULT_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'verify-email',
    title: 'Verify your email',
    description: 'Check your inbox for a verification link to activate your account.',
    icon: 'mark_email_read',
    action: {
      label: 'Resend email',
    },
  },
  {
    id: 'complete-profile',
    title: 'Complete your profile',
    description: 'Add your company details and preferences to personalize your experience.',
    icon: 'person',
    action: {
      label: 'Complete profile',
      href: '/settings/profile',
    },
  },
  {
    id: 'import-contacts',
    title: 'Import your contacts',
    description: 'Bring in your existing contacts from CSV, Google, or other CRM systems.',
    icon: 'upload',
    action: {
      label: 'Import contacts',
      href: '/contacts/import',
    },
    optional: true,
  },
  {
    id: 'explore-features',
    title: 'Explore features',
    description: 'Take a quick tour to discover AI-powered lead scoring, automation, and more.',
    icon: 'explore',
    action: {
      label: 'Start tour',
      href: '/dashboard?tour=true',
    },
    optional: true,
  },
];

// ============================================
// Step Item Component
// ============================================

interface StepItemProps {
  step: OnboardingStep;
  index: number;
  isActive: boolean;
  isCompleted: boolean;
  isLast: boolean;
  onComplete: () => void;
  variant: 'vertical' | 'horizontal';
}

function StepItem({
  step,
  index: _index,
  isActive,
  isCompleted,
  isLast,
  onComplete,
  variant,
}: StepItemProps) {
  const handleActionClick = useCallback(() => {
    step.action?.onClick?.();
    if (!step.action?.href) {
      onComplete();
    }
  }, [step.action, onComplete]);

  return (
    <div
      className={cn(
        'relative flex gap-4',
        variant === 'horizontal' ? 'flex-col items-center text-center' : 'items-start'
      )}
    >
      {/* Connector Line */}
      {!isLast && variant === 'vertical' && (
        <div
          className={cn(
            'absolute left-5 top-10 w-0.5 h-[calc(100%-2.5rem)]',
            isCompleted ? 'bg-green-500' : 'bg-slate-700'
          )}
          aria-hidden="true"
        />
      )}

      {/* Step Number/Icon */}
      <div
        className={cn(
          'relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all',
          isCompleted
            ? 'bg-green-500 border-green-500 text-white'
            : isActive
              ? 'bg-[#137fec] border-[#137fec] text-white'
              : 'bg-slate-800 border-slate-600 text-slate-400'
        )}
      >
        {isCompleted ? (
          <span className="material-symbols-outlined text-xl" aria-hidden="true">
            check
          </span>
        ) : (
          <span className="material-symbols-outlined text-xl" aria-hidden="true">
            {step.icon}
          </span>
        )}
      </div>

      {/* Step Content */}
      <div className={cn('flex-1 pb-6', variant === 'horizontal' && 'pb-0')}>
        <div className="flex items-center gap-2 mb-1">
          <h3
            className={cn(
              'font-semibold transition-colors',
              isActive ? 'text-white' : 'text-slate-300'
            )}
          >
            {step.title}
          </h3>
          {step.optional && (
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
              Optional
            </span>
          )}
          {isCompleted && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                check_circle
              </span>
              Done
            </span>
          )}
        </div>
        <p className="text-sm text-slate-400 mb-3">{step.description}</p>

        {/* Action Button */}
        {step.action && !isCompleted && (
          <>
            {step.action.href ? (
              <Link
                href={step.action.href}
                onClick={handleActionClick}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-[#137fec] text-white hover:bg-[#137fec]/90'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                )}
              >
                {step.action.label}
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleActionClick}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-[#137fec] text-white hover:bg-[#137fec]/90'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                )}
              >
                {step.action.label}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================
// Progress Bar Component
// ============================================

interface ProgressBarProps {
  current: number;
  total: number;
  className?: string;
}

function ProgressBar({ current, total, className }: ProgressBarProps) {
  const percentage = Math.round((current / total) * 100);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">
          {current} of {total} steps completed
        </span>
        <span className="text-[#137fec] font-medium">{percentage}%</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#137fec] to-[#7cc4ff] rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Onboarding progress: ${percentage}%`}
        />
      </div>
    </div>
  );
}

// ============================================
// Onboarding Flow Component
// ============================================

export function OnboardingFlow({
  steps = DEFAULT_ONBOARDING_STEPS,
  currentStep = 0,
  onStepComplete,
  onAllComplete,
  variant = 'vertical',
  showProgress = true,
  className,
}: OnboardingFlowProps) {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(
    new Set(steps.filter((s) => s.completed).map((s) => s.id))
  );
  const [activeStep, setActiveStep] = useState(currentStep);

  // Track completion when all required steps are done
  useEffect(() => {
    const requiredSteps = steps.filter((s) => !s.optional);
    const allRequiredComplete = requiredSteps.every((s) => completedSteps.has(s.id));

    if (allRequiredComplete && completedSteps.size > 0) {
      trackOnboardingComplete({
        totalSteps: steps.length,
      });
      onAllComplete?.();
    }
  }, [completedSteps, steps, onAllComplete]);

  const handleStepComplete = useCallback(
    (stepId: string, stepIndex: number) => {
      setCompletedSteps((prev) => new Set([...prev, stepId]));

      // Track step completion
      const step = steps[stepIndex];
      trackOnboardingStep({
        step: stepIndex + 1,
        stepName: step.title,
        totalSteps: steps.length,
      });

      onStepComplete?.(stepId, stepIndex);

      // Move to next uncompleted step
      const nextIncomplete = steps.findIndex(
        (s, i) => i > stepIndex && !completedSteps.has(s.id) && s.id !== stepId
      );
      if (nextIncomplete !== -1) {
        setActiveStep(nextIncomplete);
      }
    },
    [steps, completedSteps, onStepComplete]
  );

  const completedCount = completedSteps.size;

  return (
    <div className={cn('space-y-6', className)} role="navigation" aria-label="Onboarding steps">
      {/* Progress Bar */}
      {showProgress && <ProgressBar current={completedCount} total={steps.length} />}

      {/* Steps */}
      <div
        className={cn(
          variant === 'horizontal'
            ? 'grid grid-cols-2 md:grid-cols-4 gap-4'
            : 'space-y-0'
        )}
      >
        {steps.map((step, index) => (
          <StepItem
            key={step.id}
            step={step}
            index={index}
            isActive={index === activeStep}
            isCompleted={completedSteps.has(step.id)}
            isLast={index === steps.length - 1}
            onComplete={() => handleStepComplete(step.id, index)}
            variant={variant}
          />
        ))}
      </div>

      {/* Skip All (for optional remaining steps) */}
      {completedCount > 0 && completedCount < steps.length && (
        <div className="pt-4 border-t border-slate-700">
          <Link
            href="/dashboard"
            className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2"
          >
            Skip for now and go to dashboard
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

export default OnboardingFlow;
