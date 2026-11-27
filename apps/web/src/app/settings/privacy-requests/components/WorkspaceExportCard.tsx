'use client';

/**
 * "Export all workspace data" (agreement clause 5: a leaving customer gets a standalone copy of
 * their data within 14 days). Administrators only: the server refuses everyone else.
 *
 * One click queues the export; the page shows its progress, and the owner is emailed a private
 * link valid for 14 days. A fresh link for a finished export can be issued here until it expires.
 * The server owns the rules (one export a day, one at a time); this card shows its answer.
 */
import { useState } from 'react';
import { Badge, Button, Card, toast } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { SectionHeader } from '@/components/shared/section-header';

type ExportStatus = 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED';

const STATUS_LABELS: Record<ExportStatus, string> = {
  QUEUED: 'Queued',
  RUNNING: 'Building',
  READY: 'Ready',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
};

const TRIGGER_LABELS: Record<string, string> = {
  ADMIN: 'Requested by an administrator',
  SUBSCRIPTION_ENDED: 'Subscription ended',
};

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** " in 3 parts" for a split export, nothing for a single ZIP. */
function partsLabel(count: number | undefined): string {
  return count && count > 1 ? ' in ' + count + ' parts' : '';
}

function dateLabel(value: Date | string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

/** The server's rule: one administrator export per rolling 24 hours (a failed one does not count). */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** When the next export may start, or null when one may start now. */
export function nextExportAt(
  rows: ReadonlyArray<{ trigger: string; status: string; requestedAt: Date | string }>,
  now: number = Date.now()
): Date | null {
  const latest = rows
    .filter((r) => r.trigger === 'ADMIN' && r.status !== 'FAILED')
    .reduce((max, r) => Math.max(max, new Date(r.requestedAt).getTime()), 0);
  return latest > 0 && latest + COOLDOWN_MS > now ? new Date(latest + COOLDOWN_MS) : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Please try again.';
}

export function WorkspaceExportCard({ enabled = true }: Readonly<{ enabled?: boolean }>) {
  const utils = trpc.useUtils();
  const list = trpc.workspaceExport.list.useQuery(undefined, {
    enabled,
    retry: false,
    // Follow a running export without a reload.
    refetchInterval: (query) => {
      const rows = query.state.data;
      return rows?.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING') ? 15_000 : false;
    },
  });
  const request = trpc.workspaceExport.request.useMutation({
    onSuccess: () => utils.workspaceExport.invalidate(),
  });
  const link = trpc.workspaceExport.downloadLink.useMutation();
  // The links of an export with several parts, shown under its row (one signed link per part).
  const [partLinks, setPartLinks] = useState<
    Record<string, Array<{ part: number; of: number; url: string }>>
  >({});

  const rows = list.data ?? [];
  const busy = rows.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING');
  const nextAt = nextExportAt(rows);

  const start = async () => {
    try {
      await request.mutateAsync();
      toast({
        title: 'Export started',
        description: 'We will email a private download link when it is ready.',
      });
    } catch (error) {
      toast({
        title: 'Export not started',
        description: errorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const download = async (requestId: string) => {
    try {
      const { url, links } = await link.mutateAsync({ requestId });
      if (links && links.length > 1) {
        setPartLinks((prev) => ({ ...prev, [requestId]: links }));
        return;
      }
      window.location.assign(url);
    } catch (error) {
      toast({ title: 'No link', description: errorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <Card className="p-6" data-testid="workspace-export-card">
      <SectionHeader
        icon="download"
        iconBg="bg-emerald-100 dark:bg-emerald-900/30"
        iconFg="text-emerald-600 dark:text-emerald-400"
        title="Export all workspace data"
        titleId="workspace-export-title"
        headingLevel={2}
        description="A ZIP with one CSV and one JSON file for every kind of record, your stored files, a README and a manifest with checksums. Mail in personal mailboxes and drafts stays private and is not included. The owner is emailed a private link valid for 14 days. One export a day."
      />
      <div className="mt-4">
        <Button onClick={start} disabled={request.isPending || busy || nextAt !== null}>
          {busy ? 'Export in progress' : 'Export all workspace data'}
        </Button>
        {nextAt && !busy && (
          <p className="mt-2 text-sm text-muted-foreground">
            Next export available {dateLabel(nextAt)} UTC
          </p>
        )}
      </div>

      {list.isLoading && (
        <output className="mt-4 block text-sm text-muted-foreground">Loading</output>
      )}
      {list.isError && (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
          The exports could not be loaded.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="mt-4 divide-y divide-border" aria-label="Recent exports">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-foreground">
                  {dateLabel(r.requestedAt)} · {TRIGGER_LABELS[r.trigger] ?? r.trigger}
                </p>
                <p className="text-muted-foreground">
                  {r.status === 'READY' &&
                    `${formatBytes(r.archiveBytes)}${partsLabel(r.partCount)} · ${r.fileCount ?? 0} stored files · link valid until ${dateLabel(r.expiresAt)}`}
                  {r.status === 'FAILED' && 'The export failed. Request it again.'}
                  {r.status === 'EXPIRED' &&
                    `Expired ${dateLabel(r.expiresAt)}. Request a new one.`}
                  {(r.status === 'QUEUED' || r.status === 'RUNNING') &&
                    'The link is emailed when it is ready.'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={r.status === 'READY' ? 'default' : 'secondary'}>
                  {STATUS_LABELS[r.status as ExportStatus] ?? r.status}
                </Badge>
                {r.status === 'READY' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => download(r.id)}
                    disabled={link.isPending}
                  >
                    Get a new link
                  </Button>
                )}
              </div>
              {partLinks[r.id] && (
                <ul className="basis-full space-y-1 text-sm" aria-label="Download links">
                  {partLinks[r.id]!.map((l) => (
                    <li key={l.part}>
                      <a className="underline" href={l.url}>
                        Part {l.part} of {l.of}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
