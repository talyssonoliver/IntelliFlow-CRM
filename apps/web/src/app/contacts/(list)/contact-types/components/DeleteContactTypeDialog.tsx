'use client';

/**
 * Delete confirmation for a contact type (PG-205), on the shared type dialog: a
 * server refusal ("2 contacts use this type") stays inside the dialog as an alert.
 */
import {
  DeleteTypeDialog,
  type DeleteTypeDialogProps,
} from '@/components/settings/DeleteTypeDialog';

export type DeleteContactTypeDialogProps = DeleteTypeDialogProps;

export function DeleteContactTypeDialog(props: Readonly<DeleteContactTypeDialogProps>) {
  return (
    <DeleteTypeDialog
      {...props}
      fallbackName="contact type"
      description="Its default tags are unlinked. A type that contacts use cannot be deleted; deactivate it instead so existing contacts keep it."
    />
  );
}
