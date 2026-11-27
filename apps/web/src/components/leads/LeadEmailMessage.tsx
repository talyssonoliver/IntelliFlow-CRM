'use client';

/**
 * One mail of a lead's thread opened in place on the Emails tab: who it was between, when (the
 * provider's own date), and its body and attachments through the shared renderer (EmailBody), the
 * same one the /email reader uses. The thread is one query for the lead, shared by every row.
 */
import { trpc } from '@/lib/trpc';
import { EmailBody } from '@/components/email/EmailBody';

export function LeadEmailMessage({
  leadId,
  emailRecordId,
}: Readonly<{ leadId: string; emailRecordId: string }>) {
  // By id: the lead's thread list is bounded, so an older row is not in it.
  const query = trpc.emailLog.leadEmail.useQuery({ leadId, emailRecordId }, { staleTime: 60_000 });
  const notFound = query.isError && query.error?.data?.code === 'NOT_FOUND';
  // A mail that is gone or unlinked is never shown from the cache.
  const email = notFound ? undefined : query.data;
  if (query.isLoading) {
    return <p className="mt-3 text-sm text-slate-500">Loading the message...</p>;
  }
  if (query.isError && !notFound) {
    return <p className="mt-3 text-sm text-slate-500">Could not load the message. Try again.</p>;
  }
  if (!email) {
    return <p className="mt-3 text-sm text-slate-500">This message is no longer available.</p>;
  }
  const to = email.to.map((t) => t.address).join(', ');
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs text-slate-500 [overflow-wrap:anywhere]">
        From {email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address}
        {' to '}
        {to}
        {' · '}
        <time dateTime={email.receivedAt}>
          {new Date(email.receivedAt).toLocaleString('en-GB')}
        </time>
      </p>
      <div className="mt-2">
        <EmailBody
          emailId={email.id}
          htmlBody={email.htmlBody}
          textBody={email.textBody}
          attachments={email.attachments}
        />
      </div>
    </div>
  );
}
