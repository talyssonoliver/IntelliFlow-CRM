import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import {
  EmailComposeButton,
  EmailSidebarExtras,
  EmailStorageIndicator,
} from './EmailSidebarContent';

/** Settings items shown when on an email settings page */
export const EMAIL_SETTINGS_ITEMS: SidebarItem[] = [
  { id: 'email-settings', label: 'Email Settings', icon: 'tune', href: '/email/email-settings' },
  { id: 'signatures', label: 'Signatures', icon: 'draw', href: '/email/signatures' },
  { id: 'templates', label: 'Templates', icon: 'draft', href: '/email/templates' },
];

const SETTINGS_PATHS = EMAIL_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is an email settings page */
export function isEmailSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

const FOLDER_SECTIONS = (unreadCounts?: Record<string, number>): SidebarConfig['sections'] => [
  {
    id: 'folders',
    title: 'Folders',
    items: [
      { id: 'inbox', label: 'Inbox', icon: 'inbox', href: '/email', badge: unreadCounts?.inbox },
      { id: 'sent', label: 'Sent', icon: 'send', href: '/email?folder=sent' },
      { id: 'drafts', label: 'Drafts', icon: 'draft', href: '/email?folder=drafts' },
      { id: 'archive', label: 'Archive', icon: 'archive', href: '/email?folder=archive' },
      { id: 'spam', label: 'Spam', icon: 'report', href: '/email?folder=spam' },
      { id: 'trash', label: 'Trash', icon: 'delete', href: '/email?folder=trash' },
    ],
  },
];

/**
 * List mode — compose button, folders, labels, storage, Module Settings button.
 */
export function createEmailSidebarConfig(
  unreadCounts?: Record<string, number>,
  onSettingsClick?: () => void
): SidebarConfig {
  return {
    moduleId: 'email',
    moduleTitle: 'Email',
    moduleIcon: 'mail',
    beforeContent: EmailComposeButton,
    afterContent: EmailSidebarExtras,
    showSettings: !!onSettingsClick,
    onSettingsClick,
    footerContent: EmailStorageIndicator,
    sections: FOLDER_SECTIONS(unreadCounts),
  };
}

/**
 * Settings mode — settings items inline at top, folders below, labels + storage at bottom.
 */
export function createEmailSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent'],
  unreadCounts?: Record<string, number>
): SidebarConfig {
  return {
    moduleId: 'email',
    moduleTitle: 'Email',
    moduleIcon: 'mail',
    showSettings: false,
    beforeContent,
    afterContent: EmailSidebarExtras,
    sections: FOLDER_SECTIONS(unreadCounts),
  };
}
