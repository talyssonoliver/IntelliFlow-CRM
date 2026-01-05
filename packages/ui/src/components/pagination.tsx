'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

// ============================================
// Types
// ============================================

export interface PaginationProps extends React.HTMLAttributes<HTMLElement> {
  /** Current page (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Total item count (optional, for summary) */
  totalItems?: number;
  /** Items per page (optional, for summary) */
  pageSize?: number;
  /** Callback when page changes */
  onPageChange: (page: number) => void;
  /** Show "Showing X-Y of Z" summary */
  showSummary?: boolean;
  /** Maximum number of page buttons to show */
  maxVisiblePages?: number;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show first/last page buttons */
  showFirstLast?: boolean;
  /** Show "Previous" and "Next" labels on nav buttons */
  showNavLabels?: boolean;
  /** Hide pagination controls when only a single page exists */
  hideWhenSinglePage?: boolean;
}

// ============================================
// Page Button Component
// ============================================

interface PageButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const PageButton = React.forwardRef<HTMLButtonElement, PageButtonProps>(
  ({ children, isActive, size = 'md', className, disabled, ...props }, ref) => {
    const sizeClasses = {
      sm: 'h-7 min-w-7 px-2 text-xs',
      md: 'h-9 min-w-9 px-3 text-sm',
      lg: 'h-11 min-w-11 px-4 text-base',
    };

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={cn(
          'flex items-center justify-center rounded-lg font-medium transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          sizeClasses[size],
          isActive
            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

PageButton.displayName = 'PageButton';

// ============================================
// Navigation Button Component
// ============================================

interface NavButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  label?: string;
  iconPosition?: 'left' | 'right';
  size?: 'sm' | 'md' | 'lg';
}

const NavButton = React.forwardRef<HTMLButtonElement, NavButtonProps>(
  ({ icon, label, iconPosition = 'left', size = 'md', className, disabled, ...props }, ref) => {
    const sizeClasses = {
      sm: label ? 'h-7 px-2' : 'h-7 w-7',
      md: label ? 'h-9 px-3' : 'h-9 w-9',
      lg: label ? 'h-11 px-4' : 'h-11 w-11',
    };

    const iconSizeClasses = {
      sm: 'text-base',
      md: 'text-lg',
      lg: 'text-xl',
    };

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center gap-1 rounded-lg',
          'border border-slate-200 dark:border-slate-700',
          'bg-white dark:bg-slate-800',
          'text-slate-700 dark:text-slate-200',
          'transition-all duration-200',
          'hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          sizeClasses[size],
          label && 'text-sm font-medium',
          disabled && 'opacity-50 cursor-not-allowed hover:bg-white dark:hover:bg-slate-800',
          className
        )}
        {...props}
      >
        {iconPosition === 'left' && (
          <span className={cn('material-symbols-outlined', iconSizeClasses[size])} aria-hidden="true">
            {icon}
          </span>
        )}
        {label && <span className="hidden sm:inline">{label}</span>}
        {iconPosition === 'right' && (
          <span className={cn('material-symbols-outlined', iconSizeClasses[size])} aria-hidden="true">
            {icon}
          </span>
        )}
      </button>
    );
  }
);

NavButton.displayName = 'NavButton';

// ============================================
// Helper Functions
// ============================================

function generatePageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number
): (number | 'ellipsis')[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [];
  const halfVisible = Math.floor(maxVisible / 2);

  // Always show first page
  pages.push(1);

  // Calculate range around current page
  let start = Math.max(2, currentPage - halfVisible + 1);
  let end = Math.min(totalPages - 1, currentPage + halfVisible - 1);

  // Adjust if we're near the start
  if (currentPage <= halfVisible + 1) {
    end = Math.min(totalPages - 1, maxVisible - 1);
  }

  // Adjust if we're near the end
  if (currentPage >= totalPages - halfVisible) {
    start = Math.max(2, totalPages - maxVisible + 2);
  }

  // Add ellipsis before range if needed
  if (start > 2) {
    pages.push('ellipsis');
  }

  // Add pages in range
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  // Add ellipsis after range if needed
  if (end < totalPages - 1) {
    pages.push('ellipsis');
  }

  // Always show last page
  if (totalPages > 1) {
    pages.push(totalPages);
  }

  return pages;
}

