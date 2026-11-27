import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { ContactMapPreview } from './ContactMapPreview';

afterEach(() => cleanup());

describe('ContactMapPreview', () => {
  it('shows the address and a real link to Google Maps for it', () => {
    render(<ContactMapPreview location="1, 2 Shelford Pl, London N16 9HS" />);
    expect(screen.getByText('1, 2 Shelford Pl, London N16 9HS')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'View Map' });
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=1%2C%202%20Shelford%20Pl%2C%20London%20N16%209HS'
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('is an anchor, so it needs no script: tapping it never goes through window.open', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ContactMapPreview location="London, UK" />);
    expect(screen.getByRole('link', { name: 'View Map' }).tagName).toBe('A');
    expect(screen.queryByRole('button', { name: /View Map/i })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'View Map' }));
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('with no location says so and disables the control (no live-looking no-op)', () => {
    for (const location of ['', '   ', null, undefined]) {
      cleanup();
      render(<ContactMapPreview location={location} />);
      expect(screen.getByText('No address on file')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /View Map/i })).toBeDisabled();
      expect(screen.queryByRole('link', { name: /View Map/i })).toBeNull();
    }
  });

  it('keeps a tap target of at least 44px and lets a long address wrap', () => {
    render(<ContactMapPreview location={'A very long address '.repeat(8)} />);
    expect(screen.getByRole('link', { name: 'View Map' }).className).toContain('min-h-11');
    expect(screen.getByText(/A very long address/).className).toContain('break-words');
  });
});
