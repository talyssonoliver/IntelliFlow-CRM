// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UpcomingTasksWidget } from '../UpcomingTasksWidget';

describe('UpcomingTasksWidget', () => {
  it('renders upcoming tasks with priorities', () => {
    render(<UpcomingTasksWidget />);

    expect(screen.getByText('Upcoming Tasks')).toBeInTheDocument();
    expect(screen.getByText('View All')).toHaveAttribute('href', '/tasks');
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByText('high')).toBeInTheDocument();
  });
});
