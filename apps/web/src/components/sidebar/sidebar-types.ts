/**
 * Sidebar Types
 *
 * Type definitions for the collapsible AppSidebar component.
 */

import type * as React from 'react';

export interface SidebarItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  /** Color class for segment indicators (e.g., 'text-success', 'text-warning') */
  color?: string;
  /** Badge count to display */
  badge?: number;
  /** Required roles to see this item (empty = visible to all) */
  roles?: string[];
}

export interface SidebarSection {
  id: string;
  title: string;
  items: SidebarItem[];
}

export interface SidebarConfig {
  /** Unique identifier for the module */
  moduleId: string;
  /** Display title for the module */
  moduleTitle: string;
  /** Icon for the module header */
  moduleIcon: string;
  /** Sections containing navigation items */
  sections: SidebarSection[];
  /** Settings link at the bottom */
  settingsHref?: string;
  /** Callback when "Module Settings" is clicked (renders button instead of Link when provided) */
  onSettingsClick?: () => void;
  /** Whether to show the settings link */
  showSettings?: boolean;
  /** Optional custom content rendered above navigation sections (e.g., action buttons) */
  beforeContent?: React.ComponentType<{ isExpanded: boolean }>;
  /** Optional custom content rendered below navigation sections */
  afterContent?: React.ComponentType<{ isExpanded: boolean }>;
  /** Optional custom content rendered in the footer, above Module Settings */
  footerContent?: React.ComponentType<{ isExpanded: boolean }>;
}

export interface SidebarContextValue {
  /** Whether the sidebar is currently expanded */
  isExpanded: boolean;
  /** Whether the sidebar is pinned open */
  isPinned: boolean;
  /** Whether the sidebar is currently being hovered */
  isHovered: boolean;
  /** Whether the mobile sidebar drawer is open */
  isMobileOpen: boolean;
  /** Toggle the pinned state */
  togglePinned: () => void;
  /** Set hover state */
  setHovered: (hovered: boolean) => void;
  /** Toggle the mobile sidebar drawer */
  toggleMobile: () => void;
  /** Close the mobile sidebar drawer */
  closeMobile: () => void;
  /** Close the sidebar (unpin, unhover, and close mobile) */
  closeSidebar: () => void;
  /** Whether sidebar should be visible (expanded, pinned, or hovered) */
  isVisible: boolean;
}

/**
 * Sidebar Announcement - Marketing updates or app announcements
 * Displayed at the bottom of the sidebar, visible yet unobtrusive
 */
export interface SidebarAnnouncement {
  /** Unique identifier for the announcement */
  id: string;
  /** Short headline */
  headline: string;
  /** Brief description */
  description: string;
  /** Action button text */
  actionText: string;
  /** Action URL or callback */
  actionHref: string;
  /** Optional icon (Material Symbols name) */
  icon?: string;
}
