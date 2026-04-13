'use client';

/**
 * Registration Form Component
 *
 * Reusable registration form with validation, password strength indicator,
 * and accessibility support.
 *
 * IMPLEMENTS: PG-016 (Sign Up page)
 *
 * Features:
 * - Full name, email, password, and confirm password fields
 * - Real-time password strength indicator
 * - Terms acceptance checkbox
 * - Client-side validation with error messages
 * - ARIA accessibility support
 */

import { useState, useCallback, useId, useEffect, useRef } from 'react';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';
import { PasswordInput } from './password-input';
import {
  checkPasswordBreach,
  formatBreachCount,
  type BreachCheckResult,
} from '@/lib/shared/password-breach-check';

// ============================================
// Types
// ============================================

export interface RegistrationFormData {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

export interface RegistrationFormErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  acceptTerms?: string;
}

export interface RegistrationFormProps {
  onSubmit: (data: RegistrationFormData) => Promise<void>;
  isLoading?: boolean;
  className?: string;
  initialEmail?: string;
}

// ============================================
// Password Strength Calculator
// ============================================

type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

interface PasswordStrengthResult {
  strength: PasswordStrength;
  score: number;
  feedback: string[];
}

type PasswordCheck = { test: (p: string) => boolean; label: string };

const PASSWORD_CHECKS: PasswordCheck[] = [
  { test: (p) => p.length >= 8, label: 'At least 8 characters' },
  { test: (p) => p.length >= 12, label: '' }, // bonus point, no feedback label
  { test: (p) => /[a-z]/.test(p), label: 'Lowercase letter' },
  { test: (p) => /[A-Z]/.test(p), label: 'Uppercase letter' },
  { test: (p) => /\d/.test(p), label: 'Number' },
  { test: (p) => /[^a-zA-Z0-9]/.test(p), label: 'Special character' },
];

function scoreToStrength(score: number): PasswordStrength {
  if (score <= 2) return 'weak';
  if (score <= 3) return 'fair';
  if (score <= 5) return 'good';
  return 'strong';
}

function calculatePasswordStrength(password: string): PasswordStrengthResult {
  const feedback: string[] = [];
  let score = 0;

  for (const check of PASSWORD_CHECKS) {
    if (check.test(password)) {
      score += 1;
    } else if (check.label) {
      feedback.push(check.label);
    }
  }

  return { strength: scoreToStrength(score), score, feedback };
}

// ============================================
// Password Strength Indicator Component
// ============================================

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

