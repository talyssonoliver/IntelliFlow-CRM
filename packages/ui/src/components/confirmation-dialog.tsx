'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';
import { buttonVariants } from './button';
import { cn } from '../lib/utils';

export interface ConfirmationDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Dialog title */
  title: string;
  /** Dialog description */
  description: string;
  /** Confirm button label */
  confirmLabel?: string;
  /** Cancel button label */
  cancelLabel?: string;
  /** Callback when confirmed */
  onConfirm: () => void | Promise<void>;
  /** Visual variant for the confirm button */
  variant?: 'default' | 'destructive';
  /** Loading state */
  isLoading?: boolean;
  /** Icon to display (Material Symbols name) */
  icon?: string;
}

/**
 * ConfirmationDialog - Reusable confirmation dialog with loading state
 *
 * @example
 * ```tsx
 * <ConfirmationDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Delete Items"
 *   description="Are you sure you want to delete 5 items? This action cannot be undone."
 *   confirmLabel="Delete"
 *   variant="destructive"
 *   onConfirm={handleDelete}
 *   isLoading={isDeleting}
 *   icon="delete"
 * />
 * ```
 */
export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'default',
  isLoading = false,
  icon,
}: Readonly<ConfirmationDialogProps>) {
  const [internalLoading, setInternalLoading] = React.useState(false);

  const loading = isLoading || internalLoading;

  const handleConfirm = async () => {
    try {
      setInternalLoading(true);
      await onConfirm();
      onOpenChange(false);
    } finally {
      setInternalLoading(false);
    }
  };

  const iconColorClass = variant === 'destructive'
    ? 'text-red-500'
    : 'text-primary';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          {icon && (
            <div className="flex justify-center mb-4">
              <div className={cn(
                'size-12 rounded-full flex items-center justify-center',
                variant === 'destructive'
                  ? 'bg-red-100 dark:bg-red-900/30'
                  : 'bg-primary/10'
              )}>
                <span className={cn('material-symbols-outlined text-2xl', iconColorClass)}>
                  {icon}
                </span>
              </div>
            </div>
          )}
          <AlertDialogTitle className="text-center sm:text-left">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center sm:text-left">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={loading}
            className={cn(
              variant === 'destructive' && buttonVariants({ variant: 'destructive' })
            )}
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined text-lg animate-spin mr-2">
                  progress_activity
                </span>
                Processing...
              </>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
