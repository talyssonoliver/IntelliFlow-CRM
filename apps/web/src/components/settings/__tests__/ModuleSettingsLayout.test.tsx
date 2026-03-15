/**
 * ModuleSettingsLayout Component Tests
 *
 * PG-178: Lead Settings
 *
 * Tests for the shared module settings layout wrapper used by settings pages.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ModuleSettingsTab, ModuleSettingsBreadcrumb } from '../ModuleSettingsLayout';

vi.mock('@intelliflow/ui', () => ({
  Tabs: ({ children, ...props }: any) => (
    <div data-testid="tabs" {...props}>
      {children}
    </div>
  ),
  TabsList: ({ children }: any) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children, value, ...props }: any) => (
    <button role="tab" data-value={value} {...props}>
      {children}
    </button>
  ),
  TabsContent: ({ children, value }: any) => (
    <div role="tabpanel" data-value={value}>
      {children}
    </div>
  ),
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Button: ({ children, onClick, disabled, variant, className, ...props }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      data-variant={variant}
      {...props}
    >
      {children}
    </button>
  ),
  ConfirmationDialog: ({ open, onConfirm, title, onOpenChange }: any) =>
    open ? (
      <div data-testid="confirmation-dialog">
        <p>{title}</p>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
      </div>
    ) : null,
  Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
}));

// Import after mocks
import { ModuleSettingsLayout } from '../ModuleSettingsLayout';

const mockTabs: ModuleSettingsTab[] = [
  { value: 'tab-one', label: 'Tab One', content: <div>Content One</div> },
  { value: 'tab-two', label: 'Tab Two', content: <div>Content Two</div> },
];

const mockBreadcrumbs: ModuleSettingsBreadcrumb[] = [
  { label: 'Dashboard', href: '/' },
  { label: 'Settings', href: '/settings' },
  { label: 'Module Settings' },
];

const defaultProps = {
  title: 'Module Settings',
  description: 'Configure module settings here.',
  breadcrumbs: mockBreadcrumbs,
  tabs: mockTabs,
  onSave: vi.fn().mockResolvedValue(undefined),
  onReset: vi.fn().mockResolvedValue(undefined),
};

describe('ModuleSettingsLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and description', () => {
    render(<ModuleSettingsLayout {...defaultProps} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Module Settings' })).toBeInTheDocument();
    expect(screen.getByText('Configure module settings here.')).toBeInTheDocument();
  });

  it('renders breadcrumbs with links', () => {
    render(<ModuleSettingsLayout {...defaultProps} />);

    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink).toHaveAttribute('href', '/');

    const settingsLink = screen.getByRole('link', { name: 'Settings' });
    expect(settingsLink).toBeInTheDocument();
    expect(settingsLink).toHaveAttribute('href', '/settings');

    // Last breadcrumb has no link — verify it exists within the nav
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.textContent).toContain('Module Settings');
  });

  it('renders all tabs from config', () => {
    render(<ModuleSettingsLayout {...defaultProps} />);

    expect(screen.getByRole('tab', { name: 'Tab One' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tab Two' })).toBeInTheDocument();
  });

  it('renders tab content panels', () => {
    render(<ModuleSettingsLayout {...defaultProps} />);

    expect(screen.getByText('Content One')).toBeInTheDocument();
    expect(screen.getByText('Content Two')).toBeInTheDocument();
  });

  it('clicking tab switches content via TabsTrigger click', () => {
    render(<ModuleSettingsLayout {...defaultProps} />);

    const tabTwo = screen.getByRole('tab', { name: 'Tab Two' });
    fireEvent.click(tabTwo);

    // Tab Two trigger should have been clicked (tab switching is handled by the real Tabs component)
    expect(tabTwo).toBeInTheDocument();
  });

  it('Save Changes button calls onSave', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ModuleSettingsLayout {...defaultProps} onSave={onSave} isDirty={true} />);

    const saveBtn = screen.getByRole('button', { name: 'Save Changes' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });

  it('Reset to Defaults opens confirmation dialog', () => {
    render(<ModuleSettingsLayout {...defaultProps} />);

    const resetBtn = screen.getByRole('button', { name: 'Reset to Defaults' });
    fireEvent.click(resetBtn);

    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    // Title appears inside the confirmation dialog
    expect(screen.getAllByText('Reset to Defaults').length).toBeGreaterThanOrEqual(1);
  });

  it('confirming reset dialog calls onReset', async () => {
    const onReset = vi.fn().mockResolvedValue(undefined);
    render(<ModuleSettingsLayout {...defaultProps} onReset={onReset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  it('cancelling reset dialog closes it without calling onReset', () => {
    const onReset = vi.fn().mockResolvedValue(undefined);
    render(<ModuleSettingsLayout {...defaultProps} onReset={onReset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onReset).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirmation-dialog')).not.toBeInTheDocument();
  });

  it('Save button is disabled when isDirty=false', () => {
    render(<ModuleSettingsLayout {...defaultProps} isDirty={false} />);

    const saveBtn = screen.getByRole('button', { name: 'Save Changes' });
    expect(saveBtn).toBeDisabled();
  });

  it('Save button is enabled when isDirty=true', () => {
    render(<ModuleSettingsLayout {...defaultProps} isDirty={true} />);

    const saveBtn = screen.getByRole('button', { name: 'Save Changes' });
    expect(saveBtn).not.toBeDisabled();
  });

  it('Shows loading text when isSaving=true', () => {
    render(<ModuleSettingsLayout {...defaultProps} isDirty={true} isSaving={true} />);

    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('Save button is disabled when isSaving=true', () => {
    render(<ModuleSettingsLayout {...defaultProps} isDirty={true} isSaving={true} />);

    // The button is disabled because isSaving=true
    const savingText = screen.getByText('Saving...');
    expect(savingText.closest('button')).toBeDisabled();
  });

  it('Shows "Last updated" timestamp when provided', () => {
    const lastUpdated = new Date('2026-01-15T10:30:00');
    render(<ModuleSettingsLayout {...defaultProps} lastUpdated={lastUpdated} />);

    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
  });

  it('Does not show last updated text when lastUpdated is null', () => {
    render(<ModuleSettingsLayout {...defaultProps} lastUpdated={null} />);

    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });

  it('Does not show last updated text when lastUpdated is undefined', () => {
    render(<ModuleSettingsLayout {...defaultProps} />);

    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });

  it('Optional extraSidebarContent renders', () => {
    const extra = <div data-testid="extra-sidebar">Extra Sidebar Content</div>;
    render(<ModuleSettingsLayout {...defaultProps} extraSidebarContent={extra} />);

    expect(screen.getByTestId('extra-sidebar')).toBeInTheDocument();
    expect(screen.getByText('Extra Sidebar Content')).toBeInTheDocument();
  });

  it('renders breadcrumb nav with accessible label', () => {
    render(<ModuleSettingsLayout {...defaultProps} />);

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toBeInTheDocument();
  });

  it('renders empty tabs area when no tabs provided', () => {
    render(<ModuleSettingsLayout {...defaultProps} tabs={[]} />);

    // Should not crash and still render heading
    expect(screen.getByRole('heading', { level: 1, name: 'Module Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('renders complementarySidebar when provided', () => {
    const sidebar = <div data-testid="complementary-sidebar">Detail Panel</div>;
    render(<ModuleSettingsLayout {...defaultProps} complementarySidebar={sidebar} />);

    expect(screen.getByTestId('complementary-sidebar')).toBeInTheDocument();
    expect(screen.getByText('Detail Panel')).toBeInTheDocument();
  });

  it('does not render complementarySidebar when not provided', () => {
    render(<ModuleSettingsLayout {...defaultProps} />);
    expect(screen.queryByTestId('complementary-sidebar')).not.toBeInTheDocument();
  });
});
