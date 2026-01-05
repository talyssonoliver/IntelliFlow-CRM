'use client';

/**
 * AuthCard - Branded card container for auth pages
 *
 * Centered card with branding header (badge, title, description).
 * Used across login, signup, forgot-password, and reset-password pages.
 *
 * Features:
 * - Optional badge with icon
 * - Title and description
 * - Glass-morphism styling with backdrop blur
 * - Gradient overlays matching design system
 * - Optional footer content
 *
 * @example
 * ```tsx
 * <AuthCard
 *   badge="SECURE ACCESS"
 *   badgeIcon="shield_lock"
 *   title="Welcome back"
 *   description="Sign in to your account"
 *   footer={<p>Don't have an account? <Link href="/signup">Sign up</Link></p>}
 * >
 *   <form>...</form>
 * </AuthCard>
 * ```
 */

import * as React from 'react';
import { cn, Card } from '@intelliflow/ui';

// ============================================================
// Types
// ============================================================

export interface AuthCardProps {
  /** Badge text displayed above the card */
  badge?: string;
  /** Material Symbol icon name for the badge */
  badgeIcon?: string;
  /** Main title (h1) */
  title: string;
  /** Description text below the title */
  description?: string;
  /** Card content (forms, inputs, etc.) */
  children: React.ReactNode;
  /** Footer content (links, etc.) */
  footer?: React.ReactNode;
  /** Security badge content shown at bottom of card */
  securityBadge?: string;
  /** Additional CSS classes for the container */
  className?: string;
  /** Animation variant */
  animate?: boolean;
}

// ============================================================
// Component
// ============================================================

export function AuthCard({
  badge,
  badgeIcon,
  title,
  description,
  children,
  footer,
  securityBadge,
  className,
  animate = true,
}: AuthCardProps) {
  return (
    <div
      className={cn(
        'relative z-10 w-full max-w-md',
        animate && 'animate-in fade-in slide-in-from-bottom-4 duration-700',
        className
      )}
    >
      {/* Branding header */}
      <div className="text-center mb-8 space-y-2">
        {badge && (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-[#7cc4ff] font-medium backdrop-blur-sm text-sm mb-4">
            {badgeIcon && (
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {badgeIcon}
              </span>
            )}
            {badge}
          </div>
        )}
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        {description && <p className="text-slate-300 text-sm">{description}</p>}
      </div>

      <Card className="relative overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl rounded-2xl">
        {/* Card gradient overlay */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-[#137fec]/[0.03]"
          aria-hidden="true"
        />

        {/* Security indicator glow */}
        <div
          className="absolute top-0 right-0 w-32 h-32 bg-[#137fec]/10 rounded-bl-full blur-2xl"
          aria-hidden="true"
        />

        {/* Card content */}
        <div className="relative p-8 space-y-6">{children}</div>

        {/* Security badge */}
        {securityBadge && (
          <div className="bg-white/[0.03] border-t border-white/10 px-8 py-4">
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
              <span
                className="material-symbols-outlined text-base text-[#7cc4ff]"
                aria-hidden="true"
              >
                verified_user
              </span>
              <span>{securityBadge}</span>
            </div>
          </div>
        )}
      </Card>

      {/* Footer */}
      {footer && <div className="mt-6">{footer}</div>}
    </div>
  );
}

export default AuthCard;
