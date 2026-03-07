'use client';

import React from 'react';
import Link from 'next/link';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface RelatedContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  title?: string | null;
}

export interface RelationshipGraphProps {
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    account?: { id: string; name: string } | null;
    accountId?: string | null;
  };
  relatedContacts?: RelatedContact[];
  opportunityCount?: number;
  taskCount?: number;
  linkedLead?: { id: string; name: string } | null;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function RelationshipGraph({
  contact,
  relatedContacts = [],
  opportunityCount = 0,
  taskCount = 0,
  linkedLead,
}: Readonly<RelationshipGraphProps>) {
  const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown';
  const hasRelationships =
    contact.account ||
    linkedLead ||
    relatedContacts.length > 0 ||
    opportunityCount > 0 ||
    taskCount > 0;

  return (
    <div aria-label={`Relationships for ${fullName}`} className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Relationships</h3>

      {hasRelationships ? (
        <ul className="space-y-3">
          {/* Linked Account */}
          {contact.account && (
            <li className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <span className="material-symbols-outlined text-primary" aria-hidden="true">
                domain
              </span>
              <div className="flex-1">
                <p className="text-xs text-slate-500 uppercase font-semibold">Account</p>
                <Link
                  href={`/accounts/${contact.account.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View account: {contact.account.name}
                </Link>
              </div>
            </li>
          )}

          {/* No account linked */}
          {!contact.account && (
            <li className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <span className="material-symbols-outlined text-slate-400" aria-hidden="true">
                domain
              </span>
              <div className="flex-1">
                <p className="text-xs text-slate-500 uppercase font-semibold">Account</p>
                <p className="text-sm text-slate-400">No account linked</p>
              </div>
            </li>
          )}

          {/* Linked Lead */}
          {linkedLead && (
            <li className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <span className="material-symbols-outlined text-emerald-600" aria-hidden="true">
                person_search
              </span>
              <div className="flex-1">
                <p className="text-xs text-slate-500 uppercase font-semibold">
                  Converted from Lead
                </p>
                <Link
                  href={`/leads/${linkedLead.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View lead: {linkedLead.name}
                </Link>
              </div>
            </li>
          )}

          {/* Related Contacts */}
          {relatedContacts.length > 0 && (
            <li className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-indigo-600" aria-hidden="true">
                  group
                </span>
                <p className="text-xs text-slate-500 uppercase font-semibold">
                  Related Contacts ({relatedContacts.length})
                </p>
              </div>
              <ul className="space-y-2 ml-7">
                {relatedContacts.map((rc) => (
                  <li key={rc.id}>
                    <Link
                      href={`/contacts/${rc.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      View contact: {rc.firstName} {rc.lastName}
                    </Link>
                    {rc.title && <span className="text-xs text-slate-400 ml-2">{rc.title}</span>}
                  </li>
                ))}
              </ul>
            </li>
          )}

          {/* Opportunities */}
          {opportunityCount > 0 && (
            <li className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <span className="material-symbols-outlined text-amber-600" aria-hidden="true">
                handshake
              </span>
              <div className="flex-1">
                <p className="text-xs text-slate-500 uppercase font-semibold">Opportunities</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {opportunityCount} {opportunityCount === 1 ? 'opportunity' : 'opportunities'}
                </p>
              </div>
            </li>
          )}

          {/* Tasks */}
          {taskCount > 0 && (
            <li className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <span className="material-symbols-outlined text-sky-600" aria-hidden="true">
                task_alt
              </span>
              <div className="flex-1">
                <p className="text-xs text-slate-500 uppercase font-semibold">Tasks</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                </p>
              </div>
            </li>
          )}
        </ul>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4">No relationships yet</p>
      )}
    </div>
  );
}
