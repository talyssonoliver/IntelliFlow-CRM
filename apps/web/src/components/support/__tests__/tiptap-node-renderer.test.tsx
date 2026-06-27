import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TiptapNodeRenderer, safeImageSrc, safeHref } from '../tiptap-node-renderer';
import type { EditorNode } from '@/lib/support/article-editor-mapping';

function renderNodes(nodes: EditorNode[]) {
  return render(<TiptapNodeRenderer nodes={nodes} />);
}

const text = (value: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>) =>
  ({ type: 'text', text: value, ...(marks ? { marks } : {}) }) as unknown as EditorNode;

const para = (value: string) => ({ type: 'paragraph', content: [text(value)] }) as EditorNode;

describe('TiptapNodeRenderer — node types', () => {
  it('renders a paragraph as <p>', () => {
    const { container } = renderNodes([para('Hello world')]);
    const p = container.querySelector('p');
    expect(p).toBeInTheDocument();
    expect(p).toHaveTextContent('Hello world');
  });

  it('offsets heading level 1 and 2 to <h3>', () => {
    const { container } = renderNodes([
      { type: 'heading', attrs: { level: 1 }, content: [text('H1 in body')] } as EditorNode,
      { type: 'heading', attrs: { level: 2 }, content: [text('H2 in body')] } as EditorNode,
    ]);
    const h3s = container.querySelectorAll('h3');
    expect(h3s).toHaveLength(2);
    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('h2')).toBeNull();
  });

  it('maps heading level 3 to <h4> and level 6 to <h6>', () => {
    const { container } = renderNodes([
      { type: 'heading', attrs: { level: 3 }, content: [text('L3')] } as EditorNode,
      { type: 'heading', attrs: { level: 6 }, content: [text('L6')] } as EditorNode,
    ]);
    expect(container.querySelector('h4')).toHaveTextContent('L3');
    expect(container.querySelector('h6')).toHaveTextContent('L6');
  });

  it('defaults missing heading level to <h3>', () => {
    const { container } = renderNodes([
      { type: 'heading', content: [text('No level')] } as EditorNode,
    ]);
    expect(container.querySelector('h3')).toHaveTextContent('No level');
  });

  it('renders bulletList as <ul role=list> with <li> children', () => {
    const { container } = renderNodes([
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [para('one')] },
          { type: 'listItem', content: [para('two')] },
        ],
      } as EditorNode,
    ]);
    const ul = container.querySelector('ul');
    expect(ul).toBeInTheDocument();
    expect(ul?.querySelectorAll('li')).toHaveLength(2);
  });

  it('renders orderedList as <ol role=list> with <li> children', () => {
    const { container } = renderNodes([
      {
        type: 'orderedList',
        content: [
          { type: 'listItem', content: [para('first')] },
          { type: 'listItem', content: [para('second')] },
        ],
      } as EditorNode,
    ]);
    const ol = container.querySelector('ol');
    expect(ol).toBeInTheDocument();
    expect(ol?.querySelectorAll('li')).toHaveLength(2);
    expect(ol).toHaveTextContent('first');
  });

  it('renders blockquote as <blockquote>', () => {
    const { container } = renderNodes([
      { type: 'blockquote', content: [para('quoted text')] } as EditorNode,
    ]);
    expect(container.querySelector('blockquote')).toHaveTextContent('quoted text');
  });

  it('renders codeBlock as <pre><code>', () => {
    const { container } = renderNodes([
      { type: 'codeBlock', content: [text('const x = 1;')] } as EditorNode,
    ]);
    const pre = container.querySelector('pre');
    expect(pre).toBeInTheDocument();
    expect(pre?.querySelector('code')).toHaveTextContent('const x = 1;');
  });

  it('renders horizontalRule as <hr>', () => {
    const { container } = renderNodes([{ type: 'horizontalRule' } as EditorNode]);
    expect(container.querySelector('hr')).toBeInTheDocument();
  });

  it('renders hardBreak as <br> inside a paragraph', () => {
    const { container } = renderNodes([
      {
        type: 'paragraph',
        content: [text('line1'), { type: 'hardBreak' } as EditorNode, text('line2')],
      } as EditorNode,
    ]);
    expect(container.querySelector('p br')).toBeInTheDocument();
  });
});

