/**
 * Icon Mapping Reference
 *
 * Maps common icon names to Material Symbols Outlined equivalents.
 *
 * Material Symbols Pattern:
 * <span className="material-symbols-outlined text-base" aria-hidden="true">icon_name</span>
 */

export const ICON_MAPPING = {
  // UI Controls
  Check: 'check',
  ChevronDown: 'expand_more',
  ChevronUp: 'expand_less',
  ChevronRight: 'chevron_right',
  ChevronLeft: 'chevron_left',
  X: 'close',
  Circle: 'fiber_manual_record', // Filled circle for radio indicators

  // Navigation
  Menu: 'menu',
  MoreVertical: 'more_vert',
  MoreHorizontal: 'more_horiz',
  ArrowLeft: 'arrow_back',
  ArrowRight: 'arrow_forward',
  ExternalLink: 'open_in_new',

  // Status & Feedback
  AlertCircle: 'error',
  AlertTriangle: 'warning',
  CheckCircle: 'check_circle',
  CheckCircle2: 'check_circle',
  Info: 'info',
  HelpCircle: 'help',

  // Actions
  Plus: 'add',
  Minus: 'remove',
  Edit: 'edit',
  Trash: 'delete',
  Trash2: 'delete',
  Copy: 'content_copy',
  Download: 'download',
  Upload: 'upload',
  Share: 'share',
  Search: 'search',
  Filter: 'filter_list',
  Settings: 'settings',
  Refresh: 'refresh',

  // Loading
  Loader: 'progress_activity',
  Loader2: 'progress_activity',

  // File & Documents
  File: 'description',
  FileText: 'description',
  Folder: 'folder',
  FolderOpen: 'folder_open',
  Image: 'image',
  Paperclip: 'attach_file',

  // Communication
  Mail: 'mail',
  Send: 'send',
  MessageSquare: 'chat',
  Phone: 'phone',
  Video: 'videocam',
  Bell: 'notifications',
  BellOff: 'notifications_off',

  // User & Auth
  User: 'person',
  Users: 'group',
  UserPlus: 'person_add',
  LogOut: 'logout',
  LogIn: 'login',
  Key: 'key',
  Lock: 'lock',
  Unlock: 'lock_open',
  Shield: 'shield',
  Eye: 'visibility',
  EyeOff: 'visibility_off',

  // Time & Date
  Calendar: 'calendar_today',
  Clock: 'schedule',

  // Data
  BarChart: 'bar_chart',
  PieChart: 'pie_chart',
  TrendingUp: 'trending_up',
  TrendingDown: 'trending_down',

  // Layout
  Grid: 'grid_view',
  List: 'view_list',
  Columns: 'view_column',
  Maximize: 'fullscreen',
  Minimize: 'fullscreen_exit',

  // Misc
  Star: 'star',
  Heart: 'favorite',
  Bookmark: 'bookmark',
  Flag: 'flag',
  Tag: 'label',
  Link: 'link',
  LinkOff: 'link_off',
  Zap: 'bolt',
  Target: 'gps_fixed',
  Globe: 'language',
} as const;

export type IconNameKey = keyof typeof ICON_MAPPING;
export type MaterialSymbolName = (typeof ICON_MAPPING)[IconNameKey];

/**
 * Helper component for Material Symbols
 * Usage: <MaterialIcon name="check" className="text-base" />
 */
export interface MaterialIconProps {
  name: string;
  className?: string;
  size?: 'sm' | 'base' | 'lg' | 'xl';
}

export const ICON_SIZE_CLASSES = {
  sm: 'text-sm', // 14px
  base: 'text-base', // 16px
  lg: 'text-lg', // 18px
  xl: 'text-xl', // 20px
} as const;
