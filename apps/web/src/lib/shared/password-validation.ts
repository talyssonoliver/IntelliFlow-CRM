/**
 * Password Validation Utilities
 *
 * IMPLEMENTS: PG-020 (Reset Password page)
 *
 * Centralized password validation logic extracted from registration-form.tsx
 * for reuse across signup, reset-password, and change-password flows.
 */

// ============================================
// Types
// ============================================

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordStrengthResult {
  strength: PasswordStrength;
  score: number;
  percentage: number;
  feedback: string[];
  meetsMinimum: boolean;
}

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PasswordRequirement {
  id: string;
  label: string;
  test: (password: string) => boolean;
  weight: number;
}

// ============================================
// Constants
// ============================================

export const MIN_PASSWORD_LENGTH = 8;
export const STRONG_PASSWORD_LENGTH = 12;
export const MAX_SCORE = 6;

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  {
    id: 'length',
    label: 'At least 8 characters',
    test: (p) => p.length >= MIN_PASSWORD_LENGTH,
    weight: 1,
  },
  {
    id: 'longLength',
    label: '12+ characters (recommended)',
    test: (p) => p.length >= STRONG_PASSWORD_LENGTH,
    weight: 1,
  },
  {
    id: 'lowercase',
    label: 'Lowercase letter',
    test: (p) => /[a-z]/.test(p),
    weight: 1,
  },
  {
    id: 'uppercase',
    label: 'Uppercase letter',
    test: (p) => /[A-Z]/.test(p),
    weight: 1,
  },
  {
    id: 'number',
    label: 'Number',
    test: (p) => /\d/.test(p),
    weight: 1,
  },
  {
    id: 'special',
    label: 'Special character (!@#$%^&*...)',
    test: (p) => /[^a-zA-Z0-9]/.test(p),
    weight: 1,
  },
];

// ============================================
// Core Functions
// ============================================

/**
 * Calculate password strength with detailed feedback
 */
export function calculatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return {
      strength: 'weak',
      score: 0,
      percentage: 0,
      feedback: PASSWORD_REQUIREMENTS.filter((r) => r.id !== 'longLength').map(
        (r) => r.label
      ),
      meetsMinimum: false,
    };
  }

  const feedback: string[] = [];
  let score = 0;

  for (const req of PASSWORD_REQUIREMENTS) {
    if (req.test(password)) {
      score += req.weight;
    } else if (req.id !== 'longLength') {
      // Don't show 12+ as a missing requirement, it's a bonus
      feedback.push(req.label);
    }
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

  return {
    strength,
    score,
    percentage: Math.round((score / MAX_SCORE) * 100),
    feedback,
    meetsMinimum: score >= 3,
  };
}

/**
 * Validate a password meets minimum requirements
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password) {
    return { valid: false, errors: ['Password is required'] };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const strength = calculatePasswordStrength(password);
  if (!strength.meetsMinimum) {
    errors.push(
      'Password is too weak. Add uppercase, numbers, or special characters.'
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that two passwords match
 */
export function validatePasswordMatch(
  password: string,
  confirmPassword: string
): PasswordValidationResult {
  if (!confirmPassword) {
    return { valid: false, errors: ['Please confirm your password'] };
  }

  if (password !== confirmPassword) {
    return { valid: false, errors: ['Passwords do not match'] };
  }

  return { valid: true, errors: [] };
}

/**
 * Check if a specific requirement is met
 */
export function checkRequirement(
  password: string,
  requirementId: string
): boolean {
  const requirement = PASSWORD_REQUIREMENTS.find((r) => r.id === requirementId);
  if (!requirement) return false;
  return requirement.test(password);
}

/**
 * Get all unmet requirements for a password
 */
export function getUnmetRequirements(password: string): PasswordRequirement[] {
  if (!password) {
    return PASSWORD_REQUIREMENTS.filter((r) => r.id !== 'longLength');
  }

  return PASSWORD_REQUIREMENTS.filter(
    (r) => !r.test(password) && r.id !== 'longLength'
  );
}

// ============================================
// UI Helpers
// ============================================

export const STRENGTH_CONFIG: Record<
  PasswordStrength,
  {
    color: string;
    bgColor: string;
    textColor: string;
    label: string;
    width: string;
  }
> = {
  weak: {
    color: 'bg-red-500',
    bgColor: 'bg-red-500/20',
    textColor: 'text-red-400',
    label: 'Weak',
    width: 'w-1/4',
  },
  fair: {
    color: 'bg-yellow-500',
    bgColor: 'bg-yellow-500/20',
    textColor: 'text-yellow-400',
    label: 'Fair',
    width: 'w-2/4',
  },
  good: {
    color: 'bg-blue-500',
    bgColor: 'bg-blue-500/20',
    textColor: 'text-blue-400',
    label: 'Good',
    width: 'w-3/4',
  },
  strong: {
    color: 'bg-green-500',
    bgColor: 'bg-green-500/20',
    textColor: 'text-green-400',
    label: 'Strong',
    width: 'w-full',
  },
};

/**
 * Get the Tailwind color classes for a strength level
 */
export function getStrengthColors(strength: PasswordStrength): {
  bar: string;
  text: string;
  bg: string;
} {
  const config = STRENGTH_CONFIG[strength];
  return {
    bar: config.color,
    text: config.textColor,
    bg: config.bgColor,
  };
}

/**
 * Get human-readable label for strength level
 */
export function getStrengthLabel(strength: PasswordStrength): string {
  return STRENGTH_CONFIG[strength].label;
}

/**
 * Get width class for strength progress bar
 */
export function getStrengthWidth(strength: PasswordStrength): string {
  return STRENGTH_CONFIG[strength].width;
}
