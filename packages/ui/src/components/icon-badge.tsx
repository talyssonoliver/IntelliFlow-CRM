'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

// ============================================
// Variants
// ============================================

const iconBadgeVariants = cva(
  'inline-flex items-center justify-center rounded-lg',
  {
    variants: {
      variant: {
        primary: 'bg-primary/10 text-primary',
        secondary: 'bg-secondary text-secondary-foreground',
        success: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
        warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
        destructive: 'bg-destructive/10 text-destructive',
        info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        muted: 'bg-muted text-muted-foreground',
      },
      size: {
        xs: 'h-6 w-6',
        sm: 'h-8 w-8',
        md: 'h-10 w-10',
        lg: 'h-12 w-12',
        xl: 'h-14 w-14',
      },
      shape: {
        rounded: 'rounded-lg',
        circle: 'rounded-full',
        square: 'rounded-none',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      shape: 'rounded',
    },
  }
);

const iconSizeMap = {
  xs: 'text-sm',
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-3xl',
};

// ============================================
// Types
// ============================================

export interface IconBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof iconBadgeVariants> {
  /** Material Symbols icon name */
  icon: string;
  /** Accessible label for the icon */
  label?: string;
}

// ============================================
// IconBadge Component
// ============================================

const IconBadge = React.forwardRef<HTMLDivElement, IconBadgeProps>(
  ({ icon, variant, size = 'md', shape, label, className, ...props }, ref) => {
    const iconSize = iconSizeMap[size || 'md'];

    return (
      <div
        ref={ref}
        className={cn(iconBadgeVariants({ variant, size, shape }), className)}
        role={label ? 'img' : undefined}
        aria-label={label}
        {...props}
      >
        <span
          className={cn('material-symbols-outlined', iconSize)}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
    );
  }
);

IconBadge.displayName = 'IconBadge';

// ============================================
// Exports
// ============================================

export { IconBadge, iconBadgeVariants };
