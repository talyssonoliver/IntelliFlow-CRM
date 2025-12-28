'use client';

import * as React from 'react';
import type { Widget } from './types';

interface WidgetCardProps {
  widget: Widget;
  children: React.ReactNode;
  onSettings?: (widget: Widget) => void;
  onDelete?: (id: string) => void;
  onResize?: (id: string, colSpan: 1 | 2 | 3 | 4, rowSpan: 1 | 2) => void;
  isEditing?: boolean;
  isDragging?: boolean;
  isResizing?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  className?: string;
  /** Skip applying grid colSpan/rowSpan classes (use when wrapped in a grid-aware container) */
  skipGridClasses?: boolean;
}

export function WidgetCard({
  widget,
  children,
  onSettings,
  onDelete,
  onResize,
  isEditing = false,
  isDragging = false,
  isResizing = false,
  dragHandleProps,
  className = '',
  skipGridClasses = false,
}: WidgetCardProps) {
  // 4-column grid: 1 = single stat, 2 = half width, 3 = 3/4 width, 4 = full width
  const colSpanClasses: Record<number, string> = {
    1: 'col-span-1',
    2: 'col-span-1 md:col-span-2',
    3: 'col-span-1 md:col-span-2 lg:col-span-3',
    4: 'col-span-1 md:col-span-2 lg:col-span-4',
  };

  const rowSpanClasses: Record<number, string> = {
    1: '',
    2: 'row-span-2',
  };

  // Only apply grid classes if not wrapped in a grid-aware container
  const gridClasses = skipGridClasses
    ? ''
    : `${colSpanClasses[widget.colSpan] || 'col-span-1'} ${rowSpanClasses[widget.rowSpan] || ''}`;

  const baseClasses = `
    bg-white dark:bg-surface-dark rounded-xl border shadow-sm transition-all relative group h-full
    ${isEditing ? 'cursor-move hover:border-ds-primary/50 hover:shadow-md' : ''}
    ${isDragging ? 'border-2 border-ds-primary/40 shadow-lg opacity-90' : 'border-border-light dark:border-border-dark'}
    ${gridClasses}
    ${className}
  `.trim();

  return (
    <div className={baseClasses}>
      {/* Editing controls - only visible when in edit mode */}
      {isEditing && (
        <>
          {/* Drag handle bar at top */}
          <div
            {...dragHandleProps}
            className="absolute top-0 left-0 right-0 h-10 bg-ds-primary/5 rounded-t-lg border-b border-ds-primary/20 flex items-center justify-between px-3 cursor-grab active:cursor-grabbing z-10"
          >
            <div className="flex items-center gap-2 text-ds-primary font-semibold text-xs uppercase tracking-wider">
              <span className="material-symbols-outlined text-sm">drag_indicator</span>
              <span>Drag to Move</span>
            </div>
            <div className="flex gap-1">
              {onSettings && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSettings(widget);
                  }}
                  className="p-1 hover:bg-ds-primary/10 rounded text-slate-500 hover:text-ds-primary transition-colors"
                  title="Widget settings"
                >
                  <span className="material-symbols-outlined text-sm">settings</span>
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(widget.id);
                  }}
                  className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-slate-500 hover:text-red-500 transition-colors"
                  title="Remove widget"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Hover controls for non-drag handle mode */}
      {isEditing && !dragHandleProps && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
          {onSettings && (
            <button
              onClick={() => onSettings(widget)}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400"
            >
              <span className="material-symbols-outlined text-sm">settings</span>
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(widget.id)}
              className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-slate-400 hover:text-red-500"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
            </button>
          )}
        </div>
      )}

      {/* Widget content */}
      <div className={`h-full ${isEditing && dragHandleProps ? 'pt-10' : ''}`}>
        {children}
      </div>

      {/* Resize handles - only visible when in edit mode */}
      {isEditing && onResize && (
        <>
          {/* Size indicator badge */}
          <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs font-mono text-slate-500 dark:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            {widget.colSpan}×{widget.rowSpan}
          </div>
          {/* Bottom-right corner resize handle */}
          <ResizeHandle
            widget={widget}
            position="bottom-right"
            onResize={onResize}
            isResizing={isResizing}
          />
          {/* Right edge resize handle */}
          <ResizeHandle
            widget={widget}
            position="right"
            onResize={onResize}
            isResizing={isResizing}
          />
          {/* Bottom edge resize handle */}
          <ResizeHandle
            widget={widget}
            position="bottom"
            onResize={onResize}
            isResizing={isResizing}
          />
        </>
      )}
    </div>
  );
}

