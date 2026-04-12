'use client';

import * as React from 'react';

interface MoreActionsButtonProps {
  onClick: () => void;
  className?: string;
}

export function MoreActionsButton({ onClick, className = '' }: Readonly<MoreActionsButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="More actions"
      className={`flex items-center justify-center w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${className}`}
    >
      <span className="material-symbols-outlined text-[20px]">more_vert</span>
    </button>
  );
}
