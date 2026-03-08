'use client';

import type { HelpArticle } from '@/lib/support/help-articles';
import { getCategoryById } from '@/lib/support/help-articles';

export interface ArticleRendererProps {
  article: HelpArticle;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function ArticleRenderer({ article }: Readonly<ArticleRendererProps>) {
  const category = getCategoryById(article.categoryId);

  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      {/* Article metadata */}
      <div className="flex flex-wrap items-center gap-3 mb-6 not-prose">
        {category && (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${category.color} text-white`}
          >
            {category.title}
          </span>
        )}
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            schedule
          </span>
          {article.readTimeMinutes} min read
        </span>
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            update
          </span>
          Updated{' '}
          <time dateTime={article.lastUpdatedAt}>{formatDate(article.lastUpdatedAt)}</time>
        </span>
      </div>

      {/* Article sections */}
      {article.sections.map((section) => {
        const headingId = slugify(section.heading);
        return (
          <section key={headingId} className="mb-8">
            <h2 id={headingId} className="text-xl font-semibold mb-3 scroll-mt-20">
              {section.heading}
            </h2>
            <p className="text-base leading-relaxed">{section.content}</p>
          </section>
        );
      })}
    </article>
  );
}
