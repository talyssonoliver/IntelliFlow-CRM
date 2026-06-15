'use client';

import * as React from 'react';
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// Structured sections (pure, framework-free)
// ---------------------------------------------------------------------------

/**
 * A structured section of editor content, split at heading boundaries. Useful
 * for building a table of contents or persisting an article as ordered blocks.
 */
export interface RichTextSection {
  /** Stable slug derived from the heading title (or `section-N` when empty). */
  id: string;
  /** Heading level (1–6). `0` for the intro block before the first heading. */
  level: number;
  /** Plain-text heading title. Empty string for the intro block. */
  title: string;
  /** Top-level nodes belonging to this section (the heading itself excluded). */
  content: JSONContent[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // collapse every non-alphanumeric run to one dash
    .replace(/^-/, '') // strip a single leading dash (runs already collapsed)
    .replace(/-$/, ''); // strip a single trailing dash
}

/** Recursively collects the plain text of a node and its descendants. */
function nodeText(node: JSONContent): string {
  if (typeof node.text === 'string') {
    return node.text;
  }
  if (!node.content) {
    return '';
  }
  return node.content.map(nodeText).join('');
}

/**
 * Splits a Tiptap/ProseMirror document into ordered sections at heading
 * boundaries. Content before the first heading becomes an intro section
 * (level 0, empty title). Pure — safe to call on `editor.getJSON()`.
 */
export function extractSections(doc: JSONContent | null | undefined): RichTextSection[] {
  const top = doc?.content ?? [];
  const sections: RichTextSection[] = [];
  const usedIds = new Set<string>();
  let current: RichTextSection | null = null;

  const makeId = (base: string): string => {
    const root = base || `section-${sections.length + 1}`;
    let id = root;
    let n = 2;
    while (usedIds.has(id)) {
      id = `${root}-${n}`;
      n += 1;
    }
    usedIds.add(id);
    return id;
  };

  const flush = (): void => {
    if (current) {
      sections.push(current);
      current = null;
    }
  };

  for (const node of top) {
    if (node.type === 'heading') {
      flush();
      const title = nodeText(node).trim();
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1;
      current = { id: makeId(slugify(title)), level, title, content: [] };
    } else {
      if (!current) {
        current = { id: makeId('introduction'), level: 0, title: '', content: [] };
      }
      current.content.push(node);
    }
  }
  flush();

  return sections;
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

interface ToolbarContext {
  promptForLink: (currentUrl: string) => string | null;
  promptForImage: () => string | null;
}

interface ToolbarItem {
  /** Accessible label + React key. */
  label: string;
  /** Material Symbols Outlined ligature name. */
  icon: string;
  /** Whether the mark/node is active for the current selection. */
  isActive?: (editor: Editor) => boolean;
  /** Whether the command is currently unavailable (renders disabled). */
  isDisabled?: (editor: Editor) => boolean;
  /** Apply the command. */
  run: (editor: Editor, ctx: ToolbarContext) => void;
}

function runLink(editor: Editor, ctx: ToolbarContext): void {
  if (editor.isActive('link')) {
    editor.chain().focus().unsetLink().run();
    return;
  }
  const previousUrl = (editor.getAttributes('link').href as string | undefined) ?? '';
  const url = ctx.promptForLink(previousUrl);
  if (url === null) {
    return;
  }
  if (url === '') {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().setLink({ href: url }).run();
}

function runImage(editor: Editor, ctx: ToolbarContext): void {
  const url = ctx.promptForImage();
  if (!url) {
    return;
  }
  editor.chain().focus().setImage({ src: url }).run();
}

/**
 * The default toolbar actions, exported so consumers (e.g. PG-181) can build a
 * custom toolbar against the same command set.
 */
export const RICH_TEXT_TOOLBAR_ITEMS: readonly ToolbarItem[] = [
  {
    label: 'Bold',
    icon: 'format_bold',
    isActive: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    label: 'Italic',
    icon: 'format_italic',
    isActive: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    label: 'Heading 1',
    icon: 'format_h1',
    isActive: (e) => e.isActive('heading', { level: 1 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    label: 'Heading 2',
    icon: 'format_h2',
    isActive: (e) => e.isActive('heading', { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'Heading 3',
    icon: 'format_h3',
    isActive: (e) => e.isActive('heading', { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: 'Bullet list',
    icon: 'format_list_bulleted',
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: 'Numbered list',
    icon: 'format_list_numbered',
    isActive: (e) => e.isActive('orderedList'),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: 'Code block',
    icon: 'code',
    isActive: (e) => e.isActive('codeBlock'),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    label: 'Link',
    icon: 'link',
    isActive: (e) => e.isActive('link'),
    run: runLink,
  },
  {
    label: 'Image',
    icon: 'image',
    run: runImage,
  },
  {
    label: 'Undo',
    icon: 'undo',
    isDisabled: (e) => !e.can().undo(),
    run: (e) => e.chain().focus().undo().run(),
  },
  {
    label: 'Redo',
    icon: 'redo',
    isDisabled: (e) => !e.can().redo(),
    run: (e) => e.chain().focus().redo().run(),
  },
];

function RichTextToolbar({
  editor,
  ctx,
}: {
  editor: Editor;
  ctx: ToolbarContext;
}): React.JSX.Element {
  // Tiptap v3's useEditor no longer re-renders on every transaction; subscribe
  // to the derived active/disabled state so the toolbar stays in sync.
  const states = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      RICH_TEXT_TOOLBAR_ITEMS.map((item) => ({
        active: item.isActive ? item.isActive(e) : false,
        disabled: item.isDisabled ? item.isDisabled(e) : false,
      })),
  });

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-1 border-b border-border p-1"
    >
      {RICH_TEXT_TOOLBAR_ITEMS.map((item, index) => {
        const { active, disabled } = states?.[index] ?? { active: false, disabled: false };
        return (
          <button
            key={item.label}
            type="button"
            aria-label={item.label}
            aria-pressed={item.isActive ? active : undefined}
            data-active={active ? '' : undefined}
            disabled={disabled}
            onClick={() => item.run(editor, ctx)}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50',
              active && 'bg-accent text-accent-foreground'
            )}
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              {item.icon}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const defaultPromptForLink = (currentUrl: string): string | null =>
  typeof window !== 'undefined' ? window.prompt('Enter the URL', currentUrl) : null;

const defaultPromptForImage = (): string | null =>
  typeof window !== 'undefined' ? window.prompt('Enter the image URL', '') : null;

export interface RichTextEditorProps {
  /**
   * Initial content as Tiptap JSON or an HTML string. The editor is uncontrolled
   * after mount; to reset content, change the React `key` to remount.
   */
  value?: JSONContent | string | null;
  /** Fired with the editor JSON on every content change. */
  onChange?: (content: JSONContent) => void;
  /** Fired with the heading-split sections on every content change. */
  onSectionsChange?: (sections: RichTextSection[]) => void;
  /** Fired once when the editor instance is ready (for custom toolbars/commands). */
  onCreate?: (editor: Editor) => void;
  /** When false, hides the toolbar and makes the content read-only. Defaults to true. */
  editable?: boolean;
  /** Accessible label for the editing region. */
  ariaLabel?: string;
  /** Extra class names for the wrapper element. */
  className?: string;
  /** Resolve a URL for the link button. Return null to cancel, '' to remove. */
  promptForLink?: (currentUrl: string) => string | null;
  /** Resolve a URL for the image button. Return null/empty to cancel. */
  promptForImage?: () => string | null;
}

/**
 * A reusable rich-text editor built on Tiptap. Supports headings, bold, italic,
 * bullet/numbered lists, links, images and code blocks, and emits both the raw
 * editor JSON (`onChange`) and heading-split structured sections
 * (`onSectionsChange`). Icons use Material Symbols Outlined.
 */
export function RichTextEditor({
  value = null,
  onChange,
  onSectionsChange,
  onCreate,
  editable = true,
  ariaLabel = 'Rich text editor',
  className,
  promptForLink = defaultPromptForLink,
  promptForImage = defaultPromptForImage,
}: RichTextEditorProps): React.JSX.Element {
  const ctx = React.useMemo<ToolbarContext>(
    () => ({ promptForLink, promptForImage }),
    [promptForLink, promptForImage]
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    content: value ?? '',
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': ariaLabel,
        class:
          'rich-text-editor__content min-h-[12rem] max-w-none px-3 py-2 focus:outline-none prose prose-sm dark:prose-invert',
      },
    },
    onCreate: ({ editor: created }) => {
      onCreate?.(created);
    },
    onUpdate: ({ editor: updated }) => {
      const json = updated.getJSON();
      onChange?.(json);
      onSectionsChange?.(extractSections(json));
    },
  });

  // Keep the editor's editable state in sync with the prop.
  React.useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  return (
    <div
      className={cn('rich-text-editor rounded-md border border-input bg-background', className)}
      data-editable={editable}
    >
      {editable && editor ? <RichTextToolbar editor={editor} ctx={ctx} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}
