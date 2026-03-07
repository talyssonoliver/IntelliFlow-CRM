import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, STATUS_ICONS, FEATURE_ICONS } from '../icon-reference';

export const agentApprovalsSidebarConfig: SidebarConfig = {
  moduleId: 'agentApprovals',
  moduleTitle: 'AI & Agents',
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
      id: 'ai-review',
      title: 'AI Review',
      items: [
        {
          id: 'review-queue',
          label: 'Review Queue',
          icon: 'rate_review',
          href: '/agent-approvals/ai-review',
        },
      ],
    },
    {
      id: 'ai-intelligence',
      title: 'Intelligence',
      items: [
        {
          id: 'all-insights',
          label: 'All Insights',
          icon: FEATURE_ICONS.insight,
          href: '/agent-approvals/insights',
        },
        {
          id: 'lead-scoring',
          label: 'Lead Scoring',
          icon: 'leaderboard',
          href: '/agent-approvals/lead-scoring',
        },
        {
          id: 'sentiment',
          label: 'Sentiment Analysis',
          icon: 'sentiment_satisfied',
          href: '/agent-approvals/sentiment',
        },
        {
          id: 'churn-risk',
          label: 'Churn Risk',
          icon: 'warning',
          href: '/agent-approvals/churn-risk',
        },
      ],
    },
    {
      id: 'ai-tools',
      title: 'AI Tools',
      items: [
        {
          id: 'agent-tools',
          label: 'Agent Tools',
          icon: 'build',
          href: '/agent-approvals/tools',
        },
        {
          id: 'ai-search',
          label: 'AI Search (RAG)',
          icon: 'manage_search',
          href: '/agent-approvals/ai-search',
        },
        {
          id: 'experiments',
          label: 'Experiments',
          icon: 'science',
          href: '/agent-approvals/experiments',
        },
        {
          id: 'chain-versions',
          label: 'Chain Versions',
          icon: 'history',
          href: '/settings/ai',
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
      id: 'monitoring',
      title: 'Monitoring',
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
        {
          id: 'drift-detection',
          label: 'Drift Detection',
          icon: 'trending_down',
          href: '/agent-approvals/drift',
        },
        {
          id: 'latency',
          label: 'Latency Monitor',
          icon: 'speed',
          href: '/agent-approvals/latency',
        },
      ],
    },
  ],
};
