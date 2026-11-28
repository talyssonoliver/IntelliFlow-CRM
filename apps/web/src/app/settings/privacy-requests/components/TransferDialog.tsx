'use client';

/**
 * Send a portability export to another controller (IFC-317, UK GDPR Art 20(2)).
 *
 * The person may ask the firm to send their data straight to another controller. An
 * administrator names the recipient and records how the person asked; the recipient gets a
 * single-use link, valid for seven days, to the same export the person would download. This
 * dialog creates the transfer, shows every step recorded on it (created, sent, downloaded,
 * expired, revoked, with who and when) and revokes a link that is still live.
 *
 * The link is emailed through the same DSAR email path as the person's own notices. When that
 * fails, the link is shown once, here, for the administrator to send: the server keeps only a
 * hash of it, so it cannot be shown again. Nothing here polls; the list loads when the dialog
 * opens and after each action.
 */
import { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Textarea,
  toast,
} from '@intelliflow/ui';
import type {
  DsarCreateTransferInput,
  DsarCreateTransferResultDto,
  DsarRequestDto,
  DsarTransferDto,
} from '@intelliflow/validators/dsar';
import { trpc } from '@/lib/trpc';

// Mirror DSAR_TRANSFER_LIMITS in the domain package (the server validates properly).
const BASIS_MIN = 10;

/**
 * A cheap shape check, one @ with a dot after it and no spaces, so the admin hears about a typo
 * at once. The server validates the address properly. Built without a backtracking regex.
 */
function looksLikeEmail(value: string): boolean {
  const at = value.indexOf('@');
  if (at < 1 || at !== value.lastIndexOf('@') || /\s/.test(value)) return false;
  const dot = value.lastIndexOf('.');
  return dot > at + 1 && dot < value.length - 1;
}

/** Whether the request can be sent on: a confirmed portability request (the server decides too). */
export function canTransfer(request: Pick<DsarRequestDto, 'type' | 'status'>): boolean {
  return request.type === 'PORTABILITY' && ['VERIFIED', 'COMPLETED'].includes(request.status);
}

export interface TransferDraft {
  recipientName: string;
  recipientEmail: string;
  basis: string;
  confirmed: boolean;
}

export const EMPTY_DRAFT: TransferDraft = {
  recipientName: '',
  recipientEmail: '',
  basis: '',
  confirmed: false,
};

type TransferField = 'recipientName' | 'recipientEmail' | 'basis' | 'confirmed';

export interface TransferProblem {
  field: TransferField;
  message: string;
}

const FIELD_IDS: Record<TransferField, string> = {
  recipientName: 'transfer-name',
  recipientEmail: 'transfer-email',
  basis: 'transfer-basis',
  confirmed: 'transfer-confirm',
};

/** The first problem with the draft and the field it belongs to, or null. */
export function transferProblem(draft: TransferDraft): TransferProblem | null {
  if (draft.recipientName.trim().length === 0) {
    return {
      field: 'recipientName',
      message: 'Enter the name of the organisation receiving the data.',
    };
  }
  if (!looksLikeEmail(draft.recipientEmail.trim())) {
    return {
      field: 'recipientEmail',
      message: 'Enter a valid contact email address for the recipient.',
    };
  }
  if (draft.basis.trim().length < BASIS_MIN) {
    return {
      field: 'basis',
      message: `Say how the person asked for this, in at least ${BASIS_MIN} characters.`,
    };
  }
  if (!draft.confirmed) {
    return { field: 'confirmed', message: 'Confirm that the person asked for this transfer.' };
  }
  return null;
}

export function toCreateInput(requestId: string, draft: TransferDraft): DsarCreateTransferInput {
  return {
    id: requestId,
    recipientName: draft.recipientName.trim(),
    recipientEmail: draft.recipientEmail.trim().toLowerCase(),
    basis: draft.basis.trim(),
    confirmed: true,
  };
}

const STATE_LABELS: Record<DsarTransferDto['state'], string> = {
  ACTIVE: 'Link active',
  DOWNLOADED: 'Downloaded',
  REVOKED: 'Revoked',
  EXPIRED: 'Expired',
};

