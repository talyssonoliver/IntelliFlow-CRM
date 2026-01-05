'use client';

import * as React from 'react';
import { cn } from '../lib/utils';
import { Button } from './button';

// ============================================
// Types
// ============================================

export interface EmptyStateAction {
  /** Button label */
  label: string;
  /** Click handler */
  onClick?: () => void;
  /** Link href (renders as anchor) */
  href?: string;
  /** Icon to show in button */
  icon?: string;
}

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Material Symbols icon name */
  icon?: string;
  /** Main title text */
  title: string;
  /** Description text */
  description?: string;
  /** Primary action button */
  action?: EmptyStateAction;
  /** Secondary action button */
  secondaryAction?: EmptyStateAction;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Icon color class (overrides default) */
  iconColorClass?: string;
  /** Icon background class (overrides default) */
  iconBgClass?: string;
}

// ============================================
// Size configurations
// ============================================

const sizeConfig = {
  sm: {
    container: 'py-6 px-4',
    iconWrapper: 'h-10 w-10',
    icon: 'text-xl',
    title: 'text-sm font-medium',
    description: 'text-xs',
    gap: 'gap-2',
  },
  md: {
    container: 'py-10 px-6',
    iconWrapper: 'h-14 w-14',
    icon: 'text-2xl',
    title: 'text-base font-semibold',
    description: 'text-sm',
    gap: 'gap-3',
  },
  lg: {
    container: 'py-16 px-8',
    iconWrapper: 'h-20 w-20',
    icon: 'text-4xl',
    title: 'text-xl font-bold',
    description: 'text-base',
    gap: 'gap-4',
  },
};

// ============================================
// Action Button Component
// ============================================

function ActionButton({
  action,
  variant = 'default',
}: {
  action: EmptyStateAction;
  variant?: 'default' | 'outline';
}) {
  const buttonContent = (
    <>
      {action.icon && (
        <span className="material-symbols-outlined text-lg mr-1.5" aria-hidden="true">
          {action.icon}
        </span>
      )}
      {action.label}
    </>
  );

  if (action.href) {
    return (
      <Button variant={variant} asChild>
        <a href={action.href}>{buttonContent}</a>
      </Button>
    );
  }

  return (
    <Button variant={variant} onClick={action.onClick}>
      {buttonContent}
    </Button>
  );
}

// ============================================
// EmptyState Component
// ============================================

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      icon = 'inbox',
      title,
      description,
      action,
      secondaryAction,
      size = 'md',
      iconColorClass = 'text-muted-foreground',
      iconBgClass = 'bg-muted',
      className,
      ...props
    },
    ref
  ) => {
    const config = sizeConfig[size];

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center text-center',
          config.container,
          config.gap,
          className
        )}
        {...props}
      >
        {/* Icon */}
        <div
          className={cn(
            'rounded-full flex items-center justify-center',
            config.iconWrapper,
            iconBgClass
          )}
        >
          <span
            className={cn('material-symbols-outlined', config.icon, iconColorClass)}
            aria-hidden="true"
          >
            {icon}
          </span>
        </div>

        {/* Text Content */}
        <div className={cn('flex flex-col', config.gap)}>
          <h3 className={cn(config.title, 'text-foreground')}>{title}</h3>
          {description && (
            <p className={cn(config.description, 'text-muted-foreground max-w-sm')}>
              {description}
            </p>
          )}
        </div>

        {/* Actions */}
        {(action || secondaryAction) && (
          <div className="flex items-center gap-2 mt-2">
            {action && <ActionButton action={action} variant="default" />}
            {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}
          </div>
        )}
      </div>
    );
  }
);

EmptyState.displayName = 'EmptyState';

// ============================================
// Exports
// ============================================

export { EmptyState };
