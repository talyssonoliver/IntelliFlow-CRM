// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchSuggestions } from '../search-suggestions';

const usePathname = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => usePathname(),
}));

describe('SearchSuggestions', () => {
  beforeEach(() => {
    usePathname.mockReset();
  });

  it('prioritizes direct path matches first', () => {
    usePathname.mockReturnValue('/contacts/ghost-record');

    render(<SearchSuggestions />);

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveTextContent(/contacts/i);
    expect(links[0]).toHaveAttribute('href', '/contacts');
  });

  it('falls back to safe public routes when nothing matches', () => {
    usePathname.mockReturnValue('/totally/unknown/path');

    render(<SearchSuggestions />);

    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /system status/i })).toHaveAttribute('href', '/status');
  });

  it('does not render duplicate destinations', () => {
    usePathname.mockReturnValue('/dashboard/dashboard');

    render(<SearchSuggestions />);

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
