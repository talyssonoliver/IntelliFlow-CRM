// Main components
export { AppSidebar, SidebarTrigger, SidebarInset, MobileSidebar } from './AppSidebar';
export { SidebarWithSuspense } from './SidebarSuspenseWrapper';
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
  createLeadsSidebarConfig,
  createLeadsSettingsSidebarConfig,
  isLeadSettingsPage,
  createContactsSidebarConfig,
  createContactsSettingsSidebarConfig,
  isContactSettingsPage,
  createDocumentsSidebarConfig,
  createDocumentsSettingsSidebarConfig,
  isDocumentSettingsPage,
  dealsSidebarConfig,
  createDealsSidebarConfig,
  createDealsSettingsSidebarConfig,
  isDealSettingsPage,
  createTicketsSidebarConfig,
  createTicketsSettingsSidebarConfig,
  isTicketSettingsPage,
  createAnalyticsSidebarConfig,
  createAnalyticsSettingsSidebarConfig,
  isReportSettingsPage,
  createAgentApprovalsSidebarConfig,
  AI_AGENT_SECTIONS,
  type AIAgentSection,
  createNotificationsSidebarConfig,
  createNotificationsSettingsSidebarConfig,
  isNotificationSettingsPage,
  governanceSidebarConfig,
  settingsSidebarConfig,
  billingSidebarConfig,
  createAccountsSidebarConfig,
  createAccountsSettingsSidebarConfig,
  isAccountSettingsPage,
  developerSidebarConfig,
  createTasksSidebarConfig,
  createTasksSettingsSidebarConfig,
  isTaskSettingsPage,
  createCasesSidebarConfig,
  createCasesSettingsSidebarConfig,
  isCaseSettingsPage,
  createAppointmentsSidebarConfig,
  createAppointmentsSettingsSidebarConfig,
  isCalendarSettingsPage,
  createEmailSidebarConfig,
  createEmailSettingsSidebarConfig,
  isEmailSettingsPage,
  helpCenterSidebarConfig,
  insightsSidebarConfig,
  supportTicketsSidebarConfig,
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
