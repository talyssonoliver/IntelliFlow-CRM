'use client';

/**
 * The two automatic-survey switches (MVP-012): a survey after a won deal, and after a resolved or
 * closed ticket. Both default ON; only admins can change them.
 */
import { Switch, toast } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

export function AutoSurveySettings() {
  const utils = trpc.useUtils();
  const settings = trpc.feedbackSurvey.getSettings.useQuery();
  const update = trpc.feedbackSurvey.updateSettings.useMutation({
    onSuccess: () => utils.feedbackSurvey.getSettings.invalidate(),
    onError: () =>
      toast({ title: 'Only admins can change automatic surveys.', variant: 'destructive' }),
  });

  if (!settings.data) return null;
  const current = settings.data;

  const rows = [
    {
      key: 'autoSendOnDealWon' as const,
      label: 'After a deal is won',
      hint: 'Sends an NPS question to the deal contact.',
    },
    {
      key: 'autoSendOnTicketResolved' as const,
      label: 'After a ticket is resolved or closed',
      hint: 'Sends a CSAT question to the ticket contact.',
    },
  ];

  return (
    <section aria-labelledby="auto-survey-heading" className="rounded-lg border bg-card p-4">
      <h2 id="auto-survey-heading" className="text-sm font-medium">
        Automatic surveys
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        At most one survey per contact every 30 days.
      </p>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">{row.label}</div>
              <div className="text-xs text-muted-foreground">{row.hint}</div>
            </div>
            <Switch
              aria-label={row.label}
              checked={current[row.key]}
              disabled={update.isPending}
              onCheckedChange={(checked) => update.mutate({ ...current, [row.key]: checked })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
