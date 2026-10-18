/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../ContactTypesContent', () => ({
  default: () => {
    // Suspend forever so the page shows its fallback.
    throw new Promise(() => undefined);
  },
}));

import ContactTypesPage from '../page';

describe('Contact Types page (PG-205)', () => {
  it('is no longer the "coming soon" stub: it streams the bento skeleton first', () => {
    const { container } = render(<ContactTypesPage />);
    expect(container.textContent).not.toMatch(/coming soon/i);
    expect(screen.getByRole('status')).toHaveTextContent('Loading contact types');
    expect(container.querySelector('.lg\\:grid-cols-12')).not.toBeNull();
  });
});
