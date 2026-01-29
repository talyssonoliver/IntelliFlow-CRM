'use client';

import * as React from 'react';
import type { SidebarContextValue } from './sidebar-types';

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

interface SidebarProviderProps {
  children: React.ReactNode;
  /** Default pinned state */
  defaultPinned?: boolean;
  /** Storage key for persisting state */
  storageKey?: string;
}

export function SidebarProvider({
  children,
  defaultPinned = false,
  storageKey = 'intelliflow-sidebar-pinned',
}: SidebarProviderProps) {
  // Start with default value to avoid hydration mismatch
  const [isPinned, setIsPinned] = React.useState(defaultPinned);
  const [isHovered, setIsHovered] = React.useState(false);
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const [hasMounted, setHasMounted] = React.useState(false);

  // Read from localStorage only after mount to avoid hydration mismatch
  React.useEffect(() => {
    setHasMounted(true);
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) {
      setIsPinned(stored === 'true');
    }
  }, [storageKey]);

  // Persist pinned state to localStorage (only after initial mount)
  React.useEffect(() => {
    if (hasMounted) {
      localStorage.setItem(storageKey, String(isPinned));
    }
  }, [isPinned, storageKey, hasMounted]);

  // Close mobile sidebar on route change or resize to desktop
  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent body scroll when mobile sidebar is open
  React.useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  const togglePinned = React.useCallback(() => {
    setIsPinned((prev) => !prev);
  }, []);

  const setHovered = React.useCallback((hovered: boolean) => {
    setIsHovered(hovered);
  }, []);

  const toggleMobile = React.useCallback(() => {
    setIsMobileOpen((prev) => !prev);
  }, []);

  const closeMobile = React.useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  const closeSidebar = React.useCallback(() => {
    setIsPinned(false);
    setIsHovered(false);
    setIsMobileOpen(false);
  }, []);

  // Sidebar is visible if pinned OR hovered
  const isVisible = isPinned || isHovered;
  const isExpanded = isVisible;

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      isExpanded,
      isPinned,
      isHovered,
      isMobileOpen,
      togglePinned,
      setHovered,
      toggleMobile,
      closeMobile,
      closeSidebar,
      isVisible,
    }),
    [isExpanded, isPinned, isHovered, isMobileOpen, togglePinned, setHovered, toggleMobile, closeMobile, closeSidebar, isVisible]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}

/**
 * Optional hook that returns null instead of throwing if outside provider.
 * Useful for components that may or may not be inside a sidebar context.
 */
export function useSidebarOptional(): SidebarContextValue | null {
  return React.useContext(SidebarContext);
}
