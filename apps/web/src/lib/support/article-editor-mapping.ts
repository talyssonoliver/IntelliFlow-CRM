/**
 * Article Editor ↔ DB mapping (PG-181)
 *
 * Pure, framework-free helpers that translate between the Tiptap editor document
 * (`RichTextEditor` JSON) and the `helpArticle` router's section input shape
 * (`{ heading, content, blocks?, order }`). Kept dependency-free so it is unit
 * testable in a Node environment and reusable by both the create and edit flows.
 *
 * Storage contract for editor-authored articles:
 *  - The Tiptap doc is split at top-level headings into ordered sections.
 *  - `heading`  = the heading text (pre-heading content becomes an
 *                 `Introduction` section so every section has a TOC entry).
 *  - `content`  = plain text of the section body (search + public-renderer
 *                 fallback); never empty (falls back to the heading).
 *  - `blocks`   = the section's Tiptap body nodes, so the editor round-trips
 *                 with full formatting fidelity.
 *
 * The reverse (`sectionsToDoc`) reconstructs a Tiptap doc. Legacy seeded
 * articles whose `blocks` are typed ContentBlocks (not Tiptap nodes) degrade
 * gracefully to a single paragraph built from `content`.
 */

/**
 * Structural mirror of the Tiptap `JSONContent` fields this module reads
 * (avoids a direct `@tiptap/*` dependency in the app layer). Kept assignable to
 * `JSONContent` in both directions so the `RichTextEditor` value/onChange
 * boundary needs no cast.
 */
export interface EditorNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
}

/** The section shape accepted by `helpArticle.create` / `update`. */
export interface DbSectionInput {
  heading: string;
  content: string;
  blocks?: unknown;
  order: number;
}

const INTRO_HEADING = 'Introduction';
const WORDS_PER_MINUTE = 200;
const MAX_READ_TIME = 60;

/** Convert arbitrary text to a kebab-case slug (`a-z0-9-` only). */
export function slugify(text: string): string {
  // The `[^a-z0-9]+` pass already collapses runs to a single `-`, so at most one
  // leading/trailing hyphen remains — strip a single one each (no quantifier,
  // so no backtracking risk).
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
}

/** Inline node types whose text concatenates directly (no separator). */
const INLINE_TYPES = new Set(['text', 'hardBreak']);

/**
 * Recursively collect the plain text of a node and its descendants. Inline
 * children (text/hardBreak) concatenate directly so marks like bold don't split
 * a word; block children (paragraphs, list items, etc.) are separated by a
 * newline so e.g. list items don't fuse into `FirstSecond`.
 */
function nodeText(node: EditorNode): string {
  if (typeof node.text === 'string') {
    return node.text;
  }
  if (node.type === 'hardBreak') {
    return '\n';
  }
  const children = node.content ?? [];
  if (children.length === 0) {
    return '';
  }
  const allInline = children.every((child) => !!child.type && INLINE_TYPES.has(child.type));
  return children.map(nodeText).join(allInline ? '' : '\n');
}

/** Join the plain text of a list of block nodes, one block per line. */
function plainTextFromNodes(nodes: EditorNode[]): string {
  return nodes
    .map(nodeText)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}

/** Plain text of an entire editor document (used for read-time estimation). */
export function plainTextFromDoc(doc: EditorNode | null | undefined): string {
  return plainTextFromNodes(doc?.content ?? []);
}

/** Estimate read time in minutes (~200 wpm), clamped to the schema range 1–60. */
export function estimateReadTime(doc: EditorNode | null | undefined): number {
  const text = plainTextFromDoc(doc);
  const words = text.split(/\s+/).filter((w) => w.length > 0).length;
  if (words === 0) {
    return 1;
  }
  return Math.min(MAX_READ_TIME, Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)));
}

/**
 * Editor-authored bodies are persisted as a SINGLE namespaced wrapper node in
 * `ArticleSection.blocks` — `[{ type: 'tiptapDoc', content: <Tiptap nodes> }]` —
 * so they are unmistakable from the legacy `ContentBlock` union
 * (`paragraph`/`steps`/`tip`/`warning`/`info`/`nav-path`) that seed data and the
 * static public renderer use. A reader branches on `blocks[0].type === 'tiptapDoc'`;
 * anything else is legacy and is not replayed into the editor verbatim.
 */
const EDITOR_BLOCK_TYPE = 'tiptapDoc';

