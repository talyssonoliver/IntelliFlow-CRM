'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import type { SidebarConfig } from './sidebar-types';

/**
 * SidebarPortalContext
 *
 * Provides a mechanism for pages to dynamically inject their sidebar configuration
 * into a shared sidebar shell. This follows the Open/Closed Principle:
 * - Open for extension: Pages can provide their own sidebar config
 * - Closed for modification: The sidebar infrastructure doesn't change
 *
 * Usage:
 * 1. Wrap your app/layout with SidebarPortalProvider
 * 2. In pages, use useSidebarConfig(config) to inject sidebar content
 * 3. The SidebarPortalRenderer renders the current config
 */

interface SidebarPortalContextValue {
  /** Current sidebar configuration */
  config: SidebarConfig | null;
  /** Set the sidebar configuration (called by pages) */
  setConfig: (config: SidebarConfig | null) => void;
  /** Portal target ref for custom content */
  portalTargetRef: React.RefObject<HTMLDivElement | null>;
}

const SidebarPortalContext = React.createContext<SidebarPortalContextValue | null>(null);

interface SidebarPortalProviderProps {
  children: React.ReactNode;
}

/**
 * SidebarPortalProvider
 *
 * Place this in a shared layout to enable dynamic sidebar injection.
 * Pages can then use useSidebarConfig() to set their sidebar content.
 */
export function SidebarPortalProvider({ children }: SidebarPortalProviderProps) {
  const [config, setConfig] = React.useState<SidebarConfig | null>(null);
  const portalTargetRef = React.useRef<HTMLDivElement>(null);

  const value = React.useMemo<SidebarPortalContextValue>(
    () => ({
      config,
      setConfig,
      portalTargetRef,
    }),
    [config]
  );

  return (
    <SidebarPortalContext.Provider value={value}>
      {children}
    </SidebarPortalContext.Provider>
  );
}

/**
 * useSidebarPortal
 *
 * Low-level hook to access the sidebar portal context.
 * Prefer useSidebarConfig() for most use cases.
 */
export function useSidebarPortal(): SidebarPortalContextValue {
  const context = React.useContext(SidebarPortalContext);
  if (!context) {
    throw new Error('useSidebarPortal must be used within a SidebarPortalProvider');
  }
  return context;
}

/**
 * useSidebarPortalOptional
 *
 * Returns null if outside a SidebarPortalProvider.
 * Useful for components that may or may not be in a portal context.
 */
export function useSidebarPortalOptional(): SidebarPortalContextValue | null {
  return React.useContext(SidebarPortalContext);
}

/**
 * useSidebarConfig
 *
 * Hook for pages to set their sidebar configuration.
 * The config will be rendered in the shared sidebar shell.
 *
 * @example
 * ```tsx
 * // In a page component
 * import { useSidebarConfig, leadsSidebarConfig } from '@/components/sidebar';
 *
 * export default function LeadsPage() {
 *   useSidebarConfig(leadsSidebarConfig);
 *   return <div>Leads content...</div>;
 * }
 * ```
 */
export function useSidebarConfig(config: SidebarConfig): void {
  const { setConfig } = useSidebarPortal();

  React.useEffect(() => {
    setConfig(config);

    // Cleanup: reset config when component unmounts
    return () => {
      setConfig(null);
    };
  }, [config, setConfig]);
}

/**
 * SidebarPortal
 *
 * Component alternative to useSidebarConfig hook.
 * Renders children into the sidebar portal target.
 *
 * @example
 * ```tsx
 * <SidebarPortal>
 *   <CustomSidebarContent />
 * </SidebarPortal>
 * ```
 */
export function SidebarPortal({ children }: { children: React.ReactNode }) {
  const { portalTargetRef } = useSidebarPortal();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !portalTargetRef.current) {
    return null;
  }

  return createPortal(children, portalTargetRef.current);
}

/**
 * SidebarPortalTarget
 *
 * Place this in your sidebar shell where custom portal content should render.
 * Used internally by the sidebar infrastructure.
 */
export function SidebarPortalTarget() {
  const { portalTargetRef } = useSidebarPortal();

  return <div ref={portalTargetRef} />;
}
