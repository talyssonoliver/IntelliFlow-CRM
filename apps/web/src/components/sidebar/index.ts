// Main components
export { AppSidebar, SidebarTrigger, SidebarInset, MobileSidebar } from './AppSidebar';
export { SidebarProvider, useSidebar, useSidebarOptional } from './SidebarContext';

// Portal-based sidebar (for dynamic content injection)
export {
  SidebarPortalProvider,
  useSidebarPortal,
  useSidebarPortalOptional,
  useSidebarConfig,
  SidebarPortal,
  SidebarPortalTarget,
} from './SidebarPortalContext';

// Types
export type {
  SidebarItem,
  SidebarSection,
  SidebarConfig,
  SidebarContextValue,
  SidebarAnnouncement,
} from './sidebar-types';

// Configs
export {
  leadsSidebarConfig,
  contactsSidebarConfig,
  documentsSidebarConfig,
  dealsSidebarConfig,
  ticketsSidebarConfig,
  analyticsSidebarConfig,
  agentApprovalsSidebarConfig,
  notificationsSidebarConfig,
  governanceSidebarConfig,
  settingsSidebarConfig,
  billingSidebarConfig,
} from './configs';

// Icon reference and module colors
export {
  MODULE_ICONS,
  VIEW_ICONS,
  SEGMENT_ICONS,
  ACTION_ICONS,
  STATUS_ICONS,
  FEATURE_ICONS,
  MODULE_COLORS,
} from './icon-reference';

export type { ModuleColorTheme } from './icon-reference';
