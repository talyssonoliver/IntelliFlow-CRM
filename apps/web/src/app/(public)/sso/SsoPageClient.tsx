'use client';

/**
 * Enterprise SSO Page — Client Island
 *
 * Handles interactive SSO email lookup and provider redirect.
 *
 * IMPLEMENTS: PG-124 AC-005 (SSO page with email lookup form)
 *
 * Flow:
 * 1. User enters work email
 * 2. SsoEntryForm resolves email domain → SSO provider config
 * 3. If found → show provider name, initiate SSO login via Supabase
 * 4. If not found → show fallback message with link back to standard login
 */

import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { SsoEntryForm } from '@/components/auth';
import { AuthBackground, AuthCard } from '@/components/shared';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { SsoResolution } from '@/lib/auth/sso-handler';

// ============================================
// Component
// ============================================

export default function SsoPageClient() {
  const auth = useAuth();
  const [resolution, setResolution] = useState<SsoResolution | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const formRef = useFocusTrap<HTMLDivElement>(true);

  const handleResolve = async (result: SsoResolution) => {
    setResolution(result);

    if (result.found) {
      setIsRedirecting(true);
      try {
        await auth.loginWithSso(result.config.provider_id);
      } catch {
        setIsRedirecting(false);
      }
    }
  };

  return (
    <AuthBackground>
      <div ref={formRef}>
        <AuthCard
          badge="Enterprise SSO"
          badgeIcon="lock"
          title="Sign in with SSO"
          description="Enter your work email to find your organization's SSO provider"
        >
          <SsoEntryForm onResolve={handleResolve} isLoading={isRedirecting} />

          {/* Resolution announcement for screen readers */}
          <div aria-live="polite" className="sr-only">
            {(() => {
              if (resolution?.found) return `SSO provider found: ${resolution.config.provider_name}. Redirecting...`;
              if (resolution && !resolution.found) return 'No SSO provider found for your organization.';
              return '';
            })()}
          </div>

          {/* Provider found — visual feedback */}
          {resolution?.found && (
            <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2 animate-in fade-in duration-200">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                check_circle
              </span>
              {' '}Redirecting to {resolution.config.provider_name}...
            </div>
          )}
        </AuthCard>
      </div>
    </AuthBackground>
  );
}
