'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';
import { Breadcrumbs, type BreadcrumbItem, type PageAction } from './page-header';

// =============================================================================
// Types
// =============================================================================

export interface EntityBadge {
  /** Badge text */
  label: string;
  /** Badge variant for styling */
  variant: 'status' | 'priority' | 'info' | 'success' | 'warning' | 'error';
  /** Optional custom className for full control */
  className?: string;
}

export interface EntityHeaderProps {
  /** Breadcrumb navigation items */
  breadcrumbs?: BreadcrumbItem[];
  /** Entity name/title */
  title: string;
  /** Entity ID to display as badge (e.g., "DL-4920", "T-10924") */
  entityId?: string;
  /** Status/info badges to display after title */
  badges?: EntityBadge[];
  /** Action buttons */
  actions?: PageAction[];
  /** Additional content below title (e.g., metadata, tags) */
  children?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Badge Styling
// =============================================================================

function getBadgeClasses(variant: EntityBadge['variant']): string {
  switch (variant) {
    case 'status':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800';
    case 'priority':
      return 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800';
    case 'success':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800';
    case 'warning':
      return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800';
    case 'error':
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
    case 'info':
    default:
      return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700';
  }
}

// =============================================================================
// Action Button Component
// =============================================================================

interface ActionButtonProps {
  action: PageAction;
}

function ActionButton({ action }: ActionButtonProps) {
  const {
    label,
    onClick,
    href,
    icon,
    variant = 'secondary',
    hideOnMobile = false,
    disabled = false,
    loading = false,
  } = action;

  const baseClasses = cn(
    'group flex items-center justify-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 text-sm rounded-lg transition-all active:scale-95',
    disabled && 'opacity-50 cursor-not-allowed',
    variant === 'primary' && [
      'bg-primary text-white font-bold shadow-sm shadow-primary/30',
      !disabled && 'hover:bg-primary-hover',
    ],
    variant === 'secondary' && [
      'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium',
      !disabled && 'hover:bg-slate-50 dark:hover:bg-slate-700',
    ]
  );

  const content = (
    <>
      {loading ? (
        <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
      ) : icon ? (
        <span className="material-symbols-outlined text-[20px] group-hover:rotate-90 transition-transform">{icon}</span>
      ) : null}
      <span className={cn(hideOnMobile && 'hidden sm:inline')}>{label}</span>
    </>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={baseClasses}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={baseClasses}
    >
      {content}
    </button>
  );
}

// =============================================================================
// EntityHeader Component
// =============================================================================

/**
 * EntityHeader - Header component for entity detail pages
 *
 * Designed for pages like Contact/[id], Deal/[id], Ticket/[id] that display
 * a single entity with ID badge, status badges, and entity-specific actions.
 *
 * Features:
 * - Breadcrumb navigation with back link
 * - Entity name as title
 * - ID badge display
 * - Status/priority badges
 * - Primary and secondary action buttons
 * - Responsive layout
 * - Full accessibility support
 *
 * @example
 * ```tsx
 * <EntityHeader
 *   breadcrumbs={[
 *     { label: 'Tickets', href: '/tickets' },
 *     { label: 'T-10924' },
 *   ]}
 *   title="System Outage: West Region"
 *   entityId="T-10924"
 *   badges={[
 *     { label: 'Open', variant: 'status' },
 *     { label: 'Critical', variant: 'priority' },
 *   ]}
 *   actions={[
 *     { label: 'Edit', icon: 'edit', variant: 'secondary', onClick: handleEdit },
 *     { label: 'Escalate', icon: 'publish', variant: 'secondary', onClick: handleEscalate },
 *     { label: 'Resolve', icon: 'check_circle', variant: 'primary', onClick: handleResolve },
 *   ]}
 * />
 * ```
 */
export function EntityHeader({
  breadcrumbs,
  title,
  entityId,
  badges,
  actions,
  children,
  className,
}: EntityHeaderProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-4', className)}>
      {/* Left side: Breadcrumbs, Title with badges */}
      <div className="min-w-0 flex-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumbs items={breadcrumbs} />
        )}

        {/* Title Row with ID and Badges */}
        <div className="flex items-center gap-3 flex-wrap mt-1">
          <h1 className="text-2xl font-bold text-foreground">
            {title}
          </h1>

          {/* Entity ID Badge */}
          {entityId && (
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              #{entityId}
            </span>
          )}

          {/* Status/Priority Badges */}
          {badges && badges.length > 0 && (
            <>
              {badges.map((badge, index) => (
                <span
                  key={badge.label + index}
                  className={cn(
                    'px-2.5 py-0.5 rounded text-xs font-bold border',
                    badge.className || getBadgeClasses(badge.variant)
                  )}
                >
                  {badge.label}
                </span>
              ))}
            </>
          )}
        </div>

        {/* Additional content (metadata, tags, etc.) */}
        {children}
      </div>

      {/* Right side: Actions */}
      {actions && actions.length > 0 && (
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap flex-shrink-0">
          {actions.map((action, index) => (
            <ActionButton key={action.label + index} action={action} />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Convenience Export
// =============================================================================

export default EntityHeader;
