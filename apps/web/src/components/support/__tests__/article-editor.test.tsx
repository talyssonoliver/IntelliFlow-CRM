/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ArticleEditor } from '../article-editor';

// ── Router ────────────────────────────────────────────────────────
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// ── Shared component stubs ────────────────────────────────────────
vi.mock('@/components/shared', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('../article-admin-list', () => ({
  ForbiddenSurface: () => <div data-testid="forbidden-surface">Forbidden</div>,
}));

vi.mock('@intelliflow/ui', () => ({
  Button: ({ children, variant: _variant, size: _size, asChild: _asChild, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: any) => <div>{children}</div>,
  Input: (props: any) => <input {...props} />,
  Textarea: (props: any) => <textarea {...props} />,
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
  Skeleton: (props: any) => <div {...props} />,
  toast: (...args: any[]) => toastMock(...args),
  RichTextEditor: ({ value, onChange, editable, ariaLabel }: any) => (
    <div
      data-testid="rte"
      data-editable={String(editable !== false)}
      data-hascontent={String(!!value)}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        data-testid="rte-fill"
        onClick={() =>
          onChange?.({
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'How to' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Some body text content.' }] },
            ],
          })
        }
      >
        fill
      </button>
    </div>
  ),
}));

// ── tRPC api mock ─────────────────────────────────────────────────
let profileData: any = { role: 'ADMIN' };
let profileLoading = false;
let articleData: any;
let articleLoading = false;
let articleError: any = null;

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const publishMutateAsync = vi.fn();
const unpublishMutateAsync = vi.fn();
const invalidateList = vi.fn();
const invalidateById = vi.fn();
const toastMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      helpArticle: {
        list: { invalidate: invalidateList },
        getById: { invalidate: invalidateById },
      },
    }),
    user: { getProfile: { useQuery: () => ({ data: profileData, isLoading: profileLoading }) } },
    helpArticle: {
      getById: {
        useQuery: () => ({ data: articleData, isLoading: articleLoading, error: articleError }),
      },
      create: { useMutation: () => ({ mutateAsync: createMutateAsync, isPending: false }) },
      update: { useMutation: () => ({ mutateAsync: updateMutateAsync, isPending: false }) },
      publish: { useMutation: () => ({ mutateAsync: publishMutateAsync, isPending: false }) },
      unpublish: { useMutation: () => ({ mutateAsync: unpublishMutateAsync, isPending: false }) },
    },
  },
}));

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'How To Guide' } });
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'getting-started' } });
  fireEvent.change(screen.getByLabelText('Excerpt'), { target: { value: 'A short excerpt.' } });
  fireEvent.click(screen.getByTestId('rte-fill'));
}

beforeEach(() => {
  profileData = { role: 'ADMIN' };
  profileLoading = false;
  articleData = undefined;
  articleLoading = false;
  articleError = null;
  vi.clearAllMocks();
  createMutateAsync.mockResolvedValue({ id: 'new-1' });
  updateMutateAsync.mockResolvedValue({ id: 'art-42' });
  publishMutateAsync.mockResolvedValue({ id: 'new-1', status: 'PUBLISHED' });
  unpublishMutateAsync.mockResolvedValue({ id: 'art-42', status: 'DRAFT' });
});

describe('ArticleEditor — guards', () => {
  it('shows a skeleton while the profile is loading', () => {
    profileLoading = true;
    render(<ArticleEditor mode="create" />);
    expect(screen.getByTestId('article-editor-loading')).toBeTruthy();
  });

  it('renders ForbiddenSurface for a non-privileged role', () => {
    profileData = { role: 'USER' };
    render(<ArticleEditor mode="create" />);
    expect(screen.getByTestId('forbidden-surface')).toBeTruthy();
  });

  it('shows a skeleton while an edit article is loading', () => {
    articleLoading = true;
    render(<ArticleEditor mode="edit" articleId="art-42" />);
    expect(screen.getByTestId('article-editor-loading')).toBeTruthy();
  });

  it('shows a not-found surface when the edit article fails to load', () => {
    articleError = new Error('NOT_FOUND');
    render(<ArticleEditor mode="edit" articleId="art-42" />);
    expect(screen.getByTestId('article-editor-not-found')).toBeTruthy();
  });

  it('shows loading (not not-found) during the transitional window with no data and no error', () => {
    // profile resolved, query enabled but not yet settled: data & error both nullish
    articleData = undefined;
    articleError = null;
    articleLoading = false;
    render(<ArticleEditor mode="edit" articleId="art-42" />);
    expect(screen.getByTestId('article-editor-loading')).toBeTruthy();
    expect(screen.queryByTestId('article-editor-not-found')).toBeNull();
  });
});

