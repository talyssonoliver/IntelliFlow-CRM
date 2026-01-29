// @vitest-environment jsdom
import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import {
  CompactWidgetContent,
  DashboardSidebar,
  LayoutBuilderGrid,
  LayoutBuilderHeader,
  LayoutBuilderProvider,
  ProPlanCard,
  SortablePlaceholder,
  WidgetCard,
  WidgetDropZone,
  WidgetLibrary,
  WidgetLibraryItem,
  defaultDashboards,
  defaultWidgetTemplates,
  useLayoutBuilder,
} from '../src/components/layout-builder';

const baseWidget = {
  id: 'widget-1',
  type: 'total-leads',
  title: 'Total Leads',
  colSpan: 1 as const,
  rowSpan: 1 as const,
  config: {},
};

const widgetTemplate = {
  type: 'new-widget',
  title: 'New Widget',
  description: 'A test widget',
  icon: 'bolt',
  category: 'analytics' as const,
  defaultColSpan: 1 as const,
  defaultRowSpan: 1 as const,
};

describe('LayoutBuilderProvider & Header', () => {
  it('tracks dirty state and save/cancel actions', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onCancel = vi.fn();

    function Consumer() {
      const { widgets, addWidget, isDirty, save, cancel } = useLayoutBuilder();
      return (
        <div>
          <div data-testid="count">{widgets.length}</div>
          <div data-testid="dirty">{isDirty ? 'dirty' : 'clean'}</div>
          <button onClick={() => addWidget(widgetTemplate)}>add</button>
          <button onClick={save}>save</button>
          <button onClick={cancel}>cancel</button>
        </div>
      );
    }

    render(
      <LayoutBuilderProvider initialWidgets={[baseWidget]} onSave={onSave} onCancel={onCancel}>
        <Consumer />
      </LayoutBuilderProvider>
    );

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('dirty')).toHaveTextContent('clean');

    await user.click(screen.getByText('add'));
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(screen.getByTestId('dirty')).toHaveTextContent('dirty');

    await user.click(screen.getByText('save'));
    expect(onSave).toHaveBeenCalled();
    expect(screen.getByTestId('dirty')).toHaveTextContent('clean');

    await user.click(screen.getByText('add'));
    await user.click(screen.getByText('cancel'));
    expect(onCancel).toHaveBeenCalled();
    expect(screen.getByTestId('dirty')).toHaveTextContent('clean');
  });

  it('enables save button when layout changes', async () => {
    const user = userEvent.setup();

    function HeaderHarness() {
      const { addWidget } = useLayoutBuilder();
      return (
        <>
          <LayoutBuilderHeader title="Builder" description="Customize dashboard" />
          <button onClick={() => addWidget(widgetTemplate)}>mutate</button>
        </>
      );
    }

    render(
      <LayoutBuilderProvider initialWidgets={[baseWidget]}>
        <HeaderHarness />
      </LayoutBuilderProvider>
    );

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    expect(saveButton).toBeDisabled();

    await user.click(screen.getByText('mutate'));
    expect(saveButton).not.toBeDisabled();
  });
});

