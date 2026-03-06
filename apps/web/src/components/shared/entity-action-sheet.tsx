'use client';

import * as React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@intelliflow/ui';
import { useEntityPin, type UseEntityPinOptions } from '@/hooks/use-entity-pin';

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
}

export function EntityActionSheet({
  open,
  onOpenChange,
  entity,
  extraActions,
}: EntityActionSheetProps) {
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

          {/* Share (placeholder) */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">share</span>
            Share
          </button>

          {/* Export (placeholder) */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            Export
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
                  <span className="material-symbols-outlined text-[20px]">{action.icon}</span>
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
