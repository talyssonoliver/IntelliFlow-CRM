/**
 * The small pieces the deal list shows in both its table and its phone cards: the avatar, the stage
 * badge, the probability bar and the date.
 */
import { type OpportunityStage } from '@intelliflow/domain';
import { type Deal, PIPELINE_STAGE_CONFIG } from './types';

export function formatDate(dateStr: string | null, timezone: string = 'Europe/London'): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}

export function StageBadge({ stage }: Readonly<{ stage: OpportunityStage }>) {
  const config = PIPELINE_STAGE_CONFIG[stage];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-foreground">
      <span
        className="size-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: config.color }}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}

export function ProbabilityBar({ probability }: Readonly<{ probability: number }>) {
  let color: string;
  if (probability >= 70) {
    color = 'bg-green-500';
  } else if (probability >= 40) {
    color = 'bg-amber-500';
  } else {
    color = 'bg-red-500';
  }

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${probability}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{probability}%</span>
    </div>
  );
}

export function DealAvatar({ deal }: Readonly<{ deal: Deal }>) {
  const initials = deal.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const colors = [
    'bg-amber-200 text-amber-800',
    'bg-indigo-100 text-indigo-700',
    'bg-emerald-100 text-emerald-700',
    'bg-rose-100 text-rose-700',
    'bg-sky-100 text-sky-700',
  ];
  const hash = deal.name.split('').reduce((acc, c) => acc + (c.codePointAt(0) ?? 0), 0);
  const colorClass = colors[hash % colors.length];

  return (
    <span
      className={`size-9 rounded-lg shrink-0 flex items-center justify-center font-bold text-xs ${colorClass}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
