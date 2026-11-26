'use client';

/**
 * The lead page's Emails tab (moved out of the page, unchanged except that mail received from the
 * lead is labelled "Received": the label comes from the mail's direction, not its status).
 * MVP-012 PR B: a reply Aurora drafted to the lead waits at the top for Send, Edit or Dismiss.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Card, EmptyState } from '@intelliflow/ui';
import { formatRelativeTime } from '@/lib/leads/lead-format';
import { emailRowLabel, type LeadEmailRow } from '@/lib/leads/lead-emails';
import { ReplyDraftsPanel } from '@/components/contacts/ReplyDraftsPanel';
import { LeadEmailMessage } from '@/components/leads/LeadEmailMessage';

interface LeadEmailsTabProps {
  /** The lead whose drafted replies are shown (MVP-012). */
  leadId: string;
  emails: LeadEmailRow[];
  timezone: string;
  /** The lead's email address; Compose (header and empty state) is offered only when there is one. */
  leadEmail: string | null | undefined;
  /** Shows that email's activity in the timeline (tab, expanded, scrolled to). */
  onOpenActivity: (activityId: string) => void;
}

/** Green for opened, blue for received, grey for sent. */
function badgeClass(email: LeadEmailRow): string {
  if (email.direction === 'inbound') return 'bg-blue-50 text-blue-700';
  return email.status === 'opened' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600';
}

export function LeadEmailsTab({
  leadId,
  emails,
  timezone,
  leadEmail,
  onOpenActivity,
}: LeadEmailsTabProps) {
  const to = leadEmail?.trim();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Emails</h3>
        {to && (
          <Link
            href={`/email/compose?to=${encodeURIComponent(to)}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#2a78f6] hover:bg-[#2a78f6]/10 rounded-lg transition-colors"
          >
            <span aria-hidden="true" className="material-symbols-outlined !text-[18px]">
              send
            </span>{' '}
            Compose
          </Link>
        )}
      </div>
      <div className="mb-4">
        <ReplyDraftsPanel leadId={leadId} enabled />
      </div>
      <div className="space-y-3">
        {emails.length > 0 ? (
          emails.map((email) => (
            <div key={email.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <span className="material-symbols-outlined !text-[20px] text-orange-600">
                    mail
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white truncate">
                    {email.subject}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      data-testid="email-row-label"
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeClass(email)}`}
                    >
                      {emailRowLabel(email)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatRelativeTime(email.sentAt, timezone)}
                    </span>
                  </div>
                </div>
                {email.emailRecordId && (
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === email.id ? null : email.id)}
                    aria-expanded={openId === email.id}
                    aria-label={`${openId === email.id ? 'Hide' : 'Read'} "${email.subject}"`}
                    className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined !text-[18px]">
                      {openId === email.id ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                )}
                {/* Opens in place: no ?activityId= navigation, which would re-run the
                  deep-link tab switch on this same page. */}
                <button
                  type="button"
                  onClick={() => onOpenActivity(email.id)}
                  aria-label={`Open "${email.subject}" in the activity timeline`}
                  className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg"
                >
                  <span aria-hidden="true" className="material-symbols-outlined !text-[18px]">
                    open_in_new
                  </span>
                </button>
              </div>
              {openId === email.id && email.emailRecordId && (
                <LeadEmailMessage leadId={leadId} emailRecordId={email.emailRecordId} />
              )}
            </div>
          ))
        ) : (
          // Compose to this lead, never a blank recipient; no address means no button.
          <EmptyState
            entity="emails"
            {...(to
              ? {
                  ctaHref: `/email/compose?to=${encodeURIComponent(to)}`,
                  ctaLabel: 'Compose email',
                }
              : { showCta: false })}
          />
        )}
      </div>
    </Card>
  );
}
