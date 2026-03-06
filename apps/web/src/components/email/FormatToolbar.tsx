'use client';

import { useCallback, useRef, useState } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Link, RemoveFormatting } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormatToolbarProps {
  onFormat: (command: string) => void;
  activeFormats?: string[];
  className?: string;
}

const BUTTONS = [
  { command: 'bold', label: 'Bold', icon: Bold, shortcut: 'Ctrl+B' },
  { command: 'italic', label: 'Italic', icon: Italic, shortcut: 'Ctrl+I' },
  { command: 'underline', label: 'Underline', icon: Underline, shortcut: 'Ctrl+U' },
  { command: 'insertOrderedList', label: 'Ordered list', icon: ListOrdered },
  { command: 'insertUnorderedList', label: 'Unordered list', icon: List },
  { command: 'createLink', label: 'Link', icon: Link },
  { command: 'removeFormat', label: 'Clear formatting', icon: RemoveFormatting },
] as const;

export function FormatToolbar({ onFormat, activeFormats = [], className }: FormatToolbarProps) {
  const [focusIndex, setFocusIndex] = useState(0);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

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

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      aria-orientation="horizontal"
      className={cn('flex items-center gap-0.5 border-b border-border p-1', className)}
      onKeyDown={handleKeyDown}
    >
      {BUTTONS.map((btn, i) => {
        const Icon = btn.icon;
        const isActive = activeFormats.includes(btn.command);
        const isToggle = ['bold', 'italic', 'underline'].includes(btn.command);

        return (
          <button
            key={btn.command}
            ref={(el) => {
              buttonRefs.current[i] = el;
            }}
            type="button"
            tabIndex={i === focusIndex ? 0 : -1}
            aria-label={btn.label}
            aria-pressed={isToggle ? (isActive ? 'true' : 'false') : undefined}
            title={'shortcut' in btn ? `${btn.label} (${btn.shortcut})` : btn.label}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm',
              'hover:bg-accent hover:text-accent-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
              'transition-colors',
              isActive && 'bg-accent text-accent-foreground'
            )}
            onClick={() => onFormat(btn.command)}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
