'use client';

import { useCallback, useRef } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { EmptyState } from '@intelliflow/ui';
import { cn } from '@/lib/utils';
import { SearchFilterBar } from '@/components/shared';
import { EmailListItem } from './EmailListItem';

const FILTER_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'attachments', label: 'Attachments' },
];

interface EmailData {
  id: string;
  subject: string;
  textBody?: string;
  htmlBody?: string;
  from: { address: string; name?: string };
  receivedAt: string;
  isRead: boolean;
  labels?: string[];
  attachments: Array<{ filename: string; contentType: string; size: number; checksum: string }>;
}

interface EmailFilters {
  unread: boolean;
  hasAttachments: boolean;
}

interface EmailListProps {
  emails: EmailData[];
  /** Count of emails before client-side filters (unread/attachments) are applied. */
  totalUnfilteredCount: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  selectedEmailId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onEmailSelect: (emailId: string) => void;
  onFilterChange: (filters: EmailFilters) => void;
  onRetry: () => void;
  filters: EmailFilters;
  className?: string;
}

export function EmailList({
  emails,
  totalUnfilteredCount,
  isLoading,
  isError,
  error: _error,
  selectedEmailId,
  searchQuery,
  onSearchChange,
  onEmailSelect,
  onFilterChange,
  onRetry,
  filters,
  className,
}: Readonly<EmailListProps>) {
  const listRef = useRef<HTMLUListElement>(null);

  let activeChip: string;
  if (filters.unread) {
    activeChip = 'unread';
  } else if (filters.hasAttachments) {
    activeChip = 'attachments';
  } else {
    activeChip = 'all';
  }

  const handleChipChange = useCallback(
    (chipId: string) => {
      onFilterChange({
        unread: chipId === 'unread',
        hasAttachments: chipId === 'attachments',
      });
    },
    [onFilterChange]
  );

  const handleListKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = listRef.current?.querySelectorAll('[role="option"]');
      if (!items?.length) return;

      const current = Array.from(items).indexOf(document.activeElement as Element);
      const direction = e.key === 'ArrowDown' ? 1 : -1;
      const next = Math.max(0, Math.min(items.length - 1, current + direction));
      (items[next] as HTMLElement).focus();
    }
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('w-80 border-r border-border', className)}>
        <div className="p-3">
          <div className="h-9 rounded-md bg-muted animate-pulse" />
        </div>
        <div className="space-y-1 p-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 rounded-lg p-3">
              {' '}
              {/* NOSONAR typescript:S6479 */}
              <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                <div className="h-3 w-full rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div
        className={cn(
          'flex w-80 flex-col items-center justify-center gap-3 border-r border-border p-4',
          className
        )}
      >
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Failed to load emails</p>
        <button
          type="button"
          aria-label="Retry"
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          onClick={onRetry}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  const isFilteredEmpty = emails.length === 0 && totalUnfilteredCount > 0;

  return (
    <div className={cn('flex w-80 flex-col border-r border-border', className)}>
      {/* Search & filter bar */}
      <SearchFilterBar
        searchValue={searchQuery}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search emails..."
        searchAriaLabel="Search emails"
        filterChips={
          totalUnfilteredCount > 0
            ? { options: FILTER_CHIPS, value: activeChip, onChange: handleChipChange }
            : undefined
        }
        className="rounded-none border-0 border-b border-border shadow-none px-2 py-3.5 gap-3"
      />

      {/* Email list */}
      {emails.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
          {isFilteredEmpty ? (
            <>
              <EmptyState entity="emails" variant="filtered" phase="passive" />
              <button
                type="button"
                className="text-xs text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded"
                onClick={() => onFilterChange({ unread: false, hasAttachments: false })}
              >
                Clear filters
              </button>
            </>
          ) : (
            <EmptyState
              entity="emails"
              variant={searchQuery ? 'filtered' : 'folder'}
              phase="passive"
            />
          )}
        </div>
      ) : (
        <div role="none" onKeyDown={handleListKeyDown} className="flex-1 overflow-auto">
          <ul ref={listRef} aria-label="Email list" className="space-y-0.5 p-1 list-none">
            {emails.map((email) => (
              <EmailListItem
                key={email.id}
                email={email}
                isSelected={selectedEmailId === email.id}
                onSelect={onEmailSelect}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
