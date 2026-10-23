'use client';

/**
 * Log a request made in person, by phone or by post (PG-203 DSAR; compliance R3, security S5).
 *
 * Staff record how they checked the person's identity; the request starts verified, with
 * the deadline counted from the day it was received. A staff-logged erasure is announced to
 * the person by email and needs a second administrator (or a 24-hour pause) before it runs.
 */
import { useEffect, useState } from 'react';
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
  Textarea,
} from '@intelliflow/ui';
import type { DsarLogRequestInput } from '@intelliflow/validators/dsar';

type RequestType = DsarLogRequestInput['type'];
type IdentityMethod = DsarLogRequestInput['identityMethod'];

export const TYPE_LABELS: Record<RequestType, string> = {
  ACCESS: 'Access (a copy of their data)',
  PORTABILITY: 'Portability (data to take elsewhere)',
  RECTIFICATION: 'Rectification (correct data)',
  ERASURE: 'Erasure (delete data)',
  RESTRICTION: 'Restriction (pause use)',
  OBJECTION: 'Objection',
};

const IDENTITY_LABELS: Record<IdentityMethod, string> = {
  IN_PERSON_ID: 'Photo ID seen in person',
  KNOWN_CLIENT_CALLBACK: 'Called back a known client on their number on file',
  SIGNED_LETTER: 'Signed letter matching our records',
  OTHER: 'Other (describe below)',
};

const IDENTITY_NOTE_MIN = 20;

interface Draft {
  type: RequestType;
  email: string;
  receivedOn: string;
  receivedOnReason: string;
  identityMethod: IdentityMethod;
  identityNote: string;
  objectionScope: 'MARKETING' | 'OTHER';
  details: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): Draft {
  return {
    type: 'ACCESS',
    email: '',
    receivedOn: today(),
    receivedOnReason: '',
    identityMethod: 'IN_PERSON_ID',
    identityNote: '',
    objectionScope: 'MARKETING',
    details: '',
  };
}

/** A light shape check (the server validates properly): one "@", a dot in the domain. */
function looksLikeEmail(value: string): boolean {
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@') || value.includes(' ')) return false;
  const dot = value.lastIndexOf('.');
  return dot > at + 1 && dot < value.length - 1;
}

/** The first problem with a draft, in form order, or null. */
export function logRequestProblem(draft: Draft): string | null {
  if (!looksLikeEmail(draft.email.trim())) return 'Enter a valid email address.';
  if (draft.receivedOn > today()) return 'The received date cannot be in the future.';
  if (draft.receivedOn < today() && !draft.receivedOnReason.trim()) {
    return 'Say why the request is logged after the day it was received.';
  }
  if (draft.identityNote.trim().length < IDENTITY_NOTE_MIN) {
    return `Describe the identity check in at least ${IDENTITY_NOTE_MIN} characters.`;
  }
  return null;
}

export function toLogRequestInput(draft: Draft): DsarLogRequestInput {
  return {
    type: draft.type,
    email: draft.email.trim(),
    receivedOn: draft.receivedOn,
    ...(draft.receivedOn < today() ? { receivedOnReason: draft.receivedOnReason.trim() } : {}),
    identityMethod: draft.identityMethod,
    identityNote: draft.identityNote.trim(),
    ...(draft.type === 'OBJECTION' ? { objectionScope: draft.objectionScope } : {}),
    ...(draft.details.trim() ? { details: draft.details.trim() } : {}),
  };
}

export function LogRequestDialog({
  open,
  pending,
  error,
  onSubmit,
  onClose,
}: Readonly<{
  open: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (input: DsarLogRequestInput) => void;
  onClose: () => void;
}>) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(emptyDraft());
      setProblem(null);
    }
  }, [open]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const found = logRequestProblem(draft);
    setProblem(found);
    if (!found) onSubmit(toLogRequestInput(draft));
  };

  const shown = problem ?? error;
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log a request</DialogTitle>
          <DialogDescription>
            For a request made in person, by phone or by post. It starts verified on your identity
            check.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="log-type">Request</Label>
            <select
              id="log-type"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.type}
              onChange={(e) => update('type', e.target.value as RequestType)}
            >
              {(Object.keys(TYPE_LABELS) as RequestType[]).map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          {draft.type === 'OBJECTION' && (
            <div className="space-y-1.5">
              <Label htmlFor="log-scope">Objection to</Label>
              <select
                id="log-scope"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={draft.objectionScope}
                onChange={(e) =>
                  update('objectionScope', e.target.value as Draft['objectionScope'])
                }
              >
                <option value="MARKETING">Marketing (must stop)</option>
                <option value="OTHER">Another use (weighed)</option>
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="log-email">Their email address</Label>
            <Input
              id="log-email"
              type="email"
              maxLength={320}
              value={draft.email}
              onChange={(e) => update('email', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="log-received">Received on</Label>
            <Input
              id="log-received"
              type="date"
              max={today()}
              value={draft.receivedOn}
              onChange={(e) => update('receivedOn', e.target.value)}
            />
          </div>
          {draft.receivedOn < today() && (
            <div className="space-y-1.5">
              <Label htmlFor="log-received-reason">Why it is logged late</Label>
              <Input
                id="log-received-reason"
                maxLength={500}
                value={draft.receivedOnReason}
                onChange={(e) => update('receivedOnReason', e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="log-identity">How you checked their identity</Label>
            <select
              id="log-identity"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.identityMethod}
              onChange={(e) => update('identityMethod', e.target.value as IdentityMethod)}
            >
              {(Object.keys(IDENTITY_LABELS) as IdentityMethod[]).map((method) => (
                <option key={method} value={method}>
                  {IDENTITY_LABELS[method]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="log-identity-note">Identity check details</Label>
            <Textarea
              id="log-identity-note"
              rows={2}
              maxLength={500}
              value={draft.identityNote}
              onChange={(e) => update('identityNote', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="log-details">What they asked for (optional)</Label>
            <Textarea
              id="log-details"
              rows={3}
              maxLength={2000}
              value={draft.details}
              onChange={(e) => update('details', e.target.value)}
            />
          </div>
          {draft.type === 'ERASURE' && (
            <p className="text-sm text-muted-foreground">
              The person is emailed that an erasure was logged. Another administrator must carry it
              out, or, if you are the only one, it can run 24 hours after logging.
            </p>
          )}
          {shown && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {shown}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : 'Log request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
