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

import Link from 'next/link';
import {
  MODULE_METADATA,
  MODULE_NOT_IN_WORKSPACE_MESSAGE,
  getModulesForBusinessType,
  type ModuleId,
} from '@intelliflow/domain';
import { useEnabledModules } from '@/hooks/useEnabledModules';
import { ModulePaywall } from './ModulePaywall';

interface ModuleGateProps {
  moduleId: ModuleId;
  children: React.ReactNode;
}

/**
 * Shown when the workspace's business type does not include the module (Cases for a handyman).
 * An upgrade would not help here, so this is not the paywall: it says the tool is not part of the
 * workspace and points to the setting that decides it. Nothing is deleted; the route still exists.
 */
function WorkspaceModuleNotice({ moduleId }: Readonly<{ moduleId: ModuleId }>) {
  const label = MODULE_METADATA[moduleId]?.label ?? moduleId;
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center"
      data-testid="workspace-module-notice"
    >
      <div className="max-w-md space-y-4">
        <span
          className="material-symbols-outlined text-4xl text-slate-400 dark:text-slate-500"
          aria-hidden="true"
        >
          lock
        </span>
        <h1 className="text-2xl font-bold tracking-tight">{label}</h1>
        <p className="text-sm text-muted-foreground">
          {MODULE_NOT_IN_WORKSPACE_MESSAGE}. This tool is for a different kind of business. An admin
          can check the business type in workspace settings.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/settings/workspace"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Workspace settings
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ModuleGate({ moduleId, children }: Readonly<ModuleGateProps>) {
  const { isModuleEnabled, isLoading, isError, businessType } = useEnabledModules();

  // While the access query is in-flight, show a loading spinner.
  // This avoids a flash-of-paywall for users who do have access.
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // Not enabled because the business type does not include it (a null type gates like OTHER):
  // an upgrade would not help, so say it is not part of the workspace instead of selling a plan.
  if (
    !isError &&
    !isModuleEnabled(moduleId) &&
    businessType !== undefined &&
    !getModulesForBusinessType(businessType).includes(moduleId)
  ) {
    return <WorkspaceModuleNotice moduleId={moduleId} />;
  }

  // Module not enabled for this tenant — show inline upgrade paywall.
  if (isError || !isModuleEnabled(moduleId)) {
    return <ModulePaywall moduleId={moduleId} accessError={isError} />;
  }

  return <>{children}</>;
}
