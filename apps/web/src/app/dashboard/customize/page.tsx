'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  LayoutBuilderProvider,
  LayoutBuilderGrid,
  WidgetCard,
  WidgetLibrary,
  WidgetDropZone,
  DashboardSidebar,
  ProPlanCard,
  defaultWidgetTemplates,
  defaultDashboards,
  type Widget,
  type WidgetTemplate,
} from '@intelliflow/ui';
import { widgetRegistry } from '@/components/dashboard/widgets';

// Default widgets matching the actual dashboard layout (4-column grid)
const defaultWidgets: Widget[] = [
  // Row 1: 4 stat cards (1+1+1+1 = 4)
  { id: 'w1', type: 'total-leads', title: 'Total Leads', colSpan: 1, rowSpan: 1 },
  { id: 'w2', type: 'sales-revenue', title: 'Sales Revenue', colSpan: 1, rowSpan: 1 },
  { id: 'w3', type: 'active-deals', title: 'Active Deals', colSpan: 1, rowSpan: 1 },
  { id: 'w4', type: 'open-tickets', title: 'Open Tickets', colSpan: 1, rowSpan: 1 },
  // Row 2: Pipeline Summary (3/4) + Upcoming Tasks (1/4)
  { id: 'w5', type: 'pipeline-summary', title: 'Pipeline Summary', colSpan: 3, rowSpan: 1 },
  { id: 'w6', type: 'upcoming-tasks', title: 'Upcoming Tasks', colSpan: 1, rowSpan: 1 },
  // Row 3: Deals Won (3/4) + Recent Activity (1/4)
  { id: 'w7', type: 'deals-won', title: 'Deals Won (Last 6 Months)', colSpan: 3, rowSpan: 1 },
  { id: 'w8', type: 'recent-activity', title: 'Recent Activity', colSpan: 1, rowSpan: 1 },
];

// Sortable widget wrapper - applies colSpan classes to be a proper grid child
function SortableWidget({
  widget,
  children,
  onDelete,
  onSettings,
  onResize,
}: {
  widget: Widget;
  children: React.ReactNode;
  onDelete?: (id: string) => void;
  onSettings?: (widget: Widget) => void;
  onResize?: (id: string, colSpan: 1 | 2 | 3 | 4, rowSpan: 1 | 2) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  // Grid column span classes - must be on the direct grid child
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`${colSpanClasses[widget.colSpan] || 'col-span-1'} ${rowSpanClasses[widget.rowSpan] || ''}`}
    >
      <WidgetCard
        widget={widget}
        isEditing
        isDragging={isDragging}
        dragHandleProps={listeners}
        onDelete={onDelete}
        onSettings={onSettings}
        onResize={onResize}
        skipGridClasses
      >
        {children}
      </WidgetCard>
    </div>
  );
}

