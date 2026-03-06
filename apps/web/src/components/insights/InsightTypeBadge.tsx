/**
 * InsightTypeBadge — Type label badge for AI insights
 *
 * Task: PG-160 — View All AI Insights page
 */

const TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  warning: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-300',
    label: 'Warning',
  },
  opportunity: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    label: 'Opportunity',
  },
  reminder: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300',
    label: 'Reminder',
  },
  achievement: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-300',
    label: 'Achievement',
  },
};

interface InsightTypeBadgeProps {
  type: string;
}

export function InsightTypeBadge({ type }: Readonly<InsightTypeBadgeProps>) {
  const style = TYPE_STYLES[type] || { bg: 'bg-slate-100', text: 'text-slate-600', label: type };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}
