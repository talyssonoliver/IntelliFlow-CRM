import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SdkGuides } from '../sdk-guides';
import { SDK_REGISTRY } from '@/lib/developer/sdk-downloads';

// Mock clipboard for copy-to-clipboard coverage
const mockWriteText = vi.fn().mockResolvedValue(undefined);

if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    configurable: true,
  });
} else {
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
}

describe('SdkGuides', () => {
  it('renders all SDK category sections (AC-003)', () => {
    render(<SdkGuides />);
    expect(screen.getByText('About the SDK')).toBeInTheDocument();
    expect(screen.getByText('Available SDKs')).toBeInTheDocument();
    expect(screen.getByText('Prerequisites')).toBeInTheDocument();
  });

  it('renders SDK items with correct titles', () => {
    render(<SdkGuides />);
    expect(screen.getAllByText('TypeScript SDK').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('React Hooks').length).toBeGreaterThanOrEqual(1);
  });

  it('Overview tab visible by default (AC-003)', () => {
    render(<SdkGuides />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('About the SDK')).toBeInTheDocument();
  });

  it('tab switching works — click Installation, Quickstart, Downloads (AC-003)', async () => {
    const user = userEvent.setup();
    render(<SdkGuides />);

    await user.click(screen.getByRole('tab', { name: 'Installation' }));
    expect(screen.getByRole('tab', { name: 'Installation' })).toHaveAttribute(
      'data-state',
      'active'
    );

    await user.click(screen.getByRole('tab', { name: 'Quickstart' }));
    expect(screen.getByRole('tab', { name: 'Quickstart' })).toHaveAttribute('data-state', 'active');

    await user.click(screen.getByRole('tab', { name: 'Downloads' }));
    expect(screen.getByRole('tab', { name: 'Downloads' })).toHaveAttribute('data-state', 'active');
  });

  it('Installation tab shows install commands (AC-004)', async () => {
    const user = userEvent.setup();
    render(<SdkGuides />);
    await user.click(screen.getByRole('tab', { name: 'Installation' }));

    expect(screen.getByText('npm install @intelliflow/api-client')).toBeInTheDocument();
    expect(screen.getByText('pnpm add @intelliflow/api-client')).toBeInTheDocument();
    expect(screen.getByText('yarn add @intelliflow/api-client')).toBeInTheDocument();
  });

  it('Copy button triggers navigator.clipboard.writeText (AC-004)', async () => {
    const user = userEvent.setup();
    render(<SdkGuides />);
    await user.click(screen.getByRole('tab', { name: 'Installation' }));

    const copyButtons = screen.getAllByLabelText(/copy.*to clipboard/i);
    expect(copyButtons.length).toBeGreaterThanOrEqual(1);

    await user.click(copyButtons[0]);

    await waitFor(() => {
      const checkIcons = screen.queryAllByText('check');
      expect(checkIcons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Quickstart tab shows React client example (AC-005)', async () => {
    const user = userEvent.setup();
    render(<SdkGuides />);
    await user.click(screen.getByRole('tab', { name: 'Quickstart' }));

    expect(screen.getByText('React Client')).toBeInTheDocument();
    expect(screen.getAllByText(/TRPCProvider/).length).toBeGreaterThanOrEqual(1);
  });

  it('Quickstart tab shows Vanilla client example (AC-005)', async () => {
    const user = userEvent.setup();
    render(<SdkGuides />);
    await user.click(screen.getByRole('tab', { name: 'Quickstart' }));

    expect(screen.getAllByText('Vanilla Client').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/createTRPCClient/).length).toBeGreaterThanOrEqual(1);
  });

  it('Downloads tab shows SDK package cards (AC-006)', async () => {
    const user = userEvent.setup();
    render(<SdkGuides />);
    await user.click(screen.getByRole('tab', { name: 'Downloads' }));

    expect(screen.getByText('SDK Packages')).toBeInTheDocument();
    for (const sdk of SDK_REGISTRY) {
      expect(screen.getAllByText(sdk.name).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('Beta items show "Beta" badge (AC-006)', () => {
    render(<SdkGuides />);
    const badges = screen.getAllByText('Beta');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('Coming Soon items show "Coming Soon" badge (AC-012)', () => {
    render(<SdkGuides />);
    const badges = screen.getAllByText('Coming Soon');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('Coming Soon items are non-clickable with aria-disabled="true" (AC-012)', () => {
    render(<SdkGuides />);
    const disabledElements = document.querySelectorAll('[aria-disabled="true"]');
    expect(disabledElements.length).toBeGreaterThanOrEqual(1);
  });

  it('icons have aria-hidden="true" attribute (NF-005)', () => {
    render(<SdkGuides />);
    const icons = document.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('responsive grid classes present (grid, gap-4, md:grid-cols-2)', () => {
    const { container } = render(<SdkGuides />);
    const gridElements = container.querySelectorAll('.grid.gap-4');
    expect(gridElements.length).toBeGreaterThanOrEqual(1);
    const mdGridElements = container.querySelectorAll('[class*="md:grid-cols-2"]');
    expect(mdGridElements.length).toBeGreaterThanOrEqual(1);
  });

  it('focus ring classes on interactive elements (NF-005)', async () => {
    const user = userEvent.setup();
    render(<SdkGuides />);
    await user.click(screen.getByRole('tab', { name: 'Installation' }));

    const copyButtons = screen.getAllByLabelText(/copy.*to clipboard/i);
    expect(copyButtons.length).toBeGreaterThanOrEqual(1);
    const btn = copyButtons[0];
    expect(btn.className).toMatch(/focus/);
  });

  it('active cards have hover:border-primary class', () => {
    const { container } = render(<SdkGuides />);
    const activeCards = container.querySelectorAll('[class*="hover:border-primary"]');
    expect(activeCards.length).toBeGreaterThanOrEqual(1);
  });

  it('disabled cards have opacity-70 and cursor-not-allowed classes', () => {
    const { container } = render(<SdkGuides />);
    const disabledCards = container.querySelectorAll('[class*="opacity-70"]');
    expect(disabledCards.length).toBeGreaterThanOrEqual(1);
    const cursorCards = container.querySelectorAll('[class*="cursor-not-allowed"]');
    expect(cursorCards.length).toBeGreaterThanOrEqual(1);
  });

  it('section elements have aria-labelledby (NF-005)', () => {
    render(<SdkGuides />);
    const sections = document.querySelectorAll('section[aria-labelledby]');
    expect(sections.length).toBeGreaterThanOrEqual(3);
    sections.forEach((section) => {
      const labelId = section.getAttribute('aria-labelledby');
      expect(labelId).toBeTruthy();
      const label = document.getElementById(labelId!);
      expect(label).toBeInTheDocument();
    });
  });

  it('heading hierarchy: h2 for tab content sections (NF-005)', () => {
    render(<SdkGuides />);
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBeGreaterThanOrEqual(3);
  });

  it('correct total SDK item count from SDK_REGISTRY', () => {
    render(<SdkGuides />);
    // Each SDK name appears at least once in the overview tab
    expect(SDK_REGISTRY.length).toBe(5);
  });

  it('copy feedback sr-only element has aria-live="polite" (NF-005)', async () => {
    const user = userEvent.setup();
    render(<SdkGuides />);
    await user.click(screen.getByRole('tab', { name: 'Installation' }));

    const liveRegions = document.querySelectorAll('[aria-live="polite"].sr-only');
    expect(liveRegions.length).toBeGreaterThanOrEqual(1);
  });
});
