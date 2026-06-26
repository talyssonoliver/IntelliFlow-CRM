'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  Input,
  Label,
  RichTextEditor,
  Skeleton,
  Textarea,
  toast,
} from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { api } from '@/lib/api';
import { DEFAULT_HELP_CATEGORIES } from '@/lib/support/help-categories';
import type {
  CreateHelpArticleInput,
  UpdateHelpArticleInput,
} from '@intelliflow/validators/help-article';
import { ForbiddenSurface } from './article-admin-list';
import {
  docToSections,
  estimateReadTime,
  sectionsToDoc,
  slugify,
  type EditorNode,
} from '@/lib/support/article-editor-mapping';

const PRIVILEGED_ROLES = new Set(['ADMIN', 'MANAGER']);
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const EDITOR_SKELETON_KEYS = ['ae-0', 'ae-1', 'ae-2', 'ae-3'] as const;

export interface ArticleEditorProps {
  mode: 'create' | 'edit';
  /** Required in edit mode — the help article id from the route. */
  articleId?: string;
}

type FormErrors = Partial<
  Record<'title' | 'slug' | 'categoryId' | 'excerpt' | 'readTimeMinutes' | 'body', string>
>;

/** Parse the comma-separated keyword field into a de-duped, capped list. */
function parseKeywords(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const value = part.trim();
    if (value) seen.add(value);
  }
  return Array.from(seen).slice(0, 20);
}

/** Skeleton shown while the profile or the edited article is loading. */
function EditorLoading() {
  return (
    <output
      className="block w-full space-y-4 p-6"
      aria-label="Loading article editor"
      data-testid="article-editor-loading"
    >
      {EDITOR_SKELETON_KEYS.map((key) => (
        <Skeleton key={key} className="h-12 w-full" />
      ))}
    </output>
  );
}

/** Inline field validation message, programmatically associated via `id`. */
function FieldError({ id, message }: Readonly<{ id: string; message?: string }>) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} className="text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

interface MetadataFieldsProps {
  title: string;
  onTitle: (value: string) => void;
  slug: string;
  onSlug: (value: string) => void;
  categoryId: string;
  onCategory: (value: string) => void;
  excerpt: string;
  onExcerpt: (value: string) => void;
  keywords: string;
  onKeywords: (value: string) => void;
  readTime: number;
  onReadTime: (value: number) => void;
  order: number;
  onOrder: (value: number) => void;
  errors: FormErrors;
}

function MetadataFields(props: Readonly<MetadataFieldsProps>) {
  const { title, slug, categoryId, excerpt, keywords, readTime, order, errors } = props;
  return (
    <Card className="space-y-5 p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="article-title">Title</Label>
          <Input
            id="article-title"
            value={title}
            onChange={(e) => props.onTitle(e.target.value)}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'article-title-error' : undefined}
          />
          <FieldError id="article-title-error" message={errors.title} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="article-slug">Slug</Label>
          <Input
            id="article-slug"
            value={slug}
            onChange={(e) => props.onSlug(e.target.value)}
            aria-invalid={!!errors.slug}
            aria-describedby={errors.slug ? 'article-slug-error' : undefined}
          />
          <FieldError id="article-slug-error" message={errors.slug} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="article-category">Category</Label>
          <select
            id="article-category"
            value={categoryId}
            onChange={(e) => props.onCategory(e.target.value)}
            aria-invalid={!!errors.categoryId}
            aria-describedby={errors.categoryId ? 'article-category-error' : undefined}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select a category…</option>
            {DEFAULT_HELP_CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.title}
              </option>
            ))}
          </select>
          <FieldError id="article-category-error" message={errors.categoryId} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="article-read-time">Read time (min)</Label>
            <Input
              id="article-read-time"
              type="number"
              min={1}
              max={60}
              value={readTime}
              onChange={(e) => props.onReadTime(Number(e.target.value))}
              aria-invalid={!!errors.readTimeMinutes}
              aria-describedby={errors.readTimeMinutes ? 'article-read-time-error' : undefined}
            />
            <FieldError id="article-read-time-error" message={errors.readTimeMinutes} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="article-order">Order</Label>
            <Input
              id="article-order"
              type="number"
              min={0}
              value={order}
              onChange={(e) => props.onOrder(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="article-excerpt">Excerpt</Label>
        <Textarea
          id="article-excerpt"
          value={excerpt}
          maxLength={1000}
          rows={2}
          onChange={(e) => props.onExcerpt(e.target.value)}
          aria-invalid={!!errors.excerpt}
          aria-describedby={errors.excerpt ? 'article-excerpt-error' : undefined}
        />
        <FieldError id="article-excerpt-error" message={errors.excerpt} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="article-keywords">Keywords</Label>
        <Input
          id="article-keywords"
          value={keywords}
          placeholder="comma, separated, keywords"
          onChange={(e) => props.onKeywords(e.target.value)}
          aria-describedby="article-keywords-hint"
        />
        <p id="article-keywords-hint" className="text-xs text-muted-foreground">
          Separate keywords with commas (up to 20).
        </p>
      </div>
    </Card>
  );
}

