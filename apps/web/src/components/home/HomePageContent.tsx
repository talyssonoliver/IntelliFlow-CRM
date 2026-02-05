'use client';

import { useAuth } from '@/lib/auth/AuthContext';
import { AuthenticatedHomePage } from './AuthenticatedHomePage';
import { PublicHomePage } from './PublicHomePage';

/**
 * Home Page Content Wrapper
 *
 * Conditionally renders the authenticated or public home page
 * based on the user's authentication state.
 */
export function HomePageContent() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#137fec] border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading...</p>
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
