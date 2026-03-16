/**
 * InsightCard — Shared AI insight card component
 *
 * Extracted from AuthenticatedHomePage.tsx for reuse in /insights page.
 *
 * Task: PG-160 — View All AI Insights page
 */

import Link from 'next/link';
import { getInsightIcon } from './insights-utils';

// tRPC serializes Date as string over JSON
export type SerializedAIInsight = {
  id: string;
  type: 'warning' | 'opportunity' | 'reminder' | 'achievement';
  source: 'ai' | 'heuristic';
  title: string;
  description: string;
  suggestedAction?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  requiresApproval?: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
};

interface InsightCardProps {
  insight: SerializedAIInsight;
  onClick?: (insight: SerializedAIInsight) => void;
}

function resolveInsightHref(
  actionUrl: string | null | undefined,
  insightId: string,
  title?: string
): string {
  if (!actionUrl) {
    // Fallback for aggregate insights with no actionUrl
    if (title && /overdue\s+task/i.test(title)) return '/tasks?filter=overdue';
    return '#';
  }

  const [path, rawQuery = ''] = actionUrl.split('?', 2);
  const params = new URLSearchParams(rawQuery);
  const isLeadOrContactRoute = /^\/(leads|contacts)\/[^?]+$/.test(path);

  if (isLeadOrContactRoute && !params.has('tab')) {
    params.set('tab', 'ai-insights');
  }
  params.set('insightId', insightId);
  return params.size > 0 ? `${path}?${params.toString()}` : path;
}

export function InsightCard({ insight, onClick }: Readonly<InsightCardProps>) {
  const iconStyle = getInsightIcon(insight.type);
  const href = resolveInsightHref(insight.actionUrl, insight.id, insight.title);

  return (
    <Link
      href={href}
      onClick={() => onClick?.(insight)}
      className="flex gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-slate-700"
    >
      <div className={`shrink-0 ${iconStyle.iconBg} ${iconStyle.iconColor} rounded-lg p-2 h-fit`}>
        <span className="material-symbols-outlined">{iconStyle.icon}</span>
      </div>
      <div>
        <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
          {insight.title}
        </h4>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          {insight.description}
          {insight.suggestedAction && (
            <span className="font-medium text-[#137fec]">
              {' '}
              Suggested Action: {insight.suggestedAction}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}
