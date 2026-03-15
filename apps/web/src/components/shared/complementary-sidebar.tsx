'use client';

import { useEffect } from 'react';
import { Skeleton, cn } from '@intelliflow/ui';

export interface ComplementarySidebarProps {
  /** Whether the sidebar panel is visible */
  isOpen: boolean;
  /** Called when the user dismisses the panel (close button or Escape key) */
  onClose: () => void;
  /** Header title */
  title?: string;
  /** Header subtitle or secondary text */
  subtitle?: string;
  /** Shows a skeleton loader instead of children */
  isLoading?: boolean;
  /** Unique key for the current content — changing triggers a crossfade animation */
  contentKey?: string;
  /** Panel body content */
  children: React.ReactNode;
  /** Custom skeleton loader markup. Falls back to a generic detail skeleton. */
  skeleton?: React.ReactNode;
  /** Actions rendered in the header row (e.g., edit/menu buttons) */
  headerActions?: React.ReactNode;
  /** Additional class names for the root aside element */
  className?: string;
}

function DefaultSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="space-y-3 mt-6">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="space-y-3 mt-4">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

/**
 * A fixed-position detail panel that slides in from the right edge.
 *
 * Designed for two-column layouts where the main content occupies 70-80%
 * and this panel overlays 20-30% without causing layout shift.
 *
 * Features:
 * - Slide-in/out animation (200ms ease-out)
 * - Content crossfade via `contentKey` (100ms fade-in on key change)
 * - Skeleton loader for async data
 * - Escape key dismissal
 * - Persists across tab switches (consumer controls open state)
 */
export function ComplementarySidebar({
  isOpen,
  onClose,
  title,
  subtitle,
  isLoading = false,
  contentKey = '',
  children,
  skeleton,
  headerActions,
  className,
}: Readonly<ComplementarySidebarProps>) {
  // Dismiss on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <aside
      role="complementary"
      aria-label={title || 'Detail panel'}
      aria-hidden={!isOpen}
      className={cn(
        // Position & sizing — sits below the app header, fills right edge
        'fixed top-16 right-0 bottom-0 z-20',
        'w-80 lg:w-[340px] xl:w-[380px]',
        // Visual treatment
        'border-l border-border bg-card',
        'shadow-[-4px_0_12px_rgba(0,0,0,0.05)]',
        'dark:shadow-[-4px_0_12px_rgba(0,0,0,0.2)]',
        // Layout
        'flex flex-col',
        // Slide animation — 200ms ease-out
        'transition-transform duration-200 ease-out',
        isOpen ? 'translate-x-0' : 'translate-x-full',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
        <div className="min-w-0 flex-1">
          {title && (
            <h3 className="text-sm font-semibold text-foreground truncate">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {headerActions}
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'p-1.5 rounded-md',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-slate-100 dark:hover:bg-slate-800',
              'transition-colors',
            )}
            aria-label="Close panel"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              close
            </span>
          </button>
        </div>
      </div>

      {/* Scrollable content with crossfade on key change */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          key={`${contentKey}-${isLoading}`}
          className="animate-[fade-in_100ms_ease-out]"
        >
          {isLoading ? (skeleton || <DefaultSkeleton />) : children}
        </div>
      </div>
    </aside>
  );
}
