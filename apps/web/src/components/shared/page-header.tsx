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
  /** Hide the label below `sm` (icon only); the control keeps it as aria-label and tooltip */
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
  /**
   * Page controls that are not plain buttons (a period select, a menu), shown with the actions.
   * Style them with heroFieldClassName / heroActionClassName so they match the hero.
   */
  controls?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /**
   * `hero` (default, owner 21/11): the shared page hero, a dark navy card with the wave
   * background, white text, the primary action first. `plain`: the flat header, for a page
   * where a hero does not fit.
   */
  variant?: 'hero' | 'plain';
}

// =============================================================================
// Breadcrumbs Component
// =============================================================================

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
  /**
   * The last item is the current page (default). PageHeader passes `false`:
   * its trail holds ancestors only, so every item keeps its link.
   */
  endsWithCurrentPage?: boolean;
  /** `inverse`: light text for the dark page hero, with a home icon on the `/` crumb. */
  tone?: 'default' | 'inverse';
}

export function Breadcrumbs({
  items,
  className,
  endsWithCurrentPage = true,
  tone = 'default',
}: Readonly<BreadcrumbsProps>) {
  const inverse = tone === 'inverse';
  if (!items.length) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm mb-1',
        inverse ? 'text-white/85' : 'text-muted-foreground',
        className
      )}
    >
      {items.map((item, index) => {
        const isLast = endsWithCurrentPage && index === items.length - 1;

        return (
          <React.Fragment key={item.label}>
            {index > 0 && (
              <span
                className={cn('material-symbols-outlined text-xs', inverse && 'text-white/60')}
                aria-hidden="true"
              >
                chevron_right
              </span>
            )}
            {isLast || !item.href ? (
              <span
                className={cn(
                  isLast && (inverse ? 'text-white font-medium' : 'text-foreground font-medium')
                )}
                aria-current={isLast ? 'page' : undefined}
              >
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className={cn(
                  'inline-flex min-h-11 -my-3 items-center gap-1 no-underline transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                  inverse
                    ? 'hover:text-white focus-visible:ring-white focus-visible:ring-offset-[#0b1730]'
                    : 'hover:text-foreground focus-visible:ring-ring'
                )}
              >
                {/* Owner 21/11: every trail starts with the same home icon (it was only on the
                    Dashboard's "Home"; other pages started with a plain "Dashboard"). */}
                {index === 0 && (
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    home
                  </span>
                )}
                <span>{item.label}</span>
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/**
 * The trail above a page title shows where the page sits, not the page again
 * (#1222 UI-011): the h1 already names it. A last crumb with no link, or with
 * the title's own text, is the current page and is left out.
 */
export function breadcrumbAncestors(
  items: readonly BreadcrumbItem[] | undefined,
  title: string
): BreadcrumbItem[] {
  if (!items?.length) return [];
  const last = items[items.length - 1]!;
  const isCurrentPage = !last.href || last.label.trim() === title.trim();
  return isCurrentPage ? items.slice(0, -1) : [...items];
}

// =============================================================================
// Action Button Component
// =============================================================================

interface ActionButtonProps {
  action: PageAction;
  /** `hero`: styles for the dark page hero (blue-gradient primary, translucent secondaries). */
  tone?: 'hero' | 'plain';
}

/** Hero styles; the primary gradient starts at #1f63d4 so white text keeps AA contrast. */
const HERO_ACTION = {
  base: 'min-h-11 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1730]',
  primary:
    'border border-white/15 bg-linear-to-r from-[#1f63d4] to-[#4f46e5] px-5 text-white font-bold shadow-md shadow-black/25',
  primaryHover: 'hover:from-[#2a6fe0] hover:to-[#5b52f0]',
  secondary: 'min-w-11 border border-white/25 bg-white/10 text-white font-medium',
  secondaryHover: 'hover:bg-white/20',
} as const;

/** Classes for a header action: the hero styles on the dark card, the plain ones elsewhere. */
function actionClasses(
  variant: NonNullable<PageAction['variant']>,
  disabled: boolean,
  hero: boolean
): string {
  const primary = variant === 'primary';
  const tone = hero
    ? [
        HERO_ACTION.base,
        primary ? HERO_ACTION.primary : HERO_ACTION.secondary,
        !disabled && (primary ? HERO_ACTION.primaryHover : HERO_ACTION.secondaryHover),
        !primary && 'px-3 sm:px-4',
      ]
    : [
        'min-h-11 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg',
        primary
          ? [
              'bg-primary text-white font-bold shadow-sm shadow-primary/30',
              !disabled && 'hover:bg-primary-hover',
            ]
          : [
              'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium',
              !disabled && 'hover:bg-slate-50 dark:hover:bg-slate-700',
            ],
      ];
  return cn(
    'group flex items-center justify-center gap-2 text-sm transition-all motion-safe:active:scale-95 motion-reduce:transition-none',
    disabled && 'opacity-50 cursor-not-allowed',
    tone
  );
}

/** The classes of a header action button, for a page control that must look like one (a menu
 *  trigger in the hero). */
export function heroActionClassName(variant: 'primary' | 'secondary' = 'secondary'): string {
  return actionClasses(variant, false, true);
}

/** A select or input on the hero's dark card: 44px, translucent, white text. */
export const heroFieldClassName =
  'min-h-11 rounded-xl border border-white/25 bg-white/10 px-3 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white [&>option]:text-foreground';

/** The action's icon, or a spinner while it is loading. */
function ActionIcon({ icon, loading }: Readonly<{ icon?: string; loading: boolean }>) {
  if (loading) {
    return (
      <span
        className="material-symbols-outlined text-[20px] motion-safe:animate-spin"
        aria-hidden="true"
      >
        progress_activity
      </span>
    );
  }
  if (!icon) return null;
  return (
    <span
      className="material-symbols-outlined text-[20px] motion-safe:group-hover:rotate-90 motion-safe:transition-transform"
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

/**
 * The one page/record header action button: PageHeader and EntityHeader both use it (owner
 * 21/11: no copies that drift). 44px minimum on every variant.
 */
export function ActionButton({ action, tone = 'plain' }: Readonly<ActionButtonProps>) {
  const hero = tone === 'hero';
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

  // In the hero a secondary control with an icon is icon-only on phones, so a page with several
  // actions still fits; it keeps its name as aria-label and tooltip (UI-010).
  const labelHiddenOnMobile = hideOnMobile || (hero && variant === 'secondary' && Boolean(icon));
  const baseClasses = actionClasses(variant, disabled, hero);

  const content = (
    <>
      <ActionIcon icon={icon} loading={loading} />
      <span className={cn(labelHiddenOnMobile && 'hidden sm:inline')}>{label}</span>
    </>
  );

  // #1225 UI-010: when the label is hidden on phones only the (aria-hidden)
  // icon is visible, so the control carries its name itself, plus a tooltip.
  const iconOnlyOnMobile = labelHiddenOnMobile && Boolean(icon || loading);
  const nameProps = iconOnlyOnMobile ? { 'aria-label': label, title: label } : {};

  if (href && !disabled) {
    return (
      <Link href={href} className={baseClasses} {...nameProps}>
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
      {...nameProps}
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
  controls,
  className,
  variant = 'hero',
}: Readonly<PageHeaderProps>) {
  const ancestors = breadcrumbAncestors(breadcrumbs, title);
  const hero = variant === 'hero';
  // The hero leads with the primary action (owner's reference), the secondary controls after it.
  const ordered = hero
    ? [...(actions ?? [])].sort(
        (a, b) => Number(a.variant !== 'primary') - Number(b.variant !== 'primary')
      )
    : (actions ?? []);
  return (
    <div
      data-variant={variant}
      className={cn(
        hero
          ? // .page-hero (globals.css): navy base, the wave image and the contrast overlay.
            'page-hero relative isolate overflow-hidden rounded-[22px] sm:rounded-3xl ring-1 ring-white/10 shadow-sm px-5 py-5 sm:px-8 sm:py-7 text-white flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'
          : 'flex flex-col sm:flex-row sm:items-center justify-between gap-4',
        className
      )}
    >
      {/* Left side: Breadcrumbs, Title, Description */}
      <div className={cn('min-w-0 flex-1', hero && 'relative z-10')}>
        {ancestors.length > 0 && (
          <Breadcrumbs
            items={ancestors}
            endsWithCurrentPage={false}
            tone={hero ? 'inverse' : 'default'}
          />
        )}

        <h1
          className={cn(
            'font-bold tracking-tight [overflow-wrap:anywhere]',
            hero
              ? 'text-[32px] leading-tight sm:text-4xl text-white'
              : 'text-2xl md:text-3xl text-foreground'
          )}
        >
          {title}
        </h1>

        {description && (
          <p
            className={cn(
              'mt-1',
              hero ? 'max-w-prose text-[15px] sm:text-base text-white/90' : 'text-muted-foreground'
            )}
          >
            {description}
          </p>
        )}

        {children}
      </div>

      {/* Actions: in the hero, the primary first, and the row wraps on narrow screens. */}
      {(ordered.length > 0 || controls) && (
        <div
          className={cn(
            'flex items-center gap-2 sm:gap-3',
            hero ? 'relative z-10 flex-wrap' : 'flex-wrap sm:flex-nowrap flex-shrink-0'
          )}
        >
          {controls}
          {ordered.map((action, index) => (
            <ActionButton
              key={action.label + index}
              action={action}
              tone={hero ? 'hero' : 'plain'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Convenience Export
// =============================================================================
