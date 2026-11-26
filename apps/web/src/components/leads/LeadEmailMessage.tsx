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
  const thread = trpc.emailLog.leadEmails.useQuery({ leadId }, { staleTime: 60_000 });
  const email = thread.data?.emails.find((e) => e.id === emailRecordId);
  if (thread.isLoading) {
    return <p className="mt-3 text-sm text-slate-500">Loading the message...</p>;
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
