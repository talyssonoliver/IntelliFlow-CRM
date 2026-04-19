'use client';

/**
 * Enabled Modules Hook
 * IFC-210: Dynamic Module Registry
 *
 * Queries the backend for the tenant's enabled modules
 * and provides helpers to check module access.
 * Uses a 5-minute stale time to avoid excessive re-fetching.
 */

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { type ModuleId, getRoutesForModules, type NavRouteConfig } from '@intelliflow/domain';

export interface UseEnabledModulesResult {
  /** List of enabled module IDs in canonical order */
  enabledModules: ModuleId[];
  /** Check if a specific module is enabled */
  isModuleEnabled: (moduleId: ModuleId) => boolean;
  /** Navigation routes for all enabled modules */
  enabledRoutes: NavRouteConfig[];
  /** Current plan tier */
  plan: string | undefined;
  /** Whether the query is still loading */
  isLoading: boolean;
  /** Whether there was an error */
  isError: boolean;
}

export function useEnabledModules(): UseEnabledModulesResult {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data, isLoading, isError } = trpc.moduleAccess.getEnabledModules.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    // Fail closed: no placeholderData — unresolved access defaults to CORE_CRM only
  });

  // Fail closed: if query hasn't resolved, only grant CORE_CRM
  const enabledModules = useMemo<ModuleId[]>(
    () => (data?.modules ?? ['CORE_CRM']) as ModuleId[],
    [data?.modules]
  );
  const plan = data?.plan;

  const isModuleEnabled = useMemo(() => {
    const enabledSet = new Set(enabledModules);
    return (moduleId: ModuleId) => enabledSet.has(moduleId);
  }, [enabledModules]);

  const enabledRoutes = useMemo(() => getRoutesForModules(enabledModules), [enabledModules]);

  return {
    enabledModules,
    isModuleEnabled,
    enabledRoutes,
    plan,
    isLoading: authLoading || isLoading,
    isError: isAuthenticated ? isError : false,
  };
}