interface BodyEditorProps {
  preview: boolean;
  onTogglePreview: () => void;
  content: EditorNode | null;
  editorKey: number;
  onChange: (next: EditorNode) => void;
  bodyError?: string;
}

function BodyEditor({
  preview,
  onTogglePreview,
  content,
  editorKey,
  onChange,
  bodyError,
}: Readonly<BodyEditorProps>) {
  return (
    <Card className="space-y-3 p-6">
      <div className="flex items-center justify-between">
        <span id="article-body-label" className="text-sm font-medium leading-none">
          Body
        </span>
        {/* Action button (not a toggle): the visible label is the accessible
            name, so it stays consistent for AT (no aria-pressed/name clash). */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onTogglePreview}
          data-testid="toggle-preview"
        >
          {preview ? 'Edit' : 'Preview'}
        </Button>
      </div>

      {preview ? (
        <fieldset className="m-0 min-w-0 border-0 p-0" data-testid="article-preview">
          <legend className="sr-only">Article preview</legend>
          <RichTextEditor
            key={`preview-${editorKey}`}
            value={content}
            editable={false}
            ariaLabel="Article preview"
          />
        </fieldset>
      ) : (
        <fieldset
          className="m-0 min-w-0 border-0 p-0"
          aria-describedby={bodyError ? 'article-body-error' : undefined}
        >
          <legend className="sr-only">Body editor</legend>
          <RichTextEditor
            key={`edit-${editorKey}`}
            value={content}
            onChange={onChange}
            ariaLabel="Article body editor"
          />
        </fieldset>
      )}
      <FieldError id="article-body-error" message={bodyError} />
    </Card>
  );
}

interface EditorActionsProps {
  mode: 'create' | 'edit';
  status: 'DRAFT' | 'PUBLISHED';
  isSaving: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onCancel: () => void;
}

function EditorActions({
  mode,
  status,
  isSaving,
  onSaveDraft,
  onPublish,
  onUnpublish,
  onCancel,
}: Readonly<EditorActionsProps>) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={onSaveDraft} disabled={isSaving} data-testid="save-draft">
        {mode === 'create' ? 'Save draft' : 'Save changes'}
      </Button>
      {status === 'PUBLISHED' ? (
        <Button variant="outline" onClick={onUnpublish} disabled={isSaving} data-testid="unpublish">
          Unpublish
        </Button>
      ) : (
        <Button variant="secondary" onClick={onPublish} disabled={isSaving} data-testid="publish">
          Publish
        </Button>
      )}
      <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
        Cancel
      </Button>
      <output className="sr-only">{isSaving ? 'Saving…' : ''}</output>
    </div>
  );
}

