'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

export const EMAIL_LABELS = [
  { id: 'personal', name: 'Personal', color: '#3b82f6' },
  { id: 'work', name: 'Work', color: '#ef4444' },
  { id: 'important', name: 'Important', color: '#eab308' },
] as const;

export type EmailLabelId = (typeof EMAIL_LABELS)[number]['id'];

/**
 * Compose button rendered above folder navigation in the email sidebar.
 * Navigates to the dedicated /email/compose page.
 */
export function EmailComposeButton({ isExpanded }: Readonly<{ isExpanded: boolean }>) {
  if (!isExpanded) {
    return (
      <Link
        href="/email/compose"
        className={cn(
          'flex w-full items-center justify-center rounded-lg p-2',
          'bg-primary text-primary-foreground hover:bg-primary/90',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'transition-colors'
        )}
        title="Compose"
        aria-label="Compose new email"
      >
        <span className="material-symbols-outlined text-xl">edit</span>
      </Link>
    );
  }

  return (
    <Link
      href="/email/compose"
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5',
        'text-sm font-medium text-primary-foreground',
        'hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        'transition-colors'
      )}
      aria-label="Compose new email"
    >
      <span className="material-symbols-outlined text-lg">edit</span> Compose
    </Link>
  );
}

/**
 * Labels rendered below folder navigation in the email sidebar.
 */
export function EmailSidebarExtras({ isExpanded }: Readonly<{ isExpanded: boolean }>) {
  const searchParams = useSearchParams();
  const activeLabel = searchParams.get('label');

  if (!isExpanded) return null;

  return (
    <>
      <div className="px-3 mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Labels
        </span>
      </div>
      <div className="space-y-0.5 px-1">
        {EMAIL_LABELS.map((label) => {
          const isActive = activeLabel === label.id;
          const href = isActive ? '/email' : `/email?label=${label.id}`;
          return (
            <Link
              key={label.id}
              href={href}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-ring transition-colors',
                isActive
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <span
                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: label.color }}
              />
              <span>{label.name}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Storage indicator rendered in the footer, above Module Settings.
 * Fetches real storage usage via tRPC with 5-minute staleTime cache.
 */
export function EmailStorageIndicator({ isExpanded }: Readonly<{ isExpanded: boolean }>) {
  const storageQuery = trpc.email.getStorageUsage.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (!isExpanded) return null;

  const usedBytes = storageQuery.data?.usedBytes ?? 0;
  const limitBytes = storageQuery.data?.limitBytes ?? 5 * 1024 * 1024 * 1024;
  const percentage = limitBytes > 0 ? Math.min((usedBytes / limitBytes) * 100, 100) : 0;

  let barColor: string;
  if (percentage >= 95) barColor = 'bg-destructive';
  else if (percentage >= 80) barColor = 'bg-warning';
  else barColor = 'bg-primary';

  return (
    <div className="px-1">
      <div className="text-xs text-muted-foreground">
        <span className="font-medium">Storage</span>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-secondary">
          <div
            className={cn('h-full rounded-full transition-all', barColor)}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="mt-1 block">
          {storageQuery.isLoading
            ? 'Loading...'
            : `${formatStorageSize(usedBytes)} of ${formatStorageSize(limitBytes)} used`}
        </span>
      </div>
    </div>
  );
}
