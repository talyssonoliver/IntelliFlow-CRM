/**
 * Utility functions for the Active Agents Dashboard (PG-151)
 */

import type { ActiveAgent, ActiveAgentFilters, AgentStats } from './types';

const AGENT_TYPE_LABELS: Record<string, string> = {
  qualification: 'Qualification',
  email: 'Email Writer',
  followup: 'Follow-up',
  nba: 'Next Best Action',
  scoring: 'Lead Scoring',
  churn: 'Churn Prediction',
  sentiment: 'Sentiment Analysis',
  autoresponse: 'Auto-Response',
  rag: 'RAG Context',
  embedding: 'Embedding',
  crew: 'Crew Orchestrator',
  hallucination: 'Hallucination Check',
  indexer: 'Document Indexer',
  ocr: 'OCR Worker',
};

const AGENT_TYPE_ICONS: Record<string, string> = {
  qualification: 'verified',
  email: 'mail',
  followup: 'reply_all',
  nba: 'lightbulb',
  scoring: 'score',
  churn: 'trending_down',
  sentiment: 'sentiment_satisfied',
  autoresponse: 'smart_toy',
  rag: 'search',
  embedding: 'data_array',
  crew: 'groups',
  hallucination: 'fact_check',
  indexer: 'inventory_2',
  ocr: 'document_scanner',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-600',
  idle: 'text-amber-500',
  error: 'text-red-600',
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  idle: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_DOT_CLASSES: Record<string, string> = {
  active: 'bg-green-500',
  idle: 'bg-amber-500',
  error: 'bg-red-500',
};

export function getAgentTypeLabel(type: string): string {
  return AGENT_TYPE_LABELS[type] ?? 'Unknown Agent';
}

export function getAgentTypeIcon(type: string): string {
  return AGENT_TYPE_ICONS[type] ?? 'smart_toy';
}

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] ?? 'text-muted-foreground';
}

export function getStatusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASSES[status] ?? 'bg-slate-100 text-slate-600';
}

export function getStatusDotClass(status: string): string {
  return STATUS_DOT_CLASSES[status] ?? 'bg-slate-400';
}

export function formatLastActive(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function computeAgentStats(agents: ActiveAgent[]): AgentStats {
  return {
    total: agents.length,
    active: agents.filter((a) => a.status === 'active').length,
    idle: agents.filter((a) => a.status === 'idle').length,
    error: agents.filter((a) => a.status === 'error').length,
  };
}

export function filterAgents(agents: ActiveAgent[], filters: ActiveAgentFilters): ActiveAgent[] {
  let result = [...agents];

  if (filters.status) {
    result = result.filter((a) => a.status === filters.status);
  }

  if (filters.type) {
    result = result.filter((a) => a.type === filters.type);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (a) =>
        a.type.toLowerCase().includes(q) ||
        getAgentTypeLabel(a.type).toLowerCase().includes(q) ||
        (a.currentTask?.toLowerCase().includes(q) ?? false) ||
        a.model.toLowerCase().includes(q) ||
        (a.agentId?.toLowerCase().includes(q) ?? false)
    );
  }

  switch (filters.sort) {
    case 'lastActive':
      result.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
      break;
    case 'type':
      result.sort((a, b) => a.type.localeCompare(b.type));
      break;
    case 'status': {
      const order: Record<string, number> = { active: 0, idle: 1, error: 2 };
      result.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
      break;
    }
  }

  return result;
}
