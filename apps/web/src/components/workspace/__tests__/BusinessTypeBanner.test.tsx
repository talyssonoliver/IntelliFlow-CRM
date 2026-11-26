import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockUseEnabledModules = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useEnabledModules', () => ({ useEnabledModules: mockUseEnabledModules }));

import { BusinessTypeBanner } from '../BusinessTypeBanner';
import { BusinessTypePicker } from '../BusinessTypePicker';

describe('BusinessTypeBanner', () => {
  it('prompts an admin whose workspace has no business type', () => {
    mockUseEnabledModules.mockReturnValue({ needsBusinessType: true });
    render(<BusinessTypeBanner />);
    expect(screen.getByTestId('business-type-banner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /choose business type/i })).toHaveAttribute(
      'href',
      '/settings/workspace'
    );
  });

  it('stacks below 640px: text row full width, button on its own row, kept on one line', () => {
    mockUseEnabledModules.mockReturnValue({ needsBusinessType: true });
    render(<BusinessTypeBanner />);
    const banner = screen.getByTestId('business-type-banner');
    expect(banner.className).toContain('flex-col');
    expect(banner.className).toContain('sm:flex-row');
    expect(screen.getByRole('link', { name: /choose business type/i }).className).toContain(
      'whitespace-nowrap'
    );
  });

  it('renders nothing when no choice is needed', () => {
    mockUseEnabledModules.mockReturnValue({ needsBusinessType: false });
    const { container } = render(<BusinessTypeBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('BusinessTypePicker', () => {
  it('lists every business type and reports the choice', () => {
    const onChange = vi.fn();
    render(<BusinessTypePicker value={null} onChange={onChange} />);

    expect(screen.getAllByRole('radio')).toHaveLength(5);
    fireEvent.click(screen.getByRole('radio', { name: /law firm/i }));
    expect(onChange).toHaveBeenCalledWith('LAW_FIRM');
  });

  it('marks the current value', () => {
    render(<BusinessTypePicker value="AGENCY" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /agency/i })).toBeChecked();
  });
});
