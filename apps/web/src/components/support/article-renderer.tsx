'use client';

import { Fragment } from 'react';
import { Badge } from '@intelliflow/ui';
import type { ContentBlock } from '@/lib/support/help-articles';
import { getCategoryById } from '@/lib/support/help-articles';
import { tiptapBodyFromBlocks } from '@/lib/support/article-editor-mapping';
import { TiptapNodeRenderer } from './tiptap-node-renderer';

/**
 * A section as consumed by the renderer. `blocks` is `unknown` so this accepts both
 * the static `ContentBlock[]` shape (seed data) AND the DB `ArticleSection.blocks`
 * (`Json`) shape — including the editor-authored `[{ type: 'tiptapDoc', ... }]` wrapper.
 */
export interface RenderableSection {
  readonly heading: string;
  readonly content: string;
  readonly blocks?: unknown;
}

/** The article shape the renderer needs (DB-shaped or static-shaped via a page adapter). */
export interface RenderableArticle {
  readonly id: string;
  readonly categoryId: string;
  readonly readTimeMinutes: number;
  /** ISO date string (DB `updatedAt` mapped by the page adapter, or static `lastUpdatedAt`). */
  readonly lastUpdatedAt: string;
  readonly sections: readonly RenderableSection[];
}

export interface ArticleRendererProps {
  article: RenderableArticle;
}

// ─── Block classification helpers ───────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((s) => typeof s === 'string');
}

/**
 * Validate one legacy block's REQUIRED fields, not just its discriminator. `blocks`
 * is untrusted `z.unknown()` JSON, so a malformed `{ type: 'steps' }` (no `items`)
 * must NOT be treated as a valid block — otherwise `StepsBlock` would `.map` undefined.
 */
function isValidLegacyBlock(b: Record<string, unknown>): boolean {
  switch (b.type) {
    case 'paragraph':
    case 'tip':
    case 'warning':
    case 'info':
      return typeof b.text === 'string';
    case 'steps':
      return isStringArray(b.items);
    case 'nav-path':
      return isStringArray(b.path);
    default:
      return false;
  }
}

/** True when `blocks` is a well-formed legacy `ContentBlock[]` the `BlockRenderer` understands. */
function isLegacyContentBlocks(blocks: unknown): blocks is ContentBlock[] {
  return (
    Array.isArray(blocks) &&
    blocks.length > 0 &&
    blocks.every((b) => isRecord(b) && isValidLegacyBlock(b))
  );
}

/**
 * Deduplicate slugified headings so section ids (and matching TOC anchors) stay unique.
 * A heading that slugifies to empty (e.g. "!!!" or non-Latin text) falls back to
 * `section-N` so no id is "" and no TOC href is "#".
 */
function dedupeSlugs(headings: readonly string[]): string[] {
  const seen = new Set<string>();
  return headings.map((heading, index) => {
    const base = slugify(heading) || `section-${index + 1}`;
    // Increment the suffix until the FULL candidate is unused, so a suffixed duplicate
    // can't collide with another heading's natural slug (e.g. "Overview"/"Overview 2").
    let candidate = base;
    let suffix = 2;
    while (seen.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    seen.add(candidate);
    return candidate;
  });
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
  return date.toLocaleDateString('en-GB', {
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

function TableOfContents({
  items,
}: Readonly<{ items: readonly { heading: string; id: string }[] }>) {
  if (items.length < 2) return null;

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
        </span>{' '}
        In this article
      </h2>
      <ul className="space-y-2 list-none p-0 m-0">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-xs" aria-hidden="true">
                arrow_forward
              </span>
              {item.heading}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ─── Section Body ───────────────────────────────────────────────────────────

/**
 * Render a section body, routing on the stored `blocks` shape:
 *  1. editor-authored Tiptap wrapper → `TiptapNodeRenderer`
 *  2. legacy `ContentBlock[]` (seed data) → `BlockRenderer` (rich callouts preserved)
 *  3. otherwise → plain-text `content` fallback (covers unrecognized/absent blocks)
 */
function SectionBody({ section }: Readonly<{ section: RenderableSection }>) {
  const tiptapNodes = tiptapBodyFromBlocks(section.blocks);
  if (tiptapNodes) {
    return (
      <div className="space-y-4">
        <TiptapNodeRenderer nodes={tiptapNodes} />
      </div>
    );
  }

  if (isLegacyContentBlocks(section.blocks)) {
    return (
      <div className="space-y-4">
        {section.blocks.map((block, i) => (
          <BlockRenderer key={`block-${i}`} block={block} />
        ))}
      </div>
    );
  }

  return (
    <p className="text-base leading-relaxed text-slate-700 dark:text-slate-300">
      {section.content}
    </p>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export function ArticleRenderer({ article }: Readonly<ArticleRendererProps>) {
  const category = getCategoryById(article.categoryId);
  const sectionIds = dedupeSlugs(article.sections.map((s) => s.heading));

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
      <TableOfContents
        items={article.sections.map((section, i) => ({
          heading: section.heading,
          id: sectionIds[i],
        }))}
      />

      {/* Article sections */}
      {article.sections.map((section, i) => {
        const headingId = sectionIds[i];
        return (
          <section key={headingId} className="space-y-4">
            <h2
              id={headingId}
              className="text-xl font-semibold text-foreground scroll-mt-20 flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700"
            >
              {section.heading}
            </h2>
            <SectionBody section={section} />
          </section>
        );
      })}
    </article>
  );
}
