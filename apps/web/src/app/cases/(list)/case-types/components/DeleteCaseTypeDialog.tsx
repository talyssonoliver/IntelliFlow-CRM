'use client';

/**
 * Delete confirmation for a case type (PG-204), on the shared type dialog: a
 * server refusal (e.g. "3 cases use this type") stays inside the dialog as an alert.
 */
import {
  DeleteTypeDialog,
  type DeleteTypeDialogProps,
} from '@/components/settings/DeleteTypeDialog';

export type DeleteCaseTypeDialogProps = DeleteTypeDialogProps;

export function DeleteCaseTypeDialog(props: Readonly<DeleteCaseTypeDialogProps>) {
  return (
    <DeleteTypeDialog
      {...props}
      fallbackName="case type"
      description="Its checklist is removed. A type that cases use cannot be deleted; deactivate it instead so existing cases keep it."
    />
  );
}
