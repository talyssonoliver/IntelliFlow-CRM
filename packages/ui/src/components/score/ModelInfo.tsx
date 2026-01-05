'use client';

/**
 * ModelInfo Component - IFC-023
 *
 * Display AI model version and scoring timestamp information.
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import type { ComponentSize } from './types';

const modelInfoVariants = cva('flex items-center gap-1.5 text-muted-foreground', {
  variants: {
    size: {
      sm: 'text-xs',
      md: 'text-sm',
      lg: 'text-base',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export interface ModelInfoProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof modelInfoVariants> {
  /** AI model version string */
  modelVersion: string;
  /** Timestamp when score was calculated */
  scoredAt?: string;
  /** Show "Model:" label */
  showLabel?: boolean;
  /** Show AI icon */
  showIcon?: boolean;
  /** Show scoring timestamp */
  showTimestamp?: boolean;
  /** Timestamp format */
  timestampFormat?: 'relative' | 'absolute';
  /** Component size */
  size?: ComponentSize;
}

/**
 * Format timestamp as relative time (e.g., "5 minutes ago")
 */
function formatRelativeTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

    return date.toLocaleDateString();
  } catch {
    return '';
  }
}

/**
 * Format timestamp as absolute date
 */
function formatAbsoluteTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * ModelInfo - AI model version and timestamp display
 */
function ModelInfo({
  modelVersion,
  scoredAt,
  showLabel = false,
  showIcon = false,
  showTimestamp = false,
  timestampFormat = 'relative',
  size = 'md',
  className,
  ...props
}: ModelInfoProps) {
  const formattedTimestamp = scoredAt
    ? timestampFormat === 'relative'
      ? formatRelativeTime(scoredAt)
      : formatAbsoluteTime(scoredAt)
    : '';

  const iconSize = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  }[size];

  return (
    <div
      className={cn(modelInfoVariants({ size }), 'flex-wrap', className)}
      aria-label={`AI Model: ${modelVersion}`}
      {...props}
    >
      {showIcon && (
        <span
          className={cn('material-symbols-outlined', iconSize)}
          aria-hidden="true"
        >
          smart_toy
        </span>
      )}

      {showLabel && <span>Model:</span>}

      <span className="font-medium text-foreground">{modelVersion}</span>

      {showTimestamp && formattedTimestamp && (
        <>
          <span className="mx-1">·</span>
          <span>Scored {formattedTimestamp}</span>
        </>
      )}
    </div>
  );
}

export { ModelInfo, modelInfoVariants };