/** One line per recorded step: what happened and who did it. */
export function eventLine(event: DsarTransferDto['events'][number]): string {
  const who = event.actorLabel ?? 'an administrator';
  switch (event.kind) {
    case 'CREATED':
      return `Created by ${who}`;
    case 'SENT':
      return event.via === 'EMAIL'
        ? `Link emailed to the recipient (approved by ${who})`
        : `Link sent by ${who}`;
    case 'DOWNLOADED':
      return 'Downloaded by the recipient, link used up';
    case 'EXPIRED':
      return 'Link expired unused';
    case 'REVOKED':
      return `Revoked by ${who}`;
  }
}

function dateTimeLabel(iso: string): string {
  return `${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))} UTC`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Please try again.';
}

function TransferItem({
  transfer,
  busy,
  onRevoke,
}: Readonly<{ transfer: DsarTransferDto; busy: boolean; onRevoke: (t: DsarTransferDto) => void }>) {
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{transfer.recipientName}</p>
          <p className="text-sm text-foreground">{transfer.recipientEmail}</p>
        </div>
        <Badge variant={transfer.state === 'ACTIVE' ? 'default' : 'secondary'}>
          {STATE_LABELS[transfer.state]}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{`How the person asked: ${transfer.basis}`}</p>
      {transfer.state === 'ACTIVE' && (
        <p className="text-xs text-muted-foreground">{`Expires ${dateTimeLabel(transfer.expiresAt)}`}</p>
      )}
      {transfer.awaitingSend && (
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Nobody has recorded sending this link. It was shown once and is not kept, so revoke it and
          create a new transfer.
        </p>
      )}
      <ol className="space-y-0.5 border-l border-border pl-3 text-sm text-foreground">
        {transfer.events.map((event) => (
          <li key={event.kind}>
            <span className="text-muted-foreground">{`${dateTimeLabel(event.occurredAt)}: `}</span>
            {eventLine(event)}
          </li>
        ))}
      </ol>
      {transfer.state === 'ACTIVE' && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onRevoke(transfer)}
          aria-label={`Revoke the link to ${transfer.recipientName}`}
        >
          Revoke link
        </Button>
      )}
    </li>
  );
}

