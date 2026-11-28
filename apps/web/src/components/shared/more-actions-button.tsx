'use client';

import * as React from 'react';

interface MoreActionsButtonProps {
  onClick: () => void;
  className?: string;
  /**
   * `hero`: on the shared page hero's dark card, styled like the hero's other buttons (owner
   * 26/11: the white ⋮ stood out on the deal page hero). `default`: on a light surface.
   */
  variant?: 'default' | 'hero';
}

const VARIANT_CLASSES = {
  default:
    'rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700',
  hero: 'rounded-xl border border-white/25 bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
} as const;

export function MoreActionsButton({
  onClick,
  className = '',
  variant = 'default',
}: Readonly<MoreActionsButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="More actions"
      className={`flex items-center justify-center size-11 transition-colors ${VARIANT_CLASSES[variant]} ${className}`}
    >
      <span className="material-symbols-outlined text-[20px]">more_vert</span>
    </button>
  );
}