export default function CustomizeDashboardPage() {
  const router = useRouter();
  const [widgets, setWidgets] = useState<Widget[]>(defaultWidgets);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDashboard, setActiveDashboard] = useState('overview');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Load saved layout from localStorage and enable DndContext after mount
  useEffect(() => {
    const saved = localStorage.getItem('dashboard-layout');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWidgets(parsed);
        }
      } catch (e) {
        console.error('Failed to parse saved dashboard layout:', e);
      }
    }
    setIsMounted(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setWidgets((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleAddWidget = useCallback((template: WidgetTemplate) => {
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

  const handleDeleteWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const handleSettingsWidget = useCallback((widget: Widget) => {
    // TODO: Open widget settings modal
    console.log('Settings for widget:', widget);
  }, []);

  const handleResizeWidget = useCallback((id: string, colSpan: 1 | 2 | 3 | 4, rowSpan: 1 | 2) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, colSpan, rowSpan } : w))
    );
  }, []);

  const handleSave = useCallback(() => {
    // Save to localStorage for now
    localStorage.setItem('dashboard-layout', JSON.stringify(widgets));
    setLastSaved(new Date());
    router.push('/dashboard');
  }, [widgets, router]);

  const handleCancel = useCallback(() => {
    router.push('/dashboard');
  }, [router]);

  const formatLastSaved = () => {
    if (!lastSaved) return 'Not saved yet';
    const now = new Date();
    const diffMs = now.getTime() - lastSaved.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    return lastSaved.toLocaleTimeString();
  };

  const activeWidget = activeId ? widgets.find((w) => w.id === activeId) : null;

  return (
    <LayoutBuilderProvider
      initialWidgets={widgets}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      <div className="min-h-[calc(100vh-4rem)] bg-background-light dark:bg-background-dark flex">
        {/* Left Sidebar - Dashboard Navigation */}
        <DashboardSidebar
          dashboards={defaultDashboards}
          activeDashboardId={activeDashboard}
          onSelectDashboard={setActiveDashboard}
          activeConfigId="layout"
          footer={<ProPlanCard />}
        />

        {/* Main Editor Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Header Bar */}
          <div className="sticky top-16 z-10 bg-white/80 dark:bg-surface-dark/90 backdrop-blur-md border-b border-border-light dark:border-border-dark px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col">
              <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
                <Link href="/dashboard" className="hover:text-ds-primary transition-colors">
                  Dashboard
                </Link>
                <span className="material-symbols-outlined text-xs">chevron_right</span>
                <span className="text-slate-900 dark:text-white font-medium">Customize</span>
              </nav>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Customize Dashboard
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Drag and drop widgets to rearrange. Use the gear icon to configure.
              </p>
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
                className="flex items-center justify-center rounded-lg h-9 px-4 bg-ds-primary hover:bg-ds-primary-hover text-white text-sm font-bold shadow-sm shadow-ds-primary/30 transition-all"
              >
                <span className="material-symbols-outlined text-[18px] mr-2">save</span>
                Save Changes
              </button>
            </div>
          </div>

          {/* Widget Grid + Library */}
          <div className="flex flex-1 overflow-hidden">
            {/* Defer DndContext rendering until after mount to avoid hydration mismatch */}
            {isMounted ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                {/* Grid Area */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 relative grid-bg">
                  <SortableContext
                    items={widgets.map((w) => w.id)}
                    strategy={rectSortingStrategy}
                  >
                    <LayoutBuilderGrid>
                      {widgets.map((widget) => {
                        const WidgetComponent = widgetRegistry[widget.type];
                        return (
                          <SortableWidget
                            key={widget.id}
                            widget={widget}
                            onDelete={handleDeleteWidget}
                            onSettings={handleSettingsWidget}
                            onResize={handleResizeWidget}
                          >
                            {WidgetComponent ? (
                              <WidgetComponent config={widget.config} />
                            ) : (
                              <div className="p-5 text-slate-400">
                                Unknown widget: {widget.type}
                              </div>
                            )}
                          </SortableWidget>
                        );
                      })}

                      {/* Drop zone for new widgets */}
                      <WidgetDropZone onClick={() => {}} />
                    </LayoutBuilderGrid>
                  </SortableContext>

                  {/* Drag overlay */}
                  <DragOverlay>
                    {activeWidget && (
                      <WidgetCard widget={activeWidget} isEditing isDragging skipGridClasses>
                        {(() => {
                          const WidgetComponent = widgetRegistry[activeWidget.type];
                          return WidgetComponent ? (
                            <WidgetComponent config={activeWidget.config} />
                          ) : null;
                        })()}
                      </WidgetCard>
                    )}
                  </DragOverlay>
                </div>

                {/* Widget Library Sidebar */}
                <WidgetLibrary
                  templates={defaultWidgetTemplates}
                  onAddWidget={handleAddWidget}
                  usedWidgetTypes={widgets.map((w) => w.type)}
                />
              </DndContext>
            ) : (
              /* Loading skeleton while DndContext initializes */
              <div className="flex-1 overflow-y-auto p-6 md:p-8 relative grid-bg">
                <LayoutBuilderGrid>
                  {widgets.map((widget) => {
                    const WidgetComponent = widgetRegistry[widget.type];
                    return (
                      <WidgetCard key={widget.id} widget={widget} isEditing={false}>
                        {WidgetComponent ? (
                          <WidgetComponent config={widget.config} />
                        ) : (
                          <div className="p-5 text-slate-400">
                            Unknown widget: {widget.type}
                          </div>
                        )}
                      </WidgetCard>
                    );
                  })}
                </LayoutBuilderGrid>
              </div>
            )}
          </div>
        </main>
      </div>
    </LayoutBuilderProvider>
  );
}
