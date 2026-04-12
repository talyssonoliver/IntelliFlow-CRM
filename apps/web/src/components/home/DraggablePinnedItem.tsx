'use client';

import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SerializedPinnedItem } from './AuthenticatedHomePage';
import { getPinnedIcon } from './PinnedItemsSheet';

export type { SerializedPinnedItem } from './AuthenticatedHomePage';

interface DraggablePinnedItemProps {
  item: SerializedPinnedItem;
  isDragDisabled?: boolean;
  onUnpin?: (entityType: string, entityId: string) => void;
  onItemClick?: (entityType: string, entityId: string) => void;
}

export function DraggablePinnedItem({
  item,
  isDragDisabled,
  onUnpin,
  onItemClick,
}: Readonly<DraggablePinnedItemProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${item.entityType}-${item.entityId}`,
    disabled: isDragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const customIcon = item.icon;
  const iconStyle = customIcon
    ? { icon: customIcon, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-600' }
    : getPinnedIcon(item.entityType);

  const isUnavailable = item.isAvailable === false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 ${isDragging || isUnavailable ? 'opacity-50' : ''}`}
    >
      {/* Drag handle — separate from Link to avoid click/drag conflict */}
      <button
        type="button"
        className="cursor-grab flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        aria-label={`Drag to reorder ${item.title}`}
        style={{ touchAction: 'none' }}
        {...attributes}
        {...listeners}
      >
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          drag_indicator
        </span>
      </button>

      {isUnavailable ? (
        <div className="flex items-center gap-3 p-2 rounded-lg flex-1 min-w-0" aria-disabled="true">
          <div
            className={`size-8 rounded ${iconStyle.iconBg} ${iconStyle.iconColor} flex items-center justify-center flex-shrink-0`}
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              {iconStyle.icon}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-400 truncate">{item.title}</p>
            <p className="text-xs text-slate-400">Item unavailable</p>
          </div>
          <button
            type="button"
            className="flex-shrink-0 p-1 text-slate-400 hover:text-red-500 transition-colors"
            aria-label="Unpin unavailable item"
            onClick={() => onUnpin?.(item.entityType, item.entityId)}
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              close
            </span>
          </button>
        </div>
      ) : (
        <Link
          href={item.url}
          onClick={() => onItemClick?.(item.entityType, item.entityId)}
          className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors group flex-1 min-w-0"
        >
          <div
            className={`size-8 rounded ${iconStyle.iconBg} ${iconStyle.iconColor} flex items-center justify-center flex-shrink-0`}
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              {iconStyle.icon}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate group-hover:text-[#137fec]">
              {item.title}
            </p>
            {item.subtitle && <p className="text-xs text-slate-400">{item.subtitle}</p>}
          </div>
        </Link>
      )}
    </div>
  );
}
