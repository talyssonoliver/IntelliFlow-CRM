'use client';

import * as React from 'react';

interface WidgetDropZoneProps {
  isOver?: boolean;
  onClick?: () => void;
  className?: string;
}

export function WidgetDropZone({ isOver = false, onClick, className = '' }: WidgetDropZoneProps) {
  return (
    <div
      onClick={onClick}
      className={`
        col-span-1 h-[150px] border-2 border-dashed rounded-xl
        flex flex-col items-center justify-center transition-all cursor-pointer
        ${
          isOver
            ? 'border-ds-primary bg-ds-primary/10 text-ds-primary'
            : 'border-ds-primary/40 bg-ds-primary/5 text-ds-primary/70 hover:bg-ds-primary/10 hover:border-ds-primary/60'
        }
        ${className}
      `}
    >
      <span className="material-symbols-outlined text-3xl mb-2">add_circle</span>
      <span className="text-sm font-medium">
        {isOver ? 'Drop Widget Here' : 'Add Widget'}
      </span>
    </div>
  );
}

// Sortable placeholder shown during drag
interface SortablePlaceholderProps {
  height?: number;
  className?: string;
}

export function SortablePlaceholder({ height = 150, className = '' }: SortablePlaceholderProps) {
  return (
    <div
      className={`col-span-1 border-2 border-dashed border-ds-primary/60 bg-ds-primary/10 rounded-xl ${className}`}
      style={{ height }}
    />
  );
}