describe('ArticleEditor — create flow', () => {
  it('auto-derives the slug from the title until edited', () => {
    render(<ArticleEditor mode="create" />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Hello World' } });
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('hello-world');
    // manual edit detaches the auto-derivation
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'custom-slug' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Changed' } });
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('custom-slug');
  });

  it('blocks save with an empty body and never calls create', async () => {
    render(<ArticleEditor mode="create" />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Title' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'getting-started' } });
    fireEvent.change(screen.getByLabelText('Excerpt'), { target: { value: 'Ex.' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-draft'));
    });
    expect(screen.getByText('Add some content before saving.')).toBeTruthy();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it('creates a draft with mapped sections and navigates to the edit route', async () => {
    render(<ArticleEditor mode="create" />);
    fillRequiredFields();
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-draft'));
    });
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    const input = createMutateAsync.mock.calls[0][0];
    expect(input).toMatchObject({
      title: 'How To Guide',
      slug: 'how-to-guide',
      categoryId: 'getting-started',
      excerpt: 'A short excerpt.',
    });
    expect(input.sections).toHaveLength(1);
    expect(input.sections[0].heading).toBe('How to');
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith('/settings/help-center/articles/new-1/edit')
    );
  });

  it('publishes by creating then calling publish, then navigates to the list', async () => {
    render(<ArticleEditor mode="create" />);
    fillRequiredFields();
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish'));
    });
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(publishMutateAsync).toHaveBeenCalledWith({ id: 'new-1' }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/settings/help-center/articles'));
  });

  it('surfaces a destructive toast when create fails', async () => {
    createMutateAsync.mockRejectedValue(new Error('Slug already in use'));
    render(<ArticleEditor mode="create" />);
    fillRequiredFields();
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-draft'));
    });
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', description: 'Slug already in use' })
      )
    );
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('updates read time, order and keyword fields', () => {
    render(<ArticleEditor mode="create" />);
    fireEvent.change(screen.getByLabelText('Read time (min)'), { target: { value: '7' } });
    expect((screen.getByLabelText('Read time (min)') as HTMLInputElement).value).toBe('7');
    fireEvent.change(screen.getByLabelText('Order'), { target: { value: '3' } });
    expect((screen.getByLabelText('Order') as HTMLInputElement).value).toBe('3');
    fireEvent.change(screen.getByLabelText('Keywords'), { target: { value: 'a, b, a' } });
    expect((screen.getByLabelText('Keywords') as HTMLInputElement).value).toBe('a, b, a');
  });

  it('blocks save when the manual read time is out of range', async () => {
    render(<ArticleEditor mode="create" />);
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('Read time (min)'), { target: { value: '0' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-draft'));
    });
    expect(screen.getByText('Read time must be between 1 and 60 minutes.')).toBeTruthy();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it('de-duplicates keywords when building the create input', async () => {
    render(<ArticleEditor mode="create" />);
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('Keywords'), { target: { value: 'crm, crm, setup' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-draft'));
    });
    expect(createMutateAsync.mock.calls[0][0].keywords).toEqual(['crm', 'setup']);
  });

  it('surfaces a destructive toast when publish fails', async () => {
    publishMutateAsync.mockRejectedValue(new Error('already published'));
    render(<ArticleEditor mode="create" />);
    fillRequiredFields();
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish'));
    });
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Publish failed', variant: 'destructive' })
      )
    );
    // the draft was created; create-mode publish-failure routes to its edit page
    // so a retry updates the existing draft instead of re-creating (dup slug)
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith('/settings/help-center/articles/new-1/edit')
    );
  });

  it('cancels back to the article list', () => {
    render(<ArticleEditor mode="create" />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(routerPush).toHaveBeenCalledWith('/settings/help-center/articles');
  });

  it('toggles the body into a read-only preview', () => {
    render(<ArticleEditor mode="create" />);
    expect(screen.getByTestId('rte').getAttribute('data-editable')).toBe('true');
    fireEvent.click(screen.getByTestId('toggle-preview'));
    expect(screen.getByTestId('article-preview')).toBeTruthy();
    expect(screen.getByTestId('rte').getAttribute('data-editable')).toBe('false');
  });
});

