import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}));

import { ContactSettingsSidebarNav } from '../ContactSettingsSidebarNav';

describe('ContactSettingsSidebarNav', () => {
  it('renders the three settings links when expanded', () => {
    mockUsePathname.mockReturnValue('/contacts/contact-settings');
    render(<ContactSettingsSidebarNav isExpanded={true} />);
    // "Contact Settings" appears twice (section header + link label).
    expect(screen.getAllByText('Contact Settings').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Contact Types')).toBeInTheDocument();
    expect(screen.getByText('Import / Export')).toBeInTheDocument();
  });

  it('renders collapsed form when not expanded', () => {
    mockUsePathname.mockReturnValue('/contacts/contact-settings');
    const { container } = render(<ContactSettingsSidebarNav isExpanded={false} />);
    // Collapsed: labels are not rendered, only icons remain.
    expect(container.querySelectorAll('a[href^="/contacts/"]').length).toBeGreaterThanOrEqual(3);
  });

  it('marks the active route with highlight class', () => {
    mockUsePathname.mockReturnValue('/contacts/contact-settings');
    const { container } = render(<ContactSettingsSidebarNav isExpanded={true} />);
    const active = container.querySelector('a[href="/contacts/contact-settings"]');
    expect(active?.className).toContain('bg-primary/10');
  });
});