describe('LayoutBuilder primitives', () => {
  it('renders grid container classes', () => {
    const { container } = render(
      <LayoutBuilderGrid>
        <div>child</div>
      </LayoutBuilderGrid>
    );

    const grid = container.querySelector('.grid');
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveClass('grid-cols-1');
  });

  it('filters WidgetLibrary templates and calls onAddWidget', async () => {
    const user = userEvent.setup();
    const onAddWidget = vi.fn();
    render(
      <WidgetLibrary
        templates={defaultWidgetTemplates.slice(0, 3)}
        usedWidgetTypes={['total-leads']}
        onAddWidget={onAddWidget}
      />
    );

    // Total Leads should be hidden because it's in usedWidgetTypes
    expect(screen.queryByText('Total Leads')).not.toBeInTheDocument();
    // Search for 'xyz' to test no match scenario
    await user.type(screen.getByPlaceholderText(/search widgets/i), 'xyz');
    expect(screen.getByText(/no widgets match/i)).toBeInTheDocument();

    // Clear and click on Sales Revenue
    await user.clear(screen.getByPlaceholderText(/search widgets/i));
    await user.click(screen.getByText(/sales revenue/i));
    expect(onAddWidget).toHaveBeenCalled();
  });

  it('renders WidgetLibraryItem and triggers click handler', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<WidgetLibraryItem template={widgetTemplate} onClick={onClick} />);

    await user.click(screen.getByText(widgetTemplate.title));
    expect(onClick).toHaveBeenCalled();
  });

  it('renders drop zones and placeholder styles', () => {
    const { container } = render(
      <>
        <WidgetDropZone />
        <WidgetDropZone isOver />
        <SortablePlaceholder height={180} />
      </>
    );

    // Verify text content for default and isOver states
    expect(screen.getByText('Add Widget')).toBeInTheDocument();
    expect(screen.getByText('Drop Widget Here')).toBeInTheDocument();
    // Verify placeholder has correct height style
    const placeholder = container.querySelector('.border-dashed.border-ds-primary\\/60');
    expect(placeholder).toHaveStyle({ height: '180px' });
  });

  it('renders WidgetCard controls when editing', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onSettings = vi.fn();
    const onResize = vi.fn();

    render(
      <WidgetCard widget={baseWidget} isEditing onDelete={onDelete} onSettings={onSettings} onResize={onResize}>
        <div>Widget content</div>
      </WidgetCard>
    );

    await user.click(screen.getByTitle('Remove widget'));
    expect(onDelete).toHaveBeenCalledWith(baseWidget.id);

    await user.click(screen.getByTitle('Widget settings'));
    expect(onSettings).toHaveBeenCalledWith(baseWidget);

    // Resize handles render when onResize provided
    expect(document.querySelector('.cursor-nwse-resize')).toBeInTheDocument();
  });

  it('renders compact widget content with progress', () => {
    render(
      <CompactWidgetContent icon="bolt" title="KPI" value="99" subtitle="Today" progress={50} />
    );

    expect(screen.getByText('KPI')).toBeInTheDocument();
    const progressBar = screen.getByText('KPI').closest('.p-5')?.querySelector('.bg-amber-500');
    expect(progressBar).toHaveStyle({ width: '50%' });
  });
});

describe('LayoutBuilder sidebar pieces', () => {
  it('highlights active dashboard and config items', async () => {
    const user = userEvent.setup();
    const onSelectDashboard = vi.fn();
    const onSelectConfig = vi.fn();

    render(
      <DashboardSidebar
        dashboards={defaultDashboards}
        activeDashboardId="overview"
        configItems={[
          { id: 'layout', label: 'Layout', icon: 'tune' },
          { id: 'sharing', label: 'Sharing', icon: 'share' },
        ]}
        activeConfigId="sharing"
        onSelectDashboard={onSelectDashboard}
        onSelectConfig={onSelectConfig}
        footer={<div>footer content</div>}
        className="custom-sidebar"
      />
    );

    expect(screen.getByText('footer content')).toBeInTheDocument();
    expect(screen.getByText('Overview').closest('button')).toHaveClass('bg-ds-primary/10');

    await user.click(screen.getByText('Sales Performance'));
    expect(onSelectDashboard).toHaveBeenCalledWith('sales');

    await user.click(screen.getByText('Layout'));
    expect(onSelectConfig).toHaveBeenCalledWith('layout');
  });

  it('renders pro plan card', () => {
    render(<ProPlanCard />);
    // Pro Plan is in an inner div, we need to go up further to find Upgrade Now
    expect(screen.getByText('Pro Plan')).toBeInTheDocument();
    expect(screen.getByText(/upgrade now/i)).toBeInTheDocument();
  });
});