function PasswordStrengthIndicator({
  password,
  className,
}: Readonly<PasswordStrengthIndicatorProps>) {
  if (!password) return null;

  const { strength, feedback } = calculatePasswordStrength(password);

  const strengthColors: Record<PasswordStrength, string> = {
    weak: 'bg-red-500',
    fair: 'bg-yellow-500',
    good: 'bg-blue-500',
    strong: 'bg-green-500',
  };

  const strengthLabels: Record<PasswordStrength, string> = {
    weak: 'Weak',
    fair: 'Fair',
    good: 'Good',
    strong: 'Strong',
  };

  const strengthWidths: Record<PasswordStrength, string> = {
    weak: 'w-1/4',
    fair: 'w-2/4',
    good: 'w-3/4',
    strong: 'w-full',
  };

  return (
    <div className={cn('mt-2', className)} aria-live="polite">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400">Password strength</span>
        <span
          className={cn('text-xs font-medium', {
            'text-red-400': strength === 'weak',
            'text-yellow-400': strength === 'fair',
            'text-blue-400': strength === 'good',
            'text-green-400': strength === 'strong',
          })}
        >
          {strengthLabels[strength]}
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        {}
        <span
          className={cn(
            'h-full rounded-full transition-all duration-300 block',
            strengthColors[strength],
            strengthWidths[strength]
          )}
          role="progressbar"
          aria-valuenow={Math.round((calculatePasswordStrength(password).score / 6) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Password strength: ${strengthLabels[strength]}`}
        />
      </div>
      {feedback.length > 0 && strength !== 'strong' && (
        <p className="text-xs text-slate-400 mt-1">Add: {feedback.slice(0, 2).join(', ')}</p>
      )}
    </div>
  );
}

// ============================================
// Field Validators
// ============================================

function validateFullName(value: string | boolean): string | undefined {
  if (!value || (typeof value === 'string' && value.trim().length < 2)) {
    return 'Full name is required (at least 2 characters)';
  }
  return undefined;
}

function validateEmail(value: string | boolean): string | undefined {
  if (!value || typeof value !== 'string') return 'Email is required';
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@.]+$/.test(value)) {
    return 'Please enter a valid email address';
  }
  return undefined;
}

function validatePassword(value: string | boolean): string | undefined {
  if (!value || typeof value !== 'string') return 'Password is required';
  if (value.length < 8) return 'Password must be at least 8 characters';
  return undefined;
}

function validateConfirmPassword(value: string | boolean, password: string): string | undefined {
  if (!value || typeof value !== 'string') return 'Please confirm your password';
  if (value !== password) return 'Passwords do not match';
  return undefined;
}

function validateAcceptTerms(value: string | boolean): string | undefined {
  if (!value) return 'You must accept the terms and conditions';
  return undefined;
}

// ============================================
// Registration Form Component
// ============================================

export function RegistrationForm({
  onSubmit,
  isLoading = false,
  className,
  initialEmail = '',
}: Readonly<RegistrationFormProps>) {
  const formId = useId();

  // Form state
  const [formData, setFormData] = useState<RegistrationFormData>({
    fullName: '',
    email: initialEmail,
    password: '',
    confirmPassword: '',
    acceptTerms: false,
  });

  const [errors, setErrors] = useState<RegistrationFormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Breach check state (PG-016 security enhancement)
  const [breachWarning, setBreachWarning] = useState<string | null>(null);
  const [isCheckingBreach, setIsCheckingBreach] = useState(false);
  const breachCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup breach check timeout on unmount
  useEffect(() => {
    return () => {
      if (breachCheckTimeoutRef.current) {
        clearTimeout(breachCheckTimeoutRef.current);
      }
    };
  }, []);

  // Debounced password breach check (500ms delay)
  const debouncedBreachCheck = useCallback((password: string) => {
    // Clear any pending check
    if (breachCheckTimeoutRef.current) {
      clearTimeout(breachCheckTimeoutRef.current);
    }

    // Skip check for short passwords
    if (!password || password.length < 8) {
      setBreachWarning(null);
      setIsCheckingBreach(false);
      return;
    }

    setIsCheckingBreach(true);

    breachCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const result: BreachCheckResult = await checkPasswordBreach(password);

        if (result.breached && result.count) {
          setBreachWarning(
            `This password has been found in ${formatBreachCount(result.count)} data breaches. Consider using a different password.`
          );
        } else {
          setBreachWarning(null);
        }
      } catch (error) {
        // Non-blocking - don't show error to user
        console.warn('[RegistrationForm] Breach check failed:', error);
        setBreachWarning(null);
      } finally {
        setIsCheckingBreach(false);
      }
    }, 500);
  }, []);

  // Validation
  const validateField = useCallback(
    (name: keyof RegistrationFormData, value: string | boolean): string | undefined => {
      if (name === 'fullName') return validateFullName(value);
      if (name === 'email') return validateEmail(value);
      if (name === 'password') return validatePassword(value);
      if (name === 'confirmPassword') return validateConfirmPassword(value, formData.password);
      if (name === 'acceptTerms') return validateAcceptTerms(value);
      return undefined;
    },
    [formData.password]
  );

  const validateForm = useCallback((): boolean => {
    const newErrors: RegistrationFormErrors = {};
    let isValid = true;

    (Object.keys(formData) as Array<keyof RegistrationFormData>).forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) {
        newErrors[field] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  }, [formData, validateField]);

  // Event handlers
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value, type, checked } = e.target;
      const newValue = type === 'checkbox' ? checked : value;

      setFormData((prev) => ({ ...prev, [name]: newValue }));

      // Clear error on change if field was touched
      if (touched[name]) {
        const error = validateField(name as keyof RegistrationFormData, newValue);
        setErrors((prev) => ({ ...prev, [name]: error }));
      }
    },
    [touched, validateField]
  );

  const handlePasswordChange = useCallback(
    (value: string) => {
      setFormData((prev) => ({ ...prev, password: value }));
      if (touched.password) {
        const error = validateField('password', value);
        setErrors((prev) => ({ ...prev, password: error }));
      }
      // Also revalidate confirm password if it was touched
      if (touched.confirmPassword && formData.confirmPassword) {
        const confirmError =
          formData.confirmPassword === value ? undefined : 'Passwords do not match';
        setErrors((prev) => ({ ...prev, confirmPassword: confirmError }));
      }
      // Trigger debounced breach check
      debouncedBreachCheck(value);
    },
    [touched, validateField, formData.confirmPassword, debouncedBreachCheck]
  );

  const handleConfirmPasswordChange = useCallback(
    (value: string) => {
      setFormData((prev) => ({ ...prev, confirmPassword: value }));
      if (touched.confirmPassword) {
        const error = value === formData.password ? undefined : 'Passwords do not match';
        setErrors((prev) => ({ ...prev, confirmPassword: error }));
      }
    },
    [touched, formData.password]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const { name, value, type, checked } = e.target;
      const fieldValue = type === 'checkbox' ? checked : value;

      setTouched((prev) => ({ ...prev, [name]: true }));
      const error = validateField(name as keyof RegistrationFormData, fieldValue);
      setErrors((prev) => ({ ...prev, [name]: error }));
    },
    [validateField]
  );

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();

      // Mark all fields as touched
      setTouched({
        fullName: true,
        email: true,
        password: true,
        confirmPassword: true,
        acceptTerms: true,
      });

      if (!validateForm()) {
        return;
      }

      await onSubmit(formData);
    },
    [formData, validateForm, onSubmit]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('space-y-5', className)}
      noValidate
      aria-label="Registration form"
    >
      {/* Full Name Field */}
      <div>
        <label
          htmlFor={`${formId}-fullName`}
          className="block text-sm font-medium text-slate-200 mb-2"
        >
          Full name
        </label>
        <input
          id={`${formId}-fullName`}
          name="fullName"
          type="text"
          autoComplete="name"
          value={formData.fullName}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={isLoading}
          placeholder="Enter your full name"
          aria-invalid={!!errors.fullName}
          aria-describedby={errors.fullName ? `${formId}-fullName-error` : undefined}
          className={cn(
            'w-full px-4 py-3 rounded-lg border bg-slate-800/50 text-white placeholder-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-[#137fec]/50 focus:border-primary',
            'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            errors.fullName
              ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/50'
              : 'border-slate-600/50'
          )}
        />
        {errors.fullName && (
          <p
            id={`${formId}-fullName-error`}
            role="alert"
            className="mt-1.5 text-sm text-red-400 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              error
            </span>
            {errors.fullName}
          </p>
        )}
      </div>

      {/* Email Field */}
      <div>
        <label
          htmlFor={`${formId}-email`}
          className="block text-sm font-medium text-slate-200 mb-2"
        >
          Email address
        </label>
        <input
          id={`${formId}-email`}
          name="email"
          type="email"
          autoComplete="email"
          value={formData.email}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={isLoading}
          placeholder="you@example.com"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? `${formId}-email-error` : undefined}
          className={cn(
            'w-full px-4 py-3 rounded-lg border bg-slate-800/50 text-white placeholder-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-[#137fec]/50 focus:border-primary',
            'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            errors.email
              ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/50'
              : 'border-slate-600/50'
          )}
        />
        {errors.email && (
          <p
            id={`${formId}-email-error`}
            role="alert"
            className="mt-1.5 text-sm text-red-400 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              error
            </span>
            {errors.email}
          </p>
        )}
      </div>

      {/* Password Field */}
      <div>
        <PasswordInput
          id={`${formId}-password`}
          label="Password"
          value={formData.password}
          onChange={handlePasswordChange}
          onBlur={() => {
            setTouched((prev) => ({ ...prev, password: true }));
            const error = validateField('password', formData.password);
            setErrors((prev) => ({ ...prev, password: error }));
          }}
          error={errors.password}
          disabled={isLoading}
          autoComplete="new-password"
          placeholder="Create a password"
        />
        <PasswordStrengthIndicator password={formData.password} />

        {/* Breach Warning (PG-016 security) */}
        {isCheckingBreach && (
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <span className="material-symbols-outlined animate-spin text-sm" aria-hidden="true">
              progress_activity
            </span>{' '}
            Checking password security...
          </div>
        )}
        {breachWarning && !isCheckingBreach && (
          <div
            className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 flex items-start gap-2"
            role="alert"
            aria-live="polite"
          >
            <span
              className="material-symbols-outlined text-amber-500 text-base flex-shrink-0 mt-0.5"
              aria-hidden="true"
            >
              warning
            </span>
            <p className="text-xs text-amber-400">{breachWarning}</p>
          </div>
        )}
      </div>

      {/* Confirm Password Field */}
      <div>
        <PasswordInput
          id={`${formId}-confirmPassword`}
          label="Confirm password"
          value={formData.confirmPassword}
          onChange={handleConfirmPasswordChange}
          onBlur={() => {
            setTouched((prev) => ({ ...prev, confirmPassword: true }));
            const error =
              formData.confirmPassword === formData.password ? undefined : 'Passwords do not match';
            setErrors((prev) => ({ ...prev, confirmPassword: error }));
          }}
          error={errors.confirmPassword}
          disabled={isLoading}
          autoComplete="new-password"
          placeholder="Confirm your password"
        />
      </div>

      {/* Terms Checkbox */}
      <div className="flex items-start gap-3">
        <input
          id={`${formId}-acceptTerms`}
          name="acceptTerms"
          type="checkbox"
          checked={formData.acceptTerms}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={isLoading}
          aria-invalid={!!errors.acceptTerms}
          aria-describedby={errors.acceptTerms ? `${formId}-acceptTerms-error` : undefined}
          className={cn(
            'mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-800/50',
            'text-primary focus:ring-[#137fec]/50 focus:ring-offset-0',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        />
        <div className="flex-1">
          <label htmlFor={`${formId}-acceptTerms`} className="text-sm text-slate-300">
            I agree to the{' '}
            <Link
              href="/terms"
              className="text-primary hover:text-primary/80 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href="/privacy"
              className="text-primary hover:text-primary/80 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </Link>
          </label>
          {errors.acceptTerms && (
            <p
              id={`${formId}-acceptTerms-error`}
              role="alert"
              className="mt-1 text-sm text-red-400 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                error
              </span>
              {errors.acceptTerms}
            </p>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className={cn(
          'w-full py-3 px-4 rounded-lg font-semibold text-white',
          'bg-[#137fec] hover:bg-[#137fec]/90',
          'focus:outline-none focus:ring-2 focus:ring-[#137fec]/50 focus:ring-offset-2 focus:ring-offset-slate-900',
          'transition-all disabled:opacity-50 disabled:cursor-not-allowed',
          'flex items-center justify-center gap-2'
        )}
      >
        {isLoading ? (
          <>
            <span className="material-symbols-outlined animate-spin text-xl" aria-hidden="true">
              progress_activity
            </span>{' '}
            Creating account...
          </>
        ) : (
          'Create account'
        )}
      </button>
    </form>
  );
}
