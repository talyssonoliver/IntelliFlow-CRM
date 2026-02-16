const SOURCE_ICONS: Record<string, string> = {
  leads: 'leaderboard',
  contacts: 'contacts',
  accounts: 'business',
  opportunities: 'trending_up',
  documents: 'description',
  notes: 'sticky_note_2',
  conversations: 'chat',
  messages: 'message',
  tickets: 'confirmation_number',
};

const SOURCE_COLORS: Record<string, string> = {
  leads: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  contacts: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  accounts: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  opportunities: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  documents: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
  notes: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
  conversations: 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
  messages: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
  tickets: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

const SOURCE_LABELS: Record<string, string> = {
  leads: 'Leads',
  contacts: 'Contacts',
  accounts: 'Accounts',
  opportunities: 'Opportunities',
  documents: 'Documents',
  notes: 'Notes',
  conversations: 'Conversations',
  messages: 'Messages',
  tickets: 'Tickets',
};

const INLINE_SOURCES = new Set(['notes', 'messages']);

export function getSourceIcon(source: string): string {
  return SOURCE_ICONS[source] ?? 'search';
}

export function getSourceColor(source: string): string {
  return SOURCE_COLORS[source] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400';
}

export function getSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

export function getSourceHref(source: string, id: string): string {
  if (INLINE_SOURCES.has(source)) return '#';

  const routes: Record<string, string> = {
    leads: `/leads/${id}`,
    contacts: `/contacts/${id}`,
    accounts: `/accounts/${id}`,
    opportunities: `/opportunities/${id}`,
    documents: `/documents/${id}`,
    tickets: `/tickets/${id}`,
    conversations: `/agent-approvals/logs?id=${id}`,
  };

  return routes[source] ?? '#';
}

export function getRelevanceBadgeClass(score: number): string {
  if (score > 0.8) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (score >= 0.6) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
}

export function formatRelevanceScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}
