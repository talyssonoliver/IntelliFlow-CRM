/**
 * Tiptap Node Renderer (IFC-302)
 *
 * Pure React, recursive renderer for the editor-authored Tiptap document stored
 * by PG-181 as `[{ type: 'tiptapDoc', level, content: <Tiptap nodes> }]` in
 * `ArticleSection.blocks`. Renders the StarterKit + Image node/mark set the editor
 * (IFC-301) produces, with a strict allowlist.
 *
 * SECURITY (defense-in-depth — `ArticleSection.blocks` is `z.unknown()` on write,
 * so the node tree is UNTRUSTED at render time, even though authoring is gated to
 * ADMIN/MANAGER):
 *  - No `dangerouslySetInnerHTML`. All text is React children (auto-escaped).
 *  - Node/mark TYPE ALLOWLIST — anything not handled returns `null` (dropped).
 *  - Image `src` + link `href` SCHEME ALLOWLIST (http/https/relative; `mailto:` for
 *    links). `javascript:`/`data:`/`vbscript:`/`blob:` are dropped.
 *  - Images always carry `alt` (`""` when absent), `loading="lazy"`,
 *    `referrerPolicy="no-referrer"`. Links get `rel="noopener noreferrer"`.
 *
 * A11Y: Tiptap heading nodes are offset to <h3>+ so the page keeps a single <h1>
 * (PageHeader) and section <h2>s. Lists keep <ul>/<ol> with explicit role="list"
 * (the `list-none`-on-VoiceOver workaround).
 */

import { Fragment, type ReactNode } from 'react';
import type { EditorNode } from '@/lib/support/article-editor-mapping';

/** Tiptap/ProseMirror JSON node, extended with the `marks` array on text nodes. */
export interface TiptapNode {
  readonly type?: string;
  readonly text?: string;
  readonly attrs?: Record<string, unknown>;
  readonly marks?: ReadonlyArray<{
    readonly type?: string;
    readonly attrs?: Record<string, unknown>;
  }>;
  readonly content?: readonly TiptapNode[];
}

// A fixed, non-resolvable base lets `new URL` resolve PATH-RELATIVE values
// (e.g. `images/x.png`, `help-center/search`) and in-page fragments, so a relative
// editor-authored URL is kept rather than dropped — while absolute URLs keep their
// own scheme so `javascript:`/`data:`/`vbscript:` are still rejected.
const SAFE_BASE = 'https://intelliflow.invalid';

/** Stored `blocks` is untrusted `z.unknown()` JSON — guard every node before dereferencing. */
function isRecord(value: unknown): value is TiptapNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate a URL against the scheme allowlist (http/https, relative/fragment, and
 * optionally mailto). Returns the ORIGINAL value (preserving relative form) or null.
 * Protocol-relative `//host` is rejected (ambiguous origin).
 */