describe('TiptapNodeRenderer — marks', () => {
  it('renders bold as <strong>', () => {
    const { container } = renderNodes([
      { type: 'paragraph', content: [text('bold', [{ type: 'bold' }])] } as EditorNode,
    ]);
    expect(container.querySelector('strong')).toHaveTextContent('bold');
  });

  it('renders italic as <em>', () => {
    const { container } = renderNodes([
      { type: 'paragraph', content: [text('it', [{ type: 'italic' }])] } as EditorNode,
    ]);
    expect(container.querySelector('em')).toHaveTextContent('it');
  });

  it('renders strike as <s>', () => {
    const { container } = renderNodes([
      { type: 'paragraph', content: [text('gone', [{ type: 'strike' }])] } as EditorNode,
    ]);
    expect(container.querySelector('s')).toHaveTextContent('gone');
  });

  it('renders inline code mark as <code>', () => {
    const { container } = renderNodes([
      { type: 'paragraph', content: [text('npm', [{ type: 'code' }])] } as EditorNode,
    ]);
    expect(container.querySelector('code')).toHaveTextContent('npm');
  });

  it('renders combined bold+italic marks (nested)', () => {
    const { container } = renderNodes([
      {
        type: 'paragraph',
        content: [text('both', [{ type: 'bold' }, { type: 'italic' }])],
      } as EditorNode,
    ]);
    expect(container.querySelector('strong em, em strong')).toBeTruthy();
    expect(container).toHaveTextContent('both');
  });

  it('renders a safe link mark as <a rel=noopener noreferrer>', () => {
    const { container } = renderNodes([
      {
        type: 'paragraph',
        content: [text('site', [{ type: 'link', attrs: { href: 'https://example.com' } }])],
      } as EditorNode,
    ]);
    const a = container.querySelector('a');
    expect(a).toHaveAttribute('href', 'https://example.com');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('TiptapNodeRenderer — image', () => {
  it('renders a valid https image with alt, lazy loading and no-referrer', () => {
    const { container } = renderNodes([
      {
        type: 'image',
        attrs: { src: 'https://cdn.example.com/a.png', alt: 'A diagram' },
      } as EditorNode,
    ]);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/a.png');
    expect(img).toHaveAttribute('alt', 'A diagram');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('renders alt="" when image alt is missing (WCAG 1.1.1)', () => {
    const { container } = renderNodes([
      { type: 'image', attrs: { src: '/local/a.png' } } as EditorNode,
    ]);
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt', '');
  });
});

describe('TiptapNodeRenderer — security (SEC-T01..T08)', () => {
  it('SEC-T01: drops an unknown node type (no DOM output)', () => {
    const { container } = renderNodes([
      { type: 'script', content: [text('x')] } as unknown as EditorNode,
    ]);
    expect(container).toBeEmptyDOMElement();
    expect(container.querySelector('script')).toBeNull();
  });

  it('SEC-T02: drops an image with javascript: src', () => {
    const { container } = renderNodes([
      { type: 'image', attrs: { src: 'javascript:alert(1)', alt: 'x' } } as EditorNode,
    ]);
    expect(container.querySelector('img')).toBeNull();
  });

  it('SEC-T03: drops an image with data:text/html src', () => {
    const { container } = renderNodes([
      { type: 'image', attrs: { src: 'data:text/html,<script>alert(1)</script>' } } as EditorNode,
    ]);
    expect(container.querySelector('img')).toBeNull();
  });

  it('SEC-T04: renders script-like text as literal text, not markup', () => {
    const { container } = renderNodes([para('<script>alert(1)</script>')]);
    expect(container.querySelector('script')).toBeNull();
    expect(container).toHaveTextContent('<script>alert(1)</script>');
  });

  it('SEC-T05: strips a javascript: link href (no active anchor href)', () => {
    const { container } = renderNodes([
      {
        type: 'paragraph',
        content: [text('evil', [{ type: 'link', attrs: { href: 'javascript:void(0)' } }])],
      } as EditorNode,
    ]);
    expect(container.querySelector('a')).toBeNull();
    expect(container).toHaveTextContent('evil');
  });

  it('SEC-T06: renders a tree of only-unknown nodes without throwing (no DOM)', () => {
    expect(() =>
      renderNodes([
        { type: 'customWidget' } as unknown as EditorNode,
        { type: 'foo' } as unknown as EditorNode,
      ])
    ).not.toThrow();
  });

  it('SEC-T07: escapes script-like text inside a codeBlock', () => {
    const { container } = renderNodes([
      { type: 'codeBlock', content: [text('<script>alert(1)</script>')] } as EditorNode,
    ]);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('pre code')).toHaveTextContent('<script>alert(1)</script>');
  });

  it('SEC-T08: a node with undefined content does not crash', () => {
    expect(() => renderNodes([{ type: 'paragraph' } as EditorNode])).not.toThrow();
  });

  it('SEC-T09: a null child in content is dropped, not dereferenced', () => {
    const { container } = renderNodes([
      { type: 'paragraph', content: [null, { type: 'text', text: 'ok' }] } as unknown as EditorNode,
    ]);
    expect(container.querySelector('p')).toHaveTextContent('ok');
  });

  it('SEC-T10: non-array content is treated as empty (no crash)', () => {
    expect(() =>
      renderNodes([{ type: 'paragraph', content: 'not-an-array' } as unknown as EditorNode])
    ).not.toThrow();
  });

  it('SEC-T11: a non-record node (null / primitive / array) is dropped', () => {
    const { container } = renderNodes([
      null as unknown as EditorNode,
      'string-node' as unknown as EditorNode,
      [] as unknown as EditorNode,
    ]);
    expect(container).toBeEmptyDOMElement();
  });

  it('SEC-T12: non-array marks on a text node do not crash', () => {
    const { container } = renderNodes([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'hi', marks: 'bold' }],
      } as unknown as EditorNode,
    ]);
    expect(container).toHaveTextContent('hi');
  });

  it('renders nothing for empty node list (no throw)', () => {
    const { container } = renderNodes([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('source has no dangerouslySetInnerHTML usage', () => {
    const src = readFileSync(resolve(__dirname, '../tiptap-node-renderer.tsx'), 'utf-8');
    // Match actual JSX/object usage (attribute `=` or property `:`), not the word in a
    // doc comment that explains the no-raw-HTML policy.
    expect(src).not.toMatch(/dangerouslySetInnerHTML\s*[=:]/);
  });
});

describe('safeImageSrc / safeHref helpers', () => {
  it('safeImageSrc accepts https, http and relative; rejects others', () => {
    expect(safeImageSrc('https://x/y.png')).toBe('https://x/y.png');
    expect(safeImageSrc('http://x/y.png')).toBe('http://x/y.png');
    expect(safeImageSrc('/local/y.png')).toBe('/local/y.png');
    expect(safeImageSrc('javascript:alert(1)')).toBeNull();
    expect(safeImageSrc('data:image/png;base64,xx')).toBeNull();
    expect(safeImageSrc('//evil.com/x.png')).toBeNull();
    expect(safeImageSrc('')).toBeNull();
    expect(safeImageSrc(42)).toBeNull();
  });

  it('safeHref accepts https/relative/anchor/mailto; rejects javascript', () => {
    expect(safeHref('https://x.com')).toBe('https://x.com');
    expect(safeHref('/path')).toBe('/path');
    expect(safeHref('#anchor')).toBe('#anchor');
    expect(safeHref('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('vbscript:msgbox(1)')).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});
