'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@intelliflow/ui';
import { formatFileSize, formatDate } from './document-utils';
import type { VersionHistoryProps, DocumentVersion } from './types';

// =============================================================================
// VersionHistory Component
// =============================================================================

const CHANGE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  major: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
  minor: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  patch: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
};

function getChangeTypeStyle(changeType: string) {
  return CHANGE_TYPE_COLORS[changeType] ?? CHANGE_TYPE_COLORS.patch;
}

function computeSizeDelta(current: DocumentVersion, previous: DocumentVersion | undefined): string | null {
  if (!previous) return null;
  const delta = current.sizeBytes - previous.sizeBytes;
  if (delta === 0) return '±0';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${formatFileSize(Math.abs(delta))}`;
}

export function VersionHistory({
  documentId: _documentId,
  versions,
  currentVersionId,
  onVersionSelect,
  onRestoreVersion,
}: VersionHistoryProps) {
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);

  // Sort versions by date (newest first)
  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [versions]
  );

  const handleRestore = useCallback(
    (versionId: string) => {
      setRestoreTarget(versionId);
    },
    []
  );

  const confirmRestore = useCallback(() => {
    if (restoreTarget) {
      onRestoreVersion?.(restoreTarget);
      setRestoreTarget(null);
    }
  }, [restoreTarget, onRestoreVersion]);

  const cancelRestore = useCallback(() => {
    setRestoreTarget(null);
  }, []);

  // ─── Empty State ──────────────────────────────────────────────────────────

  if (versions.length === 0) {
    return (
      <div className="text-center py-12" data-testid="version-empty-state">
        <span className="material-symbols-outlined text-5xl text-slate-400">history</span>
        <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-white">No version history</h3>
        <p className="mt-2 text-sm text-slate-500">No version history available.</p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" data-testid="version-history">
      {/* Restore Confirmation Dialog */}
      {restoreTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm restore"
        >
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Restore version?</h3>
            <p className="mt-2 text-sm text-slate-500">
              This will restore version{' '}
              {sortedVersions.find((v) => v.id === restoreTarget)?.versionNumber ?? restoreTarget}{' '}
              as the current version. This action can be undone.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={cancelRestore}>
                Cancel
              </Button>
              <Button onClick={confirmRestore}>
                Restore
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <ol className="relative space-y-0" role="list" aria-label="Version history">
        {sortedVersions.map((version, index) => {
          const isCurrent = version.id === currentVersionId;
          const prevVersion = sortedVersions[index + 1]; // Previous is the next in the sorted (older) list
          const sizeDelta = computeSizeDelta(version, prevVersion);
          const changeStyle = getChangeTypeStyle(version.changeType);

          return (
            <li
              key={version.id}
              role="listitem"
              className={`relative pl-8 pb-6 ${index < sortedVersions.length - 1 ? 'border-l-2 border-slate-200 dark:border-slate-700' : ''}`}
              data-testid={`version-item-${version.id}`}
            >
              {/* Timeline dot */}
              <div
                className={`absolute left-0 top-0 -translate-x-1/2 w-4 h-4 rounded-full border-2 ${
                  isCurrent
                    ? 'bg-primary border-primary'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                }`}
                aria-hidden="true"
              />

              <div
                className={`rounded-lg p-4 cursor-pointer transition-colors ${
                  isCurrent
                    ? 'bg-primary/5 border border-primary/20'
                    : 'bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                onClick={() => onVersionSelect?.(version.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onVersionSelect?.(version.id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Version ${version.versionNumber}${isCurrent ? ' (current)' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        v{version.versionNumber}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${changeStyle.bg} ${changeStyle.text}`}
                      >
                        {version.changeType}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
                      <span>{version.createdBy}</span>
                      <span>{formatDate(version.createdAt)}</span>
                    </div>
                    {version.changelog && (
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                        {version.changelog}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                      <span>{formatFileSize(version.sizeBytes)}</span>
                      {sizeDelta && (
                        <span
                          className={
                            sizeDelta.startsWith('+')
                              ? 'text-amber-500'
                              : sizeDelta.startsWith('-')
                                ? 'text-emerald-500'
                                : 'text-slate-400'
                          }
                        >
                          ({sizeDelta})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Restore button for non-current versions */}
                  {!isCurrent && onRestoreVersion && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestore(version.id);
                      }}
                      aria-label={`Restore version ${version.versionNumber}`}
                    >
                      Restore
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