export function TransferDialog({
  request,
  onClose,
  onCloseAutoFocus,
}: Readonly<{
  request: DsarRequestDto;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}>) {
  const utils = trpc.useUtils();
  const listQuery = trpc.privacy.admin.transfers.useQuery({ id: request.id }, { retry: false });
  // Returned, so react-query waits for the refetch before it settles the mutation.
  const refresh = () => utils.privacy.admin.transfers.invalidate({ id: request.id });
  const create = trpc.privacy.admin.createTransfer.useMutation({ onSuccess: refresh });
  const markSent = trpc.privacy.admin.markTransferSent.useMutation({ onSuccess: refresh });
  const revoke = trpc.privacy.admin.revokeTransfer.useMutation({ onSuccess: refresh });

  const [draft, setDraft] = useState<TransferDraft>(EMPTY_DRAFT);
  const [problem, setProblem] = useState<TransferProblem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DsarCreateTransferResultDto | null>(null);
  const [copied, setCopied] = useState(false);

  const update = <K extends keyof TransferDraft>(key: K, value: TransferDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (create.isPending) return;
    const found = transferProblem(draft);
    setProblem(found);
    setError(null);
    if (found) {
      document.getElementById(FIELD_IDS[found.field])?.focus();
      return;
    }
    try {
      const created = await create.mutateAsync(toCreateInput(request.id, draft));
      setResult(created);
      setDraft(EMPTY_DRAFT);
      toast({
        title: created.delivered
          ? 'Link emailed to the recipient'
          : 'Transfer created, send the link',
      });
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError('Could not copy. Select the link and copy it by hand.');
    }
  };

  const recordSent = async (id: string) => {
    setError(null);
    try {
      await markSent.mutateAsync({ id });
      setResult(null);
      toast({ title: 'Recorded as sent' });
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  const revokeTransfer = async (transfer: DsarTransferDto) => {
    setError(null);
    try {
      await revoke.mutateAsync({ id: transfer.id });
      if (result?.transfer.id === transfer.id) setResult(null);
      toast({ title: 'Link revoked' });
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  const invalid = (field: TransferField) => (problem?.field === field ? true : undefined);
  const describedBy = (field: TransferField, ...ids: string[]) =>
    [...ids, ...(problem?.field === field ? ['transfer-error'] : [])].join(' ') || undefined;
  const shown = problem?.message ?? error;
  const transfers = listQuery.data ?? [];

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Send to another controller</DialogTitle>
          <DialogDescription>
            {`${request.subjectEmail} can ask you to send their data straight to another organisation (UK GDPR Article 20(2)). The recipient gets a link that works once and expires after 7 days. It opens the same file the person would download.`}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3" aria-live="polite">
            {result.delivered ? (
              <p className="text-sm text-foreground">
                {`The link was emailed to ${result.transfer.recipientEmail}. The email names your firm and the expiry only, never the person.`}
              </p>
            ) : (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
                <p className="text-sm font-medium text-foreground">
                  The email could not be sent. Send this link to the recipient yourself.
                </p>
                <p className="text-xs text-muted-foreground">
                  It is shown once and is not kept: close this and it cannot be shown again. Send it
                  over a channel you trust, then record that you did.
                </p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    aria-label="Transfer link"
                    value={result.manualLink ?? ''}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void copyLink(result.manualLink ?? '')}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <Button
                  type="button"
                  disabled={markSent.isPending}
                  onClick={() => void recordSent(result.transfer.id)}
                >
                  I have sent it
                </Button>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            )}
            <Button type="button" variant="outline" onClick={() => setResult(null)}>
              {result.delivered ? 'Done' : 'Close without recording'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="transfer-name">Recipient organisation</Label>
              <Input
                id="transfer-name"
                maxLength={200}
                aria-invalid={invalid('recipientName')}
                aria-describedby={describedBy('recipientName')}
                value={draft.recipientName}
                onChange={(e) => update('recipientName', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-email">Recipient contact email</Label>
              <Input
                id="transfer-email"
                type="email"
                maxLength={320}
                aria-invalid={invalid('recipientEmail')}
                aria-describedby={describedBy('recipientEmail')}
                value={draft.recipientEmail}
                onChange={(e) => update('recipientEmail', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-basis">How the person asked for this</Label>
              <p id="transfer-basis-hint" className="text-xs text-muted-foreground">
                {`For the record, at least ${BASIS_MIN} characters. For example: asked by email on 3 November, replying to our confirmation.`}
              </p>
              <Textarea
                id="transfer-basis"
                rows={3}
                maxLength={500}
                aria-invalid={invalid('basis')}
                aria-describedby={describedBy('basis', 'transfer-basis-hint')}
                value={draft.basis}
                onChange={(e) => update('basis', e.target.value)}
              />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="transfer-confirm"
                aria-invalid={invalid('confirmed')}
                aria-describedby={describedBy('confirmed')}
                checked={draft.confirmed}
                onCheckedChange={(checked) => update('confirmed', checked === true)}
              />
              <Label htmlFor="transfer-confirm" className="text-sm font-normal leading-snug">
                The person asked for this transfer to this recipient, and I have checked the
                recipient is who they asked for. The file holds the same data as their own export,
                including anything you withhold from it.
              </Label>
            </div>
            {shown && (
              <p
                id="transfer-error"
                role="alert"
                className="text-sm text-red-700 dark:text-red-300"
              >
                {shown}
              </p>
            )}
            <Button
              type="button"
              onClick={() => void submit()}
              aria-disabled={create.isPending || undefined}
            >
              {create.isPending ? 'Creating…' : 'Create transfer and send link'}
            </Button>
          </div>
        )}

        <section aria-labelledby="transfer-history" className="space-y-1">
          <h3 id="transfer-history" className="text-sm font-semibold text-foreground">
            Transfers on this request
          </h3>
          {listQuery.isLoading && (
            <output className="text-sm text-muted-foreground">Loading</output>
          )}
          {listQuery.isError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              The transfers could not be loaded.
            </p>
          )}
          {!listQuery.isLoading && !listQuery.isError && transfers.length === 0 && (
            <EmptyState
              entity="documents"
              showCta={false}
              size="sm"
              title="No transfers yet"
              description="A transfer you create appears here with every step recorded: created, sent, downloaded, expired or revoked."
              aria-label="No transfers yet"
              className="py-4 px-3 gap-2"
              tabIndex={-1}
            />
          )}
          <ul className="divide-y divide-border">
            {transfers.map((transfer) => (
              <TransferItem
                key={transfer.id}
                transfer={transfer}
                busy={revoke.isPending}
                onRevoke={(t) => void revokeTransfer(t)}
              />
            ))}
          </ul>
        </section>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
