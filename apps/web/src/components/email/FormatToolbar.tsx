'use client';

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface FormatToolbarProps {
  onFormat: (command: string, value?: string) => void;
  activeFormats?: string[];
  className?: string;
}

const BUTTONS = [
  { command: 'bold', label: 'Bold', symbol: 'format_bold', shortcut: 'Ctrl+B', toggle: true },
  { command: 'italic', label: 'Italic', symbol: 'format_italic', shortcut: 'Ctrl+I', toggle: true },
  {
    command: 'underline',
    label: 'Underline',
    symbol: 'format_underlined',
    shortcut: 'Ctrl+U',
    toggle: true,
  },
  {
    command: 'insertOrderedList',
    label: 'Ordered list',
    symbol: 'format_list_bulleted',
    toggle: true,
  },
  {
    command: 'insertUnorderedList',
    label: 'Unordered list',
    symbol: 'format_list_bulleted',
    toggle: true,
  },
  { command: 'createLink', label: 'Link', symbol: 'link', toggle: false },
  { command: 'removeFormat', label: 'Clear formatting', symbol: 'format_clear', toggle: false },
] as const;

export function FormatToolbar({
  onFormat,
  activeFormats = [],
  className,
}: Readonly<FormatToolbarProps>) {
  const [focusIndex, setFocusIndex] = useState(0);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const direction = e.key === 'ArrowRight' ? 1 : -1;
        const next = (focusIndex + direction + BUTTONS.length) % BUTTONS.length;
        setFocusIndex(next);
        buttonRefs.current[next]?.focus();
      }
    },
    [focusIndex]
  );

  const handleButtonClick = useCallback(
    (command: string) => {
      if (command === 'createLink') {
        setShowLinkInput(true);
        setLinkUrl('https://');
        // Focus the input after render
        setTimeout(() => linkInputRef.current?.focus(), 0);
      } else {
        onFormat(command);
      }
    },
    [onFormat]
  );

  const handleLinkSubmit = useCallback(() => {
    const url = linkUrl.trim();
    if (url && url !== 'https://') {
      onFormat('createLink', url);
    }
    setShowLinkInput(false);
    setLinkUrl('');
  }, [linkUrl, onFormat]);

  const handleLinkCancel = useCallback(() => {
    setShowLinkInput(false);
    setLinkUrl('');
  }, []);

  return (
    <div className={cn('border-b border-border', className)}>
      <div
        role="toolbar"
        aria-label="Text formatting"
        aria-orientation="horizontal"
        className="flex items-center gap-0.5 p-1"
        onKeyDown={handleKeyDown}
      >
        {BUTTONS.map((btn, i) => {
          const isActive = activeFormats.includes(btn.command);

          return (
            <button
              key={btn.command}
              ref={(el) => {
                buttonRefs.current[i] = el;
              }}
              type="button"
              tabIndex={i === focusIndex ? 0 : -1}
              aria-label={btn.label}
              aria-pressed={btn.toggle ? isActive : undefined}
              title={
                'shortcut' in btn && btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label
              }
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm',
                'hover:bg-accent hover:text-accent-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                'transition-colors',
                isActive && 'bg-primary/15 text-primary ring-1 ring-primary/30'
              )}
              // Prevent stealing focus from the contentEditable editor
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleButtonClick(btn.command)}
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {btn.symbol}
              </span>
            </button>
          );
        })}
      </div>

      {/* Inline link URL input */}
      {showLinkInput && (
        <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
          <span
            className="material-symbols-outlined text-base text-muted-foreground flex-shrink-0"
            aria-hidden="true"
          >
            link
          </span>
          <input
            ref={linkInputRef}
            type="url"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleLinkSubmit();
              }
              if (e.key === 'Escape') {
                handleLinkCancel();
              }
            }}
            className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            className="rounded px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleLinkSubmit}
          >
            Apply
          </button>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleLinkCancel}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
