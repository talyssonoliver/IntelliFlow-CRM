// Layout Builder Types - Reusable dashboard customization system

export interface Widget {
  id: string;
  type: string;
  title: string;
  colSpan: 1 | 2 | 3 | 4;
  rowSpan: 1 | 2;
  config?: Record<string, unknown>;
}

export interface WidgetTemplate {
  type: string;
  title: string;
  description: string;
  icon: string;
  category: 'analytics' | 'sales' | 'operational';
  defaultColSpan: 1 | 2 | 3 | 4;
  defaultRowSpan: 1 | 2;
}

export interface DashboardConfig {
  id: string;
  name: string;
  icon: string;
  isActive?: boolean;
}

export interface DashboardLayout {
  id: string;
  name: string;
  widgets: Widget[];
  updatedAt?: string;
}

export interface LayoutBuilderContextValue {
  widgets: Widget[];
  setWidgets: (widgets: Widget[]) => void;
  addWidget: (template: WidgetTemplate) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<Widget>) => void;
  isDirty: boolean;
  lastSaved: Date | null;
  save: () => void;
  cancel: () => void;
}