export function ArticleEditor({ mode, articleId }: Readonly<ArticleEditorProps>) {
  const router = useRouter();
  const utils = api.useUtils();

  const profileQuery = api.user.getProfile.useQuery();
  const role = profileQuery.data?.role;
  const isPrivileged = !!role && PRIVILEGED_ROLES.has(role);

  const articleQuery = api.helpArticle.getById.useQuery(
    { id: articleId ?? '' },
    { enabled: mode === 'edit' && !!articleId && isPrivileged }
  );

  // ─── Form state ──────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [keywords, setKeywords] = useState('');
  const [readTime, setReadTime] = useState(1);
  const [readTimeTouched, setReadTimeTouched] = useState(false);
  const [order, setOrder] = useState(0);
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
  // The editor has no related-articles control yet; we carry the loaded value
  // through unchanged so an edit-save never silently clears existing links.
  const [relatedArticleIds, setRelatedArticleIds] = useState<string[]>([]);
  const [content, setContent] = useState<EditorNode | null>(null);
  // Whether the body was edited in this session. Create always writes sections;
  // an edit only rewrites sections when the body actually changed, so a
  // metadata-only edit preserves the article's original (possibly richer,
  // legacy ContentBlock) sections in the DB untouched.
  const [bodyDirty, setBodyDirty] = useState(mode === 'create');
  const [errors, setErrors] = useState<FormErrors>({});
  const [preview, setPreview] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  const seededIdRef = useRef<string | null>(null);

  // Seed the form when the loaded article changes. Keyed on the article id (not
  // a one-shot boolean) so a client-side navigation from one edit route to
  // another reseeds rather than carrying the previous article's state.
  useEffect(() => {
    const article = articleQuery.data;
    if (!article || seededIdRef.current === article.id) return;
    seededIdRef.current = article.id;
    setTitle(article.title);
    setSlug(article.slug);
    setSlugTouched(true);
    setCategoryId(article.categoryId);
    setExcerpt(article.excerpt);
    setKeywords(article.keywords.join(', '));
    setReadTime(article.readTimeMinutes);
    setReadTimeTouched(true);
    setOrder(article.order);
    setStatus(article.status);
    setRelatedArticleIds(article.relatedArticleIds);
    setContent(sectionsToDoc(article.sections) as EditorNode);
    setBodyDirty(false);
    setErrors({});
    setEditorKey((k) => k + 1);
  }, [articleQuery.data]);

  // Auto-derive slug from the title until the user edits it directly.
  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      if (!slugTouched) setSlug(slugify(value));
    },
    [slugTouched]
  );

  // Auto-estimate read time from the body until the user overrides it.
  const handleContentChange = useCallback(
    (next: EditorNode) => {
      setContent(next);
      setBodyDirty(true);
      if (!readTimeTouched) setReadTime(estimateReadTime(next));
    },
    [readTimeTouched]
  );

  const validate = useCallback((): boolean => {
    const next: FormErrors = {};
    if (!title.trim()) next.title = 'Title is required.';
    if (!slug.trim()) next.slug = 'Slug is required.';
    else if (!SLUG_PATTERN.test(slug))
      next.slug = 'Slug must be lowercase letters, numbers, and hyphens.';
    if (!categoryId) next.categoryId = 'Select a category.';
    if (!excerpt.trim()) next.excerpt = 'Excerpt is required.';
    if (readTime < 1 || readTime > 60)
      next.readTimeMinutes = 'Read time must be between 1 and 60 minutes.';
    if (docToSections(content).length === 0) next.body = 'Add some content before saving.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [title, slug, categoryId, excerpt, readTime, content]);

  const createMutation = api.helpArticle.create.useMutation();
  const updateMutation = api.helpArticle.update.useMutation();
  const publishMutation = api.helpArticle.publish.useMutation();
  const unpublishMutation = api.helpArticle.unpublish.useMutation();

  // The create/update procedures return the full article (with its Prisma
  // `sections` relation) — a type deep enough to trip `tsc`'s instantiation
  // limit when awaited inside a callback. The casts are runtime no-ops (the
  // underlying `mutateAsync` reference is stable), narrowing to the id slice we
  // actually consume.
  const createArticle = createMutation.mutateAsync as unknown as (
    input: CreateHelpArticleInput
  ) => Promise<{ id: string }>;
  const updateArticle = updateMutation.mutateAsync as unknown as (
    input: UpdateHelpArticleInput
  ) => Promise<{ id: string }>;

  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    publishMutation.isPending ||
    unpublishMutation.isPending;

  const buildBase = useCallback(
    () => ({
      slug: slug.trim(),
      title: title.trim(),
      categoryId,
      excerpt: excerpt.trim(),
      readTimeMinutes: readTime,
      keywords: parseKeywords(keywords),
      relatedArticleIds,
      order,
    }),
    [slug, title, categoryId, excerpt, readTime, keywords, relatedArticleIds, order]
  );

  /** Persist the article (create or update). Returns its id, or null on error. */
  const persist = useCallback(async (): Promise<string | null> => {
    if (!validate()) return null;
    const base = buildBase();
    const sections = docToSections(content);
    try {
      if (mode === 'create') {
        const created = await createArticle({ ...base, sections });
        return created.id;
      }
      // Only rewrite sections when the body was actually edited; otherwise omit
      // them so the router leaves the stored sections (and their legacy blocks)
      // intact on a metadata-only edit.
      const updateInput: UpdateHelpArticleInput = {
        id: articleId as string,
        ...base,
        ...(bodyDirty ? { sections } : {}),
      };
      const updated = await updateArticle(updateInput);
      return updated.id;
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
      return null;
    }
  }, [validate, buildBase, content, bodyDirty, mode, articleId, createArticle, updateArticle]);

  const invalidate = useCallback(
    (id?: string) => {
      utils.helpArticle.list.invalidate();
      if (id) utils.helpArticle.getById.invalidate({ id });
    },
    [utils]
  );

  const handleSaveDraft = useCallback(async () => {
    const id = await persist();
    if (!id) return;
    invalidate(id);
    toast({ title: mode === 'create' ? 'Draft created' : 'Changes saved' });
    if (mode === 'create') {
      router.push(`/settings/help-center/articles/${id}/edit`);
    }
  }, [persist, invalidate, mode, router]);

  const handlePublish = useCallback(async () => {
    const id = await persist();
    if (!id) return;
    try {
      await publishMutation.mutateAsync({ id });
      setStatus('PUBLISHED');
      invalidate(id);
      toast({ title: 'Article published' });
      router.push('/settings/help-center/articles');
    } catch (err) {
      toast({
        title: 'Publish failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
      // In create mode the draft was already persisted with this id. Move to its
      // edit route so a retry updates the existing draft instead of attempting a
      // duplicate-slug create.
      if (mode === 'create') {
        invalidate(id);
        router.push(`/settings/help-center/articles/${id}/edit`);
      }
    }
  }, [persist, publishMutation, invalidate, mode, router]);

  const handleUnpublish = useCallback(async () => {
    if (!articleId) return;
    try {
      await unpublishMutation.mutateAsync({ id: articleId });
      setStatus('DRAFT');
      invalidate(articleId);
      toast({ title: 'Article unpublished' });
    } catch (err) {
      toast({
        title: 'Unpublish failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
    }
  }, [articleId, unpublishMutation, invalidate]);

  const breadcrumbs = useMemo(
    () => [
      { label: 'Settings', href: '/settings' },
      { label: 'Help center', href: '/settings/help-center/articles' },
      { label: 'Articles', href: '/settings/help-center/articles' },
      { label: mode === 'create' ? 'New article' : 'Edit article' },
    ],
    [mode]
  );

  // ─── Guards ────────────────────────────────────────────────────────────────
  if (profileQuery.isLoading) {
    return <EditorLoading />;
  }

  if (!isPrivileged) {
    return <ForbiddenSurface />;
  }

  if (mode === 'edit') {
    // Treat "no data and no error yet" as loading too: the article query is
    // gated on `isPrivileged`, so there is a render between the profile
    // resolving and the query firing where it is neither loading nor settled —
    // without this the not-found surface would flash briefly.
    if (articleQuery.isLoading || (!articleQuery.data && !articleQuery.error)) {
      return <EditorLoading />;
    }
    if (articleQuery.error || !articleQuery.data) {
      return (
        <div className="w-full space-y-4 p-6" data-testid="article-editor-not-found">
          <PageHeader
            title="Article not found"
            description="This help article could not be loaded."
          />
          <Button variant="outline" onClick={() => router.push('/settings/help-center/articles')}>
            Back to articles
          </Button>
        </div>
      );
    }
  }

  return (
    <div className="w-full space-y-6 p-6" data-testid="article-editor">
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={mode === 'create' ? 'New help article' : 'Edit help article'}
        description="Author the article body and metadata, then save as a draft or publish."
      />

      <MetadataFields
        title={title}
        onTitle={handleTitleChange}
        slug={slug}
        onSlug={(value) => {
          setSlugTouched(true);
          setSlug(value);
        }}
        categoryId={categoryId}
        onCategory={setCategoryId}
        excerpt={excerpt}
        onExcerpt={setExcerpt}
        keywords={keywords}
        onKeywords={setKeywords}
        readTime={readTime}
        onReadTime={(value) => {
          setReadTimeTouched(true);
          setReadTime(value);
        }}
        order={order}
        onOrder={setOrder}
        errors={errors}
      />

      <BodyEditor
        preview={preview}
        onTogglePreview={() => setPreview((p) => !p)}
        content={content}
        editorKey={editorKey}
        onChange={handleContentChange}
        bodyError={errors.body}
      />

      <EditorActions
        mode={mode}
        status={status}
        isSaving={isSaving}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        onCancel={() => router.push('/settings/help-center/articles')}
      />
    </div>
  );
}
