/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  slugify,
  estimateReadTime,
  plainTextFromDoc,
  tiptapBodyFromBlocks,
  legacyBlocksToNodes,
  docToSections,
  sectionsToDoc,
  type EditorNode,
} from '../article-editor-mapping';

const EDITOR_BLOCK = 'tiptapDoc';
function editorBlocks(...nodes: EditorNode[]): EditorNode[] {
  return [{ type: EDITOR_BLOCK, content: nodes }];
}

function heading(text: string, level = 2): EditorNode {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}
function para(text: string): EditorNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}
function doc(...nodes: EditorNode[]): EditorNode {
  return { type: 'doc', content: nodes };
}

describe('slugify', () => {
  it('produces kebab-case from arbitrary text', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('  Getting   Started  ')).toBe('getting-started');
    expect(slugify('A/B & C')).toBe('a-b-c');
  });

  it('strips leading and trailing separators', () => {
    expect(slugify('---Edge---')).toBe('edge');
    expect(slugify('!!!')).toBe('');
  });
});

describe('estimateReadTime', () => {
  it('returns at least 1 minute for empty or short content', () => {
    expect(estimateReadTime(null)).toBe(1);
    expect(estimateReadTime(doc(para('a few words here')))).toBe(1);
  });

  it('scales with word count at ~200 wpm', () => {
    const words = Array.from({ length: 450 }, (_, i) => `word${i}`).join(' ');
    expect(estimateReadTime(doc(para(words)))).toBe(3); // ceil(450/200)
  });

  it('clamps to a maximum of 60 minutes', () => {
    const words = Array.from({ length: 20000 }, (_, i) => `w${i}`).join(' ');
    expect(estimateReadTime(doc(para(words)))).toBe(60);
  });
});

describe('plainTextFromDoc', () => {
  it('joins block text across the document', () => {
    expect(plainTextFromDoc(doc(heading('Title'), para('Body text')))).toBe('Title\nBody text');
  });
  it('returns empty string for nullish docs', () => {
    expect(plainTextFromDoc(undefined)).toBe('');
  });

  it('separates nested block items but concatenates inline marks within a line', () => {
    const list: EditorNode = {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [para('First')] },
        { type: 'listItem', content: [para('Second')] },
      ],
    };
    expect(plainTextFromDoc(doc(list))).toBe('First\nSecond');

    // adjacent inline text nodes (e.g. a bold run splits the text) must NOT
    // gain a space between them
    const marked: EditorNode = {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'intelli' },
        { type: 'text', text: 'Flow' },
      ],
    };
    expect(plainTextFromDoc(doc(marked))).toBe('intelliFlow');
  });
});

describe('estimateReadTime counts nested list words correctly', () => {
  it('does not fuse list items into a single word', () => {
    const words = Array.from({ length: 400 }, (_, i) => `w${i}`);
    const list: EditorNode = {
      type: 'orderedList',
      content: words.map((w) => ({ type: 'listItem', content: [para(w)] })),
    };
    // 400 distinct words / 200 wpm => 2 minutes (would be 1 if fused)
    expect(estimateReadTime(doc(list))).toBe(2);
  });
});

describe('tiptapBodyFromBlocks', () => {
  it('extracts the body nodes from the editor wrapper', () => {
    expect(tiptapBodyFromBlocks(editorBlocks(para('hi'), heading('h')))).toEqual([
      para('hi'),
      heading('h'),
    ]);
  });
  it('returns null for non-wrapper / legacy ContentBlocks / empty / non-array', () => {
    expect(tiptapBodyFromBlocks([])).toBeNull();
    expect(tiptapBodyFromBlocks(null)).toBeNull();
    expect(tiptapBodyFromBlocks([para('bare')])).toBeNull(); // not wrapped
    expect(tiptapBodyFromBlocks([{ type: 'paragraph', text: 'legacy' }])).toBeNull();
    expect(tiptapBodyFromBlocks([{ type: 'steps', items: ['a', 'b'] }])).toBeNull();
    expect(tiptapBodyFromBlocks([{ type: 'tiptapDoc', content: 'not-array' }])).toBeNull();
  });
});

describe('legacyBlocksToNodes', () => {
  it('returns null for non-array, empty, or unrecognised block arrays', () => {
    expect(legacyBlocksToNodes(null)).toBeNull();
    expect(legacyBlocksToNodes([])).toBeNull();
    expect(legacyBlocksToNodes([{ type: 'tiptapDoc', content: [] }])).toBeNull();
    expect(legacyBlocksToNodes([{ type: 'unknown' }])).toBeNull();
  });

  it('drops malformed legacy blocks (missing payload) without throwing', () => {
    expect(legacyBlocksToNodes([{ type: 'steps' }, { type: 'tip' }])).toEqual([]);
  });
});

