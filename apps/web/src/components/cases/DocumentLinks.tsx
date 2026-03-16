'use client';

/**
 * DocumentLinks Component (PG-138)
 *
 * Shows case-attached documents with type icons, status badges, and version info.
 * Fetches documents via tRPC `api.documents.list` filtered by caseId.
 */

import { Skeleton, cn } from '@intelliflow/ui';
import { api } from '@/lib/api';

interface DocumentLinksProps {
  caseId: string;
}

const DOC_TYPE_ICONS: Record<string, string> = {
  CONTRACT: 'description',
  AGREEMENT: 'handshake',
  EVIDENCE: 'library_books',
  FILING: 'gavel',
  CORRESPONDENCE: 'mail',
  REPORT: 'analytics',
  MOTION: 'article',
  BRIEF: 'menu_book',
  AFFIDAVIT: 'verified',
  OTHER: 'draft',
};

const DOC_TYPE_COLORS: Record<string, string> = {
  CONTRACT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  AGREEMENT: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  EVIDENCE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  FILING: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  CORRESPONDENCE: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  REPORT: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-muted text-muted-foreground' },
  UNDER_REVIEW: {
    label: 'In Review',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  APPROVED: {
    label: 'Approved',
    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  },
  SIGNED: {
    label: 'Signed',
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  ARCHIVED: { label: 'Archived', cls: 'bg-muted text-muted-foreground' },
  SUPERSEDED: { label: 'Superseded', cls: 'bg-muted text-muted-foreground line-through' },
};

function formatFileSize(bytes: number | bigint): string {
  const b = Number(bytes);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date | string, timezone: string = 'UTC'): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: timezone,
  });
}

export function DocumentLinks({ caseId }: Readonly<DocumentLinksProps>) {
  const { data, isLoading } = api.documents.list.useQuery({ caseId, limit: 20 } as never, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 p-3 rounded-lg border border-border">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  const documents = (data as Record<string, unknown>)?.documents as
    | Array<Record<string, unknown>>
    | undefined;

  if (!documents || documents.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        <span className="material-symbols-outlined text-3xl mb-2 block">description</span>
        <p>No documents attached to this case yet.</p>
        <p className="text-xs mt-1">Upload or link documents from the Documents page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => {
        const docType = (doc.document_type as string) || (doc.documentType as string) || 'OTHER';
        const status = (doc.status as string) || 'DRAFT';
        const icon = DOC_TYPE_ICONS[docType] || DOC_TYPE_ICONS.OTHER;
        const typeColor = DOC_TYPE_COLORS[docType] || 'bg-muted text-muted-foreground';
        const statusBadge = STATUS_BADGE[status] || STATUS_BADGE.DRAFT;
        const vMajor = (doc.version_major as number) ?? (doc.versionMajor as number) ?? 1;
        const vMinor = (doc.version_minor as number) ?? (doc.versionMinor as number) ?? 0;

        return (
          <div
            key={doc.id as string}
            className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer group"
          >
            <div
              className={cn(
                'size-10 rounded-lg flex items-center justify-center shrink-0',
                typeColor
              )}
            >
              <span className="material-symbols-outlined text-lg">{icon}</span>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                {doc.title as string}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span>
                  v{vMajor}.{vMinor}
                </span>
                <span>·</span>
                <span>
                  {formatFileSize((doc.size_bytes as number) ?? (doc.sizeBytes as number) ?? 0)}
                </span>
                <span>·</span>
                <span>
                  {formatDate(
                    (doc.created_at as string) ?? (doc.createdAt as string) ?? new Date()
                  )}
                </span>
              </div>
            </div>

            <span
              className={cn(
                'inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0',
                statusBadge.cls
              )}
            >
              {statusBadge.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
