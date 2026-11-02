'use client';

// Delete a rule — PG-208. Wraps the shared DeleteTypeDialog (a server refusal
// stays in the dialog as an alert). The row is gone after a delete, so focus
// then moves to the Rules heading; on Cancel Radix returns it to the trigger.

import { DeleteTypeDialog } from '@/components/settings/DeleteTypeDialog';

export interface DeleteAutomationRuleDialogProps {
  readonly name: string | null;
  readonly isDeleting: boolean;
  readonly error: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** Heading that receives focus after a delete (the row is gone). */
  readonly focusTargetId: string;
  /** True once the rule is deleted; Cancel keeps Radix's focus return to the Delete button. */
  readonly deleted: boolean;
}

export function DeleteAutomationRuleDialog({
  focusTargetId,
  deleted,
  ...props
}: DeleteAutomationRuleDialogProps) {
  return (
    <DeleteTypeDialog
      {...props}
      fallbackName="rule"
      description="The rule stops running and its run history is removed. Tasks it already created are kept."
      onCloseAutoFocus={(event) => {
        if (!deleted) return;
        event.preventDefault();
        document.getElementById(focusTargetId)?.focus();
      }}
    />
  );
}
