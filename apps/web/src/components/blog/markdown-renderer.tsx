'use client';

import * as React from 'react';
import { cn } from '@intelliflow/ui';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * MarkdownRenderer - Renders markdown content with consistent styling
 *
 * Supports:
 * - Headers (h1-h6)
 * - Paragraphs
 * - Lists (ordered, unordered)
 * - Code blocks with syntax highlighting
 * - Inline code
 * - Blockquotes
 * - Links
 * - Images
 * - Bold/Italic text
 * - Horizontal rules
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const renderedContent = React.useMemo(() => {
    return parseMarkdown(content);
  }, [content]);

  return (
    <div
      className={cn(
        'prose prose-slate dark:prose-invert max-w-none',
        // Headings
        'prose-headings:font-bold prose-headings:text-slate-900 dark:prose-headings:text-white',
        'prose-h1:text-3xl prose-h1:mb-6 prose-h1:mt-8',
        'prose-h2:text-2xl prose-h2:mb-4 prose-h2:mt-6 prose-h2:border-b prose-h2:border-slate-200 prose-h2:dark:border-slate-700 prose-h2:pb-2',
        'prose-h3:text-xl prose-h3:mb-3 prose-h3:mt-5',
        'prose-h4:text-lg prose-h4:mb-2 prose-h4:mt-4',
        // Paragraphs
        'prose-p:text-slate-600 dark:prose-p:text-slate-300 prose-p:leading-relaxed prose-p:mb-4',
        // Links
        'prose-a:text-[#137fec] prose-a:no-underline hover:prose-a:underline',
        // Lists
        'prose-ul:mb-4 prose-ol:mb-4 prose-li:mb-1',
        'prose-li:text-slate-600 dark:prose-li:text-slate-300',
        // Code
        'prose-code:text-[#137fec] prose-code:bg-slate-100 dark:prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono',
        'prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-lg prose-pre:p-4 prose-pre:overflow-x-auto prose-pre:my-6',
        // Blockquotes
        'prose-blockquote:border-l-4 prose-blockquote:border-[#137fec] prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-slate-500 dark:prose-blockquote:text-slate-400',
        // Images
        'prose-img:rounded-lg prose-img:shadow-md prose-img:my-6',
        // Horizontal rule
        'prose-hr:border-slate-200 dark:prose-hr:border-slate-700 prose-hr:my-8',
        // Strong/Bold
        'prose-strong:text-slate-900 dark:prose-strong:text-white',
        className
      )}
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  );
}

/**
 * Simple markdown parser (for demo purposes)
 * In production, use a library like remark, marked, or react-markdown
 */
function parseMarkdown(markdown: string): string {
  let html = markdown;

  // Escape HTML to prevent XSS
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (fenced)
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    const languageClass = lang ? ` class="language-${lang}"` : '';
    return `<pre><code${languageClass}>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^###### (.*)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.*)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.*)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');

  // Blockquotes
  html = html.replace(/^> (.*)$/gm, '<blockquote><p>$1</p></blockquote>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr />');
  html = html.replace(/^\*\*\*$/gm, '<hr />');

  // Unordered lists
  html = html.replace(/^[\*\-] (.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)(?=\s*<li>)/gs, '<ul>$1');
  html = html.replace(/(<li>.*<\/li>)(?!\s*<li>)/gs, '$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.*)$/gm, '<li>$1</li>');

  // Paragraphs (wrap remaining text)
  html = html
    .split('\n\n')
    .map(block => {
      block = block.trim();
      if (
        block &&
        !block.startsWith('<h') &&
        !block.startsWith('<pre') &&
        !block.startsWith('<ul') &&
        !block.startsWith('<ol') &&
        !block.startsWith('<blockquote') &&
        !block.startsWith('<hr') &&
        !block.startsWith('<li')
      ) {
        return `<p>${block.replace(/\n/g, '<br />')}</p>`;
      }
      return block;
    })
    .join('\n');

  return html;
}

/**
 * TableOfContents - Auto-generated from markdown headings
 */
export function TableOfContents({ content }: { content: string }) {
  const headings = React.useMemo(() => {
    const matches = content.matchAll(/^(#{2,4}) (.*)$/gm);
    return Array.from(matches).map(match => ({
      level: match[1].length,
      text: match[2],
      id: match[2].toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    }));
  }, [content]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="Table of contents" className="mb-8 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 uppercase tracking-wide">
        Contents
      </h2>
      <ul className="space-y-2">
        {headings.map((heading, idx) => (
          <li
            key={idx}
            style={{ paddingLeft: `${(heading.level - 2) * 16}px` }}
          >
            <a
              href={`#${heading.id}`}
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors"
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * ReadingProgress - Shows reading progress bar
 */
export function ReadingProgress() {
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    function handleScroll() {
      const article = document.querySelector('article');
      if (!article) return;

      const articleTop = article.offsetTop;
      const articleHeight = article.offsetHeight;
      const windowHeight = window.innerHeight;
      const scrollY = window.scrollY;

      const start = articleTop - windowHeight;
      const end = articleTop + articleHeight - windowHeight;
      const current = scrollY - start;
      const total = end - start;

      const percent = Math.min(Math.max((current / total) * 100, 0), 100);
      setProgress(percent);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 h-1 bg-slate-200 dark:bg-slate-700 z-50"
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Reading progress"
    >
      <div
        className="h-full bg-[#137fec] transition-all duration-150"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