// ============================================
// Pagination Component
// ============================================

const Pagination = React.forwardRef<HTMLElement, PaginationProps>(
  (
    {
      currentPage,
      totalPages,
      totalItems,
      pageSize,
      onPageChange,
      showSummary = false,
      maxVisiblePages = 5,
      size = 'md',
      showFirstLast = false,
      showNavLabels = false,
      hideWhenSinglePage = false,
      className,
      ...props
    },
    ref
  ) => {
    const safeTotalPages = Math.max(totalPages, 1);

    // Optionally hide when there's only 1 page (nothing to paginate)
    if (hideWhenSinglePage && safeTotalPages <= 1) {
      return null;
    }

    const pages = generatePageNumbers(currentPage, safeTotalPages, maxVisiblePages);

    const canGoPrevious = currentPage > 1;
    const canGoNext = currentPage < safeTotalPages;

    // Calculate summary values
    const startItem = totalItems && pageSize ? (currentPage - 1) * pageSize + 1 : null;
    const endItem =
      totalItems && pageSize ? Math.min(currentPage * pageSize, totalItems) : null;

    return (
      <nav
        ref={ref}
        aria-label="Pagination"
        className={cn('flex flex-col sm:flex-row items-center justify-between gap-4', className)}
        {...props}
      >
        {/* Summary */}
        {showSummary && totalItems !== undefined && startItem && endItem && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Showing{' '}
            <span className="font-medium text-slate-700 dark:text-slate-200">{startItem}</span> to{' '}
            <span className="font-medium text-slate-700 dark:text-slate-200">{endItem}</span> of{' '}
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {totalItems.toLocaleString()}
            </span>{' '}
            results
          </p>
        )}

        {/* Page Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* First Page */}
          {showFirstLast && (
            <NavButton
              icon="first_page"
              size={size}
              disabled={!canGoPrevious}
              onClick={() => onPageChange(1)}
              aria-label="Go to first page"
            />
          )}

          {/* Previous Page */}
          <NavButton
            icon="chevron_left"
            label={showNavLabels ? 'Previous' : undefined}
            iconPosition="left"
            size={size}
            disabled={!canGoPrevious}
            onClick={() => onPageChange(currentPage - 1)}
            aria-label="Previous"
          />

          {/* Page Numbers (hidden on mobile when we have labels) */}
          <div className={cn('hidden sm:flex items-center gap-1', !showNavLabels && 'flex')}>
            {pages.map((page, index) =>
              page === 'ellipsis' ? (
                <span
                  key={`ellipsis-${index}`}
                  className="flex items-center justify-center px-2 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                >
                  ...
                </span>
              ) : (
                <PageButton
                  key={page}
                  size={size}
                  isActive={page === currentPage}
                  onClick={() => onPageChange(page)}
                  aria-label={`Go to page ${page}`}
                  aria-current={page === currentPage ? 'page' : undefined}
                >
                  {page}
                </PageButton>
              )
            )}
          </div>

          {/* Mobile Page Indicator (when nav labels are shown) */}
          {showNavLabels && (
            <span className="sm:hidden text-sm text-slate-500 dark:text-slate-400 px-2">
              Page {currentPage} of {safeTotalPages}
            </span>
          )}

          {/* Next Page */}
          <NavButton
            icon="chevron_right"
            label={showNavLabels ? 'Next' : undefined}
            iconPosition="right"
            size={size}
            disabled={!canGoNext}
            onClick={() => onPageChange(currentPage + 1)}
            aria-label="Next"
          />

          {/* Last Page */}
          {showFirstLast && (
            <NavButton
              icon="last_page"
              size={size}
              disabled={!canGoNext}
              onClick={() => onPageChange(safeTotalPages)}
              aria-label="Go to last page"
            />
          )}
        </div>
      </nav>
    );
  }
);

Pagination.displayName = 'Pagination';

// ============================================
// Exports
// ============================================

export { Pagination, PageButton, NavButton, generatePageNumbers };
