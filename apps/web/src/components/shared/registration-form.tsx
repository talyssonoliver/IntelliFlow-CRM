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

import { useState, useCallback, useId } from 'react';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';
import { PasswordInput } from './password-input';

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

function calculatePasswordStrength(password: string): PasswordStrengthResult {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push('At least 8 characters');
  }

  if (password.length >= 12) {
    score += 1;
  }

  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Lowercase letter');
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Uppercase letter');
  }

  if (/\d/.test(password)) {
    score += 1;
  } else {
    feedback.push('Number');
  }

  if (/[^a-zA-Z0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Special character');
  }

  let strength: PasswordStrength;
  if (score <= 2) {
    strength = 'weak';
  } else if (score <= 3) {
    strength = 'fair';
  } else if (score <= 5) {
    strength = 'good';
  } else {
    strength = 'strong';
  }

  return { strength, score, feedback };
}

// ============================================
// Password Strength Indicator Component
// ============================================

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

function PasswordStrengthIndicator({ password, className }: PasswordStrengthIndicatorProps) {
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
        <span className={cn('text-xs font-medium', {
          'text-red-400': strength === 'weak',
          'text-yellow-400': strength === 'fair',
          'text-blue-400': strength === 'good',
          'text-green-400': strength === 'strong',
        })}>
          {strengthLabels[strength]}
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
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
        <p className="text-xs text-slate-400 mt-1">
          Add: {feedback.slice(0, 2).join(', ')}
        </p>
      )}
    </div>
  );
}

// ============================================
// Registration Form Component
// ============================================

export function RegistrationForm({
  onSubmit,
  isLoading = false,
  className,
  initialEmail = '',
}: RegistrationFormProps) {
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

  // Validation
  const validateField = useCallback((name: keyof RegistrationFormData, value: string | boolean): string | undefined => {
    switch (name) {
      case 'fullName':
        if (!value || (typeof value === 'string' && value.trim().length < 2)) {
          return 'Full name is required (at least 2 characters)';
        }
        break;
      case 'email':
        if (!value || typeof value !== 'string') {
          return 'Email is required';
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return 'Please enter a valid email address';
        }
        break;
      case 'password':
        if (!value || typeof value !== 'string') {
          return 'Password is required';
        }
        if (value.length < 8) {
          return 'Password must be at least 8 characters';
        }
        break;
      case 'confirmPassword':
        if (!value || typeof value !== 'string') {
          return 'Please confirm your password';
        }
        if (value !== formData.password) {
          return 'Passwords do not match';
        }
        break;
      case 'acceptTerms':
        if (!value) {
          return 'You must accept the terms and conditions';
        }
        break;
    }
    return undefined;
  }, [formData.password]);

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
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;

    setFormData((prev) => ({ ...prev, [name]: newValue }));

    // Clear error on change if field was touched
    if (touched[name]) {
      const error = validateField(name as keyof RegistrationFormData, newValue);
      setErrors((prev) => ({ ...prev, [name]: error }));
    }
  }, [touched, validateField]);

  const handlePasswordChange = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, password: value }));
    if (touched.password) {
      const error = validateField('password', value);
      setErrors((prev) => ({ ...prev, password: error }));
    }
    // Also revalidate confirm password if it was touched
    if (touched.confirmPassword && formData.confirmPassword) {
      const confirmError = formData.confirmPassword !== value ? 'Passwords do not match' : undefined;
      setErrors((prev) => ({ ...prev, confirmPassword: confirmError }));
    }
  }, [touched, validateField, formData.confirmPassword]);

  const handleConfirmPasswordChange = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, confirmPassword: value }));
    if (touched.confirmPassword) {
      const error = value !== formData.password ? 'Passwords do not match' : undefined;
      setErrors((prev) => ({ ...prev, confirmPassword: error }));
    }
  }, [touched, formData.password]);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    const fieldValue = type === 'checkbox' ? checked : value;

    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validateField(name as keyof RegistrationFormData, fieldValue);
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, [validateField]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
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
  }, [formData, validateForm, onSubmit]);

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
            'focus:outline-none focus:ring-2 focus:ring-[#137fec]/50 focus:border-[#137fec]',
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
            'focus:outline-none focus:ring-2 focus:ring-[#137fec]/50 focus:border-[#137fec]',
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
            const error = formData.confirmPassword !== formData.password
              ? 'Passwords do not match'
              : undefined;
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
            'text-[#137fec] focus:ring-[#137fec]/50 focus:ring-offset-0',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        />
        <div className="flex-1">
          <label
            htmlFor={`${formId}-acceptTerms`}
            className="text-sm text-slate-300"
          >
            I agree to the{' '}
            <Link
              href="/terms"
              className="text-[#137fec] hover:text-[#137fec]/80 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href="/privacy"
              className="text-[#137fec] hover:text-[#137fec]/80 underline"
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
            <span
              className="material-symbols-outlined animate-spin text-xl"
              aria-hidden="true"
            >
              progress_activity
            </span>
            Creating account...
          </>
        ) : (
          'Create account'
        )}
      </button>
    </form>
  );
}