describe('ArticleEditor — edit flow', () => {
  const loadedArticle = {
    id: 'art-42',
    slug: 'existing-slug',
    title: 'Existing Title',
    categoryId: 'leads-contacts',
    excerpt: 'Existing excerpt.',
    readTimeMinutes: 4,
    keywords: ['alpha', 'beta'],
    relatedArticleIds: [],
    order: 2,
    status: 'DRAFT' as const,
    sections: [{ heading: 'Intro', content: 'Body of intro.', blocks: null, order: 0 }],
  };

  it('seeds the form from the loaded article and updates on save', async () => {
    articleData = loadedArticle;
    render(<ArticleEditor mode="edit" articleId="art-42" />);
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Existing Title');
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('existing-slug');
    expect((screen.getByLabelText('Keywords') as HTMLInputElement).value).toBe('alpha, beta');

    await act(async () => {
      fireEvent.click(screen.getByTestId('save-draft'));
    });
    expect(updateMutateAsync).toHaveBeenCalledTimes(1);
    expect(updateMutateAsync.mock.calls[0][0]).toMatchObject({
      id: 'art-42',
      title: 'Existing Title',
    });
    // metadata-only edit must NOT rewrite sections (preserves original DB blocks)
    expect(updateMutateAsync.mock.calls[0][0].sections).toBeUndefined();
    // edit-mode save stays on the page (no redirect)
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('rewrites sections only after the body is actually edited', async () => {
    articleData = loadedArticle;
    render(<ArticleEditor mode="edit" articleId="art-42" />);
    fireEvent.click(screen.getByTestId('rte-fill')); // edit the body
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-draft'));
    });
    const input = updateMutateAsync.mock.calls[0][0];
    expect(input.sections).toBeDefined();
    expect(input.sections[0].heading).toBe('How to');
  });

  it('preserves relatedArticleIds on save (no related-articles control yet)', async () => {
    articleData = { ...loadedArticle, relatedArticleIds: ['rel-1', 'rel-2'] };
    render(<ArticleEditor mode="edit" articleId="art-42" />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-draft'));
    });
    expect(updateMutateAsync.mock.calls[0][0].relatedArticleIds).toEqual(['rel-1', 'rel-2']);
  });

  it('reseeds the form when navigating to a different article id', () => {
    articleData = loadedArticle; // id art-42
    const { rerender } = render(<ArticleEditor mode="edit" articleId="art-42" />);
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Existing Title');

    articleData = { ...loadedArticle, id: 'art-99', title: 'Second Article', slug: 'second' };
    rerender(<ArticleEditor mode="edit" articleId="art-99" />);
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Second Article');
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('second');
  });

  it('shows Unpublish for a published article and calls unpublish', async () => {
    articleData = { ...loadedArticle, status: 'PUBLISHED' as const };
    render(<ArticleEditor mode="edit" articleId="art-42" />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('unpublish'));
    });
    expect(unpublishMutateAsync).toHaveBeenCalledWith({ id: 'art-42' });
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Article unpublished' })
      )
    );
  });
});
