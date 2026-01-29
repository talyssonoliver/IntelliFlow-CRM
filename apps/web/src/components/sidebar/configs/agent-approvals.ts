import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, STATUS_ICONS, FEATURE_ICONS } from '../icon-reference';

export const agentApprovalsSidebarConfig: SidebarConfig = {
  moduleId: 'agentApprovals',
  moduleTitle: 'Agent Approvals',
  moduleIcon: MODULE_ICONS.agentApprovals,
  settingsHref: '/settings/ai',
  showSettings: true,
  sections: [
    {
      id: 'queue',
      title: 'Approval Queue',
      items: [
        {
          id: 'pending',
          label: 'Pending Review',
          icon: VIEW_ICONS.pending,
          href: '/agent-approvals',
        },
        {
          id: 'urgent',
          label: 'Urgent Actions',
          icon: VIEW_ICONS.urgent,
          color: 'text-destructive',
          href: '/agent-approvals?priority=urgent',
        },
        {
          id: 'my-reviews',
          label: 'My Reviews',
          icon: VIEW_ICONS.my,
          href: '/agent-approvals?view=my',
        },
      ],
    },
    {
      id: 'history',
      title: 'History',
      items: [
        {
          id: 'approved',
          label: 'Approved',
          icon: STATUS_ICONS.success,
          color: 'text-success',
          href: '/agent-approvals?status=approved',
        },
        {
          id: 'rejected',
          label: 'Rejected',
          icon: STATUS_ICONS.error,
          color: 'text-destructive',
          href: '/agent-approvals?status=rejected',
        },
        {
          id: 'all-history',
          label: 'All History',
          icon: VIEW_ICONS.recentViewed,
          href: '/agent-approvals/history',
        },
      ],
    },
    {
      id: 'agents',
      title: 'Agent Management',
      items: [
        {
          id: 'active-agents',
          label: 'Active Agents',
          icon: FEATURE_ICONS.agent,
          href: '/agent-approvals/agents',
        },
        {
          id: 'agent-logs',
          label: 'Agent Logs',
          icon: FEATURE_ICONS.logs,
          href: '/agent-approvals/logs',
        },
      ],
    },
  ],
};
