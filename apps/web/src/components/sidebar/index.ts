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
  leadsSidebarConfig,
  createLeadsSidebarConfig,
  createLeadsSettingsSidebarConfig,
  isLeadSettingsPage,
  contactsSidebarConfig,
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
  ticketsSidebarConfig,
  createTicketsSidebarConfig,
  createTicketsSettingsSidebarConfig,
  isTicketSettingsPage,
  createAnalyticsSidebarConfig,
  createAnalyticsSettingsSidebarConfig,
  isReportSettingsPage,
  agentApprovalsSidebarConfig,
  createAgentApprovalsSidebarConfig,
  AI_AGENT_SECTIONS,
  type AIAgentSection,
  notificationsSidebarConfig,
  createNotificationsSidebarConfig,
  createNotificationsSettingsSidebarConfig,
  isNotificationSettingsPage,
  governanceSidebarConfig,
  settingsSidebarConfig,
  billingSidebarConfig,
  accountsSidebarConfig,
  createAccountsSidebarConfig,
  createAccountsSettingsSidebarConfig,
  isAccountSettingsPage,
  developerSidebarConfig,
  tasksSidebarConfig,
  createTasksSidebarConfig,
  createTasksSettingsSidebarConfig,
  isTaskSettingsPage,
  createCasesSidebarConfig,
  createCasesSettingsSidebarConfig,
  isCaseSettingsPage,
  appointmentsSidebarConfig,
  createAppointmentsSidebarConfig,
  createAppointmentsSettingsSidebarConfig,
  isCalendarSettingsPage,
  emailSidebarConfig,
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
