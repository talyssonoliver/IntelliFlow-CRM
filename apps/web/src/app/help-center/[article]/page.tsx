'use client';

import { useParams, notFound } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, EmptyState } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { ArticleRenderer, type RenderableArticle } from '@/components/support/article-renderer';
import { FeedbackWidget } from '@/components/support/feedback-widget';
import { DEFAULT_HELP_CATEGORIES } from '@/lib/support/help-categories';
import { trpc } from '@/lib/trpc';

// ─── DB → renderer adapter ──────────────────────────────────────────────────

interface DbArticle {
  readonly id: string;
  readonly categoryId: string;
  readonly readTimeMinutes: number;
  // No superjson transformer in this project — tRPC serializes DateTime as an ISO
  // string at the wire boundary, so `updatedAt` is already a string on the client.
  readonly updatedAt: string | Date;
  readonly sections: ReadonlyArray<{ heading: string; content: string; blocks: unknown }>;
}

function toRenderable(article: DbArticle): RenderableArticle {
  return {
    id: article.id,
    categoryId: article.categoryId,
    readTimeMinutes: article.readTimeMinutes,
    lastUpdatedAt: new Date(article.updatedAt).toISOString(),
    sections: article.sections.map((s) => ({
      heading: s.heading,
      content: s.content,
      blocks: s.blocks,
    })),
  };
}

// ─── Shared async-state views ───────────────────────────────────────────────

function LoadingState({ label }: Readonly<{ label: string }>) {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-4xl">
        <output
          aria-live="polite"
          aria-label={label}
          className="flex items-center justify-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 p-12 text-muted-foreground"
        >
          <span className="material-symbols-outlined text-2xl animate-spin" aria-hidden="true">
            progress_activity
          </span>
          <span className="text-sm">{label}</span>
        </output>
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-4xl">
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-12 text-center"
        >
          <span className="material-symbols-outlined text-4xl text-red-500" aria-hidden="true">
            error
          </span>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            We couldn&apos;t load this help article. Please try again.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              refresh
            </span>{' '}
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page (mode router) ─────────────────────────────────────────────────────

export default function HelpCenterArticlePage() {
  const params = useParams();
  const slug = params.article as string;

  // A slug matching a category id renders the category listing; categories remain
  // static structural config (not DB-managed). Everything else is an article slug.
  const category = DEFAULT_HELP_CATEGORIES.find((c) => c.id === slug);
  if (category) {
    return <CategoryListingView categoryId={category.id} categoryTitle={category.title} />;
  }

  return <ArticleDetailView slug={slug} />;
}

// ─── Article Detail ─────────────────────────────────────────────────────────

function ArticleDetailView({ slug }: Readonly<{ slug: string }>) {
  const articleQuery = trpc.helpArticle.getBySlug.useQuery({ slug });
  const article = articleQuery.data;
  const relatedQuery = trpc.helpArticle.getRelated.useQuery(
    { id: article?.id ?? '' },
    { enabled: !!article?.id }
  );

  if (articleQuery.isLoading) {
    return <LoadingState label="Loading article" />;
  }
  // A missing or DRAFT-hidden article surfaces as NOT_FOUND → Next.js 404.
  if (articleQuery.error?.data?.code === 'NOT_FOUND') {
    notFound();
  }
  // Any other failure (UNAUTHORIZED, server error, network) → recoverable error UI.
  if (articleQuery.error || !article) {
    return <ErrorState onRetry={() => void articleQuery.refetch()} />;
  }

  const articleCategory = DEFAULT_HELP_CATEGORIES.find((c) => c.id === article.categoryId);
  const relatedArticles = relatedQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-4xl">
        <PageHeader
          title={article.title}
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Help Center', href: '/help-center' },
            ...(articleCategory
              ? [{ label: articleCategory.title, href: `/help-center/${articleCategory.id}` }]
              : []),
            { label: article.title },
          ]}
        />

        {/* Article content card */}
        <Card className="mt-2">
          <CardContent className="p-6 sm:p-8">
            <ArticleRenderer article={toRenderable(article)} />
          </CardContent>
        </Card>

        {/* Feedback widget */}
        <FeedbackWidget articleId={article.id} />

        {/* Related articles */}
        {relatedArticles.length > 0 && (
          <section aria-labelledby="related-heading" className="mt-10">
            <div className="flex items-center gap-2 mb-4">
              <span
                className="material-symbols-outlined text-lg text-muted-foreground"
                aria-hidden="true"
              >
                auto_stories
              </span>
              <h2 id="related-heading" className="text-lg font-semibold text-foreground">
                Related Articles
              </h2>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 list-none p-0">
              {relatedArticles.map((related) => (
                <li key={related.id}>
                  <Link
                    href={`/help-center/${related.slug}`}
                    className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                  >
                    <Card className="h-full transition-colors hover:border-primary/50 dark:hover:border-primary/50 group-focus-visible:border-primary">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-medium text-foreground mb-1">
                          {related.title}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {related.excerpt}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-3">
                          <span className="material-symbols-outlined text-xs" aria-hidden="true">
                            schedule
                          </span>
                          {related.readTimeMinutes} min read
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Category Listing Sub-view ──────────────────────────────────────────────

function CategoryListingView({
  categoryId,
  categoryTitle,
}: Readonly<{ categoryId: string; categoryTitle: string }>) {
  const articlesQuery = trpc.helpArticle.getByCategory.useQuery({
    categoryId,
    includeUnpublished: false,
  });
  const category = DEFAULT_HELP_CATEGORIES.find((c) => c.id === categoryId);

  if (articlesQuery.isLoading) {
    return <LoadingState label={`Loading ${categoryTitle} articles`} />;
  }
  if (articlesQuery.error) {
    return <ErrorState onRetry={() => void articlesQuery.refetch()} />;
  }

  const articles = articlesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-4xl">
        <PageHeader
          title={categoryTitle}
          description={`Browse ${articles.length} help ${articles.length === 1 ? 'article' : 'articles'} in ${categoryTitle}`}
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Help Center', href: '/help-center' },
            { label: categoryTitle },
          ]}
        />

        {articles.length === 0 ? (
          <EmptyState entity="documents" phase="passive" />
        ) : (
          <ul className="grid gap-4 list-none p-0">
            {articles.map((article) => (
              <li key={article.id}>
                <Link
                  href={`/help-center/${article.slug}`}
                  className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                >
                  <Card className="h-full transition-colors hover:border-primary/50 dark:hover:border-primary/50 group-focus-visible:border-primary">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        {category && (
                          <div
                            className={`flex-shrink-0 w-10 h-10 rounded-lg ${category.color} flex items-center justify-center dark:opacity-90`}
                          >
                            <span
                              className="material-symbols-outlined text-white text-xl"
                              aria-hidden="true"
                            >
                              {category.icon}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h2 className="text-base font-medium text-foreground mb-1">
                            {article.title}
                          </h2>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {article.excerpt}
                          </p>
                          <div className="flex items-center gap-3 mt-3">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span
                                className="material-symbols-outlined text-xs"
                                aria-hidden="true"
                              >
                                schedule
                              </span>
                              {article.readTimeMinutes} min read
                            </span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span
                                className="material-symbols-outlined text-xs"
                                aria-hidden="true"
                              >
                                article
                              </span>
                              {article.sectionCount}{' '}
                              {article.sectionCount === 1 ? 'section' : 'sections'}
                            </span>
                          </div>
                        </div>
                        <span
                          className="material-symbols-outlined text-muted-foreground text-xl group-hover:text-primary transition-colors flex-shrink-0 mt-1"
                          aria-hidden="true"
                        >
                          arrow_forward
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
