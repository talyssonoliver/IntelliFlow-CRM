import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor, JSONContent } from '@tiptap/react';
import {
  RichTextEditor,
  extractSections,
  RICH_TEXT_TOOLBAR_ITEMS,
} from '../src/components/rich-text-editor';

// ProseMirror's EditorView needs a few DOM geometry APIs that jsdom omits.
beforeAll(() => {
  const rect = {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON() {},
  };
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = () =>
    ({ item: () => null, length: 0, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
});

/** Renders the editor and resolves once the underlying Tiptap instance is ready. */
async function renderEditor(props: Partial<React.ComponentProps<typeof RichTextEditor>> = {}) {
  let editor: Editor | undefined;
  const onCreate = vi.fn((e: Editor) => {
    editor = e;
  });
  const utils = render(<RichTextEditor onCreate={onCreate} {...props} />);
  await waitFor(() => expect(editor).toBeDefined());
  return { ...utils, editor: editor as Editor, onCreate };
}

describe('extractSections', () => {
  it('returns [] for empty / null docs', () => {
    expect(extractSections(null)).toEqual([]);
    expect(extractSections(undefined)).toEqual([]);
    expect(extractSections({ type: 'doc', content: [] })).toEqual([]);
    expect(extractSections({ type: 'doc' })).toEqual([]);
  });

  it('puts content before the first heading into an intro section (level 0)', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Intro line' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second intro' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
      ],
    };
    const sections = extractSections(doc);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ id: 'introduction', level: 0, title: '' });
    expect(sections[0].content).toHaveLength(2);
    expect(sections[1]).toMatchObject({ id: 'first', level: 2, title: 'First' });
    expect(sections[1].content).toHaveLength(1);
  });

  it('slugifies titles, dedupes ids, and defaults blank title/level', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Hello, World!' }],
        },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hello World' }] },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hello World' }] },
        { type: 'heading', content: [] }, // no level attr + empty title
      ],
    };
    const sections = extractSections(doc);
    expect(sections.map((s) => s.id)).toEqual([
      'hello-world',
      'hello-world-2',
      'hello-world-3',
      'section-4',
    ]);
    expect(sections[3].level).toBe(1); // default level when attrs missing
    expect(sections.every((s) => s.content.length === 0)).toBe(true); // consecutive headings
  });

  it('collects nested text for the heading title', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [
            { type: 'text', text: 'A ' },
            { type: 'text', marks: [{ type: 'bold' }], text: 'bold' },
            { type: 'hardBreak' }, // node with neither text nor content
            { type: 'text', text: 'title' },
          ],
        },
      ],
    };
    expect(extractSections(doc)[0].title).toBe('A boldtitle');
  });
});

describe('RICH_TEXT_TOOLBAR_ITEMS', () => {
  it('covers every required capability', () => {
    const labels = RICH_TEXT_TOOLBAR_ITEMS.map((i) => i.label);
    for (const required of [
      'Bold',
      'Italic',
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Bullet list',
      'Numbered list',
      'Link',
      'Image',
      'Code block',
      'Undo',
      'Redo',
    ]) {
      expect(labels).toContain(required);
    }
  });

  it('only uses Material Symbols ligature names (no JSX icon imports)', () => {
    for (const item of RICH_TEXT_TOOLBAR_ITEMS) {
      expect(item.icon).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

describe('<RichTextEditor /> rendering', () => {
  it('mounts the editor + toolbar when editable and applies className', async () => {
    const { container } = await renderEditor({ value: '<p>Hello</p>', className: 'custom-x' });
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
    expect(container.querySelector('.rich-text-editor')).toHaveClass('custom-x');
  });

  it('accepts a JSON document as value and uses a custom aria-label', async () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'From JSON' }] }],
    };
    await renderEditor({ value: doc, ariaLabel: 'Article body' });
    expect(screen.getByRole('textbox', { name: 'Article body' })).toBeInTheDocument();
    expect(screen.getByText('From JSON')).toBeInTheDocument();
  });

  it('hides the toolbar and is read-only when editable={false}, then re-enables', async () => {
    const { editor, rerender } = await renderEditor({ value: '<p>Read</p>', editable: false });
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(editor.isEditable).toBe(false);

    rerender(<RichTextEditor value="<p>Read</p>" editable onCreate={() => {}} />);
    await waitFor(() => expect(editor.isEditable).toBe(true));
  });
});

describe('<RichTextEditor /> change callbacks', () => {
  it('emits onChange + onSectionsChange when the document changes', async () => {
    const onChange = vi.fn();
    const onSectionsChange = vi.fn();
    const { editor } = await renderEditor({ onChange, onSectionsChange });

    await act(async () => {
      editor.chain().setContent('<h2>Title</h2><p>Body</p>').insertContent(' more').run();
    });

    expect(onChange).toHaveBeenCalled();
    const lastDoc = onChange.mock.calls.at(-1)?.[0] as JSONContent;
    expect(lastDoc.type).toBe('doc');
    const sections = onSectionsChange.mock.calls.at(-1)?.[0];
    expect(sections[0]).toMatchObject({ level: 2, title: 'Title' });
  });
});

