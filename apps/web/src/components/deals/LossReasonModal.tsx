/**
 * LossReasonModal Component (IFC-064)
 *
 * Modal dialog requiring a reason (>=10 characters) before marking a deal as CLOSED_LOST.
 * AC-005: CLOSED_LOST reason modal requiring >=10 char reason
 */

import * as React from 'react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@intelliflow/ui';

interface LossReasonModalProps {
  readonly open: boolean;
  readonly onConfirm: (reason: string) => void;
  readonly onCancel: () => void;
  readonly dealName: string;
}

const MIN_REASON_LENGTH = 10;

export const LossReasonModal = React.memo(function LossReasonModal({
  open,
  onConfirm,
  onCancel,
  dealName,
}: LossReasonModalProps) {
  const [reason, setReason] = useState('');

  const isValid = reason.trim().length >= MIN_REASON_LENGTH;

  const handleConfirm = () => {
    if (isValid) {
      onConfirm(reason);
      setReason('');
    }
  };

  const handleCancel = () => {
    setReason('');
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Deal as Lost</DialogTitle>
          <DialogDescription>
            Please provide a reason for marking &ldquo;{dealName}&rdquo; as lost. This helps improve
            future sales strategies.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <textarea
            className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            placeholder="Enter the reason for losing this deal (minimum 10 characters)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Loss reason"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {reason.trim().length}/{MIN_REASON_LENGTH} characters minimum
          </p>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid}
            className="px-4 py-2 text-sm font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Loss
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
