'use client';

/**
 * Delete confirmation for a contact type (PG-205). Like the PG-204 case-type
 * dialog, a server refusal ("2 contacts use this type") stays inside the dialog
 * as an alert, so the reason is never lost to a toast.
 */
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

export interface DeleteContactTypeDialogProps {
  /** The type being deleted; null closes the dialog. */
  name: string | null;
  isDeleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Called instead of Radix's focus restore when the dialog closes (the trigger row may be gone). */
  onCloseAutoFocus?: (event: Event) => void;
}

export function DeleteContactTypeDialog({
  name,
  isDeleting,
  error,
  onConfirm,
  onCancel,
  onCloseAutoFocus,
}: Readonly<DeleteContactTypeDialogProps>) {
  return (
    <AlertDialog open={name !== null} onOpenChange={(open) => (open ? null : onCancel())}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name ?? 'contact type'}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its default tags are unlinked. A type that contacts use cannot be deleted; deactivate it
            instead so existing contacts keep it.
          </AlertDialogDescription>
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
