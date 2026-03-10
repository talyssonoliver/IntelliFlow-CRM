'use client';

/**
 * Module Gate Component
 * IFC-210: Dynamic Module Registry
 *
 * Wraps a module's page/layout content and checks if the module
 * is enabled for the current tenant. Redirects to /upgrade if not.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ModuleId } from '@intelliflow/domain';
import { useEnabledModules } from '@/hooks/useEnabledModules';
import { useAuth } from '@/lib/auth/AuthContext';

/** Roles that bypass module gating entirely */
const ADMIN_ROLES = new Set(['ADMIN', 'admin', 'SUPER_ADMIN', 'owner']);

interface ModuleGateProps {
  moduleId: ModuleId;
  children: React.ReactNode;
}

export function ModuleGate({ moduleId, children }: Readonly<ModuleGateProps>) {
  const { isModuleEnabled, isLoading, isError } = useEnabledModules();
  const { user } = useAuth();
  const router = useRouter();

  const isAdmin = !!user?.role && ADMIN_ROLES.has(user.role);
  const shouldRedirect = !isAdmin && !isLoading && (isError || !isModuleEnabled(moduleId));

  useEffect(() => {
    if (shouldRedirect) {
      router.replace(`/upgrade?module=${moduleId}`);
    }
  }, [shouldRedirect, moduleId, router]);

  // Show loading spinner while checking modules or during redirect
  if (isLoading || shouldRedirect) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
