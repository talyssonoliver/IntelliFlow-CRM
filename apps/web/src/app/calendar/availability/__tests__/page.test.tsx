/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../AvailabilityContent', () => ({
  default: () => <div data-testid="availability-content" />,
}));

import AvailabilityPage from '../page';

describe('/calendar/availability page', () => {
  it('renders the availability content, not the old "coming soon" stub', () => {
    const { container } = render(<AvailabilityPage />);
    expect(screen.getByTestId('availability-content')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/coming soon/i);
  });
});
