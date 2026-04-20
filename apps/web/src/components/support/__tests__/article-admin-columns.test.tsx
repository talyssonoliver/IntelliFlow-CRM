/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@intelliflow/ui', () => ({
  StatusBadge: ({
    status,
    label,
    variant,
  }: Readonly<{ status: string; label?: string; variant?: string }>) => (
    <span data-testid={`status-${status}`} data-variant={variant}>
      {label ?? status}
    </span>
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: Readonly<{ href: string; children: React.ReactNode; [k: string]: unknown }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function loadFactory() {
  return import('../article-admin-columns');
}

function baseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'row-1',
    slug: 'intro-guide',
    title: 'Intro Guide',
    categoryId: 'onboarding',
    excerpt: 'A short intro',
    readTimeMinutes: 4,
    order: 1,
    status: 'PUBLISHED' as const,
    publishedAt: '2026-04-01T00:00:00Z',
    keywords: ['intro'],
    relatedArticleIds: [],
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
    feedbackCount: 7,
    ...overrides,
  };
}

describe('createArticleColumns — cell renderers', () => {
  it('defines exactly 8 columns (title, slug, category, status, readTime, feedback, updated, actions)', async () => {
    const { createArticleColumns } = await loadFactory();
    const cols = createArticleColumns({
      role: 'ADMIN',
      handlers: { onPublish: vi.fn(), onUnpublish: vi.fn(), onDelete: vi.fn() },
    });
    expect(cols).toHaveLength(8);
    const ids = cols.map(
      (c) => (c as { accessorKey?: string; id?: string }).accessorKey ?? (c as { id?: string }).id
    );
    expect(ids).toEqual([
      'title',
      'slug',
      'categoryId',
      'status',
      'readTimeMinutes',
      'feedbackCount',
      'updatedAt',
      'actions',
    ]);
  });

  it('title cell renders a link to /help-center/<slug> in a new tab', async () => {
    const { createArticleColumns } = await loadFactory();
    const cols = createArticleColumns({
      role: 'ADMIN',
      handlers: { onPublish: vi.fn(), onUnpublish: vi.fn(), onDelete: vi.fn() },
    });
    const titleCol = cols[0] as unknown as {
      cell: (ctx: { row: { original: ReturnType<typeof baseRow> } }) => React.ReactElement;
    };
    const { container } = render(titleCol.cell({ row: { original: baseRow() } }));
    const anchor = container.querySelector('a[href="/help-center/intro-guide"]');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('target')).toBe('_blank');
    expect(container.textContent).toContain('Intro Guide');
  });

  it('status cell renders Published for PUBLISHED and Draft for DRAFT with correct variants', async () => {
    const { createArticleColumns } = await loadFactory();
    const cols = createArticleColumns({
      role: 'ADMIN',
      handlers: { onPublish: vi.fn(), onUnpublish: vi.fn(), onDelete: vi.fn() },
    });
    const statusCol = cols[3] as unknown as {
      cell: (ctx: { row: { original: ReturnType<typeof baseRow> } }) => React.ReactElement;
    };
    const { container: pub } = render(
      statusCol.cell({ row: { original: baseRow({ status: 'PUBLISHED' }) } })
    );
    const { container: dra } = render(
      statusCol.cell({ row: { original: baseRow({ status: 'DRAFT' }) } })
    );
    expect(pub.textContent).toContain('Published');
    expect(dra.textContent).toContain('Draft');
    expect(pub.querySelector('[data-variant="success"]')).not.toBeNull();
    expect(dra.querySelector('[data-variant="warning"]')).not.toBeNull();
  });

  it('readTime cell formats as "N min"', async () => {
    const { createArticleColumns } = await loadFactory();
    const cols = createArticleColumns({
      role: 'ADMIN',
      handlers: { onPublish: vi.fn(), onUnpublish: vi.fn(), onDelete: vi.fn() },
    });
    const col = cols[4] as unknown as {
      cell: (ctx: { row: { original: ReturnType<typeof baseRow> } }) => React.ReactElement;
    };
    const { container } = render(col.cell({ row: { original: baseRow({ readTimeMinutes: 12 }) } }));
    expect(container.textContent).toContain('12 min');
  });

  it('feedback cell shows feedbackCount', async () => {
    const { createArticleColumns } = await loadFactory();
    const cols = createArticleColumns({
      role: 'ADMIN',
      handlers: { onPublish: vi.fn(), onUnpublish: vi.fn(), onDelete: vi.fn() },
    });
    const col = cols[5] as unknown as {
      cell: (ctx: { row: { original: ReturnType<typeof baseRow> } }) => React.ReactElement;
    };
    const { container } = render(col.cell({ row: { original: baseRow({ feedbackCount: 42 }) } }));
    expect(container.textContent).toContain('42');
  });

  it('updated cell uses relative formatting for recent, daily, monthly, yearly, and invalid dates', async () => {
    const { createArticleColumns } = await loadFactory();
    const cols = createArticleColumns({
      role: 'ADMIN',
      handlers: { onPublish: vi.fn(), onUnpublish: vi.fn(), onDelete: vi.fn() },
    });
    const col = cols[6] as unknown as {
      cell: (ctx: { row: { original: ReturnType<typeof baseRow> } }) => React.ReactElement;
    };

    const recent = render(
      col.cell({
        row: { original: baseRow({ updatedAt: new Date(Date.now() - 10_000).toISOString() }) },
      })
    );
    expect(recent.container.textContent).toBeTruthy();

    const hoursAgo = render(
      col.cell({
        row: {
          original: baseRow({ updatedAt: new Date(Date.now() - 3 * 3600_000).toISOString() }),
        },
      })
    );
    expect(hoursAgo.container.textContent).toBeTruthy();

    const daysAgo = render(
      col.cell({
        row: {
          original: baseRow({ updatedAt: new Date(Date.now() - 5 * 86400_000).toISOString() }),
        },
      })
    );
    expect(daysAgo.container.textContent).toBeTruthy();

    const monthsAgo = render(
      col.cell({
        row: {
          original: baseRow({ updatedAt: new Date(Date.now() - 90 * 86400_000).toISOString() }),
        },
      })
    );
    expect(monthsAgo.container.textContent).toBeTruthy();

    const yearsAgo = render(
      col.cell({
        row: {
          original: baseRow({ updatedAt: new Date(Date.now() - 400 * 86400_000).toISOString() }),
        },
      })
    );
    expect(yearsAgo.container.textContent).toBeTruthy();

    const minutesAgo = render(
      col.cell({
        row: { original: baseRow({ updatedAt: new Date(Date.now() - 5 * 60_000).toISOString() }) },
      })
    );
    expect(minutesAgo.container.textContent).toBeTruthy();

    const invalid = render(col.cell({ row: { original: baseRow({ updatedAt: 'not-a-date' }) } }));
    expect(invalid.container.textContent).toContain('—');
  });

  it('actions cell renders Edit link + Publish for DRAFT + Delete for ADMIN; Publish absent for PUBLISHED', async () => {
    const { createArticleColumns } = await loadFactory();
    const cols = createArticleColumns({
      role: 'ADMIN',
      handlers: { onPublish: vi.fn(), onUnpublish: vi.fn(), onDelete: vi.fn() },
    });
    const col = cols[7] as unknown as {
      cell: (ctx: { row: { original: ReturnType<typeof baseRow> } }) => React.ReactElement;
    };

    const draft = render(col.cell({ row: { original: baseRow({ id: 'd1', status: 'DRAFT' }) } }));
    expect(draft.queryByTestId('publish-d1')).not.toBeNull();
    expect(draft.queryByTestId('unpublish-d1')).toBeNull();
    expect(draft.queryByTestId('delete-d1')).not.toBeNull();

    const pub = render(col.cell({ row: { original: baseRow({ id: 'p1', status: 'PUBLISHED' }) } }));
    expect(pub.queryByTestId('publish-p1')).toBeNull();
    expect(pub.queryByTestId('unpublish-p1')).not.toBeNull();
    expect(pub.queryByTestId('delete-p1')).not.toBeNull();
  });

  it('actions cell hides Delete for MANAGER role on both DRAFT and PUBLISHED', async () => {
    const { createArticleColumns } = await loadFactory();
    const cols = createArticleColumns({
      role: 'MANAGER',
      handlers: { onPublish: vi.fn(), onUnpublish: vi.fn(), onDelete: vi.fn() },
    });
    const col = cols[7] as unknown as {
      cell: (ctx: { row: { original: ReturnType<typeof baseRow> } }) => React.ReactElement;
    };
    const draft = render(col.cell({ row: { original: baseRow({ id: 'm-d', status: 'DRAFT' }) } }));
    expect(draft.queryByTestId('delete-m-d')).toBeNull();
    expect(draft.queryByTestId('publish-m-d')).not.toBeNull();
    const pub = render(
      col.cell({ row: { original: baseRow({ id: 'm-p', status: 'PUBLISHED' }) } })
    );
    expect(pub.queryByTestId('delete-m-p')).toBeNull();
    expect(pub.queryByTestId('unpublish-m-p')).not.toBeNull();
  });

  it('publish / unpublish / delete handlers fire with the article id when the action button is clicked', async () => {
    const onPublish = vi.fn();
    const onUnpublish = vi.fn();
    const onDelete = vi.fn();
    const { createArticleColumns } = await loadFactory();
    const cols = createArticleColumns({
      role: 'ADMIN',
      handlers: { onPublish, onUnpublish, onDelete },
    });
    const col = cols[7] as unknown as {
      cell: (ctx: { row: { original: ReturnType<typeof baseRow> } }) => React.ReactElement;
    };

    const draft = render(col.cell({ row: { original: baseRow({ id: 'd', status: 'DRAFT' }) } }));
    (draft.getByTestId('publish-d') as HTMLButtonElement).click();
    (draft.getByTestId('delete-d') as HTMLButtonElement).click();

    const pub = render(col.cell({ row: { original: baseRow({ id: 'p', status: 'PUBLISHED' }) } }));
    (pub.getByTestId('unpublish-p') as HTMLButtonElement).click();

    expect(onPublish).toHaveBeenCalledWith('d');
    expect(onUnpublish).toHaveBeenCalledWith('p');
    expect(onDelete).toHaveBeenCalledWith('d');
  });

  it('slug cell and categoryId cell render the raw value', async () => {
    const { createArticleColumns } = await loadFactory();
    const cols = createArticleColumns({
      role: 'ADMIN',
      handlers: { onPublish: vi.fn(), onUnpublish: vi.fn(), onDelete: vi.fn() },
    });
    const slugCol = cols[1] as unknown as {
      cell: (ctx: { row: { original: ReturnType<typeof baseRow> } }) => React.ReactElement;
    };
    const catCol = cols[2] as unknown as {
      cell: (ctx: { row: { original: ReturnType<typeof baseRow> } }) => React.ReactElement;
    };
    const slug = render(slugCol.cell({ row: { original: baseRow({ slug: 'my-slug-123' }) } }));
    const cat = render(
      catCol.cell({ row: { original: baseRow({ categoryId: 'customer-success' }) } })
    );
    expect(slug.container.textContent).toContain('my-slug-123');
    expect(cat.container.textContent).toContain('customer-success');
  });
});
