'use client';

/**
 * Rollback Confirm Dialog Component
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Confirmation dialog for version rollback with required reason.
 * Features:
 * - Required reason textarea (10-500 chars)
 * - Character counter
 * - Loading state on confirm
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Textarea,
} from '@intelliflow/ui';
import type { ChainVersionSummary } from '@intelliflow/validators';

const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 500;

interface RollbackConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetVersion: ChainVersionSummary | null;
  onConfirm: (reason: string) => Promise<void>;
  isLoading: boolean;
}

export function RollbackConfirmDialog({
  open,
  onOpenChange,
  targetVersion,
  onConfirm,
  isLoading,
}: Readonly<RollbackConfirmDialogProps>) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const characterCount = reason.length;
  const isReasonValid = characterCount >= MIN_REASON_LENGTH && characterCount <= MAX_REASON_LENGTH;
  const canConfirm = isReasonValid && !isLoading;

  const handleConfirm = async () => {
    if (!canConfirm) return;

    try {
      setError(null);
      await onConfirm(reason);
      setReason('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setReason('');
      setError(null);
    }
    onOpenChange(newOpen);
  };

  if (!targetVersion) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Rollback to Version?</DialogTitle>
          <DialogDescription>
            This will create a new version based on{' '}
            <span className="font-mono text-foreground">{targetVersion.id.slice(0, 8)}...</span>{' '}and
            activate it. The current active version will be deprecated.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Version Info */}
          <div className="mb-4 p-3 bg-muted rounded-lg">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Chain Type:</span>
                <span className="ml-2 font-medium">{targetVersion.chainType}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Model:</span>
                <span className="ml-2 font-medium">{targetVersion.model}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <span className="ml-2 font-medium">{targetVersion.status}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Created:</span>
                <span className="ml-2 font-medium">
                  {typeof targetVersion.createdAt === 'string'
                    ? new Date(targetVersion.createdAt).toLocaleDateString()
                    : targetVersion.createdAt.toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Reason Input */}
          <div className="space-y-2">
            <label htmlFor="rollback-reason" className="text-sm font-medium text-foreground">
              Reason for rollback{' '}<span className="text-destructive">*</span>
            </label>
            <Textarea
              id="rollback-reason"
              placeholder="Describe why you're rolling back to this version..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[100px]"
              disabled={isLoading}
              aria-describedby="reason-hint reason-count"
            />
            <div className="flex justify-between text-xs">
              <span id="reason-hint" className="text-muted-foreground">
                {(() => {
                if (characterCount < MIN_REASON_LENGTH) return `Minimum ${MIN_REASON_LENGTH} characters required`;
                if (characterCount > MAX_REASON_LENGTH) return `Maximum ${MAX_REASON_LENGTH} characters allowed`;
                return 'Reason will be recorded in the audit log';
              })()}
              </span>
              <span
                id="reason-count"
                className={
                  characterCount < MIN_REASON_LENGTH || characterCount > MAX_REASON_LENGTH
                    ? 'text-destructive'
                    : 'text-muted-foreground'
                }
              >
                {characterCount}/{MAX_REASON_LENGTH}
              </span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {isLoading ? 'Rolling back...' : 'Confirm Rollback'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
