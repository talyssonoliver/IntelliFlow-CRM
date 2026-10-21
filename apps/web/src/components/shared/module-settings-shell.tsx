'use client';

/**
 * ModuleSettingsShell — the shared chrome for a module-settings page.
 *
 * Every module-settings page (tasks, reports, deals, contacts, …) renders the
 * same shell around its own sections: a loading skeleton, a load-error card, a
 * PageHeader carrying the Reset/Save actions, a 12-col section grid that locks
 * while a mutation is in flight, and a reset ConfirmationDialog. Only the
 * sections and the copy differ.
 *
 * This component owns that chrome ONCE. A new settings page is added by
 * supplying config (title/description/breadcrumbs/handlers) and its sections as
 * children — i.e. extend via configuration, don't re-implement the boilerplate
 * (OCP). The page keeps its own state/validation logic, which is genuinely
 * module-specific.
 *
 * Introduced by PG-191 (task-settings is the first consumer); the sibling
 * settings pages were migrated onto it by GH #576. Where a page's chrome
 * differs in a small, real way (its own loading skeleton, a retry error panel,
 * header-button icons, dialog copy) the shell takes it as an optional prop
 * rather than being forked.
 */

import type { ReactNode } from 'react';
import { Card, ConfirmationDialog } from '@intelliflow/ui';
import { PageHeader, type PageAction, type BreadcrumbItem } from '@/components/shared/page-header';

/** Grid used for both the skeleton placeholders and the real sections. */
const SECTION_GRID = 'grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5';

/**
 * Placeholder layout while loading. Each entry is the caller's literal Tailwind
 * span/height classes (kept literal so the JIT scanner sees them), e.g.
 * `'lg:col-span-6 h-48'`.
 */
export const DEFAULT_SETTINGS_SKELETON: readonly string[] = [
  'lg:col-span-6 h-48',
  'lg:col-span-6 h-48',
  'lg:col-span-12 h-64',
];

export interface ModuleSettingsShellProps {
  breadcrumbs: BreadcrumbItem[];
  title: string;
  description: string;
  /** Heading for the card shown when the settings query fails. */
  errorTitle: string;
  isLoading: boolean;
  /** Message from the failed settings query, or null/undefined when healthy. */
  errorMessage?: string | null;
  /** Tailwind classes per skeleton placeholder; defaults to two halves + a full row. */
  skeleton?: readonly string[];
  /** True while a save/reset mutation is in flight — locks inputs and swaps the label. */
  isSaving: boolean;
  canSave: boolean;
  onSave: () => void;
  resetOpen: boolean;
  onResetOpenChange: (open: boolean) => void;
  onResetConfirm: () => void;
  /** Copy for the reset confirmation dialog body. */
  resetDescription: string;
  /** Reset dialog title; defaults to 'Reset to Defaults'. */
  resetTitle?: string;
  /** Reset dialog confirm button label; defaults to 'Reset'. */
  resetConfirmLabel?: string;
  /** Replaces the default skeleton while loading (e.g. a page-specific bento skeleton). */
  loadingFallback?: ReactNode;
  /** Replaces the default error card; shown whenever it is provided (and not loading). */
  errorFallback?: ReactNode;
  /** Overrides merged onto the Reset header action (icon, hideOnMobile, disabled, ...). */
  resetAction?: Partial<PageAction>;
  /** Overrides merged onto the Save header action (icon, label, loading, ...). */
  saveAction?: Partial<PageAction>;
  /** Class for the PageHeader; defaults to 'mb-6'. */
  headerClassName?: string;
  /**
   * Hides the Reset/Save header actions — for a viewer who may read but not
   * change the settings (PG-207: members on the email settings page).
   */
  hideActions?: boolean;
  /**
   * Content between the header and the section grid, outside the fieldset
   * that locks while saving — for controls with their own immediate actions
   * (PG-207: the user's mailbox connection is not part of the settings save).
   */
  leading?: ReactNode;
  /** The module's section cards. */
  children: ReactNode;
}

export function ModuleSettingsShell({
  breadcrumbs,
  title,
  description,
  errorTitle,
  isLoading,
  errorMessage,
  skeleton = DEFAULT_SETTINGS_SKELETON,
  isSaving,
  canSave,
  onSave,
  resetOpen,
  onResetOpenChange,
  onResetConfirm,
  resetDescription,
  resetTitle = 'Reset to Defaults',
  resetConfirmLabel = 'Reset',
  loadingFallback,
  errorFallback,
  resetAction,
  saveAction,
  headerClassName = 'mb-6',
  hideActions = false,
  leading,
  children,
}: Readonly<ModuleSettingsShellProps>) {
  if (isLoading) {
    if (loadingFallback) return <>{loadingFallback}</>;
    return (
      <div className="w-full" data-testid="module-settings-skeleton">
        <div className="mb-6 space-y-2">
          <div className="h-7 w-64 bg-muted animate-pulse rounded-md" />
          <div className="h-4 w-96 bg-muted animate-pulse rounded-md" />
        </div>
        <div className={SECTION_GRID}>
          {skeleton.map((placeholder) => (
            <div
              key={placeholder}
              className={`${placeholder} bg-muted animate-pulse rounded-md`}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    );
  }

  if (errorFallback) return <>{errorFallback}</>;

  if (errorMessage) {
    return (
      <div className="w-full">
        <Card className="p-6 text-center">
          <h2 className="text-lg font-semibold">{errorTitle}</h2>
          <p className="text-sm text-muted-foreground mt-2">{errorMessage}</p>
        </Card>
      </div>
    );
  }

  const actions: PageAction[] = [
    {
      label: 'Reset to Defaults',
      variant: 'secondary',
      onClick: () => onResetOpenChange(true),
      disabled: isSaving,
      ...resetAction,
    },
    {
      label: isSaving ? 'Saving…' : 'Save Changes',
      variant: 'primary',
      onClick: onSave,
      disabled: !canSave,
      loading: isSaving,
      ...saveAction,
    },
  ];

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={title}
        description={description}
        actions={hideActions ? undefined : actions}
        className={headerClassName}
      />

      {leading && <div className="mb-4 sm:mb-5 space-y-4">{leading}</div>}

      {/* Lock every section input while a save/reset is in flight, so the
          post-save refetch cannot clobber a concurrent edit. */}
      <fieldset disabled={isSaving} className="contents">
        <div className={SECTION_GRID}>{children}</div>
      </fieldset>

      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={onResetOpenChange}
        title={resetTitle}
        description={resetDescription}
        confirmLabel={resetConfirmLabel}
        variant="destructive"
        onConfirm={onResetConfirm}
      />
    </div>
  );
}
