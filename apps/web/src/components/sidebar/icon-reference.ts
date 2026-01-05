/**
 * IntelliFlow Icon Reference
 *
 * Standardized Material Symbols Outlined icons for consistent visual design.
 * Based on: docs/company/brand/DESIGN_SYSTEM_LLM_INDEX.md
 *
 * Usage: <span class="material-symbols-outlined">{iconName}</span>
 */

// =============================================================================
// Module Icons - Primary icons for each CRM module
// =============================================================================

export const MODULE_ICONS = {
  dashboard: 'dashboard',
  leads: 'group',
  contacts: 'contacts',
  deals: 'handshake',
  documents: 'description',
  tickets: 'confirmation_number',
  analytics: 'analytics',
  agentApprovals: 'smart_toy',
  notifications: 'notifications',
  settings: 'settings',
  governance: 'policy',
  profile: 'account_circle',
} as const;

// =============================================================================
// View Icons - Standard icons for common view patterns
// =============================================================================

export const VIEW_ICONS = {
  // List views
  all: 'list',              // All items in a module
  my: 'person',             // Items assigned to current user
  starred: 'star',          // Starred/favorite items
  recent: 'schedule',       // Recently added/modified
  recentViewed: 'history',  // Recently viewed by user

  // Status views
  active: 'play_circle',
  pending: 'pending_actions',
  completed: 'check_circle',
  archived: 'archive',

  // Priority views
  urgent: 'priority_high',
  highPriority: 'arrow_upward',
  lowPriority: 'arrow_downward',
} as const;

// =============================================================================
// Segment Icons - Used for filtering/categorization
// =============================================================================

export const SEGMENT_ICONS = {
  // Status indicators (colored dots)
  statusDot: 'fiber_manual_record',

  // Lead/Deal stages
  hot: 'local_fire_department',
  warm: 'wb_sunny',
  cold: 'ac_unit',
  atRisk: 'warning',
  stalled: 'pause_circle',

  // Categories
  category: 'category',
  tag: 'label',
  folder: 'folder',
} as const;

// =============================================================================
// Action Icons - Icons for buttons and interactive elements
// =============================================================================

export const ACTION_ICONS = {
  // CRUD operations
  add: 'add',
  edit: 'edit',
  delete: 'delete',
  save: 'save',
  cancel: 'close',

  // Navigation
  back: 'arrow_back',
  forward: 'arrow_forward',
  expand: 'expand_more',
  collapse: 'expand_less',
  menu: 'menu',
  more: 'more_vert',

  // Communication
  email: 'mail',
  call: 'call',
  message: 'chat',

  // Data operations
  search: 'search',
  filter: 'filter_list',
  sort: 'sort',
  export: 'download',
  import: 'upload',
  refresh: 'refresh',
  sync: 'sync',

  // View modes
  grid: 'grid_view',
  list: 'view_list',
  kanban: 'view_kanban',

  // Settings
  settings: 'settings',
  configure: 'tune',
  preferences: 'toggle_on',
} as const;

// =============================================================================
// Status Icons - Feedback and state indicators
// =============================================================================

export const STATUS_ICONS = {
  // Success/Error states
  success: 'check_circle',
  error: 'error',
  warning: 'warning',
  info: 'info',

  // Loading states
  loading: 'pending',
  processing: 'autorenew',

  // SLA/Timer states
  onTrack: 'schedule',
  atRisk: 'timelapse',
  breached: 'timer_off',
  paused: 'pause_circle',
} as const;

// =============================================================================
// Feature-Specific Icons
// =============================================================================

export const FEATURE_ICONS = {
  // Tickets
  ticket: 'confirmation_number',
  slaPolicy: 'tune',
  ticketType: 'category',
  automation: 'auto_awesome',
  unassigned: 'person_off',
  assigned: 'assignment_ind',

  // Deals
  pipeline: 'trending_up',
  forecast: 'insights',
  revenue: 'payments',
  probability: 'percent',
  closeDate: 'event',
  highValue: 'star',

  // Analytics
  chart: 'bar_chart',
  trend: 'trending_up',
  report: 'summarize',
  insight: 'lightbulb',
  aiRecommendation: 'auto_awesome',

  // Agent/AI
  agent: 'smart_toy',
  approval: 'thumb_up',
  rejection: 'thumb_down',
  logs: 'receipt_long',

  // Documents
  document: 'description',
  file: 'insert_drive_file',
  attachment: 'attach_file',

  // Notifications
  notification: 'notifications',
  notificationActive: 'notifications_active',
  notificationOff: 'notifications_off',
} as const;

// =============================================================================
// Module Color Themes - Based on docs/design/mockups/dashboard-overview.html
// =============================================================================

export const MODULE_COLORS = {
  // Lead Management - Blue theme
  // Only icon color is module-specific, hover/active use standard accent colors
  leads: {
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-blue-600 dark:text-blue-400',
  },
  contacts: {
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-blue-600 dark:text-blue-400',
  },

  // Sales/Analytics - Purple/Indigo theme
  analytics: {
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-indigo-600 dark:text-indigo-400',
  },

  // Deals - Orange/Amber theme
  deals: {
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-amber-600 dark:text-amber-400',
  },

  // Tickets - Red/Rose theme
  tickets: {
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-rose-600 dark:text-rose-400',
  },

  // Documents - Green/Teal theme
  documents: {
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-teal-600 dark:text-teal-400',
  },

  // Agent Approvals - Purple theme
  agentApprovals: {
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-purple-600 dark:text-purple-400',
  },

  // Notifications - Sky/Cyan theme
  notifications: {
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-sky-600 dark:text-sky-400',
  },

  // Settings - Gray/Slate theme
  settings: {
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-400',
  },

  // Governance - Emerald theme
  governance: {
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-emerald-600 dark:text-emerald-400',
  },

  // Dashboard - Primary/Default theme
  dashboard: {
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-primary',
  },
} as const;

// =============================================================================
// Icon Type Definitions
// =============================================================================

export type ModuleIcon = typeof MODULE_ICONS[keyof typeof MODULE_ICONS];
export type ViewIcon = typeof VIEW_ICONS[keyof typeof VIEW_ICONS];
export type SegmentIcon = typeof SEGMENT_ICONS[keyof typeof SEGMENT_ICONS];
export type ActionIcon = typeof ACTION_ICONS[keyof typeof ACTION_ICONS];
export type StatusIcon = typeof STATUS_ICONS[keyof typeof STATUS_ICONS];
export type FeatureIcon = typeof FEATURE_ICONS[keyof typeof FEATURE_ICONS];
export type ModuleColorTheme = typeof MODULE_COLORS[keyof typeof MODULE_COLORS];