/** Block node types that carry meaning without any text (e.g. an image). */
const VOID_BLOCK_TYPES = new Set(['image', 'horizontalRule']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extract the editor body nodes from a stored `blocks` value, or `null` when the
 * value is not the editor wrapper (legacy ContentBlocks, empty, or absent).
 */
export function tiptapBodyFromBlocks(blocks: unknown): EditorNode[] | null {
  if (!Array.isArray(blocks) || blocks.length !== 1) {
    return null;
  }
  const [wrapper] = blocks;
  if (isRecord(wrapper) && wrapper.type === EDITOR_BLOCK_TYPE && Array.isArray(wrapper.content)) {
    return wrapper.content as EditorNode[];
  }
  return null;
}

/** True when a section body carries something worth persisting. */
function hasMeaningfulBody(content: string, body: EditorNode[]): boolean {
  return content.length > 0 || body.some((node) => !!node.type && VOID_BLOCK_TYPES.has(node.type));
}

function buildSection(
  headingText: string,
  body: EditorNode[],
  order: number
): DbSectionInput | null {
  const content = plainTextFromNodes(body);
  const hasBody = hasMeaningfulBody(content, body);
  const heading = headingText.trim() || (hasBody ? INTRO_HEADING : '');
  if (!heading && !hasBody) {
    return null; // truly empty (e.g. a blank Tiptap paragraph) — drop it
  }
  const safeHeading = heading || INTRO_HEADING;
  return {
    heading: safeHeading,
    content: content || safeHeading, // schema requires a non-empty content
    ...(hasBody ? { blocks: [{ type: EDITOR_BLOCK_TYPE, content: body }] } : {}),
    order,
  };
}

/**
 * Split a Tiptap document into ordered DB sections at top-level heading
 * boundaries. Returns `[]` for an empty document (the caller treats that as a
 * validation error — the schema requires ≥1 section).
 */
export function docToSections(doc: EditorNode | null | undefined): DbSectionInput[] {
  const top = doc?.content ?? [];
  const sections: DbSectionInput[] = [];
  let headingText = '';
  let body: EditorNode[] = [];
  let started = false;

  const flush = (): void => {
    if (!started) {
      return;
    }
    const section = buildSection(headingText, body, sections.length);
    if (section) {
      sections.push(section);
    }
  };

  for (const node of top) {
    if (node.type === 'heading') {
      flush();
      headingText = nodeText(node);
      body = [];
      started = true;
    } else {
      body.push(node);
      started = true;
    }
  }
  flush();

  return sections;
}

/** A single editor paragraph node wrapping a line of plain text. */
function paragraph(text: string): EditorNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function blockquote(text: string): EditorNode {
  return { type: 'blockquote', content: [paragraph(text)] };
}

function orderedList(items: string[]): EditorNode {
  return {
    type: 'orderedList',
    content: items.map((text) => ({ type: 'listItem', content: [paragraph(text)] })),
  };
}

/** The legacy `ContentBlock` discriminator types the static renderer understands. */
const CONTENT_BLOCK_TYPES = new Set(['paragraph', 'steps', 'tip', 'warning', 'info', 'nav-path']);

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Convert one legacy `ContentBlock` into the closest StarterKit editor node(s).
 * StarterKit has no callout/steps/nav-path primitives, so this is a faithful but
 * lossy mapping that preserves the text and a sensible structure:
 *  - `steps`            → ordered list
 *  - `tip`/`warning`/`info` → blockquote (the callout text survives)
 *  - `nav-path`         → a single breadcrumb paragraph
 *  - `paragraph`        → paragraph
 */
function legacyBlockToNodes(block: Record<string, unknown>): EditorNode[] {
  switch (block.type) {
    case 'steps': {
      const items = stringArray(block.items);
      return items.length > 0 ? [orderedList(items)] : [];
    }
    case 'nav-path': {
      const path = stringArray(block.path);
      return path.length > 0 ? [paragraph(path.join(' › '))] : [];
    }
    case 'tip':
    case 'warning':
    case 'info':
      return typeof block.text === 'string' ? [blockquote(block.text)] : [];
    case 'paragraph':
      return typeof block.text === 'string' ? [paragraph(block.text)] : [];
    default:
      return [];
  }
}

/**
 * Convert a stored legacy `ContentBlock[]` (seed data) into editor nodes, or
 * `null` when `blocks` is not a recognised ContentBlock array. This keeps a
 * no-op open→save of a seeded article from collapsing its structured blocks to
 * bare text — they become the nearest editable Tiptap nodes instead.
 */
export function legacyBlocksToNodes(blocks: unknown): EditorNode[] | null {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return null;
  }
  const allKnown = blocks.every(
    (b) => isRecord(b) && typeof b.type === 'string' && CONTENT_BLOCK_TYPES.has(b.type)
  );
  if (!allKnown) {
    return null;
  }
  return blocks.flatMap((b) => legacyBlockToNodes(b as Record<string, unknown>));
}

function headingNode(text: string): EditorNode {
  return { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] };
}

/** Reconstruct the editor body nodes for one stored section (heading excluded). */
function sectionBodyNodes(
  section: Pick<DbSectionInput, 'heading' | 'content' | 'blocks'>,
  heading: string
): EditorNode[] {
  // Editor-authored wrapper → replay verbatim.
  const editorBody = tiptapBodyFromBlocks(section.blocks);
  if (editorBody) {
    return editorBody;
  }

  // Legacy seeded ContentBlocks → convert to the nearest editor nodes so a no-op
  // open→save preserves the structure (steps/callouts/nav-path) rather than
  // flattening it to bare text.
  const legacyNodes = legacyBlocksToNodes(section.blocks);
  if (legacyNodes && legacyNodes.length > 0) {
    return legacyNodes;
  }

  // No recognised blocks. Render `content` as paragraphs when the section
  // genuinely had a body (a non-empty but unrecognised `blocks` array, or a
  // content-only section). A heading-only section stores `content` equal to its
  // heading as a schema placeholder — skip that so we don't emit a duplicate
  // paragraph. We key off blocks-presence rather than text equality so a
  // legitimate body that happens to equal the heading is not dropped.
  const hasStoredBody = Array.isArray(section.blocks) && section.blocks.length > 0;
  const bodyText = section.content.trim();
  if (!bodyText || (!hasStoredBody && bodyText === heading)) {
    return [];
  }
  return bodyText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(paragraph);
}

/**
 * Reconstruct a Tiptap document from stored DB sections for editing. Each
 * section yields a level-2 heading node followed by its body: the stored Tiptap
 * `blocks` when present, otherwise paragraphs derived from `content` (covers
 * legacy ContentBlock data and content-only sections).
 */
export function sectionsToDoc(
  sections: ReadonlyArray<Pick<DbSectionInput, 'heading' | 'content' | 'blocks'>>
): EditorNode {
  const content: EditorNode[] = [];

  for (const section of sections) {
    const heading = section.heading.trim();
    if (heading) {
      content.push(headingNode(heading));
    }
    content.push(...sectionBodyNodes(section, heading));
  }

  return { type: 'doc', content };
}
