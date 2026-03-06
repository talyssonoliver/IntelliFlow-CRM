'use client';

import { useMemo } from 'react';

interface SourceHighlightProps {
  text: string;
  query: string;
  maxLength?: number;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function SourceHighlight({ text, query, maxLength = 300 }: SourceHighlightProps) {
  const truncatedText = text.length > maxLength ? text.slice(0, maxLength) + '...' : text;

  const parts = useMemo(() => {
    const terms = query.trim().split(/\s+/).filter(Boolean).map(escapeRegex);

    if (terms.length === 0) return [{ text: truncatedText, highlight: false }];

    const pattern = new RegExp(`(${terms.join('|')})`, 'gi');
    const segments = truncatedText.split(pattern);

    return segments.map((segment) => ({
      text: segment,
      highlight: terms.some((term) => new RegExp(`^${term}$`, 'i').test(segment)),
    }));
  }, [truncatedText, query]);

  return (
    <span>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}
