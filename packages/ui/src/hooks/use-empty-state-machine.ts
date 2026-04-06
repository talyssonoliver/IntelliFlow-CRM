'use client';

import { useCallback, useRef, useState } from 'react';

// ============================================
// Types
// ============================================

export type EmptyStatePhase =
  | 'passive'
  | 'soft-cta'
  | 'inline-composer'
  | 'smart-suggestions';

export interface EmptyStateMachine {
  /** Current phase of the empty-state lifecycle */
  phase: EmptyStatePhase;
  /** Transition to soft-cta (hover/focus/scroll-into-view) */
  activate: () => void;
  /** Return to passive (mouse leave / blur) */
  deactivate: () => void;
  /** Open the inline composer (CTA click) */
  openComposer: () => void;
  /** Signal first item created — show smart suggestions */
  completeCreate: () => void;
  /** Reset back to passive */
  reset: () => void;
  /** Ref callback for IntersectionObserver (scroll-into-view trigger) */
  observerRef: (node: HTMLElement | null) => void;
}

// ============================================
// Hook
// ============================================

export function useEmptyStateMachine(): EmptyStateMachine {
  const [phase, setPhase] = useState<EmptyStatePhase>('passive');
  const observerInstance = useRef<IntersectionObserver | null>(null);

  const activate = useCallback(() => {
    setPhase((prev) => (prev === 'passive' ? 'soft-cta' : prev));
  }, []);

  const deactivate = useCallback(() => {
    setPhase((prev) => (prev === 'soft-cta' ? 'passive' : prev));
  }, []);

  const openComposer = useCallback(() => {
    setPhase('inline-composer');
  }, []);

  const completeCreate = useCallback(() => {
    setPhase('smart-suggestions');
  }, []);

  const reset = useCallback(() => {
    setPhase('passive');
  }, []);

  // IntersectionObserver ref callback — triggers soft-cta when scrolled into view
  const observerRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerInstance.current) {
        observerInstance.current.disconnect();
        observerInstance.current = null;
      }

      if (!node) return;

      observerInstance.current = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            activate();
          }
        },
        { threshold: 0.5 }
      );
      observerInstance.current.observe(node);
    },
    [activate]
  );

  return { phase, activate, deactivate, openComposer, completeCreate, reset, observerRef };
}
