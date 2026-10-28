/**
 * @vitest-environment jsdom
 *
 * PG-203 — /calendar/event-types page shell (AC-001).
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../EventTypesContent', () => ({
  default: () => <div data-testid="event-types-content" />,
}));

import EventTypesPage from '../page';

describe('/calendar/event-types page', () => {
  it('renders the event types content, not the old "coming soon" stub', () => {
    const { container } = render(<EventTypesPage />);
    expect(screen.getByTestId('event-types-content')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/coming soon/i);
  });
});
