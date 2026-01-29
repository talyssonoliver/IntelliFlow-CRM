// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UpcomingEventsWidget } from '../UpcomingEventsWidget';

describe('UpcomingEventsWidget', () => {
  it('renders upcoming events list', () => {
    render(<UpcomingEventsWidget />);

    expect(screen.getByText('Upcoming Events')).toBeInTheDocument();
    expect(screen.getAllByText(/PM|AM/)).toHaveLength(3);
    expect(screen.getByText('Proposal Deadline')).toBeInTheDocument();
  });
});
