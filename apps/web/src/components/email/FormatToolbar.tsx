'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link as LinkIcon,
  RemoveFormatting,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormatToolbarProps {
  onFormat: (command: string, value?: string) => void;
  activeFormats?: string[];
  className?: string;
}

const BUTTONS = [
  { command: 'bold', label: 'Bold', icon: Bold, shortcut: 'Ctrl+B', toggle: true },
  { command: 'italic', label: 'Italic', icon: Italic, shortcut: 'Ctrl+I', toggle: true },
  { command: 'underline', label: 'Underline', icon: Underline, shortcut: 'Ctrl+U', toggle: true },
  { command: 'insertOrderedList', label: 'Ordered list', icon: ListOrdered, toggle: true },
  { command: 'insertUnorderedList', label: 'Unordered list', icon: List, toggle: true },
  { command: 'createLink', label: 'Link', icon: LinkIcon, toggle: false },
  { command: 'removeFormat', label: 'Clear formatting', icon: RemoveFormatting, toggle: false },
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
          const Icon = btn.icon;
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
              title={'shortcut' in btn && btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label}
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
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {/* Inline link URL input */}
      {showLinkInput && (
        <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
          <LinkIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
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
