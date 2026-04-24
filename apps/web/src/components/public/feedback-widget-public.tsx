'use client';

/**
 * Public Feedback Widget — PG-126
 *
 * Floating action button + dialog for anonymous public feedback. Renders on
 * every public route with PublicHeader (the parent layout decides when to
 * mount this).
 *
 * - FAB: z-index 50, 44×44 px hit target, Material Symbols icon.
 * - Dialog: z-index 60; built on shadcn/ui Dialog; focus trap via Radix.
 * - Rating: role=radiogroup with 5 stars, arrow-key nav.
 * - Honeypot: visually hidden __honeypot input; non-empty submissions are
 *   rejected server-side.
 * - Client rate limit: 1 successful submission per 10 min (localStorage).
 */
import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@intelliflow/ui';
import { Button } from '@intelliflow/ui';
import { Input } from '@intelliflow/ui';
import { Textarea } from '@intelliflow/ui';
import { Label } from '@intelliflow/ui';
import { cn } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import {
  publicFeedbackInputSchema,
  canSubmitFeedbackClientRateLimit,
  markFeedbackSubmittedClientSide,
} from '@/lib/public/feedback-service';
import { usePathname } from 'next/navigation';

// -----------------------------
// FAB
// -----------------------------

export function PublicFeedbackFab() {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const fabRef = React.useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open feedback form"
        data-testid="public-feedback-fab"
        className={cn(
          'fixed bottom-6 right-6 size-12 rounded-full bg-ds-primary text-white shadow-lg',
          'flex items-center justify-center hover:shadow-xl transition-shadow',
          'focus:outline-none focus:ring-2 focus:ring-ds-primary focus:ring-offset-2'
        )}
        style={{ zIndex: 50 }}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          feedback
        </span>
      </button>
      <PublicFeedbackDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            // Return focus to the FAB on close.
            setTimeout(() => fabRef.current?.focus(), 0);
          }
        }}
        source={pathname ?? '/'}
      />
    </>
  );
}

// -----------------------------
// Dialog
// -----------------------------

interface PublicFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: string;
}

type DialogState = 'idle' | 'submitting' | 'success' | 'already-submitted';

