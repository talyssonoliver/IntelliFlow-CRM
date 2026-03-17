'use client';

/**
 * Pause Subscription Modal
 *
 * Card-based layout for selecting a 1, 2, or 3-month pause as an
 * alternative to cancellation. Shows when user clicks "Confirm Cancellation"
 * on Step 3 of the cancel flow.
 *
 * @implements PG-172 (Billing Ghost Pages — Cancel)
 */

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

type PauseDuration = 1 | 2 | 3;

interface PauseOption {
  months: PauseDuration;
  label: string;
  description: string;
  recommended?: boolean;
}

const PAUSE_OPTIONS: PauseOption[] = [
  {
    months: 1,
    label: '1 Month',
    description: 'Resume automatically after 30 days. All data retained.',
  },
  {
    months: 2,
    label: '2 Months',
    description: 'Resume automatically after 60 days. All data retained.',
    recommended: true,
  },
  {
    months: 3,
    label: '3 Months',
    description: 'Resume automatically after 90 days. All data retained.',
  },
];

interface PauseSubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinueCancel: () => void;
  onPauseSuccess: () => void;
}

export function PauseSubscriptionModal({
  open,
  onOpenChange,
  onContinueCancel,
  onPauseSuccess,
}: PauseSubscriptionModalProps) {
  const [selectedDuration, setSelectedDuration] = React.useState<PauseDuration>(2);

  const pauseMutation = trpc.billing.pauseSubscription.useMutation({
    onSuccess: () => {
      onPauseSuccess();
    },
  });

  const handlePause = () => {
    pauseMutation.mutate({ durationMonths: selectedDuration });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white">
            Pause Your Subscription
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
            Are you sure you want to pause your subscription? Your access will be temporarily
            suspended, but your data and AI model progress will be safely saved. Billing will resume
            automatically after the selected period.
          </DialogDescription>
        </DialogHeader>

        {/* Duration selection */}
        <div className="flex flex-col gap-4 py-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Select Pause Duration
          </p>
          <div className="grid grid-cols-3 gap-3">
            {PAUSE_OPTIONS.map((option) => (
              <button
                key={option.months}
                type="button"
                onClick={() => setSelectedDuration(option.months)}
                className={`relative flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left ${
                  selectedDuration === option.months
                    ? 'border-[#137fec] bg-[#137fec]/5 dark:border-[#137fec] dark:bg-[#137fec]/10 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                {option.recommended && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-[#137fec] text-white text-[10px] font-bold px-2 py-0.5 leading-none">
                    Recommended
                  </span>
                )}
                <span className="text-base font-bold text-slate-900 dark:text-white">
                  {option.label}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {option.description}
                </span>
              </button>
            ))}
          </div>

          {/* Data safety assurances */}
          <div className="flex flex-col gap-2 mt-2">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <span
                className="material-symbols-outlined text-lg text-[#137fec]"
                aria-hidden="true"
              >
                shield
              </span>
              CRM Data securely stored and accessible upon return.
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <span
                className="material-symbols-outlined text-lg text-[#137fec]"
                aria-hidden="true"
              >
                model_training
              </span>
              AI model progress and configurations saved.
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between border-t border-slate-200 dark:border-slate-700 pt-4">
          <button
            type="button"
            onClick={onContinueCancel}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Continue to cancel
          </button>
          <Button
            onClick={handlePause}
            disabled={pauseMutation.isPending}
            className="flex items-center gap-2"
          >
            {pauseMutation.isPending ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Pausing...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  pause_circle
                </span>
                Pause Subscription
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
