'use client';

/**
 * Public Product Tour — PG-126
 *
 * A lightweight, a11y-complete, first-visit tour overlay for the public
 * marketing surface. Composes shadcn/ui Dialog for portal + focus trap, adds
 * a bespoke spotlight layer that highlights a targeted DOM element, and
 * instruments events via the existing tracking-pixel utility.
 *
 * Runtime rules:
 *   - Mounts only inside useEffect (SSR renders nothing).
 *   - Auto-starts for first-visit unauthenticated visitors, unless the user
 *     has prefers-reduced-motion: reduce or the seen flag is already set.
 *   - `?tour=1` query param always forces a start regardless of seen flag.
 *   - Tour overlay sits at z-index 40; FAB at 50; Dialog at 60.
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
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { TourConfig, TourStep } from '@intelliflow/validators';
import { getTourSeenAt, markTourSeen } from '@/lib/public/tour-storage';
import {
  trackOnboardingStep,
  trackOnboardingComplete,
  trackTourStarted,
  trackTourSkipped,
} from '@/lib/shared/tracking-pixel';

// -----------------------------
// Context
// -----------------------------

interface TourContextValue {
  config: TourConfig | null;
  isActive: boolean;
  currentStepIndex: number;
  start: () => void;
  next: () => void;
  previous: () => void;
  skip: () => void;
  close: () => void;
}

const TourContext = React.createContext<TourContextValue | undefined>(undefined);

export function useTourState(): TourContextValue {
  const ctx = React.useContext(TourContext);
  if (!ctx) {
    throw new Error('useTourState must be used within a <TourProvider>');
  }
  return ctx;
}

// -----------------------------
// Provider
// -----------------------------

interface TourProviderProps {
  config: TourConfig;
  children: React.ReactNode;
  /** When true, skips auto-start logic (useful for tests). */
  disableAutoStart?: boolean;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function TourProvider({ config, children, disableAutoStart }: TourProviderProps) {
  const [isActive, setIsActive] = React.useState(false);
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const [mounted, setMounted] = React.useState(false);
  const startedAtRef = React.useRef<number | null>(null);
  const searchParams = useSearchParams();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const start = React.useCallback(() => {
    setCurrentStepIndex(0);
    setIsActive(true);
    startedAtRef.current = Date.now();
    trackTourStarted({
      tourId: config.id,
      totalSteps: config.steps.length,
    });
  }, [config.id, config.steps.length]);

  const skip = React.useCallback(() => {
    trackTourSkipped({
      tourId: config.id,
      stepIndex: currentStepIndex,
      totalSteps: config.steps.length,
    });
    setIsActive(false);
  }, [config.id, config.steps.length, currentStepIndex]);

  const close = React.useCallback(() => {
    setIsActive(false);
  }, []);

  const next = React.useCallback(() => {
    setCurrentStepIndex((idx) => {
      const nextIdx = idx + 1;
      const currentStep = config.steps[idx];
      if (currentStep) {
        trackOnboardingStep({
          step: idx + 1,
          stepName: currentStep.title,
          totalSteps: config.steps.length,
        });
      }
      if (nextIdx >= config.steps.length) {
        // Completion path.
        markTourSeen(config.id);
        const durationSec = startedAtRef.current
          ? Math.floor((Date.now() - startedAtRef.current) / 1000)
          : undefined;
        trackOnboardingComplete({
          totalSteps: config.steps.length,
          timeToComplete: durationSec,
        });
        setIsActive(false);
        return idx;
      }
      return nextIdx;
    });
  }, [config.id, config.steps]);

  const previous = React.useCallback(() => {
    setCurrentStepIndex((idx) => Math.max(0, idx - 1));
  }, []);

  // Auto-start: ?tour=1 overrides; otherwise honour seen flag + RM.
  React.useEffect(() => {
    if (!mounted || disableAutoStart) return;

    const forceStart = searchParams?.get('tour') === '1';
    if (forceStart) {
      start();
      return;
    }

    if (prefersReducedMotion()) return;
    const seenAt = getTourSeenAt(config.id);
    if (seenAt) return;

    start();
  }, [mounted, disableAutoStart, searchParams, config.id, start]);

  const value = React.useMemo<TourContextValue>(
    () => ({
      config,
      isActive,
      currentStepIndex,
      start,
      next,
      previous,
      skip,
      close,
    }),
    [config, isActive, currentStepIndex, start, next, previous, skip, close]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

// -----------------------------
// Spotlight
// -----------------------------

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TourSpotlightProps {
  rect: TargetRect | null;
  reducedMotion: boolean;
}

export function TourSpotlight({ rect, reducedMotion }: TourSpotlightProps) {
  if (!rect) {
    // Full-dim fallback when target cannot be located.
    return (
      <div
        aria-hidden="true"
        data-testid="tour-spotlight-fallback"
        className="fixed inset-0 bg-black/60"
        style={{ zIndex: 40 }}
      />
    );
  }

  const pad = 8;
  const transitionClass = reducedMotion ? '' : 'transition-all duration-200 ease-out';

  return (
    <div
      aria-hidden="true"
      data-testid="tour-spotlight"
      className={`fixed inset-0 ${transitionClass}`}
      style={{
        zIndex: 40,
        boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.6)`,
        clipPath: `polygon(
          0 0, 100% 0, 100% 100%, 0 100%, 0 0,
          ${rect.left - pad}px ${rect.top - pad}px,
          ${rect.left - pad}px ${rect.top + rect.height + pad}px,
          ${rect.left + rect.width + pad}px ${rect.top + rect.height + pad}px,
          ${rect.left + rect.width + pad}px ${rect.top - pad}px,
          ${rect.left - pad}px ${rect.top - pad}px
        )`,
      }}
    />
  );
}

// -----------------------------
// Tour Root
// -----------------------------

export function PublicTour() {
  const { config, isActive, currentStepIndex, next, previous, skip, close } = useTourState();
  const [mounted, setMounted] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    setReducedMotion(prefersReducedMotion());
  }, []);

  if (!mounted || !isActive || !config) return null;

  const step: TourStep | undefined = config.steps[currentStepIndex];
  if (!step) return null;

  const rect =
    typeof document !== 'undefined'
      ? (document.querySelector(step.targetSelector)?.getBoundingClientRect() ?? null)
      : null;

  return (
    <>
      <TourSpotlight
        rect={
          rect
            ? {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }
            : null
        }
        reducedMotion={reducedMotion}
      />
      <TourStepDialog
        step={step}
        currentIndex={currentStepIndex}
        totalSteps={config.steps.length}
        onNext={next}
        onPrevious={previous}
        onSkip={skip}
        onClose={close}
      />
    </>
  );
}

interface TourStepDialogProps {
  step: TourStep;
  currentIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onClose: () => void;
}

function TourStepDialog({
  step,
  currentIndex,
  totalSteps,
  onNext,
  onPrevious,
  onSkip,
  onClose,
}: TourStepDialogProps) {
  const titleId = React.useId();
  const descId = React.useId();
  const isLast = currentIndex === totalSteps - 1;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={descId}
        data-testid="tour-step-dialog"
        className="max-w-md"
        style={{ zIndex: 60 }}
      >
        <DialogHeader>
          <DialogTitle id={titleId}>{step.title}</DialogTitle>
          <DialogDescription id={descId}>{step.description}</DialogDescription>
        </DialogHeader>
        <div className="text-xs text-muted-foreground" aria-live="polite">
          Step {currentIndex + 1} of {totalSteps}
        </div>
        <DialogFooter className="flex-row gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            aria-label="Skip tour"
            data-testid="tour-skip-button"
          >
            Skip
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onPrevious}
            disabled={currentIndex === 0}
            data-testid="tour-previous-button"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              arrow_back
            </span>
            Previous
          </Button>
          <Button type="button" onClick={onNext} data-testid="tour-next-button" autoFocus>
            {isLast ? 'Done' : 'Next'}
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              {isLast ? 'check' : 'arrow_forward'}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------
// Replay trigger
// -----------------------------

interface TourTriggerButtonProps {
  tourId: string;
  label?: string;
  /** If provided, navigates to this URL (with ?tour=1) instead of calling start(). */
  href?: string;
  className?: string;
}

export function TourTriggerButton({
  tourId,
  label = 'Take the tour',
  href,
  className,
}: TourTriggerButtonProps) {
  if (href) {
    const separator = href.includes('?') ? '&' : '?';
    const target = `${href}${separator}tour=1`;
    return (
      <Link
        href={target}
        className={className}
        data-testid="tour-trigger-link"
        data-tour-id={tourId}
      >
        <span className="material-symbols-outlined text-base mr-1" aria-hidden="true">
          play_circle
        </span>
        {label}
      </Link>
    );
  }

  return <TourTriggerInlineButton label={label} className={className} />;
}

function TourTriggerInlineButton({ label, className }: { label: string; className?: string }) {
  const { start } = useTourState();
  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={start}
      data-testid="tour-trigger-button"
    >
      <span className="material-symbols-outlined text-base mr-1" aria-hidden="true">
        play_circle
      </span>
      {label}
    </Button>
  );
}

export type { TourStep, TourConfig } from '@intelliflow/validators';