// Resize handle component
interface ResizeHandleProps {
  widget: Widget;
  position: 'right' | 'bottom' | 'bottom-right';
  onResize: (id: string, colSpan: 1 | 2 | 3 | 4, rowSpan: 1 | 2) => void;
  isResizing?: boolean;
}

function ResizeHandle({ widget, position, onResize, isResizing }: ResizeHandleProps) {
  const handleRef = React.useRef<HTMLDivElement>(null);
  const startPosRef = React.useRef({ x: 0, y: 0 });
  const startSpanRef = React.useRef({ colSpan: widget.colSpan, rowSpan: widget.rowSpan });

  const positionClasses: Record<string, string> = {
    'right': 'right-0 top-1/2 -translate-y-1/2 w-2 h-12 cursor-ew-resize hover:bg-ds-primary/30',
    'bottom': 'bottom-0 left-1/2 -translate-x-1/2 h-2 w-12 cursor-ns-resize hover:bg-ds-primary/30',
    'bottom-right': 'right-0 bottom-0 w-4 h-4 cursor-nwse-resize hover:bg-ds-primary/50',
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    startPosRef.current = { x: e.clientX, y: e.clientY };
    startSpanRef.current = { colSpan: widget.colSpan, rowSpan: widget.rowSpan };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startPosRef.current.x;
      const deltaY = moveEvent.clientY - startPosRef.current.y;

      // Grid cell is approximately 200-300px wide, use 150px as threshold for span change
      const colThreshold = 150;
      const rowThreshold = 100;

      let newColSpan = startSpanRef.current.colSpan;
      let newRowSpan = startSpanRef.current.rowSpan;

      if (position === 'right' || position === 'bottom-right') {
        const colDelta = Math.round(deltaX / colThreshold);
        newColSpan = Math.max(1, Math.min(4, startSpanRef.current.colSpan + colDelta)) as 1 | 2 | 3 | 4;
      }

      if (position === 'bottom' || position === 'bottom-right') {
        const rowDelta = Math.round(deltaY / rowThreshold);
        newRowSpan = Math.max(1, Math.min(2, startSpanRef.current.rowSpan + rowDelta)) as 1 | 2;
      }

      if (newColSpan !== widget.colSpan || newRowSpan !== widget.rowSpan) {
        onResize(widget.id, newColSpan, newRowSpan);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = position === 'right' ? 'ew-resize' : position === 'bottom' ? 'ns-resize' : 'nwse-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div
      ref={handleRef}
      onMouseDown={handleMouseDown}
      className={`absolute z-20 rounded transition-colors ${positionClasses[position]} ${
        isResizing ? 'bg-ds-primary/40' : 'bg-transparent group-hover:bg-ds-primary/20'
      }`}
    >
      {position === 'bottom-right' && (
        <span className="material-symbols-outlined text-xs text-ds-primary/60 absolute right-0.5 bottom-0.5">
          drag_handle
        </span>
      )}
    </div>
  );
}

// Compact widget card for smaller KPI-style widgets
interface CompactWidgetCardProps {
  icon: string;
  iconBgColor?: string;
  iconColor?: string;
  title: string;
  value: string;
  subtitle?: string;
  progress?: number;
  progressColor?: string;
  children?: React.ReactNode;
}

export function CompactWidgetContent({
  icon,
  iconBgColor = 'bg-violet-100 dark:bg-violet-900/20',
  iconColor = 'text-violet-600 dark:text-violet-400',
  title,
  value,
  subtitle,
  progress,
  progressColor = 'bg-amber-500',
}: CompactWidgetCardProps) {
  return (
    <div className="p-5 flex flex-col justify-between h-full">
      <div className="flex items-center gap-3">
        <div className={`size-8 rounded-full ${iconBgColor} flex items-center justify-center ${iconColor}`}>
          <span className="material-symbols-outlined text-lg">{icon}</span>
        </div>
        <h3 className="font-medium text-slate-700 dark:text-slate-300">{title}</h3>
      </div>
      <div>
        <div className="text-3xl font-bold text-slate-900 dark:text-white">{value}</div>
        {subtitle && (
          <div className="text-xs text-slate-500 mt-1">{subtitle}</div>
        )}
        {progress !== undefined && (
          <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className={`${progressColor} h-full rounded-full`} style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
