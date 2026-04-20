'use client';

import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { StatusBadge } from '@intelliflow/ui';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@intelliflow/api-client';

export type Role = 'USER' | 'MANAGER' | 'ADMIN';
export type ArticleStatus = 'DRAFT' | 'PUBLISHED';

/**
 * Row type derived from the tRPC response so it stays in lock-step with the
 * router's Prisma `select` shape. `Date` fields are serialised to ISO strings
 * over the wire; see `formatRelative` below — it accepts both string and Date.
 */
type HelpArticleListItem = inferRouterOutputs<AppRouter>['helpArticle']['list']['items'][number];
export type ArticleRow = HelpArticleListItem;

export interface ArticleRowHandlers {
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatRelative(value: string | Date | null | undefined): string {
  if (value == null) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (absSec < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour');
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day');
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, 'month');
  const diffYear = Math.round(diffMonth / 12);
  return rtf.format(diffYear, 'year');
}

export function createArticleColumns({
  role,
  handlers,
}: Readonly<{
  role: Role;
  handlers: ArticleRowHandlers;
}>): ColumnDef<ArticleRow>[] {
  return [
    {
      accessorKey: 'title',
      header: 'Title',
      size: 280,
      cell: ({ row }) => {
        const article = row.original;
        return (
          <div className="flex flex-col min-w-0">
            <Link
              href={`/help-center/${article.slug}`}
              target="_blank"
              className="text-sm font-semibold text-foreground hover:text-primary truncate"
              data-testid={`article-title-${article.id}`}
            >
              {article.title}
            </Link>
            <span className="text-xs text-muted-foreground truncate">{article.excerpt}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'slug',
      header: 'Slug',
      size: 180,
      cell: ({ row }) => <code className="text-xs text-muted-foreground">{row.original.slug}</code>,
    },
    {
      accessorKey: 'categoryId',
      header: 'Category',
      size: 140,
      cell: ({ row }) => <span className="text-sm text-foreground">{row.original.categoryId}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 110,
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <StatusBadge
            status={status}
            label={status === 'PUBLISHED' ? 'Published' : 'Draft'}
            variant={status === 'PUBLISHED' ? 'success' : 'warning'}
            showIcon={false}
          />
        );
      },
    },
    {
      accessorKey: 'readTimeMinutes',
      header: 'Read time',
      size: 100,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.readTimeMinutes} min</span>
      ),
    },
    {
      accessorKey: 'feedbackCount',
      header: 'Feedback',
      size: 100,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.feedbackCount}</span>
      ),
    },
    {
      accessorKey: 'updatedAt',
      header: 'Updated',
      size: 130,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatRelative(row.original.updatedAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      size: 200,
      cell: ({ row }) => {
        const article = row.original;
        return (
          <div className="flex items-center gap-1" data-testid={`article-actions-${article.id}`}>
            <Link
              href={`/settings/help-center/articles/${article.id}/edit`}
              className="p-1 rounded hover:bg-muted"
              title="Edit article"
              aria-label={`Edit ${article.title}`}
            >
              <span className="material-symbols-outlined text-base text-muted-foreground">
                edit
              </span>
            </Link>
            {article.status === 'DRAFT' ? (
              <button
                type="button"
                className="p-1 rounded hover:bg-muted"
                onClick={() => handlers.onPublish(article.id)}
                title="Publish article"
                aria-label={`Publish ${article.title}`}
                data-testid={`publish-${article.id}`}
              >
                <span className="material-symbols-outlined text-base text-muted-foreground">
                  upload
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="p-1 rounded hover:bg-muted"
                onClick={() => handlers.onUnpublish(article.id)}
                title="Unpublish article"
                aria-label={`Unpublish ${article.title}`}
                data-testid={`unpublish-${article.id}`}
              >
                <span className="material-symbols-outlined text-base text-muted-foreground">
                  visibility_off
                </span>
              </button>
            )}
            {role === 'ADMIN' ? (
              <button
                type="button"
                className="p-1 rounded hover:bg-destructive/10"
                onClick={() => handlers.onDelete(article.id)}
                title="Delete article"
                aria-label={`Delete ${article.title}`}
                data-testid={`delete-${article.id}`}
              >
                <span className="material-symbols-outlined text-base text-muted-foreground hover:text-destructive">
                  delete
                </span>
              </button>
            ) : null}
          </div>
        );
      },
    },
  ];
}
