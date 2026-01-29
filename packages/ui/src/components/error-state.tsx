'use client';

import * as React from 'react';
import { cn } from '../lib/utils';
import { Button } from './button';

// ============================================
// Types
// ============================================

export type ErrorVariant = 'error' | 'warning' | 'info';

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Error title (default: "Something went wrong") */
  title?: string;
  /** Error message/description */
  message: string;
  /** Retry callback */
  onRetry?: () => void;
  /** Custom retry button label (default: "Try Again") */
  retryLabel?: string;
  /** Error variant */
  variant?: ErrorVariant;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Custom icon (overrides variant icon) */
  icon?: string;
  /** Show technical details */
  details?: string;
  /** Show details expanded by default */
  showDetails?: boolean;
}

// ============================================
// Variant configurations
// ============================================

const variantConfig: Record<
  ErrorVariant,
  { icon: string; iconColor: string; iconBg: string; borderColor: string }
> = {
  error: {
    icon: 'error_outline',
    iconColor: 'text-destructive',
    iconBg: 'bg-destructive/10',
    borderColor: 'border-destructive/20',
  },
  warning: {
    icon: 'warning_amber',
    iconColor: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
  info: {
    icon: 'info',
    iconColor: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
  },
};

const sizeConfig = {
  sm: {
    container: 'p-4',
    iconWrapper: 'h-8 w-8',
    icon: 'text-lg',
    title: 'text-sm font-medium',
    message: 'text-xs',
    gap: 'gap-2',
  },
  md: {
    container: 'p-6',
    iconWrapper: 'h-12 w-12',
    icon: 'text-2xl',
    title: 'text-base font-semibold',
    message: 'text-sm',
    gap: 'gap-3',
  },
  lg: {
    container: 'p-8',
    iconWrapper: 'h-16 w-16',
    icon: 'text-3xl',
    title: 'text-lg font-bold',
    message: 'text-base',
    gap: 'gap-4',
  },
};

// ============================================
// ErrorState Component
// ============================================

const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  (
    {
      title = 'Something went wrong',
      message,
      onRetry,
      retryLabel = 'Try Again',
      variant = 'error',
      size = 'md',
      icon,
      details,
      showDetails = false,
      className,
      ...props
    },
    ref
  ) => {
    const [isDetailsOpen, setIsDetailsOpen] = React.useState(showDetails);
    const vConfig = variantConfig[variant];
    const sConfig = sizeConfig[size];
    const displayIcon = icon || vConfig.icon;

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center text-center rounded-lg border',
          vConfig.borderColor,
          sConfig.container,
          sConfig.gap,
          className
        )}
        role="alert"
        {...props}
      >
        {/* Icon */}
        <div
          className={cn(
            'rounded-full flex items-center justify-center',
            sConfig.iconWrapper,
            vConfig.iconBg
          )}
        >
          <span
            className={cn('material-symbols-outlined', sConfig.icon, vConfig.iconColor)}
            aria-hidden="true"
          >
            {displayIcon}
          </span>
        </div>

        {/* Text Content */}
        <div className={cn('flex flex-col', sConfig.gap)}>
          <h3 className={cn(sConfig.title, 'text-foreground')}>{title}</h3>
          <p className={cn(sConfig.message, 'text-muted-foreground max-w-md')}>
            {message}
          </p>
        </div>

        {/* Details Toggle */}
        {details && (
          <div className="w-full max-w-md">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto"
              onClick={() => setIsDetailsOpen(!isDetailsOpen)}
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                {isDetailsOpen ? 'expand_less' : 'expand_more'}
              </span>
              {isDetailsOpen ? 'Hide details' : 'Show details'}
            </button>
            {isDetailsOpen && (
              <pre className="mt-2 p-3 bg-muted rounded text-left text-xs font-mono overflow-auto max-h-32">
                {details}
              </pre>
            )}
          </div>
        )}

        {/* Retry Button */}
        {onRetry && (
          <Button variant="outline" size={size === 'lg' ? 'default' : 'sm'} onClick={onRetry}>
            <span className="material-symbols-outlined text-lg mr-1.5" aria-hidden="true">
              refresh
            </span>
            {retryLabel}
          </Button>
        )}
      </div>
    );
  }
);

ErrorState.displayName = 'ErrorState';

// ============================================
// Exports
// ============================================

export { ErrorState };
