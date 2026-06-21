'use client';

/**
 * Module Gate Component
 * IFC-210: Dynamic Module Registry
 *
 * Wraps a module's page/layout content and checks if the module
 * is enabled for the current tenant. Renders ModulePaywall inline
 * when access is denied, allowing users to see the upgrade CTA
 * without leaving the current context.
 *
 * Gating is PLAN-based, matching the backend `requireModule` guard: a tenant's
 * own ADMIN/owner is still bound by the tenant's plan (this codebase has no
 * platform super-admin concept). A previous tenant-admin bypass here let a
 * lower-tier admin see the paid UI while every data call returned FORBIDDEN —
 * the paywall must show instead.
 */

import type { ModuleId } from '@intelliflow/domain';
import { useEnabledModules } from '@/hooks/useEnabledModules';
import { ModulePaywall } from './ModulePaywall';

interface ModuleGateProps {
  moduleId: ModuleId;
  children: React.ReactNode;
}

export function ModuleGate({ moduleId, children }: Readonly<ModuleGateProps>) {
  const { isModuleEnabled, isLoading, isError } = useEnabledModules();

  // While the access query is in-flight, show a loading spinner.
  // This avoids a flash-of-paywall for users who do have access.
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // Module not enabled for this tenant — show inline upgrade paywall.
  if (isError || !isModuleEnabled(moduleId)) {
    return <ModulePaywall moduleId={moduleId} accessError={isError} />;
  }

  return <>{children}</>;
}