function safeUrl(value: unknown, allowMailto: boolean): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  if (value.startsWith('//')) {
    return null; // protocol-relative — ambiguous origin
  }
  try {
    const { protocol } = new URL(value, SAFE_BASE);
    if (protocol === 'http:' || protocol === 'https:') {
      return value; // absolute http(s) OR a relative path/fragment resolved against the base
    }
    if (allowMailto && protocol === 'mailto:') {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

/** Validate an image `src` against the scheme allowlist; returns the src or null. */
export function safeImageSrc(src: unknown): string | null {
  return safeUrl(src, false);
}

/** Validate a link `href` against the scheme allowlist; returns the href or null. */
export function safeHref(href: unknown): string | null {
  return safeUrl(href, true);
}

const DEFAULT_LEVEL = 2;
const MIN_BODY_HEADING = 3;
const MAX_HEADING = 6;

/** Offset a Tiptap heading level so body headings never collide with the page <h1>/<h2>. */
function headingTag(level: unknown): 'h3' | 'h4' | 'h5' | 'h6' {
  const n = typeof level === 'number' ? level : DEFAULT_LEVEL;
  const clamped = Math.min(MAX_HEADING, Math.max(MIN_BODY_HEADING, n + 1));
  return `h${clamped}` as 'h3' | 'h4' | 'h5' | 'h6';
}

/** Wrap a text node's content in its allowlisted marks (unknown marks ignored). */
function renderText(node: TiptapNode, key: string): ReactNode {
  let content: ReactNode = node.text ?? '';
  const marks = Array.isArray(node.marks) ? node.marks : [];
  for (const mark of marks) {
    switch (isRecord(mark) ? mark.type : undefined) {
      case 'bold':
        content = <strong>{content}</strong>;
        break;
      case 'italic':
        content = <em>{content}</em>;
        break;
      case 'strike':
        content = <s>{content}</s>;
        break;
      case 'code':
        content = (
          <code className="rounded bg-slate-100 px-1 py-0.5 text-sm dark:bg-slate-800">
            {content}
          </code>
        );
        break;
      case 'link': {
        const href = safeHref(mark.attrs?.href);
        content = href ? (
          <a
            href={href}
            rel="noopener noreferrer"
            target="_blank"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {content}
          </a>
        ) : (
          content
        );
        break;
      }
      default:
        break; // unknown mark — render plain text
    }
  }
  return <Fragment key={key}>{content}</Fragment>;
}

function renderChildren(node: TiptapNode, key: string): ReactNode[] {
  // Untrusted JSON: a non-array `content` is treated as empty rather than crashing on .map.
  const children = Array.isArray(node.content) ? node.content : [];
  return children.map((child, i) => renderNode(child, `${key}-${i}`));
}

const PARA_CLASS = 'text-base leading-relaxed text-slate-700 dark:text-slate-300';

function renderNode(node: unknown, key: string): ReactNode {
  // Untrusted JSON: drop anything that is not a node object (null, arrays, primitives).
  if (!isRecord(node)) {
    return null;
  }
  if (typeof node.text === 'string') {
    return renderText(node, key);
  }
  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} className={PARA_CLASS}>
          {renderChildren(node, key)}
        </p>
      );
    case 'heading': {
      const Tag = headingTag(node.attrs?.level);
      return (
        <Tag key={key} className="font-semibold text-foreground scroll-mt-20">
          {renderChildren(node, key)}
        </Tag>
      );
    }
    case 'bulletList':
      return (
        <ul key={key} className="list-disc space-y-1 pl-6 text-slate-700 dark:text-slate-300">
          {renderChildren(node, key)}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} className="list-decimal space-y-1 pl-6 text-slate-700 dark:text-slate-300">
          {renderChildren(node, key)}
        </ol>
      );
    case 'listItem':
      return (
        <li key={key} className="leading-relaxed">
          {renderChildren(node, key)}
        </li>
      );
    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="border-l-4 border-slate-300 pl-4 italic text-slate-600 dark:border-slate-700 dark:text-slate-400"
        >
          {renderChildren(node, key)}
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded-lg bg-slate-100 p-4 text-sm dark:bg-slate-800"
        >
          <code>{renderChildren(node, key)}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr key={key} className="my-4 border-slate-200 dark:border-slate-700" />;
    case 'hardBreak':
      return <br key={key} />;
    case 'image': {
      const src = safeImageSrc(node.attrs?.src);
      if (!src) {
        return null;
      }
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
      // Plain <img>: DB-authored article images have arbitrary external dimensions/hosts
      // that next/image cannot pre-size or allowlist. src is scheme-validated above.
      return (
        <img
          key={key}
          src={src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="max-w-full rounded-lg"
        />
      );
    }
    default:
      return null; // allowlist: drop unknown node types
  }
}

export interface TiptapNodeRendererProps {
  /** Tiptap body nodes (e.g. from `tiptapBodyFromBlocks`). */
  readonly nodes: readonly EditorNode[];
}

/** Render a list of Tiptap body nodes as React. */
export function TiptapNodeRenderer({ nodes }: Readonly<TiptapNodeRendererProps>) {
  return <>{nodes.map((node, i) => renderNode(node, `tt-${i}`))}</>;
}
