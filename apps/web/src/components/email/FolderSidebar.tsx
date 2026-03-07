'use client';

import { useCallback, useRef } from 'react';
import { Inbox, Send, FileText, Archive, AlertTriangle, Trash2, PenSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

const FOLDERS = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'drafts', label: 'Drafts', icon: FileText },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'spam', label: 'Spam', icon: AlertTriangle },
  { id: 'trash', label: 'Trash', icon: Trash2 },
] as const;

const LABELS = [
  { id: 'personal', name: 'Personal', color: '#3b82f6' },
  { id: 'work', name: 'Work', color: '#ef4444' },
  { id: 'important', name: 'Important', color: '#eab308' },
] as const;

interface FolderSidebarProps {
  activeFolder: string;
  onFolderSelect: (folderId: string) => void;
  onCompose: () => void;
  unreadCounts?: Record<string, number>;
  className?: string;
}

export function FolderSidebar({
  activeFolder,
  onFolderSelect,
  onCompose,
  unreadCounts = {},
  className,
}: Readonly<FolderSidebarProps>) {
  const folderRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const direction = e.key === 'ArrowDown' ? 1 : -1;
      const next = Math.max(0, Math.min(FOLDERS.length - 1, index + direction));
      folderRefs.current[next]?.focus();
    }
  }, []);

  return (
    <nav
      aria-label="Email folders"
      className={cn('flex w-56 flex-col border-r border-border bg-card', className)}
    >
      {/* Compose button */}
      <div className="p-3">
        <button
          type="button"
          aria-label="Compose new email"
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground',
            'hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'transition-colors'
          )}
          onClick={onCompose}
        >
          <PenSquare className="h-4 w-4" />
          Compose
        </button>
      </div>

      {/* Folder list */}
      <div className="flex-1 space-y-0.5 px-2">
        {FOLDERS.map((folder, i) => {
          const Icon = folder.icon;
          const isActive = activeFolder === folder.id;
          const count = unreadCounts[folder.id];

          return (
            <button
              key={folder.id}
              ref={(el) => {
                folderRefs.current[i] = el;
              }}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              aria-label={folder.label}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                isActive && 'bg-primary/10 text-primary font-medium'
              )}
              onClick={() => onFolderSelect(folder.id)}
              onKeyDown={(e) => handleKeyDown(e, i)}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-left">{folder.label}</span>
              {count != null && count > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Labels section */}
      <div className="border-t border-border p-3">
        <h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Labels
        </h3>
        <div className="space-y-1">
          {LABELS.map((label) => (
            <button
              key={label.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />
              <span>{label.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Storage indicator */}
      <div className="border-t border-border p-3">
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">Storage</span>
          <div className="mt-1 h-1.5 w-full rounded-full bg-secondary">
            <div className="h-full w-1/4 rounded-full bg-primary" />
          </div>
          <span className="mt-0.5 block">2.5 GB of 10 GB used</span>
        </div>
      </div>
    </nav>
  );
}
