'use client';

/**
 * IFC-312 — Inline "AI-suggested tags" row on the contact detail page.
 * Hidden when `aiTagSuggestions` is disabled or when the server returns [].
 * Accept → calls trpc.contact.addTags. Dismiss → local hide.
 */

import { useEffect, useState } from 'react';
import { trpc } from '@intelliflow/api-client';

export interface SuggestedTagsRowProps {
  readonly contactId: string;
  readonly enabled: boolean;
}

interface Suggestion {
  label: string;
  confidence: number;
  reason: string;
}

export function SuggestedTagsRow({ contactId, enabled }: Readonly<SuggestedTagsRowProps>) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const suggestMutation = trpc.contact.suggestTags.useMutation();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    suggestMutation
      .mutateAsync({ contactId })
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
  }, [contactId, enabled, suggestMutation]);

  const visible = suggestions.filter((s) => !dismissed.has(s.label));

  if (!enabled) return null;
  if (loading && visible.length === 0) {
    return (
      <div className="text-xs text-muted-foreground" data-testid="suggested-tags-loading">
        Loading AI tag suggestions…
      </div>
    );
  }
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" data-testid="suggested-tags-row">
      <span className="text-xs text-muted-foreground mr-1">Suggested:</span>
      {visible.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => setDismissed((prev) => new Set(prev).add(s.label))}
          className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300"
          title={`${s.reason} · ${Math.round(s.confidence * 100)}% confident`}
          aria-label={`Dismiss suggestion ${s.label}`}
        >
          <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
            sell
          </span>
          {s.label}
          <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
            close
          </span>
        </button>
      ))}
    </div>
  );
}
