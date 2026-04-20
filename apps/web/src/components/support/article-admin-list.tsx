'use client';

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ConfirmationDialog,
  DataTable,
  EmptyState,
  Pagination,
  Skeleton,
  toast,
} from '@intelliflow/ui';
import { PageHeader, SearchFilterBar } from '@/components/shared';
import { api } from '@/lib/api';
import {
  createArticleColumns,
  type ArticleRow,
  type ArticleStatus,
  type Role,
} from './article-admin-columns';

const DEFAULT_LIMIT = 20;
const SKELETON_KEYS = ['sk-0', 'sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5'] as const;

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function ForbiddenSurface() {
  return (
    <div className="w-full space-y-4 p-6" data-testid="forbidden-surface">
      <PageHeader title="Help articles" description="Manage the in-app knowledge base." />
      <EmptyState
        entity="notes"
        title="Admin access required"
        description="You need Admin or Manager access to manage help articles."
      />
    </div>
  );
}

export interface ArticleAdminListProps {
  initialData?: unknown;
  role: Role;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Draft' },
];

export function ArticleAdminList({ initialData, role }: Readonly<ArticleAdminListProps>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = api.useUtils();

  const initialSearch = searchParams.get('search') ?? '';
  const initialStatus = searchParams.get('status') ?? '';
  const initialCategory = searchParams.get('categoryId') ?? '';
  const initialPage = Number(searchParams.get('page') ?? '1') || 1;

  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [categoryFilter, setCategoryFilter] = useState<string>(initialCategory);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, categoryFilter]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    if (categoryFilter) params.set('categoryId', categoryFilter);
    if (currentPage > 1) params.set('page', String(currentPage));
    const qs = params.toString();
    const currentQs =
      typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';
    if (qs === currentQs) return; // no-op when URL already matches derived state
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }, [debouncedSearch, statusFilter, categoryFilter, currentPage, router]);

  const queryInput = useMemo(
    () => ({
      page: currentPage,
      limit: DEFAULT_LIMIT,
      status: (statusFilter as ArticleStatus) || undefined,
      categoryId: categoryFilter || undefined,
      search: debouncedSearch || undefined,
      orderBy: 'order' as const,
      orderDir: 'asc' as const,
    }),
    [currentPage, statusFilter, categoryFilter, debouncedSearch]
  );

  const noFiltersApplied =
    !statusFilter && !categoryFilter && !debouncedSearch && currentPage === 1;
  const shouldUseInitialData = initialData != null && noFiltersApplied;

  const listQuery = api.helpArticle.list.useQuery(queryInput, {
    ...(shouldUseInitialData
      ? {
          initialData: initialData as Parameters<typeof api.helpArticle.list.useQuery>[1] extends {
            initialData?: infer T;
          }
            ? T
            : never,
        }
      : {}),
    placeholderData: (prev) => prev,
  });

  const items: ArticleRow[] = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_LIMIT));
  const hasFilters = Boolean(debouncedSearch || statusFilter || categoryFilter);

  const categoryOptions = useMemo(() => {
    const distinct = Array.from(new Set(items.map((item) => item.categoryId))).sort();
    return [
      { value: '', label: 'All categories' },
      ...distinct.map((id) => ({ value: id, label: id })),
    ];
  }, [items]);

  const publishMutation = api.helpArticle.publish.useMutation({
    onSuccess: () => {
      utils.helpArticle.list.invalidate();
      toast({ title: 'Article published' });
    },
    onError: (err) => {
      toast({
        title: 'Publish failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const unpublishMutation = api.helpArticle.unpublish.useMutation({
    onSuccess: () => {
      utils.helpArticle.list.invalidate();
      toast({ title: 'Article unpublished' });
    },
    onError: (err) => {
      toast({
        title: 'Unpublish failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = api.helpArticle.delete.useMutation({
    onSuccess: () => {
      utils.helpArticle.list.invalidate();
      toast({ title: 'Article deleted' });
    },
    onError: (err) => {
      toast({
        title: 'Delete failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handlers = useMemo(
    () => ({
      onPublish: (id: string) => publishMutation.mutate({ id }),
      onUnpublish: (id: string) => unpublishMutation.mutate({ id }),
      onDelete: (id: string) => setConfirmDeleteId(id),
    }),
    [publishMutation, unpublishMutation]
  );

  const columns = useMemo(() => createArticleColumns({ role, handlers }), [role, handlers]);

  const resetFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('');
    setCategoryFilter('');
    setCurrentPage(1);
  }, []);

  const handleSearchKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      setSearch('');
    }
  }, []);

  const confirmDelete = useCallback(async () => {
    if (confirmDeleteId) {
      await deleteMutation.mutateAsync({ id: confirmDeleteId });
      setConfirmDeleteId(null);
    }
  }, [confirmDeleteId, deleteMutation]);

  const pageActions = useMemo(
    () => [
      {
        label: 'New article',
        icon: 'add',
        variant: 'primary' as const,
        onClick: () => router.push('/settings/help-center/articles/new'),
      },
    ],
    [router]
  );

  return (
    <div className="w-full space-y-4 p-6" data-testid="help-article-admin-list">
      <PageHeader
        breadcrumbs={[
          { label: 'Settings', href: '/settings' },
          { label: 'Help center' },
          { label: 'Articles' },
        ]}
        title="Help articles"
        description="Manage tenant knowledge base articles. Drafts are only visible to Admin and Manager roles."
        actions={pageActions}
      />

      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- event delegation: keyboard shortcut bubbles from search input inside SearchFilterBar */}
      <div onKeyDown={handleSearchKeyDown}>
        <SearchFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search title or excerpt…"
          searchAriaLabel="Search help articles"
          filters={[
            {
              id: 'status',
              label: 'Status',
              options: STATUS_OPTIONS,
              value: statusFilter,
              onChange: setStatusFilter,
            },
            {
              id: 'category',
              label: 'Category',
              options: categoryOptions,
              value: categoryFilter,
              onChange: setCategoryFilter,
            },
          ]}
        />
      </div>

      <p className="sr-only" aria-live="polite" data-testid="result-count">
        {listQuery.isFetching ? 'Loading articles…' : `${total} articles`}
      </p>

      {(() => {
        if (listQuery.isLoading && !listQuery.data) {
          return (
            <div className="space-y-3" data-testid="loading-skeleton">
              {SKELETON_KEYS.map((key) => (
                <Skeleton key={key} className="h-14 w-full" />
              ))}
            </div>
          );
        }
        if (items.length === 0) {
          return hasFilters ? (
            <EmptyState
              entity="notes"
              variant="empty"
              title="No matching articles"
              description="Try adjusting your search or filters."
              action={{
                label: 'Reset filters',
                onClick: resetFilters,
              }}
              data-testid="empty-filtered"
            />
          ) : (
            <EmptyState
              entity="notes"
              variant="empty"
              title="No help articles yet"
              description="Create your first article to start building the knowledge base."
              action={{
                label: 'New article',
                onClick: () => router.push('/settings/help-center/articles/new'),
              }}
              data-testid="empty-initial"
            />
          );
        }
        return (
          <>
            <DataTable<ArticleRow, unknown>
              columns={columns}
              data={items}
              hidePagination
              pageSize={DEFAULT_LIMIT}
            />
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={total}
              pageSize={DEFAULT_LIMIT}
              onPageChange={setCurrentPage}
              showSummary
              showNavLabels
              hideWhenSinglePage
            />
          </>
        );
      })()}

      <ConfirmationDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
        title="Delete article?"
        description="This action cannot be undone. The article, its sections, and feedback will be permanently removed."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
        icon="delete"
      />
    </div>
  );
}