describe('docToSections', () => {
  it('returns [] for an empty document', () => {
    expect(docToSections(doc())).toEqual([]);
    expect(docToSections(null)).toEqual([]);
  });

  it('returns [] for an empty Tiptap document (a single blank paragraph)', () => {
    expect(docToSections(doc({ type: 'paragraph' }))).toEqual([]);
    expect(docToSections(doc(para('')))).toEqual([]);
  });

  it('splits at headings and stores plain-text content + wrapped Tiptap blocks', () => {
    const sections = docToSections(
      doc(heading('Setup'), para('Install the CLI.'), heading('Usage'), para('Run it.'))
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ heading: 'Setup', content: 'Install the CLI.', order: 0 });
    expect(sections[0].blocks).toEqual(editorBlocks(para('Install the CLI.')));
    expect(sections[1]).toMatchObject({ heading: 'Usage', content: 'Run it.', order: 1 });
  });

  it('keeps an image-only section (meaningful body without text)', () => {
    const image: EditorNode = { type: 'image', attrs: { src: 'https://x/y.png' } };
    const sections = docToSections(doc(heading('Shot'), image));
    expect(sections).toHaveLength(1);
    expect(sections[0].blocks).toEqual(editorBlocks(image));
  });

  it('wraps pre-heading content in an Introduction section', () => {
    const sections = docToSections(doc(para('Intro line.'), heading('Next'), para('More.')));
    expect(sections[0].heading).toBe('Introduction');
    expect(sections[0].content).toBe('Intro line.');
    expect(sections[1].heading).toBe('Next');
  });

  it('falls back content to the heading for a heading with an empty body', () => {
    const sections = docToSections(doc(heading('Empty Section')));
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ heading: 'Empty Section', content: 'Empty Section' });
    expect(sections[0].blocks).toBeUndefined();
  });
});

describe('sectionsToDoc', () => {
  it('reconstructs heading nodes followed by the wrapped Tiptap body', () => {
    const reconstructed = sectionsToDoc([
      {
        heading: 'Setup',
        content: 'Install the CLI.',
        blocks: editorBlocks(para('Install the CLI.')),
      },
    ]);
    expect(reconstructed.type).toBe('doc');
    expect(reconstructed.content?.[0]).toMatchObject({ type: 'heading' });
    expect(reconstructed.content?.[1]).toEqual(para('Install the CLI.'));
  });

  it('converts legacy ContentBlocks to the nearest editor nodes', () => {
    const reconstructed = sectionsToDoc([
      {
        heading: 'Guide',
        content: 'plain text fallback',
        blocks: [
          { type: 'paragraph', text: 'Intro line.' },
          { type: 'steps', items: ['First', 'Second'] },
          { type: 'tip', text: 'Be careful.' },
          { type: 'nav-path', path: ['Settings', 'Help'] },
        ],
      },
    ]);
    expect(reconstructed.content).toEqual([
      heading('Guide'),
      para('Intro line.'),
      {
        type: 'orderedList',
        content: [
          { type: 'listItem', content: [para('First')] },
          { type: 'listItem', content: [para('Second')] },
        ],
      },
      { type: 'blockquote', content: [para('Be careful.')] },
      para('Settings › Help'),
    ]);
  });

  it('falls back to content paragraphs for an unrecognised blocks array', () => {
    const reconstructed = sectionsToDoc([
      { heading: 'Odd', content: 'Body line.', blocks: [{ type: 'mystery-widget' }] },
    ]);
    expect(reconstructed.content).toEqual([heading('Odd'), para('Body line.')]);
  });

  it('omits a duplicate body paragraph for a heading-only section (no stored blocks)', () => {
    const reconstructed = sectionsToDoc([{ heading: 'Solo', content: 'Solo' }]);
    expect(reconstructed.content).toEqual([heading('Solo')]);
  });

  it('round-trips doc → sections → doc stably (second pass is identity)', () => {
    const original = doc(heading('A'), para('alpha'), heading('B'), para('beta'));
    const sections = docToSections(original);
    const rebuilt = sectionsToDoc(sections);
    expect(docToSections(rebuilt)).toEqual(sections);
  });
});
