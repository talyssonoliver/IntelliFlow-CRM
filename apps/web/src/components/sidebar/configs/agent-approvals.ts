import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS, FEATURE_ICONS } from '../icon-reference';
import type { ModuleSettingsNavItem } from '@/components/shared/module-settings-nav';

/** Section with its navigation items (compatible with both sidebar and panel) */
export interface AIAgentSection {
  id: string;
  title: string;
  icon: string;
  items: (SidebarItem & ModuleSettingsNavItem)[];
}

/** All AI & Agents navigation sections */
export const AI_AGENT_SECTIONS: readonly AIAgentSection[] = [
  {
    id: 'queue',
    title: 'Approval Queue',
    icon: VIEW_ICONS.pending,
    items: [
      { id: 'pending', label: 'Pending Review', icon: VIEW_ICONS.pending, href: '/agent-approvals' },
      { id: 'urgent', label: 'Urgent Actions', icon: VIEW_ICONS.urgent, color: 'text-destructive', href: '/agent-approvals?priority=urgent' },
      { id: 'my-reviews', label: 'My Reviews', icon: VIEW_ICONS.my, href: '/agent-approvals?view=my' },
      { id: 'tool-actions', label: 'Tool Actions', icon: 'pending_actions', href: '/agent-approvals/preview' },
    ],
  },
  {
    id: 'ai-review',
    title: 'AI Review',
    icon: 'rate_review',
    items: [
      { id: 'review-queue', label: 'Review Queue', icon: 'rate_review', href: '/agent-approvals/ai-review' },
    ],
  },
  {
    id: 'ai-intelligence',
    title: 'Intelligence',
    icon: FEATURE_ICONS.insight,
    items: [
      { id: 'all-insights', label: 'All Insights', icon: FEATURE_ICONS.insight, href: '/agent-approvals/insights' },
      { id: 'lead-scoring', label: 'Lead Scoring', icon: 'leaderboard', href: '/agent-approvals/lead-scoring' },
      { id: 'sentiment', label: 'Sentiment Analysis', icon: 'sentiment_satisfied', href: '/agent-approvals/sentiment' },
      { id: 'churn-risk', label: 'Churn Risk', icon: 'warning', href: '/agent-approvals/churn-risk' },
    ],
  },
  {
    id: 'ai-tools',
    title: 'AI Tools',
    icon: 'build',
    items: [
      { id: 'agent-tools', label: 'Agent Tools', icon: 'build', href: '/agent-approvals/tools' },
      { id: 'ai-search', label: 'AI Search (RAG)', icon: 'manage_search', href: '/agent-approvals/ai-search' },
      { id: 'experiments', label: 'Experiments', icon: 'science', href: '/agent-approvals/experiments' },
      { id: 'chain-versions', label: 'Chain Versions', icon: 'history', href: '/agent-approvals/ai-settings' },
    ],
  },
  {
    id: 'monitoring',
    title: 'Monitoring',
    icon: 'monitoring',
    items: [
      { id: 'active-agents', label: 'Active Agents', icon: FEATURE_ICONS.agent, href: '/agent-approvals/agents' },
      { id: 'agent-logs', label: 'Agent Logs', icon: FEATURE_ICONS.logs, href: '/agent-approvals/logs' },
      { id: 'drift-detection', label: 'Drift Detection', icon: 'trending_down', href: '/agent-approvals/drift' },
      { id: 'latency', label: 'Latency Monitor', icon: 'speed', href: '/agent-approvals/latency' },
    ],
  },
] as const;

/** Find which section owns the given pathname (longest/most specific match wins) */
export function findSectionForPath(pathname: string): string {
  let bestMatch = '';
  let bestSectionId = 'queue';

  for (const section of AI_AGENT_SECTIONS) {
    for (const item of section.items) {
      const itemPath = new URL(item.href, 'http://localhost').pathname;
      if (
        (pathname === itemPath || pathname.startsWith(itemPath + '/')) &&
        itemPath.length > bestMatch.length
      ) {
        bestMatch = itemPath;
        bestSectionId = section.id;
      }
    }
  }

  return bestSectionId;
}

/**
 * Build the sidebar config:
 * - All sections rendered via beforeContent as an accordion
 * - Active section expanded inline, inactive sections open panel on click
 */
export function createAgentApprovalsSidebarConfig(
  activeSectionId: string,
  afterContent: SidebarConfig['afterContent'],
  onSettingsClick?: () => void,
): SidebarConfig {
  const activeSection = AI_AGENT_SECTIONS.find((s) => s.id === activeSectionId);

  return {
    moduleId: 'agentApprovals',
    moduleTitle: 'AI & Agents',
    moduleIcon: MODULE_ICONS.agentApprovals,
    showSettings: !!onSettingsClick,
    onSettingsClick,
    afterContent,
    sections: activeSection
      ? [{ id: activeSection.id, title: activeSection.title, items: [...activeSection.items] }]
      : [],
  };
}

/** Settings items shown when on an AI settings page */
export const AI_SETTINGS_ITEMS: SidebarItem[] = [
  { id: 'ai-settings', label: 'AI Settings', icon: 'tune', href: '/agent-approvals/ai-settings' },
  { id: 'model-config', label: 'Model Configuration', icon: 'psychology', href: '/agent-approvals/model-config' },
  { id: 'approval-policies', label: 'Approval Policies', icon: 'policy', href: '/agent-approvals/approval-policies' },
];

const AI_SETTINGS_PATHS = AI_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is an AI settings page */
export function isAISettingsPage(pathname: string): boolean {
  return AI_SETTINGS_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

/** Settings mode — settings items inline at top, section links below */
export function createAgentApprovalsSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent'],
): SidebarConfig {
  // Show each section as a single link to its first page
  const sections: SidebarConfig['sections'] = [
    {
      id: 'sections',
      title: 'Sections',
      items: AI_AGENT_SECTIONS.map((section) => ({
        id: section.id,
        label: section.title,
        icon: section.icon,
        href: section.items[0].href,
      })),
    },
  ];

  return {
    moduleId: 'agentApprovals',
    moduleTitle: 'AI & Agents',
    moduleIcon: MODULE_ICONS.agentApprovals,
    showSettings: false,
    beforeContent,
    sections,
  };
}
