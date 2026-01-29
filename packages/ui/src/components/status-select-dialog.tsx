'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Button } from './button';
import { cn } from '../lib/utils';

export interface StatusOption {
  /** The status value */
  value: string;
  /** Display label */
  label: string;
  /** Optional description */
  description?: string;
  /** Optional icon (Material Symbols name) */
  icon?: string;
  /** Optional color for the status indicator */
  color?: 'slate' | 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'orange';
}

export interface StatusSelectDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Dialog title */
  title: string;
  /** Dialog description */
  description: string;
  /** Available status options */
  options: StatusOption[];
  /** Currently selected status */
  selectedStatus?: string;
  /** Callback when status is selected and confirmed */
  onConfirm: (status: string) => void | Promise<void>;
  /** Loading state */
  isLoading?: boolean;
  /** Number of items being updated (for display) */
  itemCount?: number;
}

const colorClasses: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600',
  green: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  blue: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  amber: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  red: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  purple: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
  orange: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
};

/**
 * StatusSelectDialog - Dialog for selecting a status from a list of options
 *
 * @example
 * ```tsx
 * <StatusSelectDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Update Lead Status"
 *   description="Select the new status for 5 selected leads."
 *   options={[
 *     { value: 'NEW', label: 'New', color: 'slate' },
 *     { value: 'CONTACTED', label: 'Contacted', color: 'orange' },
 *     { value: 'QUALIFIED', label: 'Qualified', color: 'blue' },
 *   ]}
 *   onConfirm={handleStatusUpdate}
 *   itemCount={5}
 * />
 * ```
 */
export function StatusSelectDialog({
  open,
  onOpenChange,
  title,
  description,
  options,
  selectedStatus: initialStatus,
  onConfirm,
  isLoading = false,
  itemCount,
}: Readonly<StatusSelectDialogProps>) {
  const [selectedStatus, setSelectedStatus] = React.useState<string | undefined>(initialStatus);
  const [internalLoading, setInternalLoading] = React.useState(false);

  const loading = isLoading || internalLoading;

  // Reset selection when dialog opens
  React.useEffect(() => {
    if (open) {
      setSelectedStatus(initialStatus);
    }
  }, [open, initialStatus]);

  const handleConfirm = async () => {
    if (!selectedStatus) return;

    try {
      setInternalLoading(true);
      await onConfirm(selectedStatus);
      onOpenChange(false);
    } finally {
      setInternalLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
            {itemCount !== undefined && itemCount > 0 && (
              <span className="block mt-1 text-slate-600 dark:text-slate-400">
                This will update <strong>{itemCount}</strong> {itemCount === 1 ? 'item' : 'items'}.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-4">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedStatus(option.value)}
              disabled={loading}
              className={cn(
                'flex items-center gap-3 w-full p-3 rounded-lg border-2 transition-all text-left',
                'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                selectedStatus === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
                loading && 'opacity-50 cursor-not-allowed'
              )}
            >
              {/* Status indicator */}
              <span
                className={cn(
                  'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border',
                  colorClasses[option.color || 'slate']
                )}
              >
                {option.icon && (
                  <span className="material-symbols-outlined text-sm mr-1">
                    {option.icon}
                  </span>
                )}
                {option.label}
              </span>

              {/* Description if provided */}
              {option.description && (
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {option.description}
                </span>
              )}

              {/* Check indicator */}
              {selectedStatus === option.value && (
                <span className="material-symbols-outlined text-primary ml-auto">
                  check_circle
                </span>
              )}
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !selectedStatus}
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined text-lg animate-spin mr-2">
                  progress_activity
                </span>
                Updating...
              </>
            ) : (
              'Update Status'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
