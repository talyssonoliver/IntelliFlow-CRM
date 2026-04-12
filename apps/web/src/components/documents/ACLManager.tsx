'use client';

import { useState, useCallback } from 'react';
import { Button, EmptyState } from '@intelliflow/ui';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { canUserModifyACL, formatDate } from './document-utils';
import type { ACLManagerProps, AccessLevel } from './types';

// =============================================================================
// ACLManager Component
// =============================================================================

const ACCESS_LEVELS: { value: AccessLevel; label: string }[] = [
  { value: 'VIEW', label: 'View' },
  { value: 'COMMENT', label: 'Comment' },
  { value: 'EDIT', label: 'Edit' },
  { value: 'ADMIN', label: 'Admin' },
];

const ACCESS_LEVEL_COLORS: Record<AccessLevel, string> = {
  NONE: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  VIEW: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  COMMENT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  EDIT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  ADMIN: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

export function ACLManager({
  documentId: _documentId,
  currentACL,
  currentUserAccessLevel,
  onGrantAccess,
  onRevokeAccess,
  isLegalHold = false,
}: Readonly<ACLManagerProps>) {
  const [isGrantFormOpen, setIsGrantFormOpen] = useState(false);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantLevel, setGrantLevel] = useState<AccessLevel>('VIEW');
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const isAdmin = canUserModifyACL(currentUserAccessLevel);

  // ─── Grant Access ─────────────────────────────────────────────────────────

  const handleGrantSubmit = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      if (!grantUserId.trim()) return;
      onGrantAccess(grantUserId.trim(), grantLevel);
      setGrantUserId('');
      setGrantLevel('VIEW');
      setIsGrantFormOpen(false);
    },
    [grantUserId, grantLevel, onGrantAccess]
  );

  // ─── Revoke Access ────────────────────────────────────────────────────────

  const confirmRevoke = useCallback(() => {
    if (revokeTarget) {
      onRevokeAccess(revokeTarget);
      setRevokeTarget(null);
    }
  }, [revokeTarget, onRevokeAccess]);

  const cancelRevoke = useCallback(() => {
    setRevokeTarget(null);
  }, []);

  const revokeDialogRef = useFocusTrap<HTMLDialogElement>(!!revokeTarget);

  // ─── Empty State ──────────────────────────────────────────────────────────

  if (currentACL.length === 0 && !isAdmin) {
    return (
      <div data-testid="acl-empty-state">
        <EmptyState entity="documents" phase="passive" />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" data-testid="acl-manager">
      {/* Legal Hold Warning */}
      {isLegalHold && (
        <div
          className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
          role="alert"
          data-testid="legal-hold-warning"
        >
          <span className="material-symbols-outlined text-amber-600">gavel</span>
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-300">Legal Hold Active</p>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              This document is under legal hold. Access permissions cannot be modified.
            </p>
          </div>
        </div>
      )}

      {/* Grant Access Button */}
      {isAdmin && (
        <div className="flex justify-end">
          <Button
            onClick={() => setIsGrantFormOpen(true)}
            disabled={isLegalHold}
            aria-label="Grant access"
            data-testid="grant-access-button"
          >
            <span className="material-symbols-outlined text-[18px] mr-1">person_add</span> Grant
            Access
          </Button>
        </div>
      )}

      {/* Grant Access Form */}
      {isGrantFormOpen && (
        <form
          onSubmit={handleGrantSubmit}
          className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg space-y-4"
          data-testid="grant-access-form"
        >
          <div>
            <label
              htmlFor="grant-user-id"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              User ID or Email
            </label>
            <input
              id="grant-user-id"
              type="text"
              value={grantUserId}
              onChange={(e) => setGrantUserId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              placeholder="Enter user ID or email"
            />
          </div>
          <div>
            <label
              htmlFor="grant-access-level"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Access Level
            </label>
            <select
              id="grant-access-level"
              value={grantLevel}
              onChange={(e) => setGrantLevel(e.target.value as AccessLevel)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              {ACCESS_LEVELS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsGrantFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!grantUserId.trim()}>
              Grant
            </Button>
          </div>
        </form>
      )}

      {/* ACL Table */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full" role="table" aria-label="Access control list">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Access Level
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Granted
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Granted By
              </th>
              {isAdmin && (
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {currentACL.map((entry) => (
              <tr
                key={entry.principalId}
                className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{entry.userName}</p>
                    <p className="text-sm text-slate-500">{entry.email}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ACCESS_LEVEL_COLORS[entry.accessLevel]}`}
                    aria-label={`Access level: ${entry.accessLevel}`}
                  >
                    {entry.accessLevel}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">{formatDate(entry.grantedAt)}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{entry.grantedBy}</td>
                {isAdmin && (
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevokeTarget(entry.principalId)}
                      disabled={isLegalHold}
                      aria-label={`Revoke access for ${entry.userName}`}
                      data-testid={`revoke-${entry.principalId}`}
                    >
                      <span className="material-symbols-outlined text-[18px] text-red-500">
                        person_remove
                      </span>
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {currentACL.length === 0 && (
              <tr>
                <td
                  colSpan={isAdmin ? 5 : 4}
                  className="px-4 py-8 text-center text-sm text-slate-500"
                >
                  No access entries. Use "Grant Access" to add users.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Revoke Confirmation Dialog */}
      {revokeTarget && (
        <dialog
          ref={revokeDialogRef}
          open
          className="appearance-none bg-transparent border-none p-0 m-0 max-w-none max-h-none fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          aria-modal="true"
          aria-label="Confirm revoke access"
        >
          <div
            role="none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelRevoke();
            }}
            className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Revoke access?</h3>
            <p className="mt-2 text-sm text-slate-500">
              Are you sure you want to revoke access for{' '}
              {currentACL.find((e) => e.principalId === revokeTarget)?.userName ?? revokeTarget}?
              They will no longer be able to access this document.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={cancelRevoke}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmRevoke}>
                Revoke
              </Button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
