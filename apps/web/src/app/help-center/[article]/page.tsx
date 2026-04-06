'use client';

import { useParams, notFound } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, EmptyState } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { ArticleRenderer } from '@/components/support/article-renderer';
import { FeedbackWidget } from '@/components/support/feedback-widget';
import {
  getArticleBySlug,
  getArticlesByCategory,
  getRelatedArticles,
  getCategoryById,
} from '@/lib/support/help-articles';
import { DEFAULT_HELP_CATEGORIES } from '@/lib/support/help-categories';

export default function HelpCenterArticlePage() {
  const params = useParams();
  const slug = params.article as string;

  // Check if slug matches a category ID (category listing mode)
  const category = DEFAULT_HELP_CATEGORIES.find((c) => c.id === slug);
  if (category) {
    return <CategoryListingView categoryId={category.id} categoryTitle={category.title} />;
  }

  // Check if slug matches an article slug (article detail mode)
  const article = getArticleBySlug(slug);
  if (!article) {
    notFound();
  }

  const relatedArticles = getRelatedArticles(article);
  const articleCategory = getCategoryById(article.categoryId);

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
            <ArticleRenderer article={article} />
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
                          <span
                            className="material-symbols-outlined text-xs"
                            aria-hidden="true"
                          >
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
  const articles = getArticlesByCategory(categoryId);
  const category = DEFAULT_HELP_CATEGORIES.find((c) => c.id === categoryId);

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
            {articles.map((article) => {
              const articleCategory = category;
              return (
                <li key={article.id}>
                  <Link
                    href={`/help-center/${article.slug}`}
                    className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                  >
                    <Card className="h-full transition-colors hover:border-primary/50 dark:hover:border-primary/50 group-focus-visible:border-primary">
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          {articleCategory && (
                            <div
                              className={`flex-shrink-0 w-10 h-10 rounded-lg ${articleCategory.color} flex items-center justify-center dark:opacity-90`}
                            >
                              <span
                                className="material-symbols-outlined text-white text-xl"
                                aria-hidden="true"
                              >
                                {articleCategory.icon}
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
                                {article.sections.length}{' '}
                                {article.sections.length === 1 ? 'section' : 'sections'}
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
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
