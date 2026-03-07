'use client';

import { getConflictSeverityColor, formatTimeRange } from '@/lib/appointments/appointment-utils';
import type { ConflictDetail } from './types';

export interface ConflictWarningProps {
  conflicts: ConflictDetail[];
  onViewConflict: (appointmentId: string) => void;
  onOverride?: () => void;
}

export function ConflictWarning({ conflicts, onViewConflict, onOverride }: Readonly<ConflictWarningProps>) {
  if (conflicts.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-lg border border-red-200 bg-red-50 p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-red-600 text-xl">warning</span>
        <h4 className="font-semibold text-red-800">
          {conflicts.length} Scheduling Conflict{conflicts.length === 1 ? '' : 's'}
        </h4>
      </div>

      <ul className="space-y-2" aria-label="Conflict list">
        {conflicts.map((conflict) => {
          const severity = getConflictSeverityColor(conflict.conflictType);
          const partialOrBufferIcon = conflict.conflictType === 'PARTIAL' ? 'schedule' : 'timer';
          const conflictIcon = conflict.conflictType === 'EXACT' ? 'block' : partialOrBufferIcon;
          const partialOrBufferLabel =
            conflict.conflictType === 'PARTIAL' ? 'Partial overlap' : 'Buffer overlap';
          const conflictLabel =
            conflict.conflictType === 'EXACT' ? 'Exact overlap' : partialOrBufferLabel;
          return (
            <li
              key={conflict.id}
              className={`rounded-md border p-3 ${severity.bgColor} ${severity.borderColor}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`material-symbols-outlined text-base ${severity.color}`}>
                      {conflictIcon}
                    </span>
                    <span className={`text-sm font-medium ${severity.color}`}>{conflictLabel}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mt-1 truncate">
                    {conflict.title}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {formatTimeRange(conflict.startTime, conflict.endTime)} ·{' '}
                    {conflict.overlapMinutes} min overlap
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onViewConflict(conflict.id)}
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 shrink-0"
                >
                  <span className="material-symbols-outlined text-base">visibility</span>{' '}
                  View
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {onOverride && (
        <label className="flex items-center gap-2 mt-4 pt-3 border-t border-red-200 cursor-pointer">
          <input
            type="checkbox"
            onChange={() => onOverride()}
            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          <span className="text-sm text-red-800">I want to schedule despite conflicts</span>
        </label>
      )}
    </div>
  );
}
