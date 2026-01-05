'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';

// =============================================================================
// Types
// =============================================================================

export interface BreadcrumbItem {
  /** Display label for the breadcrumb */
  label: string;
  /** URL to navigate to (optional for last item) */
  href?: string;
}

export interface PageAction {
  /** Button label */
  label: string;
  /** Click handler or href */
  onClick?: () => void;
  href?: string;
  /** Material Symbols icon name */
  icon?: string;
  /** Button variant */
  variant?: 'primary' | 'secondary';
  /** Hide label on small screens */
  hideOnMobile?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
}

export interface PageHeaderProps {
  /** Breadcrumb navigation items */
  breadcrumbs?: BreadcrumbItem[];
  /** Page title (h1) */
  title: string;
  /** Page description */
  description?: string;
  /** Action buttons */
  actions?: PageAction[];
  /** Additional content below description */
  children?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Breadcrumbs Component
// =============================================================================

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (!items.length) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center gap-2 text-sm text-muted-foreground mb-1', className)}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <React.Fragment key={item.label}>
            {index > 0 && (
              <span className="material-symbols-outlined text-xs" aria-hidden="true">
                chevron_right
              </span>
            )}
            {isLast || !item.href ? (
              <span
                className={cn(
                  isLast && 'text-foreground font-medium'
                )}
                aria-current={isLast ? 'page' : undefined}
              >
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
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
// PageHeader Component
// =============================================================================

/**
 * PageHeader - Reusable page header component
 *
 * Features:
 * - Breadcrumb navigation
 * - Page title (h1) with proper hierarchy
 * - Optional description
 * - Primary and secondary action buttons
 * - Responsive layout
 * - Full accessibility support
 *
 * @example
 * ```tsx
 * <PageHeader
 *   breadcrumbs={[
 *     { label: 'Home', href: '/' },
 *     { label: 'Leads', href: '/leads' },
 *     { label: 'All Leads' },
 *   ]}
 *   title="All Leads"
 *   description="Manage and track your sales leads"
 *   actions={[
 *     {
 *       label: 'Export',
 *       icon: 'download',
 *       variant: 'secondary',
 *       onClick: handleExport,
 *     },
 *     {
 *       label: 'Add Lead',
 *       icon: 'add',
 *       variant: 'primary',
 *       href: '/leads/new',
 *     },
 *   ]}
 * />
 * ```
 */
export function PageHeader({
  breadcrumbs,
  title,
  description,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-4', className)}>
      {/* Left side: Breadcrumbs, Title, Description */}
      <div className="min-w-0 flex-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumbs items={breadcrumbs} />
        )}

        <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
          {title}
        </h1>

        {description && (
          <p className="text-muted-foreground mt-1">
            {description}
          </p>
        )}

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

export default PageHeader;
