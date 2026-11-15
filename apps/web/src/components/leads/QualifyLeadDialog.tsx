'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@intelliflow/ui';
import { api } from '@/lib/api';
import { revalidateLeadCaches } from '@/app/leads/actions';
import { leadDisplayName } from '@/lib/leads/lead-format';
import {
  QUALIFY_REASON_MAX,
  QUALIFY_REASON_MIN,
  validateQualifyReason,
} from '@/lib/leads/lead-conversion';

const INPUT_CLASS =
  'w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2a78f6] focus:border-transparent';

function reportCacheRevalidationError(error: unknown) {
  console.error('Failed to revalidate lead caches:', error);
}

/** Header button that opens the qualify dialog (shown for NEW and CONTACTED leads). */
export function QualifyLeadButton({ onClick }: Readonly<{ onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Qualify lead"
      className="flex items-center gap-2 px-3 sm:px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
    >
      <span aria-hidden="true" className="material-symbols-outlined !text-[18px]">
        verified
      </span>{' '}
      <span className="hidden sm:inline">Qualify</span>
    </button>
  );
}

export interface QualifyLeadDialogProps {
  lead: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    email?: string | null;
  };
  userId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Asks why the lead is qualified, then calls lead.qualify. Convert unlocks afterwards. */
export function QualifyLeadDialog({ lead, userId, open, onOpenChange }: QualifyLeadDialogProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const utils = api.useUtils();

  const qualifyMutation = api.lead.qualify.useMutation({
    onSuccess: () => {
      if (userId) revalidateLeadCaches(userId).catch(reportCacheRevalidationError);
      toast({ title: 'Lead qualified', description: 'You can now convert this lead.' });
      onOpenChange(false);
      setReason('');
      setTouched(false);
      setServerError(null);
      return utils.lead.getById.invalidate({ id: lead.id });
    },
    onError: (err) => {
      setServerError(err.message);
      toast({ title: 'Qualification failed', description: err.message, variant: 'destructive' });
    },
  });

  const validationError = validateQualifyReason(reason);
  const shownError = (touched ? validationError : null) ?? serverError;

  const handleSubmit = () => {
    setTouched(true);
    if (validationError) return;
    setServerError(null);
    qualifyMutation.mutate({ leadId: lead.id, reason: reason.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Qualify Lead</DialogTitle>
          <DialogDescription>
            Record why {leadDisplayName(lead)} is a good fit. A qualified lead can be converted.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5 py-2">
          <label
            htmlFor="qualify-reason"
            className="text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Reason for qualifying <span className="text-red-500">*</span>
          </label>
          <textarea
            id="qualify-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="e.g. Confirmed budget and a decision date in Q1"
            rows={3}
            aria-invalid={shownError ? true : undefined}
            aria-describedby="qualify-reason-hint"
            className={`${INPUT_CLASS} resize-none`}
          />
          <p id="qualify-reason-hint" className="text-xs text-slate-500 dark:text-slate-400">
            {QUALIFY_REASON_MIN} to {QUALIFY_REASON_MAX} characters ({reason.trim().length} so far).
          </p>
          {shownError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {shownError}
            </p>
          )}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={qualifyMutation.isPending}
            className="px-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={qualifyMutation.isPending}
            className="px-4 py-2 rounded-md bg-[#2a78f6] text-white text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {qualifyMutation.isPending ? 'Qualifying...' : 'Qualify Lead'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
