'use client';

/**
 * Delete confirmation for a tenant type (case types PG-204, contact types
 * PG-205). Unlike the shared ConfirmationDialog it keeps a server refusal
 * (e.g. "3 cases use this type") inside the dialog as an alert, so the reason
 * is never lost to a toast or the console.
 */
import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@intelliflow/ui';

export interface DeleteTypeDialogProps {
  /** The type being deleted; null closes the dialog. */
  name: string | null;
  isDeleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Called instead of Radix's focus restore when the dialog closes (the trigger row may be gone). */
  onCloseAutoFocus?: (event: Event) => void;
}

interface DeleteTypeDialogCopy {
  /** Title fallback while no name is set, e.g. "case type". */
  fallbackName: string;
  description: ReactNode;
}

export function DeleteTypeDialog({
  name,
  isDeleting,
  error,
  onConfirm,
  onCancel,
  onCloseAutoFocus,
  fallbackName,
  description,
}: Readonly<DeleteTypeDialogProps & DeleteTypeDialogCopy>) {
  return (
    <AlertDialog open={name !== null} onOpenChange={(open) => (open ? null : onCancel())}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name ?? fallbackName}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting && (
              <span
                className="material-symbols-outlined mr-1 animate-spin text-[16px]"
                aria-hidden="true"
              >
                progress_activity
              </span>
            )}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
