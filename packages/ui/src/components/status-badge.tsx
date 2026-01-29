'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

// ============================================
// Variant Definitions
// ============================================

const statusBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        muted: 'border-transparent bg-muted text-muted-foreground',
        success: 'border-transparent bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
        warning: 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
        destructive: 'border-transparent bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
        info: 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        md: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

// ============================================
// Status Configuration Types
// ============================================

export interface StatusConfig {
  label: string;
  icon?: string;
  variant: 'default' | 'muted' | 'success' | 'warning' | 'destructive' | 'info';
}

export type StatusType = 'lead' | 'document' | 'ticket' | 'deal' | 'task' | 'custom';

// ============================================
// Built-in Status Configurations
// ============================================

const LEAD_STATUS_CONFIG: Record<string, StatusConfig> = {
  NEW: { label: 'New', variant: 'muted' },
  CONTACTED: { label: 'Contacted', icon: 'mail', variant: 'warning' },
  QUALIFIED: { label: 'Qualified', icon: 'verified', variant: 'info' },
  UNQUALIFIED: { label: 'Unqualified', variant: 'destructive' },
  NEGOTIATING: { label: 'Negotiating', icon: 'handshake', variant: 'default' },
  CONVERTED: { label: 'Converted', icon: 'check_circle', variant: 'success' },
  LOST: { label: 'Lost', icon: 'cancel', variant: 'muted' },
};

const DOCUMENT_STATUS_CONFIG: Record<string, StatusConfig> = {
  DRAFT: { label: 'Draft', icon: 'edit_note', variant: 'muted' },
  UNDER_REVIEW: { label: 'In Review', icon: 'rate_review', variant: 'warning' },
  PENDING_APPROVAL: { label: 'Pending Approval', icon: 'hourglass_empty', variant: 'warning' },
  APPROVED: { label: 'Approved', icon: 'check_circle', variant: 'success' },
  PENDING_SIGNATURE: { label: 'Pending Signature', icon: 'draw', variant: 'info' },
  SIGNED: { label: 'Signed', icon: 'verified', variant: 'success' },
  ARCHIVED: { label: 'Archived', icon: 'archive', variant: 'muted' },
  REJECTED: { label: 'Rejected', icon: 'cancel', variant: 'destructive' },
};

const TICKET_STATUS_CONFIG: Record<string, StatusConfig> = {
  OPEN: { label: 'Open', icon: 'radio_button_unchecked', variant: 'info' },
  IN_PROGRESS: { label: 'In Progress', icon: 'pending', variant: 'warning' },
  WAITING_ON_CUSTOMER: { label: 'Waiting on Customer', icon: 'hourglass_empty', variant: 'muted' },
  WAITING_ON_THIRD_PARTY: { label: 'Waiting on Third Party', icon: 'schedule', variant: 'muted' },
  RESOLVED: { label: 'Resolved', icon: 'check_circle', variant: 'success' },
  CLOSED: { label: 'Closed', icon: 'task_alt', variant: 'muted' },
  REOPENED: { label: 'Reopened', icon: 'refresh', variant: 'warning' },
};

const DEAL_STATUS_CONFIG: Record<string, StatusConfig> = {
  QUALIFICATION: { label: 'Qualification', variant: 'info' },
  NEEDS_ANALYSIS: { label: 'Needs Analysis', variant: 'warning' },
  PROPOSAL: { label: 'Proposal', icon: 'description', variant: 'default' },
  NEGOTIATION: { label: 'Negotiation', icon: 'handshake', variant: 'warning' },
  CLOSED_WON: { label: 'Won', icon: 'emoji_events', variant: 'success' },
  CLOSED_LOST: { label: 'Lost', icon: 'cancel', variant: 'destructive' },
};

const TASK_STATUS_CONFIG: Record<string, StatusConfig> = {
  TODO: { label: 'To Do', variant: 'muted' },
  IN_PROGRESS: { label: 'In Progress', icon: 'pending', variant: 'info' },
  BLOCKED: { label: 'Blocked', icon: 'block', variant: 'destructive' },
  COMPLETED: { label: 'Completed', icon: 'check_circle', variant: 'success' },
  CANCELLED: { label: 'Cancelled', icon: 'cancel', variant: 'muted' },
};

const STATUS_CONFIGS: Record<StatusType, Record<string, StatusConfig>> = {
  lead: LEAD_STATUS_CONFIG,
  document: DOCUMENT_STATUS_CONFIG,
  ticket: TICKET_STATUS_CONFIG,
  deal: DEAL_STATUS_CONFIG,
  task: TASK_STATUS_CONFIG,
  custom: {},
};

// ============================================
// Component Props
// ============================================

export interface StatusBadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'>,
    VariantProps<typeof statusBadgeVariants> {
  /** The status value (e.g., 'NEW', 'QUALIFIED', 'DRAFT') */
  status: string;
  /** Predefined status type for built-in configurations */
  type?: StatusType;
  /** Custom status configuration (overrides type) */
  config?: Record<string, StatusConfig>;
  /** Whether to show the status icon */
  showIcon?: boolean;
  /** Custom label (overrides config label) */
  label?: string;
}

// ============================================
// StatusBadge Component
// ============================================

function StatusBadge({
  status,
  type = 'custom',
  config,
  showIcon = true,
  label,
  size,
  variant: variantProp,
  className,
  ...props
}: StatusBadgeProps) {
  // Determine the configuration source
  const statusConfigs = config || STATUS_CONFIGS[type];
  const statusConfig = statusConfigs[status];

  // Fallback for unknown status
  const displayLabel = label || statusConfig?.label || status.replace(/_/g, ' ');
  const displayIcon = showIcon ? statusConfig?.icon : undefined;
  const displayVariant = variantProp || statusConfig?.variant || 'muted';

  return (
    <span
      className={cn(statusBadgeVariants({ variant: displayVariant, size }), className)}
      {...props}
    >
      {displayIcon && (
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          {displayIcon}
        </span>
      )}
      {displayLabel}
    </span>
  );
}

// ============================================
// Exports
// ============================================

export { StatusBadge, statusBadgeVariants, STATUS_CONFIGS };

// Export individual configs for customization
export {
  LEAD_STATUS_CONFIG,
  DOCUMENT_STATUS_CONFIG,
  TICKET_STATUS_CONFIG,
  DEAL_STATUS_CONFIG,
  TASK_STATUS_CONFIG,
};
