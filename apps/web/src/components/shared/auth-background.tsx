'use client';

/**
 * AuthBackground - the Aurora backdrop for the sign-in pages
 *
 * Aurora Navy with the landing page's aurora ribbons rising from the bottom
 * corners and a soft violet glow behind the card, as in the landing's
 * Security section and closing call to action. The wordmark at the top left
 * goes back home. Used across login, signup, forgot-password, reset-password,
 * verify-email, MFA, SSO and logout.
 *
 * Nothing here moves on its own, so there is nothing to pause.
 *
 * @example
 * ```tsx
 * <AuthBackground>
 *   <div className="relative z-10">Content here</div>
 * </AuthBackground>
 * ```
 */

import * as React from 'react';
import Link from 'next/link';
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

export function AuthBackground({ children, className }: Readonly<AuthBackgroundProps>) {
  return (
    <main
      className={cn(
        // IFC-007: Use min-height for responsive auth pages (the full screen:
        // the sign-in pages have no app bar above them)
        // - Uses dvh (dynamic viewport height) for mobile keyboard support
        // - Falls back to vh for older browsers via CSS
        // - Centers content when it fits, scrolls when content is taller
        // - pt-24 clears the wordmark; pb-12 gives breathing room when scrolling
        // - scroll-pb-32 ensures focused inputs aren't hidden behind keyboard
        // - Hide scrollbar for cleaner appearance
        'aurora-auth relative min-h-screen min-h-[100dvh] bg-[#11175b] flex items-center justify-center overflow-y-auto overflow-x-clip px-4 pt-24 pb-12 scroll-pb-32 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]',
        className
      )}
      style={{ fontFamily: 'var(--font-manrope), system-ui, sans-serif' }}
    >
      {/* The aurora: a violet glow behind the card and the ribbons rising from the corners. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute left-1/2 top-1/3 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7655f6]/25 blur-[120px]" />
        <div className="absolute -right-24 top-0 h-80 w-80 rounded-full bg-[#28d9d4]/10 blur-[100px]" />
        <img
          src="/brand/aurora/bg/ribbon-left.webp"
          alt=""
          className="absolute -bottom-16 -left-36 w-[360px] max-w-none opacity-90 sm:-bottom-24 sm:w-[600px]"
        />
        <img
          src="/brand/aurora/bg/ribbon-right.webp"
          alt=""
          className="absolute -bottom-24 -right-44 w-[440px] max-w-none -rotate-6 opacity-90 sm:-bottom-36 sm:w-[780px]"
        />
      </div>

      <Link
        href="/"
        aria-label="Aurora home"
        className="absolute left-5 top-6 z-20 flex items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bca8ff] sm:left-8"
      >
        <img src="/brand/aurora/aurora-wave.webp" alt="" className="h-[22px] w-auto" />
        <img
          src="/brand/aurora/aurora-wordmark.webp"
          alt="Aurora"
          className="h-[18px] w-auto brightness-0 invert"
        />
      </Link>

      {/* Content */}
      {children}
    </main>
  );
}
