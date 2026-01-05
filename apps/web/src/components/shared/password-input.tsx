'use client';

/**
 * PasswordInput - Password field with visibility toggle
 *
 * Reusable password input with show/hide toggle button.
 * Used in login, signup, change-password, and reset-password pages.
 *
 * Features:
 * - Show/hide password toggle with Material Symbols icons
 * - Error state styling
 * - Accessible with ARIA attributes
 * - Dark theme styling matching design system
 * - Flexible autocomplete support
 *
 * @example
 * ```tsx
 * <PasswordInput
 *   id="password"
 *   value={password}
 *   onChange={setPassword}
 *   error={errors.password}
 *   placeholder="Enter your password"
 * />
 * ```
 */

import * as React from 'react';
import { cn } from '@intelliflow/ui';

// ============================================================
// Types
// ============================================================

export interface PasswordInputProps {
  /** Input field ID */
  id?: string;
  /** Input field name */
  name?: string;
  /** Current password value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Blur handler */
  onBlur?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Error message to display */
  error?: string;
  /** Error ID for aria-describedby */
  errorId?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Autocomplete attribute for password managers */
  autoComplete?: 'current-password' | 'new-password';
  /** Additional CSS classes for the input wrapper */
  className?: string;
  /** Label text (optional, renders above input) */
  label?: string;
  /** Additional content to render in the label row (e.g., "Forgot password?" link) */
  labelExtra?: React.ReactNode;
}

// ============================================================
// Component
// ============================================================

export function PasswordInput({
  id = 'password',
  name,
  value,
  onChange,
  onBlur,
  placeholder = 'Enter your password',
  error,
  errorId,
  disabled = false,
  autoComplete = 'current-password',
  className,
  label,
  labelExtra,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = React.useState(false);

  const resolvedErrorId = errorId || (error ? `${id}-error` : undefined);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Label row */}
      {(label || labelExtra) && (
        <div className="flex items-center justify-between">
          {label && (
            <label htmlFor={id} className="block text-sm font-medium text-slate-200">
              {label}
            </label>
          )}
          {labelExtra}
        </div>
      )}

      {/* Input with toggle */}
      <div className="relative">
        <span
          className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl"
          aria-hidden="true"
        >
          lock
        </span>
        <input
          id={id}
          name={name || id}
          type={showPassword ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={cn(
            'w-full pl-11 pr-12 py-3 rounded-lg border bg-white/5 text-white placeholder:text-slate-400 backdrop-blur-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:border-transparent',
            error ? 'border-red-500/50' : 'border-white/10 hover:border-white/20'
          )}
          placeholder={placeholder}
          aria-describedby={resolvedErrorId}
          aria-invalid={!!error}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] rounded p-1"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          disabled={disabled}
        >
          <span className="material-symbols-outlined text-xl" aria-hidden="true">
            {showPassword ? 'visibility_off' : 'visibility'}
          </span>
        </button>
      </div>

      {/* Error message */}
      {error && (
        <p
          id={resolvedErrorId}
          className="text-sm text-red-400 flex items-center gap-1 animate-in fade-in slide-in-from-top-1 duration-200"
          role="alert"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            error
          </span>
          {error}
        </p>
      )}
    </div>
  );
}

export default PasswordInput;
