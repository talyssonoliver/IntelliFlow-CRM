'use client';

/**
 * "Send a survey" dialog (MVP-012): pick a contact and a question type, and the CRM emails them a
 * single-use answer link. The tenant comes from the session on the server; this only sends ids.
 */
import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

type SurveyType = 'NPS' | 'CSAT';

const TYPE_OPTIONS: ReadonlyArray<{ value: SurveyType; label: string; hint: string }> = [
  { value: 'NPS', label: 'NPS', hint: 'Would you recommend us? (0 to 10)' },
  { value: 'CSAT', label: 'CSAT', hint: 'How satisfied are you? (1 to 5)' },
];

export function SendSurveyDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const [search, setSearch] = useState('');
  const [contactId, setContactId] = useState<string | null>(null);
  const [surveyType, setSurveyType] = useState<SurveyType>('NPS');
  const utils = trpc.useUtils();

  // A sent email cannot be recalled, so the choice never outlives what is on screen: a new search
  // or closing the dialog clears it, and Send needs the chosen contact to be in the list shown.
  const close = () => {
    setContactId(null);
    setSearch('');
    onOpenChange(false);
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    setContactId(null);
  };

  const contacts = trpc.contact.list.useQuery(
    { page: 1, limit: 8, ...(search.trim() ? { search: search.trim() } : {}) },
    { enabled: open }
  );
  const send = trpc.feedbackSurvey.send.useMutation({
    onSuccess: async (result) => {
      if (result.delivered) {
        toast({ title: 'Survey sent' });
        close();
      } else {
        toast({
          title: 'The email could not be sent',
          description: 'The survey was saved. Try again later.',
          variant: 'destructive',
        });
      }
      await utils.feedbackSurvey.getDashboardStats.invalidate();
    },
    onError: (error) =>
      toast({ title: 'Could not send', description: error.message, variant: 'destructive' }),
  });

  const rows: Array<{ id: string; firstName: string; lastName: string; email: string }> =
    contacts.data?.contacts ?? [];
  const selected = rows.find((c) => c.id === contactId) ?? null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a survey</DialogTitle>
          <DialogDescription>
            The contact gets one short question by email. The link works once and expires in 14
            days.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="survey-contact-search">Contact</Label>
            <Input
              id="survey-contact-search"
              value={search}
              placeholder="Search by name or email"
              onChange={(e) => changeSearch(e.target.value)}
            />
            <ul className="max-h-48 space-y-1 overflow-y-auto" aria-label="Contacts">
              {rows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-pressed={contactId === c.id}
                    onClick={() => setContactId(c.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      contactId === c.id ? 'border-primary bg-primary/10' : 'hover:bg-accent'
                    }`}
                  >
                    <span className="font-medium">
                      {c.firstName} {c.lastName}
                    </span>
                    <span className="block text-xs text-muted-foreground">{c.email}</span>
                  </button>
                </li>
              ))}
              {!contacts.isLoading && rows.length === 0 && (
                <li className="px-1 text-sm text-muted-foreground">No contacts found.</li>
              )}
            </ul>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Question</legend>
            {TYPE_OPTIONS.map((option) => (
              <div key={option.value} className="flex items-start gap-2 text-sm">
                <input
                  id={`survey-type-${option.value}`}
                  type="radio"
                  name="survey-type"
                  checked={surveyType === option.value}
                  onChange={() => setSurveyType(option.value)}
                  className="mt-1"
                />
                <label htmlFor={`survey-type-${option.value}`} className="cursor-pointer">
                  <span className="font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </label>
              </div>
            ))}
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!selected || send.isPending}
            onClick={() => selected && send.mutate({ contactId: selected.id, surveyType })}
          >
            {send.isPending ? 'Sending...' : 'Send survey'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
