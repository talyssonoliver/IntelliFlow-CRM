'use client';

import * as React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  useToast,
} from '@intelliflow/ui';
import { useEntityPin, type UseEntityPinOptions } from '@/hooks/use-entity-pin';
import { exportToCSV } from '@/lib/export/csv';

type ExportValue = string | number | boolean | null | undefined;

/**
 * A spreadsheet reads a cell that starts with = + - @ (or a tab / carriage return) as a
 * formula; a leading apostrophe keeps user-entered text as text.
 */
export function csvSafe(value: ExportValue): ExportValue {
  return typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** The record's link as an absolute URL, for sharing outside the app. */
export function absoluteEntityUrl(url: string): string {
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

export interface EntityActionSheetEntity {
  type: UseEntityPinOptions['entityType'];
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  url: string;
}

export interface ExtraAction {
  label: string;
  icon: string;
  onClick: () => void;
  destructive?: boolean;
}

interface EntityActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: EntityActionSheetEntity;
  extraActions?: ExtraAction[];
  /**
   * The fields Export writes, one column each. Without it Export writes the record's
   * own details (type, id, name, subtitle, link).
   */
  exportFields?: Record<string, ExportValue>;
}

export function EntityActionSheet({
  open,
  onOpenChange,
  entity,
  extraActions,
  exportFields,
}: Readonly<EntityActionSheetProps>) {
  const { toast } = useToast();
  const { isPinned, isLoading, togglePin } = useEntityPin({
    entityType: entity.type,
    entityId: entity.id,
    title: entity.title,
    subtitle: entity.subtitle,
    icon: entity.icon,
    url: entity.url,
  });

  const handleTogglePin = () => {
    togglePin();
    onOpenChange(false);
  };

  // Share: the device's share sheet where there is one, otherwise copy the link.
  const handleShare = async () => {
    const url = absoluteEntityUrl(entity.url);
    onOpenChange(false);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: entity.title, url });
        return;
      } catch (error) {
        // Closing the share sheet is not a failure.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: url });
    } catch {
      toast({
        title: "Couldn't copy the link",
        description: url,
        variant: 'destructive',
      });
    }
  };

  // Export: one CSV row for this record.
  const handleExport = () => {
    const fields: Record<string, ExportValue> = exportFields ?? {
      type: entity.type,
      id: entity.id,
      name: entity.title,
      subtitle: entity.subtitle,
      url: absoluteEntityUrl(entity.url),
    };
    const row = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, csvSafe(value)])
    );
    exportToCSV([row], { filename: `${entity.type}-${entity.id}` });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[340px] sm:max-w-[340px]">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-lg">{entity.title}</SheetTitle>
          {entity.subtitle && <SheetDescription>{entity.subtitle}</SheetDescription>}
        </SheetHeader>

        <div className="flex flex-col gap-1">
          {/* Pin / Unpin */}
          <button
            type="button"
            onClick={handleTogglePin}
            disabled={isLoading}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">{'push_pin'}</span>{' '}
            {isPinned ? 'Unpin from Home' : 'Pin to Home'}
          </button>

          {/* Share */}
          <button
            type="button"
            onClick={() => void handleShare()}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">share</span> Share
          </button>

          {/* Export */}
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">download</span> Export
          </button>

          {/* Extra actions */}
          {extraActions && extraActions.length > 0 && (
            <>
              <div className="my-2 border-t border-slate-200 dark:border-slate-700" />
              {extraActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    action.onClick();
                    onOpenChange(false);
                  }}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${
                    action.destructive
                      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">{action.icon}</span>{' '}
                  {action.label}
                </button>
              ))}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