export function PublicFeedbackDialog({
  open,
  onOpenChange,
  source,
}: PublicFeedbackDialogProps) {
  const [rating, setRating] = React.useState<number>(0);
  const [comment, setComment] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [honeypot, setHoneypot] = React.useState('');
  const [ratingError, setRatingError] = React.useState<string | null>(null);
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [state, setState] = React.useState<DialogState>('idle');

  const submitMutation = trpc.publicFeedback.submit.useMutation({
    onSuccess: () => {
      markFeedbackSubmittedClientSide();
      setState('success');
      window.setTimeout(() => {
        onOpenChange(false);
      }, 3000);
    },
    onError: (err) => {
      if (err.data?.code === 'TOO_MANY_REQUESTS') {
        setServerError('Please try again in a few minutes.');
      } else if (err.data?.code === 'BAD_REQUEST') {
        setServerError('Your submission could not be processed. Please try again.');
      } else {
        setServerError('Something went wrong. Please try again.');
      }
      setState('idle');
    },
  });

  // Reset when opening fresh.
  React.useEffect(() => {
    if (!open) return;
    setRating(0);
    setComment('');
    setEmail('');
    setHoneypot('');
    setRatingError(null);
    setEmailError(null);
    setServerError(null);
    if (!canSubmitFeedbackClientRateLimit()) {
      setState('already-submitted');
    } else {
      setState('idle');
    }
  }, [open]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRatingError(null);
    setEmailError(null);
    setServerError(null);

    if (rating < 1 || rating > 5) {
      setRatingError('Please select a rating');
      return;
    }

    const parsed = publicFeedbackInputSchema.safeParse({
      rating,
      comment: comment.trim() || undefined,
      email: email.trim() || undefined,
      source,
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      __honeypot: honeypot || '',
    });

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      if (fieldErrors.email?.[0]) {
        setEmailError(fieldErrors.email[0]);
        return;
      }
      setServerError(parsed.error.issues[0]?.message ?? 'Invalid submission');
      return;
    }

    setState('submitting');
    submitMutation.mutate(parsed.data);
  }

  // Submit button is always enabled while the form is idle; the handler
  // surfaces the "Please select a rating" inline error when rating is 0 so
  // the user sees an explicit failure mode instead of a dead button.
  const canSubmit = state === 'idle' && !submitMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        role="dialog"
        aria-labelledby="public-feedback-title"
        aria-describedby="public-feedback-desc"
        data-testid="public-feedback-dialog"
        className="max-w-md"
        style={{ zIndex: 60 }}
      >
        <DialogHeader>
          <DialogTitle id="public-feedback-title">Share your feedback</DialogTitle>
          <DialogDescription id="public-feedback-desc">
            Help us improve IntelliFlow. Your feedback is anonymous unless you
            leave an email.
          </DialogDescription>
        </DialogHeader>

        {state === 'success' ? (
          <div
            aria-live="polite"
            data-testid="public-feedback-success"
            className="flex items-center gap-2 py-4 text-sm"
          >
            <span
              className="material-symbols-outlined text-success"
              aria-hidden="true"
            >
              check_circle
            </span>
            Feedback submitted — thank you!
          </div>
        ) : state === 'already-submitted' ? (
          <div
            aria-live="polite"
            data-testid="public-feedback-already-submitted"
            className="py-4 text-sm text-muted-foreground"
          >
            Thanks — we&apos;ve already received your feedback recently.
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <FeedbackRatingRadioGroup
              value={rating}
              onChange={setRating}
              error={ratingError}
            />

            <div className="mt-4">
              <Label htmlFor="public-feedback-comment">Comment (optional)</Label>
              <Textarea
                id="public-feedback-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="What's on your mind?"
              />
              <div
                className="text-xs text-muted-foreground text-right mt-1"
                aria-live="polite"
              >
                {comment.length}/1000
              </div>
            </div>

            <div className="mt-4">
              <Label htmlFor="public-feedback-email">Email (optional)</Label>
              <Input
                id="public-feedback-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-invalid={emailError ? 'true' : undefined}
                aria-describedby={
                  emailError ? 'public-feedback-email-error' : undefined
                }
              />
              {emailError && (
                <p
                  id="public-feedback-email-error"
                  className="text-xs text-destructive mt-1"
                >
                  {emailError}
                </p>
              )}
            </div>

            {/* Honeypot — visually hidden, not focusable */}
            <input
              type="text"
              name="__honeypot"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              data-testid="public-feedback-honeypot"
              style={{
                position: 'absolute',
                left: '-9999px',
                width: 1,
                height: 1,
                opacity: 0,
              }}
            />

            {serverError && (
              <p
                data-testid="public-feedback-server-error"
                className="text-sm text-destructive mt-3"
              >
                {serverError}
              </p>
            )}

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit}
                data-testid="public-feedback-submit"
              >
                {submitMutation.isPending ? 'Sending...' : 'Send feedback'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------
// Rating radiogroup
// -----------------------------

interface FeedbackRatingRadioGroupProps {
  value: number;
  onChange: (value: number) => void;
  error: string | null;
}

export function FeedbackRatingRadioGroup({
  value,
  onChange,
  error,
}: FeedbackRatingRadioGroupProps) {
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault();
        onChange(Math.min(5, value + 1 || 1));
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        onChange(Math.max(1, value - 1 || 1));
      } else if (event.key === 'Home') {
        event.preventDefault();
        onChange(1);
      } else if (event.key === 'End') {
        event.preventDefault();
        onChange(5);
      }
    },
    [value, onChange]
  );

  return (
    <div>
      <span id="public-feedback-rating-label" className="text-sm font-medium">
        How would you rate your experience?
      </span>
      <div
        role="radiogroup"
        tabIndex={-1}
        aria-labelledby="public-feedback-rating-label"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={
          error ? 'public-feedback-rating-error' : undefined
        }
        onKeyDown={handleKeyDown}
        className="flex items-center gap-2 mt-2"
        data-testid="public-feedback-rating"
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = value >= star;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`Rate ${star} out of 5 stars`}
              data-testid={`public-feedback-rating-${star}`}
              onClick={() => onChange(star)}
              tabIndex={value === star || (value === 0 && star === 1) ? 0 : -1}
              className={cn(
                'size-10 rounded-md flex items-center justify-center transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-ds-primary',
                filled ? 'text-amber-400' : 'text-muted-foreground'
              )}
            >
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={{
                  fontVariationSettings: filled
                    ? '"FILL" 1'
                    : '"FILL" 0',
                }}
              >
                star
              </span>
            </button>
          );
        })}
      </div>
      {error && (
        <p
          id="public-feedback-rating-error"
          className="text-xs text-destructive mt-1"
          data-testid="public-feedback-rating-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
