'use client';

import { Icon } from '@/lib/icons';

/** Spinner shown while a tracking panel loads its first data. */
export function LoadingPanel() {
  return (
    <div className="flex items-center justify-center h-64">
      <Icon name="progress_activity" className="animate-spin text-blue-500" size="2xl" />
    </div>
  );
}

interface ErrorPanelProps {
  error: string;
  onRetry: () => void;
}

/** Error box with a retry button for a tracking panel whose fetch failed. */
export function ErrorPanel({ error, onRetry }: Readonly<ErrorPanelProps>) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
      <div className="flex items-center gap-2">
        <Icon name="error" size="lg" />
        <span>Error: {error}</span>
      </div>
      <button onClick={onRetry} className="mt-2 text-sm underline hover:no-underline">
        Try again
      </button>
    </div>
  );
}
