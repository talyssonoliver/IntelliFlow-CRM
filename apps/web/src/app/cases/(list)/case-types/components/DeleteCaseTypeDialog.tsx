'use client';

/**
 * Delete confirmation for a case type (PG-204). Unlike the shared
 * ConfirmationDialog it keeps a server refusal (e.g. "3 cases use this type")
 * inside the dialog as an alert, so the reason is never lost to the console.
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

export interface DeleteCaseTypeDialogProps {
  /** The type being deleted; null closes the dialog. */
  name: string | null;
  isDeleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Called instead of Radix's focus restore when the dialog closes (the trigger row may be gone). */
  onCloseAutoFocus?: (event: Event) => void;
}

export function DeleteCaseTypeDialog({
  name,
  isDeleting,
  error,
  onConfirm,
  onCancel,
  onCloseAutoFocus,
}: Readonly<DeleteCaseTypeDialogProps>) {
  return (
    <AlertDialog open={name !== null} onOpenChange={(open) => (open ? null : onCancel())}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name ?? 'case type'}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its checklist is removed. A type that cases use cannot be deleted; deactivate it instead
            so existing cases keep it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
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
