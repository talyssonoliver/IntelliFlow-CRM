'use client';

/**
 * AuthCard - Branded card container for auth pages
 *
 * Centered Aurora glass card on Navy with a branding header (badge, title,
 * description).
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
  /** Additional CSS classes for the badge (e.g., responsive visibility) */
  badgeClassName?: string;
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
  badgeClassName,
  title,
  description,
  children,
  footer,
  securityBadge,
  className,
  animate = true,
}: Readonly<AuthCardProps>) {
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
          <div
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-[#bca8ff] font-semibold backdrop-blur-sm text-sm mb-4 ring-1 ring-inset ring-white/15',
              badgeClassName
            )}
          >
            {badgeIcon && (
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {badgeIcon}
              </span>
            )}
            {badge}
          </div>
        )}
        <h1 className="text-3xl font-extrabold tracking-tight text-white">{title}</h1>
        {description && <p className="text-white/75 text-[15px]">{description}</p>}
      </div>

      <Card className="relative overflow-hidden rounded-3xl border border-white/15 bg-white/[0.06] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        {/* Card sheen */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-[#7655f6]/[0.06]"
          aria-hidden="true"
        />

        {/* Aurora glow in the corner */}
        <div
          className="absolute top-0 right-0 w-40 h-40 bg-[#28d9d4]/10 rounded-bl-full blur-2xl"
          aria-hidden="true"
        />

        {/* Card content */}
        <div className="relative p-8 space-y-6">{children}</div>

        {/* Security badge */}
        {securityBadge && (
          <div className="bg-white/[0.03] border-t border-white/10 px-8 py-4">
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
              <span
                className="material-symbols-outlined text-base text-[#bca8ff]"
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
