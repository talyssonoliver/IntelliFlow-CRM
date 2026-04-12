'use client';

import { Fragment } from 'react';
import { Badge } from '@intelliflow/ui';
import type { HelpArticle, ContentBlock } from '@/lib/support/help-articles';
import { getCategoryById } from '@/lib/support/help-articles';

export interface ArticleRendererProps {
  article: HelpArticle;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// ─── Block Renderers ──────────────────────────────────────────────────────

function ParagraphBlock({ text }: Readonly<{ text: string }>) {
  return <p className="text-base leading-relaxed text-slate-700 dark:text-slate-300">{text}</p>;
}

function StepsBlock({ items }: Readonly<{ items: readonly string[] }>) {
  return (
    <ol className="space-y-3 my-4 list-none p-0">
      {items.map((step, i) => (
        <li key={`step-${i}`} className="flex gap-3 items-start">
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 pt-1">
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TipBlock({ text }: Readonly<{ text: string }>) {
  return (
    <div className="flex gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
      <span
        className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-xl flex-shrink-0 mt-0.5"
        aria-hidden="true"
      >
        lightbulb
      </span>
      <div>
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 mb-1">Tip</p>
        <p className="text-sm text-slate-700 dark:text-slate-300">{text}</p>
      </div>
    </div>
  );
}

function WarningBlock({ text }: Readonly<{ text: string }>) {
  return (
    <div className="flex gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
      <span
        className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-xl flex-shrink-0 mt-0.5"
        aria-hidden="true"
      >
        warning
      </span>
      <div>
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">Important</p>
        <p className="text-sm text-slate-700 dark:text-slate-300">{text}</p>
      </div>
    </div>
  );
}

function InfoBlock({ text }: Readonly<{ text: string }>) {
  return (
    <div className="flex gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
      <span
        className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-xl flex-shrink-0 mt-0.5"
        aria-hidden="true"
      >
        info
      </span>
      <div>
        <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">Note</p>
        <p className="text-sm text-slate-700 dark:text-slate-300">{text}</p>
      </div>
    </div>
  );
}

function NavPathBlock({ path }: Readonly<{ path: readonly string[] }>) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap my-3" aria-label="Navigation path">
      {path.map((segment, i) => (
        <Fragment key={`nav-${i}`}>
          {i > 0 && (
            <span
              className="material-symbols-outlined text-xs text-muted-foreground"
              aria-hidden="true"
            >
              chevron_right
            </span>
          )}
          <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {segment}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function BlockRenderer({ block }: Readonly<{ block: ContentBlock }>) {
  switch (block.type) {
    case 'paragraph':
      return <ParagraphBlock text={block.text} />;
    case 'steps':
      return <StepsBlock items={block.items} />;
    case 'tip':
      return <TipBlock text={block.text} />;
    case 'warning':
      return <WarningBlock text={block.text} />;
    case 'info':
      return <InfoBlock text={block.text} />;
    case 'nav-path':
      return <NavPathBlock path={block.path} />;
  }
}

// ─── Table of Contents ────────────────────────────────────────────────────

function TableOfContents({ sections }: Readonly<{ sections: readonly { heading: string }[] }>) {
  if (sections.length < 2) return null;

  return (
    <nav
      className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700"
      aria-label="Table of contents"
    >
      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <span
          className="material-symbols-outlined text-base text-muted-foreground"
          aria-hidden="true"
        >
          list
        </span>
        {' '}In this article
      </h2>
      <ul className="space-y-2 list-none p-0 m-0">
        {sections.map((section) => {
          const id = slugify(section.heading);
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-xs" aria-hidden="true">
                  arrow_forward
                </span>
                {section.heading}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export function ArticleRenderer({ article }: Readonly<ArticleRendererProps>) {
  const category = getCategoryById(article.categoryId);

  return (
    <article className="space-y-8">
      {/* Article metadata */}
      <div className="flex flex-wrap items-center gap-3">
        {category && (
          <Badge className={`${category.color} text-white border-transparent`}>
            {category.title}
          </Badge>
        )}
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            schedule
          </span>
          {article.readTimeMinutes} min read
        </span>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            update
          </span>
          Updated <time dateTime={article.lastUpdatedAt}>{formatDate(article.lastUpdatedAt)}</time>
        </span>
      </div>

      {/* Table of contents */}
      <TableOfContents sections={article.sections} />

      {/* Article sections */}
      {article.sections.map((section) => {
        const headingId = slugify(section.heading);
        return (
          <section key={headingId} className="space-y-4">
            <h2
              id={headingId}
              className="text-xl font-semibold text-foreground scroll-mt-20 flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700"
            >
              {section.heading}
            </h2>
            {section.blocks ? (
              <div className="space-y-4">
                {section.blocks.map((block, i) => (
                  <BlockRenderer key={`block-${headingId}-${i}`} block={block} />
                ))}
              </div>
            ) : (
              <p className="text-base leading-relaxed text-slate-700 dark:text-slate-300">
                {section.content}
              </p>
            )}
          </section>
        );
      })}
    </article>
  );
}
