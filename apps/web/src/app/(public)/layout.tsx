'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';
import { useAuth } from '@/lib/auth/AuthContext';

// Auth pages that should NOT show footer (they have their own full-screen layout)
const AUTH_PAGES_NO_FOOTER = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/logout',
  '/verify-email',
  '/mfa',
  '/auth/callback',
  '/sso',
];

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  // IFC-007: Don't show footer on auth pages (they use AuthBackground full-screen layout)
  const isAuthPage = AUTH_PAGES_NO_FOOTER.some((page) => pathname?.startsWith(page));

  // Show PublicHeader if:
  // 1. On auth pages (login, signup, etc.) - ALWAYS show header, redirect will handle auth users
  // 2. On non-auth pages when user is NOT authenticated
  // This prevents header flash on auth pages when auth state changes
  const showPublicHeader = isAuthPage || !isAuthenticated;

  // Debug: Log auth state for public layout
  console.log('[PublicLayout]', {
    pathname,
    isAuthenticated,
    isLoading,
    showPublicHeader,
    isAuthPage,
  });

  return (
    <>
      {showPublicHeader && <PublicHeader />}
      {/* IFC-007: Auth pages use their own full-height background, no min-h-screen needed */}
      {isAuthPage ? (
        children
      ) : (
        <main className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">{children}</main>
      )}
      {!isAuthPage && !isAuthenticated && <PublicFooter />}
    </>
  );
}
