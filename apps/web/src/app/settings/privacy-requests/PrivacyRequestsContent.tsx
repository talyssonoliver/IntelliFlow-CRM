'use client';

/**
 * Privacy requests — settings (PG-203 DSAR; spec Addendum A, sign-off 1-8).
 *
 * The firm's data subject requests, overdue first, and the processing restrictions in force.
 * Administrators confirm, extend, complete or refuse requests here, log requests made in
 * person, and lift restrictions after telling the person. The server owns every rule; the
 * page explains and shows the server's answer. Only administrators can see it.
 */
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
  toast,
} from '@intelliflow/ui';
import type { DsarExportDto, DsarRequestDto } from '@intelliflow/validators/dsar';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { SectionHeader } from '@/components/shared/section-header';
import {
  RequestActionDialog,
  type ActionInput,
  type RequestAction,
} from './components/RequestActionDialog';
import { LogRequestDialog, TYPE_LABELS } from './components/LogRequestDialog';

const STATUS_LABELS: Record<DsarRequestDto['status'], string> = {
  PENDING_VERIFICATION: 'Awaiting confirmation',
  VERIFIED: 'Open',
  COMPLETED: 'Completed',
  REJECTED: 'Refused',
};

/** The tRPC error code of a failed request, if any. */
export function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined;
  const data = (error as { data?: { code?: unknown } }).data;
  return typeof data?.code === 'string' ? data.code : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Please try again.';
}

