'use client';

/**
 * Module Gate Component
 * IFC-210: Dynamic Module Registry
 *
 * Wraps a module's page/layout content and checks if the module
 * is enabled for the current tenant. Shows ModulePaywall if not.
 */

import type { ModuleId } from '@intelliflow/domain';
import { useEnabledModules } from '@/hooks/useEnabledModules';
import { ModulePaywall } from './ModulePaywall';

interface ModuleGateProps {
  moduleId: ModuleId;
  children: React.ReactNode;
}

export function ModuleGate({ moduleId, children }: ModuleGateProps) {
  const { isModuleEnabled, isLoading } = useEnabledModules();

  // Show loading skeleton while checking modules
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isModuleEnabled(moduleId)) {
    return <ModulePaywall moduleId={moduleId} />;
  }

  return <>{children}</>;
}
