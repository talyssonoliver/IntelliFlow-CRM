'use client';

/**
 * IFC-312 — Inline "AI-suggested tags" row on the contact and account detail
 * pages.
 *
 * Generalized in the IFC-312 audit gap-close: previously contact-only. Now
 * takes an `entity` prop and dispatches to the matching tRPC procedure pair
 * (`suggestTags` + `addTags`). Hidden when the relevant toggle is off (the
 * server returns []), or when the user dismisses/accepts every suggestion.
 *
 * Accept → calls `trpc.<entity>.addTags`. Dismiss → local hide.
 */

import { useEffect, useState } from 'react';
import { trpc } from '@intelliflow/api-client';

export interface SuggestedTagsRowProps {
  readonly entity: 'contact' | 'account';
  readonly entityId: string;
  readonly enabled: boolean;
}

interface Suggestion {
  label: string;
  confidence: number;
  reason: string;
}

export function SuggestedTagsRow({ entity, entityId, enabled }: Readonly<SuggestedTagsRowProps>) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Dispatch to the entity-specific mutations. Hooks MUST be called
  // unconditionally — call both and pick the one we need per render.
  const contactSuggest = trpc.contact.suggestTags.useMutation();
  const accountSuggest = trpc.account.suggestTags.useMutation();
  const contactAddTags = trpc.contact.addTags.useMutation();
  const accountAddTags = trpc.account.addTags.useMutation();
  const suggestMutation = entity === 'contact' ? contactSuggest : accountSuggest;
  const acceptMutation = entity === 'contact' ? contactAddTags : accountAddTags;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    const payload = entity === 'contact' ? { contactId: entityId } : { accountId: entityId };
    suggestMutation
      // `mutateAsync` is typed differently across the two — cast narrowly.
      .mutateAsync(payload as never)
      .then((result: unknown) => {
        if (cancelled) return;
        const arr = Array.isArray(result) ? (result as Suggestion[]) : [];
        setSuggestions(arr);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entity, entityId, enabled, suggestMutation]);

  const visible = suggestions.filter((s) => !dismissed.has(s.label) && !accepting.has(s.label));

  if (!enabled) return null;
  if (loading && visible.length === 0) {
    return (
      <div className="text-xs text-muted-foreground" data-testid="suggested-tags-loading">
        Loading AI tag suggestions…
      </div>
    );
  }
  if (visible.length === 0) return null;

  async function handleAccept(label: string) {
    // Optimistically hide the chip while the mutation runs.
    setAccepting((prev) => new Set(prev).add(label));
    try {
      const payload =
        entity === 'contact'
          ? { contactId: entityId, tags: [label] }
          : { accountId: entityId, tags: [label] };
      await acceptMutation.mutateAsync(payload as never);
    } catch {
      // Revert on error — put the chip back.
      setAccepting((prev) => {
        const next = new Set(prev);
        next.delete(label);
        return next;
      });
    }
  }

  function handleDismiss(label: string) {
    setDismissed((prev) => new Set(prev).add(label));
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid="suggested-tags-row">
      <span className="text-xs text-muted-foreground mr-1">Suggested:</span>
      {visible.map((s) => (
        <span
          key={s.label}
          className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300"
          title={`${s.reason} · ${Math.round(s.confidence * 100)}% confident`}
        >
          <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
            sell
          </span>
          {s.label}
          <button
            type="button"
            onClick={() => handleAccept(s.label)}
            className="ml-1 inline-flex items-center rounded-full p-0.5 text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
            aria-label={`Accept suggestion ${s.label}`}
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              check
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleDismiss(s.label)}
            className="inline-flex items-center rounded-full p-0.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            aria-label={`Dismiss suggestion ${s.label}`}
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              close
            </span>
          </button>
        </span>
      ))}
    </div>
  );
}
