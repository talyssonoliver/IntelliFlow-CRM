'use client';

/**
 * AuthBackground - Animated gradient background for auth pages
 *
 * Provides the dark theme animated background with gradient orbs
 * used across login, signup, forgot-password, and reset-password pages.
 *
 * Features:
 * - Animated gradient orbs with pulse effect
 * - Dark blue theme matching design system
 * - Subtle grid pattern overlay
 * - Full viewport coverage
 *
 * @example
 * ```tsx
 * <AuthBackground>
 *   <div className="relative z-10">Content here</div>
 * </AuthBackground>
 * ```
 */

import * as React from 'react';
import { cn } from '@intelliflow/ui';

// ============================================================
// Types
// ============================================================

export interface AuthBackgroundProps {
  /** Content to render on top of the background */
  children: React.ReactNode;
  /** Additional CSS classes for the container */
  className?: string;
}

// ============================================================
// Component
// ============================================================

export function AuthBackground({ children, className }: AuthBackgroundProps) {
  return (
    <main
      className={cn(
        'relative min-h-screen bg-[#0f172a] flex items-center justify-center overflow-hidden py-12 px-4',
        className
      )}
    >
      {/* Base gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#0d1b2a] to-[#0b1f37]" />

      {/* Animated gradient orb - top left */}
      <div
        className="absolute -left-40 top-20 h-96 w-96 rounded-full bg-[#137fec]/20 blur-3xl opacity-50 animate-pulse"
        style={{ animationDuration: '4s' }}
        aria-hidden="true"
      />

      {/* Animated gradient orb - bottom right */}
      <div
        className="absolute right-0 bottom-0 h-[500px] w-[500px] rounded-full bg-indigo-500/20 blur-3xl opacity-40 animate-pulse"
        style={{ animationDuration: '6s', animationDelay: '1s' }}
        aria-hidden="true"
      />

      {/* Subtle grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
        }}
        aria-hidden="true"
      />

      {/* Content */}
      {children}
    </main>
  );
}

export default AuthBackground;