describe('<RichTextEditor /> formatting commands', () => {
  it('fires every toolbar command without error (covers all run handlers)', async () => {
    const user = userEvent.setup();
    const { editor } = await renderEditor({
      value: '<p>Hello</p>',
      promptForImage: () => null,
      promptForLink: () => null,
    });

    for (const item of RICH_TEXT_TOOLBAR_ITEMS) {
      act(() => {
        editor.chain().setContent('<p>Hello</p>').selectAll().run();
      });
      await user.click(screen.getByLabelText(item.label));
      // The command ran (possibly a no-op for undo/redo); the editor is intact.
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    }
  });

  it('toggles bold and italic marks over the selection', async () => {
    const user = userEvent.setup();
    const { editor } = await renderEditor({ value: '<p>Hello</p>' });
    act(() => {
      editor.chain().selectAll().run();
    });

    await user.click(screen.getByLabelText('Bold'));
    await waitFor(() => expect(editor.isActive('bold')).toBe(true));
    await user.click(screen.getByLabelText('Italic'));
    await waitFor(() => expect(editor.isActive('italic')).toBe(true));

    // Toggling Bold again removes it (covers the inactive→active→inactive path).
    await user.click(screen.getByLabelText('Bold'));
    await waitFor(() => expect(editor.isActive('bold')).toBe(false));
  });

  it('supports undo then redo after an edit', async () => {
    const user = userEvent.setup();
    const { editor } = await renderEditor({ value: '<p>start</p>' });
    act(() => {
      editor.chain().selectAll().insertContent(' added').run();
    });
    const undo = screen.getByLabelText('Undo');
    const redo = screen.getByLabelText('Redo');
    await waitFor(() => expect(undo).not.toBeDisabled());
    expect(redo).toBeDisabled();

    await user.click(undo);
    await waitFor(() => expect(editor.can().undo()).toBe(false));

    // Undo makes redo available — exercises the Redo command handler.
    await waitFor(() => expect(redo).not.toBeDisabled());
    await user.click(redo);
    await waitFor(() => expect(editor.can().redo()).toBe(false));
  });
});

describe('<RichTextEditor /> link button', () => {
  it('sets a link from the prompt over a selection', async () => {
    const user = userEvent.setup();
    const promptForLink = vi.fn(() => 'https://example.com');
    const { editor } = await renderEditor({ value: '<p>linkme</p>', promptForLink });
    act(() => {
      editor.chain().selectAll().run();
    });
    await user.click(screen.getByLabelText('Link'));
    await waitFor(() => expect(editor.getHTML()).toContain('href="https://example.com"'));
    expect(promptForLink).toHaveBeenCalledWith('');
  });

  it('removes the link when the button is pressed while a link is active', async () => {
    const user = userEvent.setup();
    const { editor } = await renderEditor({ value: '<p><a href="https://x.dev">x</a></p>' });
    act(() => {
      editor.chain().selectAll().run();
    });
    await waitFor(() => expect(editor.isActive('link')).toBe(true));
    await user.click(screen.getByLabelText('Link'));
    await waitFor(() => expect(editor.getHTML()).not.toContain('href'));
  });

  it('does nothing when the prompt is cancelled (null)', async () => {
    const user = userEvent.setup();
    const promptForLink = vi.fn(() => null);
    const { editor } = await renderEditor({ value: '<p>nolink</p>', promptForLink });
    act(() => {
      editor.chain().selectAll().run();
    });
    await user.click(screen.getByLabelText('Link'));
    expect(promptForLink).toHaveBeenCalled();
    expect(editor.getHTML()).not.toContain('href');
  });

  it('removes the link when the prompt returns an empty string', async () => {
    const user = userEvent.setup();
    const promptForLink = vi.fn(() => '');
    const { editor } = await renderEditor({ value: '<p>plain</p>', promptForLink });
    act(() => {
      editor.chain().selectAll().run();
    });
    await user.click(screen.getByLabelText('Link'));
    expect(editor.getHTML()).not.toContain('href');
  });

  it('falls back to window.prompt when no promptForLink is provided', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('https://default.dev');
    const { editor } = await renderEditor({ value: '<p>dft</p>' });
    act(() => {
      editor.chain().selectAll().run();
    });
    await user.click(screen.getByLabelText('Link'));
    await waitFor(() => expect(editor.getHTML()).toContain('href="https://default.dev"'));
    expect(promptSpy).toHaveBeenCalled();
    promptSpy.mockRestore();
  });
});

describe('<RichTextEditor /> image button', () => {
  it('inserts an image from the prompt', async () => {
    const user = userEvent.setup();
    const promptForImage = vi.fn(() => 'https://img.dev/p.png');
    const { editor } = await renderEditor({ value: '<p>x</p>', promptForImage });
    await user.click(screen.getByLabelText('Image'));
    await waitFor(() => expect(editor.getHTML()).toContain('src="https://img.dev/p.png"'));
  });

  it('does nothing when the image prompt is cancelled', async () => {
    const user = userEvent.setup();
    const promptForImage = vi.fn(() => null);
    const { editor } = await renderEditor({ value: '<p>x</p>', promptForImage });
    await user.click(screen.getByLabelText('Image'));
    expect(promptForImage).toHaveBeenCalled();
    expect(editor.getHTML()).not.toContain('<img');
  });

  it('falls back to window.prompt for images', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('https://img.dev/d.png');
    const { editor } = await renderEditor({ value: '<p>x</p>' });
    await user.click(screen.getByLabelText('Image'));
    await waitFor(() => expect(editor.getHTML()).toContain('src="https://img.dev/d.png"'));
    promptSpy.mockRestore();
  });
});
