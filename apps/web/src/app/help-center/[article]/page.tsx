'use client';

import { useParams, notFound } from 'next/navigation';
import Link from 'next/link';
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
      <div className="max-w-3xl">
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

        <ArticleRenderer article={article} />

        <FeedbackWidget articleId={article.id} />

        {relatedArticles.length > 0 && (
          <section aria-labelledby="related-heading" className="mt-10">
            <h2 id="related-heading" className="text-lg font-semibold mb-4">
              Related Articles
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 list-none p-0">
              {relatedArticles.map((related) => (
                <li key={related.id}>
                  <Link
                    href={`/help-center/${related.slug}`}
                    className="block p-4 rounded-lg border border-border hover:bg-accent transition-colors"
                  >
                    <h3 className="text-sm font-medium text-foreground mb-1">{related.title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">{related.excerpt}</p>
                    <span className="text-xs text-muted-foreground mt-2 inline-block">
                      {related.readTimeMinutes} min read
                    </span>
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

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-3xl">
        <PageHeader
          title={categoryTitle}
          description={`Browse help articles in ${categoryTitle}`}
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Help Center', href: '/help-center' },
            { label: categoryTitle },
          ]}
        />

        {articles.length === 0 ? (
          <p className="text-muted-foreground text-sm">No articles in this category yet.</p>
        ) : (
          <ul className="grid gap-4 list-none p-0">
            {articles.map((article) => (
              <li key={article.id}>
                <Link
                  href={`/help-center/${article.slug}`}
                  className="block p-4 rounded-lg border border-border hover:bg-accent transition-colors"
                >
                  <h2 className="text-base font-medium text-foreground mb-1">{article.title}</h2>
                  <p className="text-sm text-muted-foreground line-clamp-2">{article.excerpt}</p>
                  <span className="text-xs text-muted-foreground mt-2 inline-block">
                    {article.readTimeMinutes} min read
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
