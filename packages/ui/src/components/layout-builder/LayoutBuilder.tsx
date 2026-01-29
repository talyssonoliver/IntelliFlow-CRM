'use client';

import * as React from 'react';
import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { Widget, WidgetTemplate, LayoutBuilderContextValue } from './types';

const LayoutBuilderContext = createContext<LayoutBuilderContextValue | null>(null);

export function useLayoutBuilder() {
  const context = useContext(LayoutBuilderContext);
  if (!context) {
    throw new Error('useLayoutBuilder must be used within a LayoutBuilderProvider');
  }
  return context;
}

interface LayoutBuilderProviderProps {
  children: React.ReactNode;
  initialWidgets?: Widget[];
  onSave?: (widgets: Widget[]) => void;
  onCancel?: () => void;
}

export function LayoutBuilderProvider({
  children,
  initialWidgets = [],
  onSave,
  onCancel,
}: LayoutBuilderProviderProps) {
  const [widgets, setWidgets] = useState<Widget[]>(initialWidgets);
  const [savedWidgets, setSavedWidgets] = useState<Widget[]>(initialWidgets);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const isDirty = useMemo(() => {
    return JSON.stringify(widgets) !== JSON.stringify(savedWidgets);
  }, [widgets, savedWidgets]);

  const addWidget = useCallback((template: WidgetTemplate) => {
    const newWidget: Widget = {
      id: `widget-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: template.type,
      title: template.title,
      colSpan: template.defaultColSpan,
      rowSpan: template.defaultRowSpan,
      config: {},
    };
    setWidgets((prev) => [...prev, newWidget]);
  }, []);

  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const updateWidget = useCallback((id: string, updates: Partial<Widget>) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...updates } : w))
    );
  }, []);

  const save = useCallback(() => {
    setSavedWidgets(widgets);
    setLastSaved(new Date());
    onSave?.(widgets);
  }, [widgets, onSave]);

  const cancel = useCallback(() => {
    setWidgets(savedWidgets);
    onCancel?.();
  }, [savedWidgets, onCancel]);

  const value: LayoutBuilderContextValue = useMemo(
    () => ({
      widgets,
      setWidgets,
      addWidget,
      removeWidget,
      updateWidget,
      isDirty,
      lastSaved,
      save,
      cancel,
    }),
    [widgets, addWidget, removeWidget, updateWidget, isDirty, lastSaved, save, cancel]
  );

  return (
    <LayoutBuilderContext.Provider value={value}>
      {children}
    </LayoutBuilderContext.Provider>
  );
}

interface LayoutBuilderGridProps {
  children: React.ReactNode;
  className?: string;
}

export function LayoutBuilderGrid({ children, className = '' }: LayoutBuilderGridProps) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 auto-rows-min ${className}`}
    >
      {children}
    </div>
  );
}

interface LayoutBuilderHeaderProps {
  title: string;
  description?: string;
  onCancel?: () => void;
  onSave?: () => void;
}

export function LayoutBuilderHeader({
  title,
  description,
  onCancel,
  onSave,
}: LayoutBuilderHeaderProps) {
  const { isDirty, lastSaved, save, cancel } = useLayoutBuilder();

  const handleSave = () => {
    save();
    onSave?.();
  };

  const handleCancel = () => {
    cancel();
    onCancel?.();
  };

  const formatLastSaved = () => {
    if (!lastSaved) return 'Not saved yet';
    const now = new Date();
    const diffMs = now.getTime() - lastSaved.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    return lastSaved.toLocaleTimeString();
  };

  return (
    <div className="sticky top-0 z-10 bg-white/80 dark:bg-[#1a2632]/90 backdrop-blur-md border-b border-border-light dark:border-border-dark px-6 py-4 flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-col">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
        {description && (
          <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 hidden sm:inline-block mr-2">
          Last saved: {formatLastSaved()}
        </span>
        <button
          onClick={handleCancel}
          className="flex items-center justify-center rounded-lg h-9 px-4 bg-white dark:bg-transparent border border-border-light dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className="flex items-center justify-center rounded-lg h-9 px-4 bg-ds-primary hover:bg-ds-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold shadow-sm shadow-ds-primary/30 transition-all"
        >
          <span className="material-symbols-outlined text-[18px] mr-2">save</span>
          Save Changes
        </button>
      </div>
    </div>
  );
}
