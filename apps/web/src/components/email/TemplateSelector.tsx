'use client';

import { useState, useMemo, useCallback } from 'react';
import { LayoutTemplate, Search, ChevronDown } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  variables: string[];
}

interface TemplateSelectorProps {
  onSelect: (template: Template) => void;
  currentBody?: string;
  className?: string;
}

export function TemplateSelector({ onSelect, currentBody = '', className }: TemplateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const { data: templates = [] } = trpc.email.listTemplates.useQuery(
    { search: searchQuery },
    { enabled: true }
  );

  const filteredTemplates = useMemo(() => {
    if (!searchQuery) return templates as Template[];
    return (templates as Template[]).filter((t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [templates, searchQuery]);

  const handleSelect = useCallback(
    (template: Template) => {
      if (currentBody.trim()) {
        setPendingTemplate(template);
      } else {
        onSelect(template);
        setIsOpen(false);
      }
    },
    [currentBody, onSelect]
  );

  const confirmReplace = useCallback(() => {
    if (pendingTemplate) {
      onSelect(pendingTemplate);
      setPendingTemplate(null);
      setIsOpen(false);
    }
  }, [pendingTemplate, onSelect]);

  const cancelReplace = useCallback(() => {
    setPendingTemplate(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev < filteredTemplates.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Enter' && highlightIndex >= 0) {
        e.preventDefault();
        handleSelect(filteredTemplates[highlightIndex]);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    },
    [filteredTemplates, highlightIndex, handleSelect]
  );

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        aria-label="Template"
        aria-expanded={isOpen}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm',
          'hover:bg-accent hover:text-accent-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <LayoutTemplate className="h-4 w-4" />
        <span>Template</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <div
          className="absolute bottom-full left-0 z-50 mb-1 w-80 rounded-md border border-border bg-popover p-2 shadow-lg"
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlightIndex(-1);
              }}
              className="w-full rounded-md border border-input bg-transparent py-1.5 pl-7 pr-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>

          {/* Template list */}
          {filteredTemplates.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              No templates available
            </div>
          ) : (
            <ul className="max-h-48 space-y-0.5 overflow-auto" role="listbox">
              {filteredTemplates.map((template, i) => (
                <li
                  key={template.id}
                  role="option"
                  aria-selected={i === highlightIndex}
                  data-highlighted={i === highlightIndex ? true : undefined}
                  tabIndex={-1}
                  className={cn(
                    'cursor-pointer rounded-md px-2 py-1.5 text-sm',
                    'hover:bg-accent hover:text-accent-foreground',
                    i === highlightIndex && 'bg-accent text-accent-foreground'
                  )}
                  onFocus={() => setHighlightIndex(i)}
                  onClick={() => handleSelect(template)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(template);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{template.name}</span>
                    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px]">
                      {template.category}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                    {template.body.replace(/<[^>]*>/g, '').slice(0, 60)}...
                  </div>
                  {/* Merge variables */}
                  {template.variables.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {template.variables.map((v) => (
                        <span
                          key={v}
                          className="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-mono text-primary"
                        >
                          {`{{${v}}}`}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Confirmation dialog */}
          {pendingTemplate && (
            <div className="mt-2 rounded-md border border-warning bg-warning/10 p-2">
              <p className="text-sm">
                Replace existing content with template &ldquo;{pendingTemplate.name}&rdquo;?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
                  onClick={confirmReplace}
                >
                  Replace
                </button>
                <button
                  type="button"
                  className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
                  onClick={cancelReplace}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
