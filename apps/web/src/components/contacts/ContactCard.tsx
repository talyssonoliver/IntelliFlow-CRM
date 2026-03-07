'use client';

import React from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────────

type ContactStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

interface ContactCardContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  title?: string | null;
  phone?: string | null;
  status: ContactStatus;
  account?: { id: string; name: string } | null;
  _count?: { opportunities: number; tasks: number };
}

export interface ContactCardProps {
  contact: ContactCardContact;
  onClick?: (contact: ContactCardContact) => void;
  onCall?: (contact: ContactCardContact) => void;
  onEmail?: (contact: ContactCardContact) => void;
  compact?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getAvatarColor(name: string) {
  const colors = [
    'bg-amber-200 text-amber-800 border-amber-300',
    'bg-indigo-100 text-indigo-700 border-indigo-200',
    'bg-emerald-100 text-emerald-700 border-emerald-200',
    'bg-rose-100 text-rose-700 border-rose-200',
    'bg-sky-100 text-sky-700 border-sky-200',
  ];
  const hash = name.split('').reduce((acc, char) => acc + (char.codePointAt(0) ?? 0), 0);
  return colors[hash % colors.length];
}

const statusConfig: Record<ContactStatus, { label: string; className: string; icon: string }> = {
  ACTIVE: {
    label: 'Active',
    className:
      'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
    icon: 'check_circle',
  },
  INACTIVE: {
    label: 'Inactive',
    className:
      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    icon: 'pause_circle',
  },
  ARCHIVED: {
    label: 'Archived',
    className:
      'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
    icon: 'archive',
  },
};

// ─── Component ──────────────────────────────────────────────────────────────────

export function ContactCard({ contact, onClick, onCall, onEmail, compact }: Readonly<ContactCardProps>) {
  const fullName = `${contact.firstName} ${contact.lastName}`;
  const initials =
    `${contact.firstName?.[0] || ''}${contact.lastName?.[0] || ''}`.toUpperCase() || '?';
  const status = statusConfig[contact.status] || statusConfig.ACTIVE;
  const opportunities = contact._count?.opportunities ?? 0;
  const tasks = contact._count?.tasks ?? 0;

  const cardClassName = `bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:border-slate-300 dark:hover:border-slate-600 transition-colors ${onClick ? 'cursor-pointer' : ''}`;

  const cardContent = (
    <div className="flex items-start gap-3">
      {/* Avatar */}
      <span
        className={`size-10 rounded-full shrink-0 flex items-center justify-center font-bold text-sm border ${getAvatarColor(fullName)}`}
        aria-hidden="true"
      >
        {initials}
      </span>

      <div className="flex-1 min-w-0">
        {/* Name & Title */}
        <p className="font-medium text-slate-900 dark:text-white truncate">{fullName}</p>
        {contact.title && !compact && (
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{contact.title}</p>
        )}
        {contact.account && !compact && (
          <p className="text-xs text-slate-400 mt-0.5">{contact.account.name}</p>
        )}

        {/* Status Badge */}
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold mt-2 ${status.className}`}
        >
          <span className="material-symbols-outlined text-xs" aria-hidden="true">
            {status.icon}
          </span>
          {status.label}
        </span>

        {/* Activity Badges */}
        {!compact && (opportunities > 0 || tasks > 0) && (
          <div className="flex gap-2 mt-2">
            {opportunities > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-xs" aria-hidden="true">
                  handshake
                </span>
                {opportunities} {opportunities === 1 ? 'Deal' : 'Deals'}
              </span>
            )}
            {tasks > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <span className="material-symbols-outlined text-xs" aria-hidden="true">
                  task_alt
                </span>
                {tasks} {tasks === 1 ? 'Task' : 'Tasks'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      {(onEmail || onCall) && (
        <div className="flex gap-1">
          {onEmail && (
            <button
              type="button"
              aria-label={`Send email to ${fullName}`}
              className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onEmail(contact);
              }}
            >
              <span className="material-symbols-outlined text-lg">mail</span>
            </button>
          )}
          {onCall && contact.phone && (
            <button
              type="button"
              aria-label={`Call ${fullName}`}
              className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onCall(contact);
              }}
            >
              <span className="material-symbols-outlined text-lg">phone</span>
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={`Contact card for ${fullName}`}
        className={cardClassName}
        onClick={() => onClick(contact)}
      >
        {cardContent}
      </button>
    );
  }

  return (
    <article aria-label={`Contact card for ${fullName}`} className={cardClassName}>
      {cardContent}
    </article>
  );
}
