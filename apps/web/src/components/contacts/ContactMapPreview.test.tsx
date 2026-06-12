import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { ContactMapPreview } from './ContactMapPreview';

afterEach(() => cleanup());

describe('ContactMapPreview (IFC-257)', () => {
  it('renders a "View Map" control', () => {
    render(<ContactMapPreview location="London, UK" />);
    expect(screen.getByRole('button', { name: /View Map/i })).toBeInTheDocument();
  });

  it('disables the View Map button when there is no location', () => {
    render(<ContactMapPreview location="" />);
    expect(screen.getByRole('button', { name: /View Map/i })).toBeDisabled();
  });

  it('treats null/undefined location as no location (disabled)', () => {
    render(<ContactMapPreview location={null} />);
    expect(screen.getByRole('button', { name: /View Map/i })).toBeDisabled();
  });

  it('does not open a window when disabled and clicked', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ContactMapPreview location="" />);
    fireEvent.click(screen.getByRole('button', { name: /View Map/i }));
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('opens Google Maps in a new tab when a location is present', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ContactMapPreview location="London, UK" />);
    const btn = screen.getByRole('button', { name: /View Map/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/maps/search/?api=1&query=London%2C%20UK',
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });
});