function dateLabel(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/** The actions an admin can take on a request, in the order they are offered. */
export function actionsFor(request: DsarRequestDto): RequestAction[] {
  // A live download link can be revoked even after the request closed (codex).
  const revoke: RequestAction[] = request.exportLinkActive ? ['revokeExport'] : [];
  if (request.status !== 'VERIFIED') return revoke;
  const isExport = request.type === 'ACCESS' || request.type === 'PORTABILITY';
  const actions: RequestAction[] = [isExport ? 'completeAccess' : 'complete'];
  if (!request.extendedUntil) actions.push('extend');
  if (request.type === 'ERASURE') actions.push('cancelErasure');
  actions.push(...revoke, 'reject');
  return actions;
}

const ACTION_LABELS: Record<RequestAction, string> = {
  complete: 'Complete',
  completeAccess: 'Complete',
  extend: 'Extend',
  reject: 'Refuse',
  cancelErasure: 'Cancel erasure',
  revokeExport: 'Revoke link',
};

/** Save a staff export as a file from memory. */
function downloadJson(data: DsarExportDto): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'personal-data-export.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

function RequestRow({
  request,
  onAction,
  onExport,
}: Readonly<{
  request: DsarRequestDto;
  onAction: (action: RequestAction, request: DsarRequestDto) => void;
  onExport: (request: DsarRequestDto) => void;
}>) {
  const isExport = request.type === 'ACCESS' || request.type === 'PORTABILITY';
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <p className="font-medium text-foreground">
          {TYPE_LABELS[request.type]}
          {request.objectionScope === 'MARKETING' ? ', marketing' : ''}
        </p>
        <p className="text-sm text-foreground">{request.subjectEmail}</p>
        <p className="text-xs text-muted-foreground">
          {`Received ${dateLabel(request.receivedOn)} · ${request.source === 'STAFF' ? 'Logged by staff' : 'Online form'}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{STATUS_LABELS[request.status]}</Badge>
          {request.effectiveDeadline && request.status === 'VERIFIED' && (
            <Badge variant={request.overdue ? 'destructive' : 'outline'}>
              {`${request.overdue ? 'Overdue since' : 'Due'} ${dateLabel(request.effectiveDeadline)}${request.extendedUntil ? ' (extended)' : ''}`}
            </Badge>
          )}
          {request.clockBreached && <Badge variant="destructive">Answered late</Badge>}
        </div>
        {request.details && (
          <p className="max-w-prose whitespace-pre-wrap text-sm text-muted-foreground">
            {request.details}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {isExport && request.status === 'VERIFIED' && (
          <Button type="button" size="sm" variant="outline" onClick={() => onExport(request)}>
            Download data
          </Button>
        )}
        {actionsFor(request).map((action) => (
          <Button
            key={action}
            type="button"
            size="sm"
            variant={action === 'reject' ? 'outline' : 'default'}
            onClick={() => onAction(action, request)}
            aria-label={`${ACTION_LABELS[action]}: ${TYPE_LABELS[request.type]} for ${request.subjectEmail}`}
          >
            {ACTION_LABELS[action]}
          </Button>
        ))}
      </div>
    </li>
  );
}

export default function PrivacyRequestsContent() {
  const auth = useRequireAuth();
  const enabled = auth.isAuthenticated && !auth.isLoading;
  const utils = trpc.useUtils();
  const listQuery = trpc.privacy.admin.list.useQuery({}, { enabled, retry: false });
  const restrictionsQuery = trpc.privacy.admin.restrictions.useQuery(undefined, {
    enabled,
    retry: false,
  });
  const refresh = () => utils.privacy.admin.invalidate();

  const [active, setActive] = useState<{ action: RequestAction; request: DsarRequestDto } | null>(
    null
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [lifting, setLifting] = useState<{ id: string; email: string } | null>(null);
  const [liftNote, setLiftNote] = useState('');
  const [liftError, setLiftError] = useState<string | null>(null);

  const preview = trpc.privacy.admin.previewErasure.useQuery(
    { id: active?.request.id ?? '' },
    {
      enabled: active?.action === 'complete' && active.request.type === 'ERASURE',
      retry: false,
    }
  );
  const complete = trpc.privacy.admin.complete.useMutation({ onSuccess: refresh });
  const completeAccess = trpc.privacy.admin.completeAccess.useMutation({ onSuccess: refresh });
  const extend = trpc.privacy.admin.extend.useMutation({ onSuccess: refresh });
  const reject = trpc.privacy.admin.reject.useMutation({ onSuccess: refresh });
  const cancelErasure = trpc.privacy.admin.cancelErasure.useMutation({ onSuccess: refresh });
  const revokeExport = trpc.privacy.admin.revokeExport.useMutation({ onSuccess: refresh });
  const logRequest = trpc.privacy.admin.logRequest.useMutation({ onSuccess: refresh });
  const liftRestriction = trpc.privacy.admin.liftRestriction.useMutation({ onSuccess: refresh });
  const exportData = trpc.privacy.admin.exportData.useMutation();

  const pending =
    complete.isPending ||
    completeAccess.isPending ||
    extend.isPending ||
    reject.isPending ||
    cancelErasure.isPending ||
    revokeExport.isPending;

  if (errorCode(listQuery.error) === 'FORBIDDEN') {
    return (
      <div className="space-y-4 p-6">
        <PageHeader title="Privacy requests" />
        <Card className="p-6">
          <p className="text-foreground">Only administrators can see and handle data requests.</p>
        </Card>
      </div>
    );
  }

  const runAction = async (input: ActionInput) => {
    if (!active) return;
    const { action, request } = active;
    setActionError(null);
    try {
      let done = 'Request updated';
      switch (action) {
        case 'complete': {
          const result = await complete.mutateAsync({
            id: request.id,
            note: input.note ?? '',
            ...input,
          });
          done = result.erasure ? 'Data erased and the person told' : 'Request completed';
          break;
        }
        case 'completeAccess':
          await completeAccess.mutateAsync({
            id: request.id,
            note: input.note ?? '',
            withheld: input.withheld ?? [],
          });
          done = 'Request completed';
          break;
        case 'extend':
          await extend.mutateAsync({
            id: request.id,
            months: input.months ?? 1,
            reason: input.reason ?? '',
          });
          done = 'Deadline extended and the person told';
          break;
        case 'reject': {
          const result = await reject.mutateAsync({ id: request.id, reason: input.reason ?? '' });
          done = result.restrictionKept
            ? 'Request refused. The restriction stays until the person can be told it is lifted.'
            : 'Request refused and the person told';
          break;
        }
        case 'cancelErasure':
          await cancelErasure.mutateAsync({ id: request.id, reason: input.reason ?? '' });
          done = 'Erasure cancelled and the person told';
          break;
        case 'revokeExport':
          await revokeExport.mutateAsync({ id: request.id });
          done = 'Download link revoked';
      }
      toast({ title: done });
      setActive(null);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const runExport = async (request: DsarRequestDto) => {
    try {
      downloadJson(await exportData.mutateAsync({ id: request.id }));
    } catch (error) {
      toast({
        title: 'Could not export',
        description: errorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const requests = listQuery.data ?? [];
  const open = requests.filter(
    (r) => r.status === 'VERIFIED' || r.status === 'PENDING_VERIFICATION'
  );
  const closed = requests.filter((r) => r.status === 'COMPLETED' || r.status === 'REJECTED');
  const restrictions = restrictionsQuery.data ?? [];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Privacy requests' }]}
        title="Privacy requests"
        description="Requests from people about their personal data. Answer each within one month of confirmation."
        actions={[{ label: 'Log a request', icon: 'add', onClick: () => setLogOpen(true) }]}
      />

      <Card className="p-6">
        <SectionHeader
          icon="assignment_ind"
          iconBg="bg-blue-100 dark:bg-blue-900/30"
          iconFg="text-blue-600 dark:text-blue-400"
          title="Open requests"
          headingLevel={2}
          description="Overdue first, then the nearest deadline."
        />
        {listQuery.isLoading && <output className="text-sm text-muted-foreground">Loading</output>}
        {listQuery.isError && errorCode(listQuery.error) !== 'FORBIDDEN' && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            The requests could not be loaded.
          </p>
        )}
        {!listQuery.isLoading && open.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">No open requests.</p>
        )}
        <ul className="divide-y divide-border">
          {open.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              onAction={(action, row) => {
                setActionError(null);
                setActive({ action, request: row });
              }}
              onExport={(row) => {
                runExport(row).catch(() => undefined);
              }}
            />
          ))}
        </ul>
      </Card>

      <Card className="p-6">
        <SectionHeader
          icon="block"
          iconBg="bg-amber-100 dark:bg-amber-900/30"
          iconFg="text-amber-700 dark:text-amber-400"
          title="Processing restrictions"
          headingLevel={2}
          description="While a restriction is in force, the person is not scored, embedded or drafted for by AI. Lifting one emails the person first."
        />
        {restrictions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No restrictions in force.</p>
        ) : (
          <ul className="divide-y divide-border">
            {restrictions.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{row.subjectEmail}</p>
                  <p className="text-xs text-muted-foreground">
                    {`Since ${dateLabel(row.since)}${row.blocksMarketing ? ' · Do not send marketing' : ''}`}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Lift the restriction for ${row.subjectEmail}`}
                  onClick={() => {
                    setLiftNote('');
                    setLiftError(null);
                    setLifting({ id: row.id, email: row.subjectEmail });
                  }}
                >
                  Lift
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {closed.length > 0 && (
        <Card className="p-6">
          <SectionHeader
            icon="task_alt"
            iconBg="bg-muted"
            iconFg="text-muted-foreground"
            title="Closed requests"
            headingLevel={2}
            description="Completed and refused requests, kept as the record of each answer."
          />
          <ul className="divide-y divide-border">
            {closed.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                onAction={(action, row) => {
                  setActionError(null);
                  setActive({ action, request: row });
                }}
                onExport={() => undefined}
              />
            ))}
          </ul>
        </Card>
      )}

      <RequestActionDialog
        action={active?.action ?? null}
        request={active?.request ?? null}
        erasurePreview={preview.data ?? null}
        pending={pending}
        error={actionError}
        onSubmit={(input) => {
          runAction(input).catch(() => setActionError('Please try again.'));
        }}
        onClose={() => setActive(null)}
      />

      <LogRequestDialog
        open={logOpen}
        pending={logRequest.isPending}
        error={logError}
        onClose={() => setLogOpen(false)}
        onSubmit={(input) => {
          setLogError(null);
          logRequest
            .mutateAsync(input)
            .then(() => {
              toast({ title: 'Request logged' });
              setLogOpen(false);
            })
            .catch((error: unknown) => setLogError(errorMessage(error)));
        }}
      />

      <Dialog open={lifting !== null} onOpenChange={(next) => (next ? null : setLifting(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lift restriction</DialogTitle>
            <DialogDescription>
              {`${lifting?.email ?? ''} is emailed before the restriction is lifted.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="lift-note">Reason</Label>
            <Textarea
              id="lift-note"
              rows={3}
              maxLength={500}
              value={liftNote}
              onChange={(e) => setLiftNote(e.target.value)}
            />
          </div>
          {liftError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {liftError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLifting(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={liftRestriction.isPending}
              onClick={() => {
                if (!lifting) return;
                if (liftNote.trim().length < 10) {
                  setLiftError('Give a reason of at least 10 characters.');
                  return;
                }
                liftRestriction
                  .mutateAsync({ restrictionId: lifting.id, note: liftNote.trim() })
                  .then(() => {
                    toast({ title: 'Restriction lifted and the person told' });
                    setLifting(null);
                  })
                  .catch((error: unknown) => setLiftError(errorMessage(error)));
              }}
            >
              Lift restriction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
