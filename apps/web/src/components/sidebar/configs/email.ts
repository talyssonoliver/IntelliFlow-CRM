import type { SidebarConfig } from '../sidebar-types';

export const emailSidebarConfig: SidebarConfig = {
  moduleId: 'email',
  moduleTitle: 'Email',
  moduleIcon: 'mail',
  sections: [
    {
      id: 'folders',
      title: 'Folders',
      items: [
        { id: 'inbox', label: 'Inbox', icon: 'inbox', href: '/email' },
        { id: 'sent', label: 'Sent', icon: 'send', href: '/email?folder=sent' },
        { id: 'drafts', label: 'Drafts', icon: 'draft', href: '/email?folder=drafts' },
        { id: 'archive', label: 'Archive', icon: 'archive', href: '/email?folder=archive' },
        { id: 'spam', label: 'Spam', icon: 'report', href: '/email?folder=spam' },
        { id: 'trash', label: 'Trash', icon: 'delete', href: '/email?folder=trash' },
      ],
    },
  ],
};
