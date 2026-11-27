'use client';

/**
 * One-click "Log to contact" (#1177): links an email the CRM holds to the lead or contact it is
 * with, so it shows on their timeline. Once linked it reads "Logged". Nothing is read from the
 * user's mailbox; the server links its own record of the email.
 */
import { toast } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

const BUTTON_CLASS =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50';

export function LogToContactButton({ emailId }: Readonly<{ emailId: string }>) {
  const utils = trpc.useUtils();
  const status = trpc.emailLog.status.useQuery({ emailId }, { retry: false });
  const log = trpc.emailLog.logToContact.useMutation({
    onSuccess: async () => {
      toast({ title: 'Logged to contact', description: 'It now shows on their timeline.' });
      await utils.emailLog.status.invalidate({ emailId });
    },
    onError: (error) => {
      toast({
        title: 'Could not log this email',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Nothing to offer until the link state is known (or when it cannot be read).
  if (!status.data) return null;

  if (status.data.logged) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground">
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          task_alt
        </span>{' '}
        Logged
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label="Log to contact"
      className={BUTTON_CLASS}
      disabled={log.isPending}
      onClick={() => log.mutate({ emailId })}
    >
      <span className="material-symbols-outlined text-base" aria-hidden="true">
        person_add
      </span>{' '}
      Log to contact
    </button>
  );
}
