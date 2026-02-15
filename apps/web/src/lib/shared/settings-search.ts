/**
 * Settings Search Utility
 *
 * Client-side search/filter for settings items.
 * Part of PG-104 (Settings Home).
 */

export interface SettingItem {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: string;
  color: string;
  keywords: string[];
}

export interface SettingCategory {
  id: string;
  title: string;
  itemIds: string[];
}

/**
 * All settings items — single source of truth.
 * Downstream tasks (PG-105 to PG-113) add entries here.
 */
export const SETTINGS_ITEMS: SettingItem[] = [
  {
    id: 'account',
    title: 'Account',
    description:
      'Manage your personal information, password, and security settings',
    href: '/settings/account',
    icon: 'person',
    color: 'bg-primary',
    keywords: [
      'profile',
      'password',
      'email',
      'name',
      'avatar',
      '2fa',
      'sessions',
    ],
  },
  {
    id: 'team',
    title: 'Team',
    description:
      'Invite team members, manage roles, and control access permissions',
    href: '/settings/team',
    icon: 'group',
    color: 'bg-primary/80',
    keywords: ['members', 'invite', 'roles', 'permissions', 'access'],
  },
  {
    id: 'ai',
    title: 'AI Chains',
    description:
      'Manage AI chain versions, rollout strategies, and memory budget',
    href: '/settings/ai',
    icon: 'auto_awesome',
    color: 'bg-primary/90',
    keywords: [
      'llm',
      'model',
      'chain',
      'version',
      'rollback',
      'experiment',
      'budget',
    ],
  },
  {
    id: 'pipeline',
    title: 'Pipeline',
    description:
      'Configure deal pipeline stages, automation rules, and workflows',
    href: '/settings/pipeline',
    icon: 'linear_scale',
    color: 'bg-primary/70',
    keywords: ['deals', 'stages', 'workflow', 'automation', 'funnel'],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description:
      'Connect third-party apps and services to enhance your workflow',
    href: '/settings/integrations',
    icon: 'extension',
    color: 'bg-primary/80',
    keywords: [
      'slack',
      'google',
      'salesforce',
      'hubspot',
      'webhook',
      'api',
      'connect',
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description:
      'Configure email, push, and in-app notification preferences',
    href: '/settings/notifications',
    icon: 'notifications',
    color: 'bg-primary/60',
    keywords: ['email', 'push', 'alerts', 'digest', 'preferences'],
  },
  {
    id: 'security',
    title: 'Security',
    description:
      'Multi-factor authentication, session management, and security policies',
    href: '/settings/security/mfa',
    icon: 'security',
    color: 'bg-destructive',
    keywords: ['mfa', '2fa', 'totp', 'sessions', 'password', 'authentication'],
  },
];

/**
 * Settings categories for organized navigation.
 */
export const SETTINGS_CATEGORIES: SettingCategory[] = [
  {
    id: 'account-profile',
    title: 'Account & Profile',
    itemIds: ['account', 'team'],
  },
  {
    id: 'ai-automation',
    title: 'AI & Automation',
    itemIds: ['ai', 'pipeline'],
  },
  {
    id: 'integrations-comms',
    title: 'Integrations & Communications',
    itemIds: ['integrations', 'notifications'],
  },
  {
    id: 'security',
    title: 'Security',
    itemIds: ['security'],
  },
];

/**
 * Score how well a query matches text.
 * Returns 0 for no match.
 */
function scoreMatch(text: string, normalizedQuery: string): number {
  const normalizedText = text.toLowerCase();
  if (normalizedText === normalizedQuery) return 3; // exact match
  if (normalizedText.startsWith(normalizedQuery)) return 2; // prefix match
  if (normalizedText.includes(normalizedQuery)) return 1; // contains match
  return 0;
}

/**
 * Filter and rank settings items by search query.
 *
 * Scoring weights:
 * - Title match: weight 3
 * - Description match: weight 2
 * - Keyword match: weight 1
 *
 * Returns items with score > 0, sorted by score descending.
 */
export function filterSettings(
  query: string,
  items: SettingItem[]
): SettingItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;

  const scored = items
    .map((item) => {
      const titleScore = scoreMatch(item.title, normalized) * 3;
      const descScore = scoreMatch(item.description, normalized) * 2;
      const keywordScore = item.keywords.reduce(
        (max, kw) => Math.max(max, scoreMatch(kw, normalized)),
        0
      );

      return { item, score: titleScore + descScore + keywordScore };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map(({ item }) => item);
}

/**
 * Split text into highlighted and non-highlighted segments for a query.
 * Returns an array of segments with highlighted flags.
 */
export function highlightMatch(
  text: string,
  query: string
): { text: string; highlighted: boolean }[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [{ text, highlighted: false }];

  const lowerText = text.toLowerCase();
  const index = lowerText.indexOf(normalized);

  if (index === -1) return [{ text, highlighted: false }];

  const segments: { text: string; highlighted: boolean }[] = [];

  if (index > 0) {
    segments.push({ text: text.slice(0, index), highlighted: false });
  }
  segments.push({
    text: text.slice(index, index + normalized.length),
    highlighted: true,
  });
  if (index + normalized.length < text.length) {
    segments.push({
      text: text.slice(index + normalized.length),
      highlighted: false,
    });
  }

  return segments;
}

/**
 * Get resolved categories with their full item objects.
 * Optionally filters by search query.
 */
export function getResolvedCategories(
  searchQuery?: string
): { id: string; title: string; items: SettingItem[] }[] {
  const filteredItems = searchQuery
    ? filterSettings(searchQuery, SETTINGS_ITEMS)
    : SETTINGS_ITEMS;

  const filteredIds = new Set(filteredItems.map((i) => i.id));

  return SETTINGS_CATEGORIES.map((cat) => ({
    id: cat.id,
    title: cat.title,
    items: cat.itemIds
      .map((id) => SETTINGS_ITEMS.find((i) => i.id === id)!)
      .filter((item) => filteredIds.has(item.id)),
  })).filter((cat) => cat.items.length > 0);
}
