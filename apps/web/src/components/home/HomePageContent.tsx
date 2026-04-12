'use client';

import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth/AuthContext';

/**
 * Authenticated skeleton — neutral white/light background grid placeholder
 * shown while the AuthenticatedHomePage chunk loads.
 * Must NOT use the public page dark background (prevents CLS for auth users).
 */
function AuthenticatedSkeleton() {
  return (
    <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
      <div className="px-4 sm:px-6 lg:px-8 xl:px-12 py-6 max-w-[1800px] mx-auto">
        {/* Welcome banner skeleton */}
        <div className="bg-gradient-to-r from-[#137fec]/20 to-indigo-600/20 rounded-xl p-8 mb-6 animate-pulse">
          <div className="h-8 w-48 bg-white/20 rounded mb-4" />
          <div className="h-6 w-64 bg-white/20 rounded" />
        </div>
        {/* Dashboard grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <div className="col-span-1 md:col-span-2 lg:col-span-3 h-48 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] animate-pulse" />
          <div className="col-span-1 h-48 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] animate-pulse" />
          <div className="col-span-1 md:col-span-2 lg:col-span-3 h-64 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] animate-pulse" />
          <div className="col-span-1 h-48 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] animate-pulse" />
        </div>
      </div>
    </div>
  );
}

const AuthenticatedHomePage = dynamic(
  () => import('./AuthenticatedHomePage').then((m) => ({ default: m.AuthenticatedHomePage })),
  { ssr: false, loading: () => <AuthenticatedSkeleton /> }
);

const PublicHomePage = dynamic(
  () => import('./PublicHomePage').then((m) => ({ default: m.PublicHomePage })),
  { ssr: true }
);

/**
 * Home Page Content Wrapper
 *
 * Conditionally renders the authenticated or public home page
 * based on the user's authentication state.
 * Code-split via next/dynamic to reduce initial bundle size (PG-166).
 */
export function HomePageContent() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#137fec] border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600 dark:text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Show authenticated home page for logged-in users
  if (isAuthenticated) {
    return <AuthenticatedHomePage />;
  }

  // Show public home page for visitors
  return <PublicHomePage />;
}
